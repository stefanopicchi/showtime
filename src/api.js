// Piccolo client per le API di ShowTime (/api/*)
async function call(method, path, body) {
  let r;
  try {
    r = await fetch('/api/' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('session'); // rete assente oppure sessione Cloudflare Access scaduta
  }
  if (!(r.headers.get('content-type') || '').includes('json')) throw new Error('session');
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || String(r.status));
  return j;
}

export const api = {
  get: (p) => call('GET', p),
  post: (p, b) => call('POST', p, b),
  put: (p, b) => call('PUT', p, b),
  patch: (p, b) => call('PATCH', p, b),
};
