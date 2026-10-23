// API tests for bars (user-defined task sections). Run with `npm test`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { call, mint } from './helpers.mjs';

const T = mint('user-bars');
const T2 = mint('user-bars-b');
const bars = async (token) => (await call('GET', '/api/lists', { token })).data;
const names = (list) => list.map((b) => b.name);
const mk = (token, id, name, color = 'violet') => call('POST', '/api/lists', { token, body: { id, name, color } });
const mkTask = (token, id, extra = {}) => call('POST', '/api/tasks', { token, body: { id, title: `Task ${id}`, ...extra } });
const find = async (token, id) => (await call('GET', '/api/tasks', { token })).data.find((t) => t.id === id);

describe('bars (user-defined sections)', () => {
  it('requires sign-in for every bar endpoint', async () => {
    assert.equal((await call('GET', '/api/lists')).status, 401);
    assert.equal((await call('POST', '/api/lists', { body: { id: 'x', name: 'x' } })).status, 401);
    assert.equal((await call('PUT', '/api/lists/x', { body: { name: 'x' } })).status, 401);
    assert.equal((await call('DELETE', '/api/lists/x')).status, 401);
    assert.equal((await call('PUT', '/api/lists/order', { body: { ids: ['x'] } })).status, 401);
    assert.equal((await call('POST', '/api/tasks/reorder', { body: { moves: [] } })).status, 401);
  });

  it('gives a new account the four starter bars, in order', async () => {
    const list = await bars(T);
    assert.deepEqual(names(list), ['Personal', 'Work', 'Fitness', 'Ideas']);
    assert.deepEqual(list.map((b) => b.position), [0, 1, 2, 3]);
    assert.equal(list[1].color, 'violet');
  });

  it('does not create duplicate bars when loaded again', async () => {
    await bars(T);
    await call('GET', '/api/tasks', { token: T });
    assert.equal((await bars(T)).length, 4);
  });

  it("files an older account's tasks into bars made from the categories it already used", async () => {
    const L = mint('user-legacy');
    const tasks = (await call('GET', '/api/tasks', { token: L })).data;
    const list = await bars(L);
    assert.deepEqual(names(list), ['Personal', 'Work', 'Fitness', 'Ideas', 'Reading'], 'the standard four plus the extra category in use');
    const nameOf = (id) => list.find((b) => b.id === id)?.name;
    assert.equal(nameOf(tasks.find((t) => t.id === 'leg-1').list_id), 'Work');
    assert.equal(nameOf(tasks.find((t) => t.id === 'leg-2').list_id), 'Fitness');
    assert.equal(nameOf(tasks.find((t) => t.id === 'leg-3').list_id), 'Reading');
    assert.deepEqual(tasks.map((t) => t.id), ['leg-1', 'leg-2', 'leg-3'], 'the existing order is kept');
  });

  it('creates, renames and recolours a bar', async () => {
    assert.equal((await mk(T, 'bar-groceries', '  Groceries   list ', 'teal')).status, 201);
    let b = (await bars(T)).find((x) => x.id === 'bar-groceries');
    assert.deepEqual([b.name, b.color, b.position], ['Groceries list', 'teal', 4], 'trimmed, spaces collapsed, added at the end');
    assert.equal((await call('PUT', '/api/lists/bar-groceries', { token: T, body: { name: 'Shopping', color: 'rose' } })).status, 200);
    b = (await bars(T)).find((x) => x.id === 'bar-groceries');
    assert.deepEqual([b.name, b.color], ['Shopping', 'rose']);
  });

  it('rejects bad bar input', async () => {
    const bad = async (body) => assert.equal((await call('POST', '/api/lists', { token: T, body })).status, 400, JSON.stringify(body));
    await bad({ id: 'v1', name: '   ' });
    await bad({ id: 'v2', name: 'x'.repeat(41) });
    await bad({ id: 'v3', name: 'ok', color: 'chartreuse' });
    await bad({ id: 'has spaces', name: 'ok' });
    await bad({ id: 'v4', name: 123 });
    assert.equal((await call('PUT', '/api/lists/bar-groceries', { token: T, body: {} })).status, 400);
    assert.equal((await call('PUT', '/api/lists/bar-groceries', { token: T, body: { color: 'nope' } })).status, 400);
  });

  it('puts a new task in the first bar unless another is asked for', async () => {
    await mkTask(T, 'bt-default');
    const first = (await bars(T))[0].id;
    assert.equal((await find(T, 'bt-default')).list_id, first);
    await mkTask(T, 'bt-groceries', { list_id: 'bar-groceries' });
    assert.equal((await find(T, 'bt-groceries')).list_id, 'bar-groceries');
  });

  it("never lets one account file tasks into, edit or delete another account's bars", async () => {
    await mk(T2, 'bar-b-private', 'B only');
    assert.equal((await mkTask(T, 'bt-steal', { list_id: 'bar-b-private' })).status, 400, 'create into a foreign bar');
    assert.equal((await call('PUT', '/api/tasks/bt-default', { token: T, body: { list_id: 'bar-b-private' } })).status, 400, 'move into a foreign bar');
    assert.equal((await call('PUT', '/api/lists/bar-b-private', { token: T, body: { name: 'mine now' } })).status, 404);
    assert.equal((await call('DELETE', '/api/lists/bar-b-private', { token: T })).status, 404);
    assert.equal((await call('PUT', '/api/lists/order', { token: T, body: { ids: ['bar-b-private'] } })).status, 400);
    const move = { id: 'bt-default', list_id: 'bar-b-private', position: 1 };
    assert.equal((await call('POST', '/api/tasks/reorder', { token: T, body: { moves: [move] } })).status, 400);
    assert.ok(!(await bars(T)).some((b) => b.id === 'bar-b-private'), "B's bar never shows up for A");
    assert.equal((await bars(T2)).find((b) => b.id === 'bar-b-private').name, 'B only');
    assert.equal((await find(T, 'bt-default')).list_id, (await bars(T))[0].id, 'the task did not move');
  });

  it('moves a task to another bar and remembers its place', async () => {
    assert.equal((await call('PUT', '/api/tasks/bt-default', { token: T, body: { list_id: 'bar-groceries', position: 5.5 } })).status, 200);
    const t = await find(T, 'bt-default');
    assert.deepEqual([t.list_id, t.position], ['bar-groceries', 5.5]);
  });

  it('validates position and bar fields on tasks', async () => {
    for (const body of [{ position: 'top' }, { position: 1e20 }, { position: null }, { list_id: 42 }, { list_id: 'bad id!' }]) {
      assert.equal((await call('PUT', '/api/tasks/bt-default', { token: T, body })).status, 400, JSON.stringify(body));
    }
  });

  it('returns tasks in their saved order', async () => {
    for (const [id, position] of [['ord-c', 3], ['ord-a', 1], ['ord-b', 2]]) await mkTask(T, id, { position });
    const order = (await call('GET', '/api/tasks', { token: T })).data.map((t) => t.id).filter((id) => id.startsWith('ord-'));
    assert.deepEqual(order, ['ord-a', 'ord-b', 'ord-c']);
  });

  it('repositions many tasks at once, and only live ones', async () => {
    await mkTask(T, 'rb-1', { list_id: 'bar-groceries', position: 10 });
    await mkTask(T, 'rb-2', { list_id: 'bar-groceries', position: 20 });
    await mkTask(T, 'rb-gone', { position: 30 });
    await call('DELETE', '/api/tasks/rb-gone', { token: T });
    const moves = [{ id: 'rb-1', position: 2048 }, { id: 'rb-2', list_id: 'bar-groceries', position: 1024 }, { id: 'rb-gone', position: 1 }];
    const r = await call('POST', '/api/tasks/reorder', { token: T, body: { moves } });
    assert.equal(r.status, 200);
    assert.equal(r.data.updated, 2, 'the Deleted task is left alone');
    assert.equal((await find(T, 'rb-1')).position, 2048);
    assert.equal((await find(T, 'rb-2')).position, 1024);
    assert.equal((await find(T, 'rb-gone')).position, 30);
    for (const bad of [[], 'x', [{ id: 'a', position: 'x' }], Array.from({ length: 501 }, (_, i) => ({ id: `m${i}`, position: i }))]) {
      assert.equal((await call('POST', '/api/tasks/reorder', { token: T, body: { moves: bad } })).status, 400);
    }
  });

  it('reorders the bars themselves', async () => {
    const ids = (await bars(T)).map((b) => b.id);
    const reversed = [...ids].reverse();
    assert.equal((await call('PUT', '/api/lists/order', { token: T, body: { ids: reversed } })).status, 200);
    assert.deepEqual((await bars(T)).map((b) => b.id), reversed);
    for (const bad of [[], ['a', 'a'], 'x', [1]]) assert.equal((await call('PUT', '/api/lists/order', { token: T, body: { ids: bad } })).status, 400);
    await call('PUT', '/api/lists/order', { token: T, body: { ids } }); // put them back
  });

  it('deleting a bar moves its tasks (including Deleted ones) instead of deleting them', async () => {
    await mk(T, 'bar-temp', 'Temporary');
    await mkTask(T, 'tmp-live', { list_id: 'bar-temp' });
    await mkTask(T, 'tmp-trashed', { list_id: 'bar-temp' });
    await call('DELETE', '/api/tasks/tmp-trashed', { token: T });

    assert.equal((await call('DELETE', '/api/lists/bar-temp?moveTo=nope', { token: T })).status, 400, 'unknown destination');
    assert.equal((await call('DELETE', '/api/lists/bar-temp?moveTo=bar-b-private', { token: T })).status, 400, 'foreign destination');
    const r = await call('DELETE', '/api/lists/bar-temp?moveTo=bar-groceries', { token: T });
    assert.equal(r.status, 200);
    assert.equal(r.data.moved, 2);
    assert.ok(!(await bars(T)).some((b) => b.id === 'bar-temp'));
    assert.equal((await find(T, 'tmp-live')).list_id, 'bar-groceries');
    assert.equal((await find(T, 'tmp-trashed')).list_id, 'bar-groceries');

    // restoring still works, and the task lands in a bar that exists
    assert.equal((await call('POST', '/api/tasks/tmp-trashed/restore', { token: T, body: {} })).status, 200);
    const restored = await find(T, 'tmp-trashed');
    assert.equal(restored.deleted_at, null);
    assert.ok((await bars(T)).some((b) => b.id === restored.list_id));
  });

  it('deleting without a destination uses the first remaining bar', async () => {
    await mk(T, 'bar-temp2', 'Temp 2');
    await mkTask(T, 'tmp2', { list_id: 'bar-temp2' });
    const first = (await bars(T)).filter((b) => b.id !== 'bar-temp2')[0].id;
    const r = await call('DELETE', '/api/lists/bar-temp2', { token: T });
    assert.equal(r.data.movedTo, first);
    assert.equal((await find(T, 'tmp2')).list_id, first);
  });

  it('will not delete the last bar', async () => {
    await mk(T2, 'bar-b-2', 'Second');
    const all = (await bars(T2)).map((b) => b.id);
    for (const id of all.slice(0, -1)) assert.equal((await call('DELETE', `/api/lists/${id}`, { token: T2 })).status, 200);
    const r = await call('DELETE', `/api/lists/${all.at(-1)}`, { token: T2 });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /at least one bar/i);
    assert.equal((await bars(T2)).length, 1);
  });

  it('stops at 30 bars', async () => {
    let have = (await bars(T)).length;
    let n = 0;
    while (have < 30) {
      assert.equal((await mk(T, `fill-${n++}`, `Fill ${n}`)).status, 201);
      have++;
    }
    const over = await mk(T, 'fill-over', 'One too many');
    assert.equal(over.status, 409);
    assert.match(over.data.error, /up to 30 bars/);
    assert.equal((await bars(T)).length, 30);
  });
});
