// Client for the Worker API in src/worker.js. Every call throws ApiError on failure.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(method, path, { token, body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('You appear to be offline', 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body
  }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data;
}

export const api = {
  getAuthConfig: () => request('GET', '/api/auth/config'),
  signInWithGoogle: (credential) => request('POST', '/api/auth/google', { body: { credential } }),
  // Revokes this device's session on the server (signOutAll: every device's).
  signOut: (token) => request('POST', '/api/auth/signout', { token, body: {} }),
  signOutAll: (token) => request('POST', '/api/auth/signout-all', { token, body: {} }),

  listTasks: (token) => request('GET', '/api/tasks', { token }),
  createTask: (token, task) => request('POST', '/api/tasks', { token, body: task }),
  updateTask: (token, id, updates) => request('PUT', `/api/tasks/${encodeURIComponent(id)}`, { token, body: updates }),
  // Moves a task to the Deleted section.
  deleteTask: (token, id) => request('DELETE', `/api/tasks/${encodeURIComponent(id)}`, { token }),
  restoreTask: (token, id) => request('POST', `/api/tasks/${encodeURIComponent(id)}/restore`, { token, body: {} }),
  // Permanent. The server only allows it for tasks that are already in Deleted.
  deleteForever: (token, id) =>
    request('DELETE', `/api/tasks/${encodeURIComponent(id)}?permanent=true`, { token }),
  emptyTrash: (token) => request('POST', '/api/tasks/empty-trash', { token, body: {} }),
  clearCompleted: (token) => request('POST', '/api/tasks/clear-completed', { token, body: {} }),
  completeAll: (token) => request('POST', '/api/tasks/complete-all', { token, body: {} }),
  // Move/reposition many tasks at once: moves = [{ id, list_id?, position }]
  reorderTasks: (token, moves) => request('POST', '/api/tasks/reorder', { token, body: { moves } }),

  // Bars (the user's named sections)
  listBars: (token) => request('GET', '/api/lists', { token }),
  createBar: (token, bar) => request('POST', '/api/lists', { token, body: bar }),
  updateBar: (token, id, updates) => request('PUT', `/api/lists/${encodeURIComponent(id)}`, { token, body: updates }),
  // Tasks in the deleted bar move to `moveTo` (or the first remaining bar); they are never deleted.
  deleteBar: (token, id, moveTo) =>
    request('DELETE', `/api/lists/${encodeURIComponent(id)}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`, { token }),
  reorderBars: (token, ids) => request('PUT', '/api/lists/order', { token, body: { ids } }),
};
