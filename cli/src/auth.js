import { createCredentialStore } from './credential-store.js';
import { config } from './config.js';

const store = createCredentialStore();

export function saveCredentials(session) {
  if (!session.user?.id || typeof session.access_token !== 'string' || !session.access_token ||
      typeof session.refresh_token !== 'string' || !session.refresh_token) {
    throw new Error('Invalid authentication session');
  }
  const data = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || (Date.now() / 1000 + 3600),
    user: session.user ? {
      id: session.user.id,
      email: session.user.email,
      display_name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0],
    } : null,
  };
  store.save(data);
}

export function loadCredentials() {
  return store.load();
}

export function clearCredentials() {
  store.clear();
}

export async function getValidToken() {
  const creds = loadCredentials();
  if (!creds) return null;

  // Check if token is expired (with 60s buffer)
  const now = Date.now() / 1000;
  if (creds.expires_at && creds.expires_at - 60 > now) {
    return creds.access_token;
  }

  // Try refresh
  if (creds.refresh_token) {
    try {
      const res = await fetch(`${config.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: creds.refresh_token }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user?.id !== creds.user?.id) throw new Error('Refresh user mismatch');
        saveCredentials(data);
        return data.access_token;
      }
    } catch { /* fall through */ }
  }

  return null;
}

export async function requireAuth() {
  const token = await getValidToken();
  if (!token) {
    console.error('Not logged in or session expired. Run: gameplatform login');
    process.exit(1);
  }
  const creds = loadCredentials();
  return { ...creds, access_token: token };
}
