// Autenticazione: l'app sta dietro Cloudflare Access.
// Verifichiamo il token firmato (JWT) e ricaviamo l'email dell'utente.
// Ogni utente vede solo i propri dati.

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const keyCache = { keys: null, at: 0 };

function b64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function verifyAccess(request, env) {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return null;
  const [h, p, s] = jwt.split('.');
  if (!h || !p || !s) return null;
  const dec = new TextDecoder();
  const header = JSON.parse(dec.decode(b64u(h)));
  const payload = JSON.parse(dec.decode(b64u(p)));
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;

  if (!keyCache.keys || Date.now() - keyCache.at > 3600e3) {
    const r = await fetch(`${issuer}/cdn-cgi/access/certs`);
    keyCache.keys = (await r.json()).keys;
    keyCache.at = Date.now();
  }
  const jwk = keyCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(`${h}.${p}`)
  );
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!ok || payload.iss !== issuer || !aud.includes(env.ACCESS_AUD) || payload.exp * 1000 < Date.now()) {
    return null;
  }
  return payload.email || null;
}

export async function onRequest({ request, env, data, next }) {
  let email = null;
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    email = await verifyAccess(request, env).catch(() => null);
  } else if (env.ALLOW_ANON === '1') {
    email = 'dev@local'; // solo per sviluppo locale
  } else {
    return json({ error: 'auth_not_configured' }, 503);
  }
  if (!email) return json({ error: 'unauthorized' }, 401);
  data.user = email.toLowerCase();
  return next();
}
