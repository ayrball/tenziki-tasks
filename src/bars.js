// "Bars": the user's own named sections that tasks are grouped into. Stored in the `lists` table.
//
// Every query is scoped to the signed-in user. A task can only be filed into a bar its owner owns,
// and deleting a bar never deletes tasks: they move to another bar.

import { BAR_COLOR_IDS, DEFAULT_BARS, LIST_NAME_MAX, MAX_LISTS_PER_USER } from './lib/limits.js';
import { HttpError, json, readJson } from './http.js';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_REORDER = 500;

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'bar';
// Deterministic, so two requests creating a new user's first bars at once can't create duplicates.
const seedId = (uid, name) => `${uid}-${slug(name)}`.slice(0, 64);

export async function assertOwnsList(db, uid, listId) {
  const owned = await db.prepare('SELECT 1 AS ok FROM lists WHERE id = ? AND user_id = ?').bind(listId, uid).first();
  if (!owned) throw new HttpError(400, 'Unknown bar');
}

export async function defaultListId(db, uid) {
  const row = await db
    .prepare('SELECT id FROM lists WHERE user_id = ? ORDER BY position, created_at LIMIT 1')
    .bind(uid)
    .first();
  return row?.id ?? null;
}

// First time a user loads their data after bars were introduced: create their bars from the categories
// they already use (plus the standard four), and file every existing task into the matching bar.
// Afterwards it only mops up tasks that an older copy of the app created without a bar.
export async function ensureLists(db, uid) {
  const has = await db.prepare('SELECT 1 AS ok FROM lists WHERE user_id = ? LIMIT 1').bind(uid).first();

  if (has) {
    const orphan = await db.prepare('SELECT 1 AS ok FROM tasks WHERE user_id = ? AND list_id IS NULL LIMIT 1').bind(uid).first();
    if (orphan) {
      const fallback = await defaultListId(db, uid);
      await db.prepare('UPDATE tasks SET list_id = ? WHERE user_id = ? AND list_id IS NULL').bind(fallback, uid).run();
    }
    return;
  }

  const { results } = await db
    .prepare('SELECT category FROM tasks WHERE user_id = ? GROUP BY category ORDER BY COUNT(*) DESC')
    .bind(uid)
    .all();

  const names = DEFAULT_BARS.map((b) => b.name);
  for (const row of results ?? []) {
    const extra = String(row.category || '').trim().slice(0, LIST_NAME_MAX);
    if (extra && !names.some((n) => n.toLowerCase() === extra.toLowerCase())) names.push(extra);
  }

  const now = new Date().toISOString();
  const statements = names.slice(0, MAX_LISTS_PER_USER).map((name, i) => {
    const color = DEFAULT_BARS.find((b) => b.name === name)?.color ?? BAR_COLOR_IDS[i % BAR_COLOR_IDS.length];
    return db
      .prepare('INSERT OR IGNORE INTO lists (id, user_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(seedId(uid, name), uid, name, color, i, now);
  });
  statements.push(
    db
      .prepare(
        'UPDATE tasks SET list_id = COALESCE((SELECT id FROM lists WHERE user_id = ? AND lower(name) = lower(tasks.category) LIMIT 1), ?) WHERE user_id = ? AND list_id IS NULL'
      )
      .bind(uid, seedId(uid, names[0]), uid)
  );
  await db.batch(statements);
}

function validateBar(input, { partial }) {
  const out = {};
  if (typeof input !== 'object' || input === null) throw new HttpError(400, 'Invalid bar');

  if (!partial || input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
    if (!name || name.length > LIST_NAME_MAX) throw new HttpError(400, `Bar names must be 1-${LIST_NAME_MAX} characters`);
    out.name = name;
  }
  if (!partial || input.color !== undefined) {
    const color = input.color ?? 'violet';
    if (!BAR_COLOR_IDS.includes(color)) throw new HttpError(400, 'Invalid colour');
    out.color = color;
  }
  return out;
}

const formatBar = (row) => ({ id: row.id, name: row.name, color: row.color, position: row.position, created_at: row.created_at });

// Handles /api/lists*. Returns null when the path isn't one of ours.
export async function handleLists(request, env, url, session) {
  const { pathname } = url;
  const method = request.method;
  const db = env.todo_db;
  const uid = session.uid;

  if (pathname === '/api/lists' && method === 'GET') {
    await ensureLists(db, uid);
    const { results } = await db
      .prepare('SELECT id, name, color, position, created_at FROM lists WHERE user_id = ? ORDER BY position, created_at')
      .bind(uid)
      .all();
    return json((results || []).map(formatBar));
  }

  if (pathname === '/api/lists' && method === 'POST') {
    const body = await readJson(request);
    if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw new HttpError(400, 'Invalid bar id');
    const bar = validateBar(body, { partial: false });

    await ensureLists(db, uid);
    const stats = await db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS top FROM lists WHERE user_id = ?').bind(uid).first();
    if (stats.n >= MAX_LISTS_PER_USER) {
      throw new HttpError(409, `You can have up to ${MAX_LISTS_PER_USER} bars. Delete one to add another.`);
    }
    const result = await db
      .prepare('INSERT OR IGNORE INTO lists (id, user_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(body.id, uid, bar.name, bar.color, stats.top + 1, new Date().toISOString())
      .run();
    return json({ success: true, created: result.meta.changes > 0 }, 201);
  }

  if (pathname === '/api/lists/order' && method === 'PUT') {
    const { ids } = await readJson(request);
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_LISTS_PER_USER || new Set(ids).size !== ids.length ||
        !ids.every((id) => typeof id === 'string' && ID_RE.test(id))) {
      throw new HttpError(400, 'Invalid order');
    }
    const { results } = await db
      .prepare(`SELECT id FROM lists WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
      .bind(uid, ...ids)
      .all();
    if ((results || []).length !== ids.length) throw new HttpError(400, 'Unknown bar');

    await db.batch(ids.map((id, i) => db.prepare('UPDATE lists SET position = ? WHERE id = ? AND user_id = ?').bind(i, id, uid)));
    return json({ success: true });
  }

  const idMatch = pathname.match(/^\/api\/lists\/([^/]+)$/);
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1]);
    if (!ID_RE.test(id)) throw new HttpError(400, 'Invalid bar id');

    if (method === 'PUT') {
      const updates = validateBar(await readJson(request), { partial: true });
      const fields = Object.keys(updates);
      if (fields.length === 0) throw new HttpError(400, 'Nothing to update');
      const result = await db
        .prepare(`UPDATE lists SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ? AND user_id = ?`)
        .bind(...fields.map((f) => updates[f]), id, uid)
        .run();
      if (result.meta.changes === 0) throw new HttpError(404, 'Bar not found');
      return json({ success: true });
    }

    if (method === 'DELETE') {
      const exists = await db.prepare('SELECT 1 AS ok FROM lists WHERE id = ? AND user_id = ?').bind(id, uid).first();
      if (!exists) throw new HttpError(404, 'Bar not found');

      const { results } = await db
        .prepare('SELECT id FROM lists WHERE user_id = ? AND id != ? ORDER BY position, created_at')
        .bind(uid, id)
        .all();
      const others = (results || []).map((r) => r.id);
      if (others.length === 0) throw new HttpError(409, 'Keep at least one bar');

      // Tasks (including Deleted ones) move to another bar; they are never deleted with it.
      const requested = url.searchParams.get('moveTo');
      if (requested && !others.includes(requested)) throw new HttpError(400, 'Unknown bar to move tasks to');
      const destination = requested || others[0];

      const [moved] = await db.batch([
        db.prepare('UPDATE tasks SET list_id = ? WHERE user_id = ? AND list_id = ?').bind(destination, uid, id),
        db.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?').bind(id, uid),
      ]);
      return json({ success: true, moved: moved.meta.changes, movedTo: destination });
    }
  }

  return null;
}

// POST /api/tasks/reorder: move/reposition many tasks at once (used to tidy positions after lots of drags).
export async function handleReorder(request, db, session) {
  const { moves } = await readJson(request, 256 * 1024);
  if (!Array.isArray(moves) || moves.length === 0 || moves.length > MAX_REORDER) throw new HttpError(400, 'Invalid moves');

  const listIds = new Set();
  for (const m of moves) {
    const okId = m && typeof m.id === 'string' && ID_RE.test(m.id);
    const okPos = m && typeof m.position === 'number' && Number.isFinite(m.position) && Math.abs(m.position) <= 1e13;
    const okList = m.list_id === undefined || (typeof m.list_id === 'string' && ID_RE.test(m.list_id));
    if (!okId || !okPos || !okList) throw new HttpError(400, 'Invalid moves');
    if (m.list_id) listIds.add(m.list_id);
  }

  if (listIds.size > 0) {
    const ids = [...listIds];
    const { results } = await db
      .prepare(`SELECT id FROM lists WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
      .bind(session.uid, ...ids)
      .all();
    if ((results || []).length !== ids.length) throw new HttpError(400, 'Unknown bar');
  }

  const results = await db.batch(
    moves.map((m) =>
      m.list_id
        ? db
            .prepare('UPDATE tasks SET list_id = ?, position = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
            .bind(m.list_id, m.position, m.id, session.uid)
        : db
            .prepare('UPDATE tasks SET position = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
            .bind(m.position, m.id, session.uid)
    )
  );
  return json({ success: true, updated: results.reduce((sum, r) => sum + r.meta.changes, 0) });
}
