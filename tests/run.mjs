// Runs the API tests against a throwaway Worker + local D1 database.
//   npm test
// It never touches your real local data (.wrangler) or the remote database.

import { spawn, spawnSync } from 'node:child_process';
import { rmSync, readFileSync, writeFileSync } from 'node:fs';

const PORT = 8799;
// Relative on purpose: wrangler mangles absolute Windows paths for these options.
const STATE = '.tmp-test-d1';
const SEED_FILE = '.tmp-test-seed.sql';
const shell = process.platform === 'win32';
const npx = (args, opts = {}) => spawnSync('npx', args, { shell, encoding: 'utf8', ...opts });

const now = Math.floor(Date.now() / 1000);
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

// Sessions and old Deleted rows that individual tests rely on.
const SEED_SQL = [
  ...['user-a', 'user-b', 'user-c', 'user-limit', 'user-legacy', 'user-bars', 'user-bars-b'].map(
    (u) => `INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('sid-${u}', '${u}', '${iso(0)}', ${now + 3600});`
  ),
  `INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('sid-user-a-phone', 'user-a', '${iso(0)}', ${now + 3600});`,
  `INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('sid-user-c-phone', 'user-c', '${iso(0)}', ${now + 3600});`,
  `INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('sid-expired', 'user-a', '${iso(40)}', ${now - 60});`,
  `INSERT INTO sessions (id, user_id, created_at, expires_at, revoked_at) VALUES ('sid-revoked', 'user-a', '${iso(1)}', ${now + 3600}, '${iso(0)}');`,
  `INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('sid-user-purge', 'user-purge', '${iso(0)}', ${now + 3600});`,
  `INSERT INTO tasks (id, user_id, title, created_at, deleted_at) VALUES ('old-deleted', 'user-purge', 'Deleted 40 days ago', '${iso(50)}', '${iso(40)}');`,
  `INSERT INTO tasks (id, user_id, title, created_at, deleted_at) VALUES ('recent-deleted', 'user-purge', 'Deleted 10 days ago', '${iso(50)}', '${iso(10)}');`,
  `INSERT INTO tasks (id, user_id, title, created_at) VALUES ('old-active', 'user-purge', 'Active, created long ago', '${iso(400)}');`,
  // An account from before bars existed: tasks with old categories and no bars yet.
  `INSERT INTO tasks (id, user_id, title, category, created_at, position) VALUES ('leg-1', 'user-legacy', 'Work thing', 'Work', '${iso(3)}', -3);`,
  `INSERT INTO tasks (id, user_id, title, category, created_at, position) VALUES ('leg-2', 'user-legacy', 'Gym', 'Fitness', '${iso(2)}', -2);`,
  `INSERT INTO tasks (id, user_id, title, category, created_at, position) VALUES ('leg-3', 'user-legacy', 'A book', 'Reading', '${iso(1)}', -1);`,
].join(' ');

// workerd outlives the npx/wrangler wrapper processes, and wrangler restarts workerd if only that is killed.
// So find the wrangler process tree by its command line and stop the whole tree.
function freePort() {
  if (process.platform === 'win32') {
    const script = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '--port ${PORT}' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>&1 | Out-Null }`;
    spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
  } else {
    spawnSync('pkill', ['-f', `wrangler.*--port ${PORT}`]);
  }
}

let server;
function cleanup() {
  server?.kill();
  if (process.platform === 'win32' && server?.pid) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F']);
  freePort();
  try {
    rmSync(STATE, { recursive: true, force: true });
    rmSync(SEED_FILE, { force: true });
  } catch {
    // files may still be released by workerd; harmless
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

freePort(); // a previous interrupted run may still hold the port and the database files
await new Promise((res) => setTimeout(res, 1500));
rmSync(STATE, { recursive: true, force: true });

let r = npx(['wrangler', 'd1', 'migrations', 'apply', 'todo-db', '--local', '--persist-to', STATE]);
if (r.status !== 0) {
  console.error(r.stdout, r.stderr);
  process.exit(1);
}

writeFileSync(SEED_FILE, SEED_SQL);
r = npx(['wrangler', 'd1', 'execute', 'todo-db', '--local', '--persist-to', STATE, '--file', SEED_FILE]);
rmSync(SEED_FILE, { force: true });
if (r.status !== 0) {
  console.error(r.stdout, r.stderr);
  process.exit(1);
}

server = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', STATE], { shell, stdio: 'ignore' });

const base = `http://127.0.0.1:${PORT}`;
let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  await new Promise((res) => setTimeout(res, 1000));
  try {
    ready = (await fetch(`${base}/api/auth/config`)).ok;
  } catch {
    // not up yet
  }
}
if (!ready) {
  console.error('Worker did not start');
  cleanup();
  process.exit(1);
}

const secret = readFileSync('.dev.vars', 'utf8').match(/^SESSION_SECRET=(.+)$/m)?.[1]?.trim();
if (!secret) {
  console.error('.dev.vars needs a SESSION_SECRET for the tests');
  cleanup();
  process.exit(1);
}

const test = spawnSync(process.execPath, ['--test', '--test-timeout=120000', 'tests/api.test.mjs', 'tests/bars.test.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, API_BASE: base, TEST_SESSION_SECRET: secret },
});
cleanup();
process.exit(test.status ?? 1);
