// API tests. Run with `npm test` (tests/run.mjs starts the Worker and a throwaway database).

import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.API_BASE;
const SECRET = process.env.TEST_SESSION_SECRET;
if (!BASE || !SECRET) throw new Error('Run these tests with `npm test`');

const b64 = (b) => Buffer.from(b).toString('base64url');

// Mints a token the way the Worker does. `sid` must match a row in `sessions` (seeded by tests/run.mjs).
function mint(uid, { sid = `sid-${uid}`, secret = SECRET, exp = Math.floor(Date.now() / 1000) + 600, omitSid = false } = {}) {
  const payload = { uid, email: `${uid}@example.test`, exp, ...(omitSid ? {} : { sid }) };
  const body = b64(JSON.stringify(payload));
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, data, headers: res.headers };
}

const task = (id, extra = {}) => ({ id, title: 'Buy milk', priority: 'high', category: 'Work', due_date: '2026-10-09', ...extra });
const list = async (token) => (await call('GET', '/api/tasks', { token })).data;

const A = mint('user-a');
const B = mint('user-b');

describe('authentication', () => {
  it('rejects requests with no token', async () => {
    assert.equal((await call('GET', '/api/tasks')).status, 401);
  });

  it('ignores the old ?user_id= query parameter', async () => {
    assert.equal((await call('GET', '/api/tasks?user_id=google-someone_gmail_com')).status, 401);
  });

  it('rejects wrong-secret, expired, tampered and garbage tokens', async () => {
    assert.equal((await call('GET', '/api/tasks', { token: mint('user-a', { secret: 'nope' }) })).status, 401);
    assert.equal((await call('GET', '/api/tasks', { token: mint('user-a', { exp: 1000 }) })).status, 401);
    const forged = `${b64(JSON.stringify({ uid: 'user-b', sid: 'sid-user-b', exp: Math.floor(Date.now() / 1000) + 600 }))}.${A.split('.')[1]}`;
    assert.equal((await call('GET', '/api/tasks', { token: forged })).status, 401);
    assert.equal((await call('GET', '/api/tasks', { token: 'abc' })).status, 401);
  });

  it('does not let a bogus Google credential sign anyone in', async () => {
    const r = await call('POST', '/api/auth/google', { body: { credential: 'not-a-real-token' } });
    assert.ok([401, 503].includes(r.status), `got ${r.status}`); // 503 if no client id is configured locally
    assert.equal(r.data.token, undefined);
  });

  it('sends no CORS headers and nosniff on API responses', async () => {
    const r = await call('GET', '/api/auth/config');
    assert.equal(r.headers.get('access-control-allow-origin'), null);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  });
});

describe('server-side sessions', () => {
  it('rejects a correctly signed token whose session row does not exist', async () => {
    assert.equal((await call('GET', '/api/tasks', { token: mint('user-a', { sid: 'never-created' }) })).status, 401);
  });

  it('rejects a token with no session id (old format)', async () => {
    assert.equal((await call('GET', '/api/tasks', { token: mint('user-a', { omitSid: true }) })).status, 401);
  });

  it('rejects revoked and expired sessions', async () => {
    assert.equal((await call('GET', '/api/tasks', { token: mint('user-a', { sid: 'sid-revoked' }) })).status, 401);
    assert.equal((await call('GET', '/api/tasks', { token: mint('user-a', { sid: 'sid-expired' }) })).status, 401);
  });

  it("rejects another user's session id", async () => {
    assert.equal((await call('GET', '/api/tasks', { token: mint('user-b', { sid: 'sid-user-a' }) })).status, 401);
  });

  it('sign-out revokes only that device', async () => {
    const laptop = mint('user-c');
    const phone = mint('user-c', { sid: 'sid-user-c-phone' });
    assert.equal((await call('GET', '/api/tasks', { token: laptop })).status, 200);
    assert.equal((await call('GET', '/api/tasks', { token: phone })).status, 200);

    assert.equal((await call('POST', '/api/auth/signout', { token: laptop, body: {} })).status, 200);
    assert.equal((await call('GET', '/api/tasks', { token: laptop })).status, 401, 'signed-out token must stop working at once');
    assert.equal((await call('GET', '/api/tasks', { token: phone })).status, 200, 'other device stays signed in');

    assert.equal((await call('POST', '/api/auth/signout-all', { token: phone, body: {} })).status, 200);
    assert.equal((await call('GET', '/api/tasks', { token: phone })).status, 401);
  });

  it('sign-out endpoints require a session', async () => {
    assert.equal((await call('POST', '/api/auth/signout', { body: {} })).status, 401);
    assert.equal((await call('POST', '/api/auth/signout-all', { body: {} })).status, 401);
  });
});

describe('tasks: isolation between users', () => {
  it("never shows, edits, deletes or overwrites another user's task", async () => {
    let r = await call('POST', '/api/tasks', { token: A, body: task('iso-1') });
    assert.equal(r.status, 201);
    assert.equal(r.data.created, true);

    assert.equal((await list(B)).filter((t) => t.id === 'iso-1').length, 0, 'B cannot list A task');
    assert.equal((await call('GET', '/api/tasks?user_id=user-a', { token: B })).data.filter((t) => t.id === 'iso-1').length, 0);
    assert.equal((await call('PUT', '/api/tasks/iso-1', { token: B, body: { title: 'hacked' } })).status, 404);
    assert.equal((await call('DELETE', '/api/tasks/iso-1', { token: B })).status, 404);

    r = await call('POST', '/api/tasks', { token: B, body: task('iso-1', { title: 'stolen id' }) });
    assert.equal(r.data.created, false, 're-using an id must not overwrite');
    assert.equal((await list(A)).find((t) => t.id === 'iso-1').title, 'Buy milk');
  });
});

describe('tasks: create, update, bulk', () => {
  it('creates, updates and persists changes', async () => {
    await call('POST', '/api/tasks', { token: A, body: task('crud-1', { title: 'Second' }) });
    const r = await call('PUT', '/api/tasks/crud-1', { token: A, body: { completed: true, title: 'Second!', description: 'notes', due_date: null } });
    assert.equal(r.status, 200);
    const t = (await list(A)).find((x) => x.id === 'crud-1');
    assert.deepEqual([t.completed, t.title, t.description, t.due_date], [true, 'Second!', 'notes', null]);
  });

  it('bulk actions only touch the caller', async () => {
    await call('POST', '/api/tasks', { token: B, body: task('bulk-b', { completed: true }) });
    const cleared = await call('POST', '/api/tasks/clear-completed', { token: A, body: {} });
    assert.ok(cleared.data.deleted >= 1);
    assert.ok((await list(B)).some((t) => t.id === 'bulk-b' && !t.deleted_at), "B's completed task must survive A's clear");
    await call('POST', '/api/tasks', { token: A, body: task('bulk-open') });
    const done = await call('POST', '/api/tasks/complete-all', { token: A, body: {} });
    assert.ok(done.data.updated >= 1);
    assert.equal((await list(B)).find((t) => t.id === 'bulk-b').completed, true);
  });
});

describe('tasks: validation', () => {
  const bad = (name, body) =>
    it(`rejects ${name}`, async () => assert.equal((await call('POST', '/api/tasks', { token: A, body })).status, 400));

  bad('a bad priority', task('v1', { priority: 'urgent' }));
  bad('a bad category', task('v2', { category: 'Evil' }));
  bad('a non-date due_date', task('v3', { due_date: 'Today' }));
  bad('an empty title', task('v4', { title: '   ' }));
  bad('a 201-character title', task('v5', { title: 'x'.repeat(201) }));
  bad('an unsafe id', task('has spaces/../x'));
  bad('a non-boolean completed', task('v6', { completed: 'yes' }));
  bad('an invalid deleted_at', task('v7', { deleted_at: 'nope' }));

  it('rejects bad PUT bodies', async () => {
    assert.equal((await call('PUT', '/api/tasks/crud-1', { token: A, body: { priority: 'nope' } })).status, 400);
    assert.equal((await call('PUT', '/api/tasks/crud-1', { token: A, body: {} })).status, 400);
  });

  it('rejects oversized bodies', async () => {
    const r = await call('POST', '/api/tasks', { token: A, body: { id: 'big', title: 'x', description: 'y'.repeat(20000) } });
    assert.ok([400, 413].includes(r.status));
  });
});

describe('Deleted section', () => {
  it('delete moves a task to Deleted instead of destroying it', async () => {
    await call('POST', '/api/tasks', { token: A, body: task('del-1') });
    assert.equal((await call('DELETE', '/api/tasks/del-1', { token: A })).status, 200);
    const t = (await list(A)).find((x) => x.id === 'del-1');
    assert.equal(typeof t.deleted_at, 'string');
    assert.equal((await call('DELETE', '/api/tasks/del-1', { token: A })).status, 404, 'already deleted');
    assert.equal((await call('PUT', '/api/tasks/del-1', { token: A, body: { title: 'x' } })).status, 404, 'cannot edit while deleted');
  });

  it('refuses to permanently delete a task that is not in Deleted', async () => {
    await call('POST', '/api/tasks', { token: A, body: task('del-2') });
    const r = await call('DELETE', '/api/tasks/del-2?permanent=true', { token: A });
    assert.equal(r.status, 409);
    assert.ok((await list(A)).some((t) => t.id === 'del-2'));
  });

  it('restores a deleted task, and only if it is deleted', async () => {
    await call('DELETE', '/api/tasks/del-2', { token: A });
    assert.equal((await call('POST', '/api/tasks/del-2/restore', { token: A, body: {} })).status, 200);
    assert.equal((await list(A)).find((t) => t.id === 'del-2').deleted_at, null);
    assert.equal((await call('POST', '/api/tasks/del-2/restore', { token: A, body: {} })).status, 404);
  });

  it('permanently deletes from Deleted, and nobody else can', async () => {
    await call('DELETE', '/api/tasks/del-2', { token: A });
    assert.equal((await call('POST', '/api/tasks/del-2/restore', { token: B, body: {} })).status, 404);
    assert.equal((await call('DELETE', '/api/tasks/del-2?permanent=true', { token: B })).status, 404);
    assert.ok((await list(A)).find((t) => t.id === 'del-2').deleted_at);

    assert.equal((await call('DELETE', '/api/tasks/del-2?permanent=true', { token: A })).status, 200);
    assert.ok(!(await list(A)).some((t) => t.id === 'del-2'));
    assert.equal((await call('DELETE', '/api/tasks/del-2?permanent=true', { token: A })).status, 404);
  });

  it("empty-trash removes only the caller's Deleted tasks", async () => {
    await call('POST', '/api/tasks', { token: B, body: task('b-del') });
    await call('DELETE', '/api/tasks/b-del', { token: B });
    const before = (await list(A)).filter((t) => t.deleted_at).length;
    const r = await call('POST', '/api/tasks/empty-trash', { token: A, body: {} });
    assert.equal(r.data.deleted, before);
    assert.ok((await list(A)).every((t) => !t.deleted_at));
    assert.ok((await list(B)).some((t) => t.id === 'b-del' && t.deleted_at));
  });

  it('requires auth for Deleted-section endpoints', async () => {
    assert.equal((await call('POST', '/api/tasks/empty-trash', { body: {} })).status, 401);
    assert.equal((await call('POST', '/api/tasks/x/restore', { body: {} })).status, 401);
  });

  it('keeps deleted_at when a signed-out task list is imported; complete-all skips deleted tasks', async () => {
    const deletedAt = new Date(Date.now() - 86400000).toISOString(); // recent, so auto-purge keeps it
    const r = await call('POST', '/api/tasks', { token: A, body: task('imp-1', { deleted_at: deletedAt }) });
    assert.equal(r.status, 201);
    assert.equal((await list(A)).find((t) => t.id === 'imp-1').deleted_at, deletedAt);
    await call('POST', '/api/tasks/complete-all', { token: A, body: {} });
    assert.equal((await list(A)).find((t) => t.id === 'imp-1').completed, false);
  });
});

describe('Deleted auto-purge', () => {
  const P = mint('user-purge');

  it('removes tasks deleted more than 30 days ago, keeps the rest', async () => {
    const tasks = await list(P);
    const ids = tasks.map((t) => t.id).sort();
    assert.deepEqual(ids, ['old-active', 'recent-deleted'], 'old-deleted must be gone; old active and recent deleted must stay');
  });
});

describe('account limit', () => {
  const L = mint('user-limit');

  it('lists every task (no silent cut-off) and blocks creating beyond the limit', { timeout: 120000 }, async () => {
    const LIMIT = 3000;
    let created = 0;
    for (let start = 0; start < LIMIT; start += 50) {
      const results = await Promise.all(
        Array.from({ length: Math.min(50, LIMIT - start) }, (_, k) =>
          call('POST', '/api/tasks', { token: L, body: { id: `lim-${start + k}`, title: `Task ${start + k}`, created_at: new Date(Date.now() - (start + k) * 1000).toISOString() } })
        )
      );
      created += results.filter((r) => r.status === 201).length;
    }
    assert.equal(created, LIMIT);

    const all = await list(L);
    assert.equal(all.length, LIMIT, 'GET must return all 3000, not a truncated page');

    const over = await call('POST', '/api/tasks', { token: L, body: task('lim-over') });
    assert.equal(over.status, 409);
    assert.match(over.data.error, /limit of 3000/);
    assert.equal((await list(L)).length, LIMIT);
  });
});
