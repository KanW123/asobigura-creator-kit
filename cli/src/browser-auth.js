import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';

export async function exchangeCode({ config, code, verifier, fetchFn = fetch }) {
  const response = await fetchFn(`${config.SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', apikey: config.SUPABASE_ANON_KEY },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  if (!response.ok) throw new Error('Authentication code exchange failed');
  const session = await response.json();
  if (!session.access_token || !session.refresh_token) throw new Error('Invalid session');
  const userResponse = await fetchFn(`${config.SUPABASE_URL}/auth/v1/user`, {
    redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { apikey: config.SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
  });
  if (!userResponse.ok) throw new Error('User verification failed');
  const user = await userResponse.json();
  if (!user.id || user.id !== session.user?.id) throw new Error('Session user mismatch');
  return { ...session, user };
}

// Dependency injection allows local tests without contacting production or opening a browser.
export async function startBrowserAuth({ config, exchange = exchangeCode, save, timeoutMs = 180000 }) {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  let resolveResult, rejectResult, timer, busy = false, ended = false;
  const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  result.catch(() => {});
  let origin;
  function finish(error, session) {
    if (ended) return;
    ended = true; clearTimeout(timer); server.close(); server.closeAllConnections();
    if (error) rejectResult(error); else resolveResult(session);
  }
  const server = createServer(async (req, res) => {
    const reply = (status, text) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
      res.end(text);
    };
    if (req.headers.host !== new URL(origin).host || req.url.length > 8192 ||
        (req.headers.origin && req.headers.origin !== origin)) return reply(403, 'Rejected');
    const url = new URL(req.url, origin);
    if (req.method !== 'GET' || url.pathname !== '/callback') return reply(404, 'Not found');
    if (url.searchParams.get('state') !== state) return reply(403, 'Invalid login attempt');
    if (busy || ended) return reply(409, 'Login already processed');
    const code = url.searchParams.get('code');
    if (url.searchParams.has('error') || !code || code.length > 4096) {
      reply(400, 'Login failed. Return to the terminal.');
      return finish(new Error('Login cancelled or invalid callback'));
    }
    busy = true;
    try {
      const session = await exchange({ config, code, verifier });
      if (ended) return;
      await save(session);
      reply(200, 'Login successful. You can close this tab.');
      // Let the response drain before closing connections.
      res.on('finish', () => finish(null, session));
    } catch {
      if (ended) return;
      reply(400, 'Login failed. No credentials were accepted.');
      res.on('finish', () => finish(new Error('Login failed; retry from the terminal')));
    }
  });
  server.headersTimeout = 10000; server.requestTimeout = 15000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  const callback = `${origin}/callback?state=${state}`;
  const url = new URL(`${config.SUPABASE_URL}/auth/v1/authorize`);
  url.search = new URLSearchParams({ provider: 'google', redirect_to: callback,
    code_challenge: challenge, code_challenge_method: 's256' }).toString();
  timer = setTimeout(() => finish(new Error('Login timed out')), timeoutMs);
  return { url: url.href, callback, result, cancel: () => finish(new Error('Login cancelled')) };
}
