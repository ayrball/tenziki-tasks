import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { drainQueue, retryDelayMs } from '../../src/lib/syncQueue.js';

// A tiny in-memory queue shaped like the one TaskContext keeps.
function makeQueue(ops) {
  let queue = ops.map((op, i) => ({ id: `op${i}`, ...op }));
  return {
    peek: () => queue[0],
    remove: (id) => {
      queue = queue.filter((o) => o.id !== id);
    },
    push: (op) => {
      queue = [...queue, { id: `late${queue.length}`, ...op }];
    },
    ids: () => queue.map((o) => o.id),
    types: () => queue.map((o) => o.type),
  };
}
const httpError = (status, message = 'error') => Object.assign(new Error(message), { status });

describe('drainQueue', () => {
  it('sends operations in order and empties the queue', async () => {
    const q = makeQueue([{ type: 'create' }, { type: 'update' }, { type: 'delete' }]);
    const sent = [];
    const result = await drainQueue({ peek: q.peek, remove: q.remove, run: async (op) => sent.push(op.type) });
    assert.deepEqual(sent, ['create', 'update', 'delete']);
    assert.equal(result.status, 'done');
    assert.deepEqual(q.ids(), []);
  });

  it('stops at the first network failure and keeps that operation and everything after it', async () => {
    const q = makeQueue([{ type: 'create' }, { type: 'update' }, { type: 'delete' }]);
    let calls = 0;
    const result = await drainQueue({
      peek: q.peek,
      remove: q.remove,
      run: async () => {
        if (++calls === 2) throw httpError(0, 'offline');
      },
    });
    assert.equal(result.status, 'offline');
    assert.deepEqual(q.types(), ['update', 'delete'], 'the failed operation stays at the front, in order');
  });

  it('treats server errors, 429 and 408 as retryable', async () => {
    for (const status of [500, 502, 503, 429, 408]) {
      const q = makeQueue([{ type: 'update' }]);
      const result = await drainQueue({ peek: q.peek, remove: q.remove, run: async () => Promise.reject(httpError(status)) });
      assert.equal(result.status, 'offline', `status ${status}`);
      assert.equal(q.ids().length, 1, `status ${status} keeps the operation`);
    }
  });

  it('keeps the queue and reports unauthorized on 401', async () => {
    const q = makeQueue([{ type: 'update' }, { type: 'delete' }]);
    const result = await drainQueue({ peek: q.peek, remove: q.remove, run: async () => Promise.reject(httpError(401)) });
    assert.equal(result.status, 'unauthorized');
    assert.equal(q.ids().length, 2);
  });

  it('drops operations the server refuses for good and carries on with the rest', async () => {
    const q = makeQueue([{ type: 'update', target: 'gone' }, { type: 'create' }, { type: 'update' }]);
    const sent = [];
    const result = await drainQueue({
      peek: q.peek,
      remove: q.remove,
      run: async (op) => {
        sent.push(op.type);
        if (op.target === 'gone') throw httpError(404, 'Task not found');
        if (op.type === 'create') throw httpError(409, 'limit reached');
      },
    });
    assert.equal(result.status, 'done');
    assert.deepEqual(sent, ['update', 'create', 'update']);
    assert.deepEqual(result.dropped.map((d) => d.status), [404, 409]);
    assert.equal(result.dropped[1].message, 'limit reached');
    assert.deepEqual(q.ids(), []);
  });

  it('picks up operations added while it is running instead of overwriting them', async () => {
    const q = makeQueue([{ type: 'create' }]);
    const sent = [];
    const result = await drainQueue({
      peek: q.peek,
      remove: q.remove,
      run: async (op) => {
        sent.push(op.type);
        if (op.type === 'create') q.push({ type: 'update' }); // the user edits while the first request is in flight
      },
    });
    assert.deepEqual(sent, ['create', 'update']);
    assert.equal(result.status, 'done');
    assert.deepEqual(q.ids(), []);
  });

  it('resumes where it left off on the next attempt', async () => {
    const q = makeQueue([{ type: 'a' }, { type: 'b' }, { type: 'c' }]);
    const sent = [];
    let online = false;
    const run = async (op) => {
      if (!online) throw httpError(0);
      sent.push(op.type);
    };
    assert.equal((await drainQueue({ peek: q.peek, remove: q.remove, run })).status, 'offline');
    online = true;
    assert.equal((await drainQueue({ peek: q.peek, remove: q.remove, run })).status, 'done');
    assert.deepEqual(sent, ['a', 'b', 'c']);
  });
});

describe('retryDelayMs', () => {
  it('backs off exponentially and never waits more than a minute', () => {
    assert.deepEqual([0, 1, 2, 3, 4].map(retryDelayMs), [4000, 8000, 16000, 32000, 60000]);
    assert.equal(retryDelayMs(30), 60000);
  });
});
