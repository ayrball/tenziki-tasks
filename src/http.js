// Small HTTP helpers shared by the Worker modules.

export const MAX_BODY_BYTES = 16 * 1024;

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request body too large');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}
