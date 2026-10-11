// Cloudflare Worker for todo.tenziki.com: authenticated task API on D1 + static assets.
//
// Auth model
//   1. The browser signs in with Google Identity Services and gets a Google ID token.
//   2. POST /api/auth/google verifies that token with Google, then returns a session
//      token signed with SESSION_SECRET (HMAC-SHA256).
//   3. Every /api/tasks request must carry `Authorization: Bearer <session token>`.
//      The user id always comes from the verified token, never from the request.
//   4. Each session also has a row in D1 (`sessions`), so signing out revokes it on the server:
//      a copied token stops working immediately instead of living until it expires.

import { MAX_TASKS_PER_USER, SESSION_TTL_DAYS, TRASH_RETENTION_DAYS } from './lib/limits.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * SESSION_TTL_DAYS;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;

const PRIORITIES = ['low', 'medium', 'high'];
const CATEGORIES = ['Personal', 'Work', 'Fitness', 'Ideas'];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const encoder = new TextEncoder();

// ---------- small helpers ----------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

function toBase64Url(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ---------- session tokens ----------

function hmacKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function signSession(payload, secret) {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(sig)}`;
}

async function verifySession(token, secret) {
  const [body, sig] = (token || '').split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64Url(sig), encoder.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (!payload.uid || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function requireUser(request, env) {
  if (!env.SESSION_SECRET) throw new HttpError(503, 'Server auth is not configured');
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  const session = match ? await verifySession(match[1], env.SESSION_SECRET) : null;
  if (!session || !session.sid) throw new HttpError(401, 'Not signed in');

  // The signature proves the token is ours; this proves it hasn't been signed out.
  const live = await env.todo_db
    .prepare('SELECT 1 AS ok FROM sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?')
    .bind(session.sid, session.uid, Math.floor(Date.now() / 1000))
    .first();
  if (!live) throw new HttpError(401, 'Session expired or signed out');
  return session;
}

// ---------- Google sign-in ----------

async function verifyGoogleCredential(credential, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.SESSION_SECRET) {
    throw new HttpError(503, 'Google sign-in is not configured');
  }
  if (typeof credential !== 'string' || credential.length > 4096) {
    throw new HttpError(400, 'Missing credential');
  }

  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!res.ok) throw new HttpError(401, 'Google rejected the sign-in token');
  const info = await res.json();

  const issuerOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  const verified = info.email_verified === true || info.email_verified === 'true';
  const notExpired = Number(info.exp) > Math.floor(Date.now() / 1000);
  if (info.aud !== env.GOOGLE_CLIENT_ID || !issuerOk || !verified || !notExpired || !info.sub || !info.email) {
    throw new HttpError(401, 'Invalid sign-in token');
  }
  return info;
}

async function handleGoogleSignIn(request, env) {
  const { credential } = await readJson(request);
  const info = await verifyGoogleCredential(credential, env);

  const email = String(info.email).toLowerCase();
  const uid = `google-${info.sub}`;

  // Before real auth existed, user ids were derived from the (unverified) email.
  // Google has now verified this email, so hand any of those tasks to the real account.
  const legacyId = `google-${email.replace(/[^a-z0-9]/g, '_')}`;
  if (legacyId !== uid) {
    await env.todo_db.prepare('UPDATE tasks SET user_id = ? WHERE user_id = ?').bind(uid, legacyId).run();
  }

  const user = { uid, email, name: info.name || email.split('@')[0], picture: info.picture || null };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_SECONDS;
  const sid = crypto.randomUUID();

  await env.todo_db
    .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(sid, uid, new Date().toISOString(), exp)
    .run();
  // Housekeeping: drop sessions that expired more than a week ago.
  await env.todo_db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now - 7 * 24 * 3600).run();

  const token = await signSession({ ...user, sid, exp }, env.SESSION_SECRET);
  return json({ token, user, expiresAt: exp });
}

async function revokeSessions(env, session, { all }) {
  const result = all
    ? await env.todo_db
        .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
        .bind(new Date().toISOString(), session.uid)
        .run()
    : await env.todo_db
        .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL')
        .bind(new Date().toISOString(), session.sid, session.uid)
        .run();
  return json({ success: true, revoked: result.meta.changes });
}

// ---------- task validation ----------

function validateTask(input, { partial }) {
  const out = {};
  const fail = (msg) => {
    throw new HttpError(400, msg);
  };
  if (typeof input !== 'object' || input === null) fail('Invalid task');

  if (!partial || input.title !== undefined) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title || title.length > 200) fail('Title must be 1-200 characters');
    out.title = title;
  }
  if (input.description !== undefined) {
    if (input.description !== null && typeof input.description !== 'string') fail('Invalid description');
    const description = (input.description || '').trim();
    if (description.length > 4000) fail('Description is too long');
    out.description = description;
  }
  if (input.completed !== undefined) {
    if (typeof input.completed !== 'boolean') fail('Invalid completed flag');
    out.completed = input.completed ? 1 : 0;
  }
  if (input.priority !== undefined) {
    if (!PRIORITIES.includes(input.priority)) fail('Invalid priority');
    out.priority = input.priority;
  }
  if (input.category !== undefined) {
    if (!CATEGORIES.includes(input.category)) fail('Invalid category');
    out.category = input.category;
  }
  if (input.due_date !== undefined) {
    if (input.due_date !== null && !(typeof input.due_date === 'string' && DATE_RE.test(input.due_date))) {
      fail('Invalid due date');
    }
    out.due_date = input.due_date;
  }
  return out;
}

function formatRow(row) {
  return { ...row, completed: Boolean(row.completed) };
}

// ---------- API ----------

async function handleApi(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/auth/config' && method === 'GET') {
    return json({ googleClientId: env.GOOGLE_CLIENT_ID || null });
  }
  if (pathname === '/api/auth/google' && method === 'POST') {
    return handleGoogleSignIn(request, env);
  }
  if (pathname === '/api/auth/signout' && method === 'POST') {
    return revokeSessions(env, await requireUser(request, env), { all: false });
  }
  if (pathname === '/api/auth/signout-all' && method === 'POST') {
    return revokeSessions(env, await requireUser(request, env), { all: true });
  }

  if (!pathname.startsWith('/api/tasks')) throw new HttpError(404, 'Not found');

  const session = await requireUser(request, env);
  const db = env.todo_db;

  if (pathname === '/api/tasks' && method === 'GET') {
    // Deleted tasks are kept for TRASH_RETENTION_DAYS, then removed for good.
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * DAY_MS).toISOString();
    await db
      .prepare('DELETE FROM tasks WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?')
      .bind(session.uid, cutoff)
      .run();

    // The cap on create keeps every account below this limit, so the list is never silently cut off.
    const { results } = await db
      .prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .bind(session.uid, MAX_TASKS_PER_USER + 500)
      .all();
    return json((results || []).map(formatRow));
  }

  if (pathname === '/api/tasks' && method === 'POST') {
    const body = await readJson(request);
    if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw new HttpError(400, 'Invalid task id');
    const task = validateTask(body, { partial: false });

    const { n } = await db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?').bind(session.uid).first();
    if (n >= MAX_TASKS_PER_USER) {
      throw new HttpError(
        409,
        `You've reached the limit of ${MAX_TASKS_PER_USER} tasks. Permanently delete some from Deleted to add more.`
      );
    }
    const createdAt = typeof body.created_at === 'string' && !Number.isNaN(Date.parse(body.created_at))
      ? new Date(body.created_at).toISOString()
      : new Date().toISOString();

    // Used when tasks created while signed out are brought into the account.
    let deletedAt = null;
    if (body.deleted_at !== undefined && body.deleted_at !== null) {
      if (typeof body.deleted_at !== 'string' || Number.isNaN(Date.parse(body.deleted_at))) {
        throw new HttpError(400, 'Invalid deleted_at');
      }
      deletedAt = new Date(body.deleted_at).toISOString();
    }

    // OR IGNORE: re-sending the same id (retry) never overwrites or hijacks another user's row.
    const result = await db
      .prepare(
        'INSERT OR IGNORE INTO tasks (id, user_id, title, description, completed, priority, category, due_date, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        body.id,
        session.uid,
        task.title,
        task.description || '',
        task.completed ?? 0,
        task.priority || 'medium',
        task.category || 'Personal',
        task.due_date ?? null,
        createdAt,
        deletedAt
      )
      .run();
    return json({ success: true, created: result.meta.changes > 0 }, 201);
  }

  // "Clear done" moves finished tasks to Deleted; it never destroys them.
  if (pathname === '/api/tasks/clear-completed' && method === 'POST') {
    const result = await db
      .prepare('UPDATE tasks SET deleted_at = ? WHERE user_id = ? AND completed = 1 AND deleted_at IS NULL')
      .bind(new Date().toISOString(), session.uid)
      .run();
    return json({ success: true, deleted: result.meta.changes });
  }

  if (pathname === '/api/tasks/complete-all' && method === 'POST') {
    const result = await db
      .prepare('UPDATE tasks SET completed = 1 WHERE user_id = ? AND completed = 0 AND deleted_at IS NULL')
      .bind(session.uid)
      .run();
    return json({ success: true, updated: result.meta.changes });
  }

  // The only bulk operation that permanently removes data, and only for tasks already in Deleted.
  if (pathname === '/api/tasks/empty-trash' && method === 'POST') {
    const result = await db
      .prepare('DELETE FROM tasks WHERE user_id = ? AND deleted_at IS NOT NULL')
      .bind(session.uid)
      .run();
    return json({ success: true, deleted: result.meta.changes });
  }

  const restoreMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/restore$/);
  if (restoreMatch && method === 'POST') {
    const id = decodeURIComponent(restoreMatch[1]);
    if (!ID_RE.test(id)) throw new HttpError(400, 'Invalid task id');
    const result = await db
      .prepare('UPDATE tasks SET deleted_at = NULL WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL')
      .bind(id, session.uid)
      .run();
    if (result.meta.changes === 0) throw new HttpError(404, 'Task not found in Deleted');
    return json({ success: true });
  }

  const idMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1]);
    if (!ID_RE.test(id)) throw new HttpError(400, 'Invalid task id');

    if (method === 'PUT') {
      const updates = validateTask(await readJson(request), { partial: true });
      const fields = Object.keys(updates);
      if (fields.length === 0) throw new HttpError(400, 'Nothing to update');
      const result = await db
        .prepare(
          `UPDATE tasks SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
        )
        .bind(...fields.map((f) => updates[f]), id, session.uid)
        .run();
      if (result.meta.changes === 0) throw new HttpError(404, 'Task not found');
      return json({ success: true });
    }

    if (method === 'DELETE') {
      if (url.searchParams.get('permanent') === 'true') {
        // Permanent deletion is only allowed from the Deleted section.
        const result = await db
          .prepare('DELETE FROM tasks WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL')
          .bind(id, session.uid)
          .run();
        if (result.meta.changes > 0) return json({ success: true });
        const exists = await db
          .prepare('SELECT 1 AS found FROM tasks WHERE id = ? AND user_id = ?')
          .bind(id, session.uid)
          .first();
        if (exists) throw new HttpError(409, 'Move the task to Deleted before deleting it permanently');
        throw new HttpError(404, 'Task not found');
      }

      const result = await db
        .prepare('UPDATE tasks SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
        .bind(new Date().toISOString(), id, session.uid)
        .run();
      if (result.meta.changes === 0) throw new HttpError(404, 'Task not found');
      return json({ success: true });
    }
  }

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      // The app is same-origin, so no CORS headers are sent: other sites cannot call this API from a browser.
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        if (err instanceof HttpError) return json({ error: err.message }, err.status);
        console.error('Unhandled API error:', err);
        return json({ error: 'Internal Server Error' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
