// Shared by the API test files (started by tests/run.mjs).

import { createHmac } from 'node:crypto';

export const BASE = process.env.API_BASE;
const SECRET = process.env.TEST_SESSION_SECRET;
if (!BASE || !SECRET) throw new Error('Run these tests with `npm test`');

const b64 = (b) => Buffer.from(b).toString('base64url');

// Mints a token the way the Worker does. `sid` must match a row in `sessions` (seeded by tests/run.mjs).
export function mint(uid, { sid = `sid-${uid}`, secret = SECRET, exp = Math.floor(Date.now() / 1000) + 600, omitSid = false } = {}) {
  const payload = { uid, email: `${uid}@example.test`, exp, ...(omitSid ? {} : { sid }) };
  const body = b64(JSON.stringify(payload));
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export async function call(method, path, { token, body, headers = {} } = {}) {
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
