// Autenticazione integrata: nome utente + password, sessione in un cookie firmato.
//
// Variabili da impostare su Cloudflare Pages:
//   AUTH_SECRET  stringa lunga e casuale (firma i cookie di sessione)
//   APP_USERS    utenti nel formato  nome:password;altronome:altrapassword
// Ogni utente vede solo i propri dati (il database separa tutto per nome utente).

const enc = new TextEncoder();
const dec = new TextDecoder();
const SESSION_DAYS = 365; // sessione scorrevole: si rinnova a ogni uso

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const b64e = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64u = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const hmacKey = (secret) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

function users(env) {
  const m = new Map();
  for (const part of (env.APP_USERS || '').split(';')) {
    const i = part.indexOf(':');
    if (i > 0) m.set(part.slice(0, i).trim().toLowerCase(), part.slice(i + 1));
  }
  return m;
}

async function makeSession(env, user) {
  const payload = b64e(enc.encode(JSON.stringify({ u: user, e: Date.now() + SESSION_DAYS * 864e5 })));
  const sig = b64e(await crypto.subtle.sign('HMAC', await hmacKey(env.AUTH_SECRET), enc.encode(payload)));
  return `${payload}.${sig}`;
}

async function readSession(env, request) {
  const m = /(?:^|;\s*)st_session=([^;]+)/.exec(request.headers.get('Cookie') || '');
  if (!m) return null;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env.AUTH_SECRET), b64u(sig), enc.encode(payload));
    if (!ok) return null;
    const { u, e } = JSON.parse(dec.decode(b64u(payload)));
    return e > Date.now() && users(env).has(u) ? { user: u, e } : null; // l'utente deve esistere ancora
  } catch {
    return null;
  }
}

const cookie = (value, maxAge) =>
  `st_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export async function onRequest({ request, env, data, next }) {
  const path = new URL(request.url).pathname;

  // Solo sviluppo locale
  if (env.ALLOW_ANON === '1') {
    data.user = 'dev@local';
    return next();
  }
  if (!env.AUTH_SECRET || !env.APP_USERS) return json({ error: 'auth_not_configured' }, 503);

  if (path === '/api/logout' && request.method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }

  if (path === '/api/login' && request.method === 'POST') {
    const { u, p } = await request.json().catch(() => ({}));
    const name = String(u || '').trim().toLowerCase();
    const expected = users(env).get(name);
    let ok = false;
    if (expected !== undefined && typeof p === 'string') {
      // confronto a tempo costante tramite HMAC
      const key = await hmacKey(env.AUTH_SECRET);
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(expected));
      ok = await crypto.subtle.verify('HMAC', key, sig, enc.encode(p));
    }
    if (!ok) {
      await new Promise((r) => setTimeout(r, 800)); // rallenta i tentativi a raffica
      return json({ error: 'bad_login' }, 401);
    }
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(await makeSession(env, name), SESSION_DAYS * 86400) });
  }

  const session = await readSession(env, request);
  if (!session) return json({ error: 'unauthorized' }, 401);
  data.user = session.user;
  const res = await next();

  // Rinnovo: al massimo una volta al giorno rimandiamo il cookie con la scadenza riportata a 365 giorni
  if (session.e - Date.now() < (SESSION_DAYS - 1) * 864e5) {
    const out = new Response(res.body, res);
    out.headers.append('Set-Cookie', cookie(await makeSession(env, session.user), SESSION_DAYS * 86400));
    return out;
  }
  return res;
}
