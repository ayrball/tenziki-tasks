// Offline-safe change queue. Every change a signed-in user makes becomes an operation that is stored locally
// and sent to the server in order. If the network is down the operations wait (and survive a reload),
// then are replayed when the connection returns, so no edit is lost.

import { api } from './apiClient.js';

const storageKey = (uid) => `tenziki_queue_${uid}`;

export function loadQueue(uid) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(uid)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveQueue(uid, ops) {
  try {
    if (ops.length > 0) localStorage.setItem(storageKey(uid), JSON.stringify(ops));
    else localStorage.removeItem(storageKey(uid));
  } catch {
    // storage full/unavailable: the queue still works for this page session
  }
}

// Sends one operation to the server.
export function runOp(token, op) {
  switch (op.type) {
    case 'create':
      return api.createTask(token, op.task);
    case 'update':
      return api.updateTask(token, op.id, op.updates);
    case 'delete':
      return api.deleteTask(token, op.id);
    case 'restore':
      return api.restoreTask(token, op.id);
    case 'forever':
      return api.deleteForever(token, op.id);
    case 'emptyTrash':
      return api.emptyTrash(token);
    case 'clearCompleted':
      return api.clearCompleted(token);
    case 'completeAll':
      return api.completeAll(token);
    case 'reorderTasks':
      return api.reorderTasks(token, op.moves);
    case 'createBar':
      return api.createBar(token, op.bar);
    case 'updateBar':
      return api.updateBar(token, op.id, op.updates);
    case 'deleteBar':
      return api.deleteBar(token, op.id, op.moveTo);
    case 'reorderBars':
      return api.reorderBars(token, op.ids);
    default:
      return Promise.resolve();
  }
}

// Sends queued operations one at a time, in order.
//   peek()      returns the first waiting operation (re-read every time, so changes made while
//               this runs are picked up instead of overwritten)
//   run(op)     sends it to the server
//   remove(id)  takes it off the queue once it is done
// Result status:
//   'done'          every operation was sent (or refused by the server and dropped)
//   'offline'       the network or server is unavailable: the rest stay queued for a retry
//   'unauthorized'  the session ended: the rest stay queued for the next sign-in
// Operations the server refuses for good (4xx, e.g. the task no longer exists) are dropped and reported.
export async function drainQueue({ peek, run, remove }) {
  const dropped = [];

  for (;;) {
    const op = peek();
    if (!op) return { status: 'done', dropped };
    try {
      await run(op);
    } catch (err) {
      if (err.status === 401) return { status: 'unauthorized', dropped };
      const retryable = !err.status || err.status >= 500 || err.status === 429 || err.status === 408;
      if (retryable) return { status: 'offline', dropped };
      dropped.push({ op, status: err.status, message: err.message });
    }
    remove(op.id);
  }
}

// Seconds to wait before retry number `attempt` (0, 1, 2...): 4s, 8s, 16s ... capped at 60s.
export function retryDelayMs(attempt) {
  return Math.min(60000, 4000 * 2 ** attempt);
}
