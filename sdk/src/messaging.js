/**
 * postMessage communication layer between game iframe and platform portal.
 */

const TIMEOUT_MS = 5000;
const pending = new Map();
let bridgeId = null;
let gameId = null;
let sdkVersion = '1';
let portalOrigin = null;
let transport = 'iframe';

export function initMessaging(config) {
  transport = 'iframe';
  bridgeId = config.bridgeId;
  gameId = config.gameId;
  sdkVersion = config.sdkVersion || '1';
  portalOrigin = config.portalOrigin;

  window.addEventListener('message', handleMessage);
}

export function initTopLevelMessaging(config) {
  transport = 'top_level';
  gameId = config.gameId;
  sdkVersion = config.sdkVersion || '1';
  bridgeId = null;
  portalOrigin = null;
}

export function getTransport() {
  return transport;
}

export function destroyMessaging() {
  window.removeEventListener('message', handleMessage);
  for (const [, { reject }] of pending) {
    reject(new Error('SDK destroyed'));
  }
  pending.clear();
}

// Listeners for push events from platform
const pushListeners = new Map();

export function onPush(type, callback) {
  if (!pushListeners.has(type)) pushListeners.set(type, []);
  pushListeners.get(type).push(callback);
  return () => {
    const arr = pushListeners.get(type);
    if (arr) {
      const idx = arr.indexOf(callback);
      if (idx !== -1) arr.splice(idx, 1);
    }
  };
}

function handleMessage(event) {
  // Validate origin
  if (portalOrigin && event.origin !== portalOrigin) return;

  const data = event.data;
  if (!data) return;

  // Handle push events from platform (e.g. auth changes)
  if (data.type === 'PLATFORM_SDK_AUTH_CHANGE') {
    const listeners = pushListeners.get('auth_change') || [];
    for (const cb of listeners) {
      try { cb(data.user); } catch { /* ignore */ }
    }
    return;
  }

  if (data.type !== 'PLATFORM_SDK_RESPONSE') return;

  const resolver = pending.get(data.id);
  if (!resolver) return;

  pending.delete(data.id);
  clearTimeout(resolver.timer);

  if (data.success) {
    resolver.resolve(data.data);
  } else {
    const err = new Error(data.error?.message || 'Unknown error');
    err.code = data.error?.code || 'UNKNOWN';
    resolver.reject(err);
  }
}

export function sendRequest(method, params = {}, timeout = TIMEOUT_MS) {
  if (transport === 'top_level') return sendTopLevelRequest(method, params, timeout);
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();

    const timer = setTimeout(() => {
      pending.delete(id);
      const err = new Error(`SDK request timed out: ${method}`);
      err.code = 'SDK_TIMEOUT';
      reject(err);
    }, timeout);

    pending.set(id, { resolve, reject, timer });

    const message = {
      type: 'PLATFORM_SDK_REQUEST',
      id,
      bridgeId,
      gameId,
      method,
      params,
      sdkVersion,
    };

    window.parent.postMessage(message, portalOrigin || '*');
  });
}

async function sendTopLevelRequest(method, params, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch('/.gameplatform/sdk', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params, gameId, sdkVersion }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      const err = new Error(payload.error?.message || `SDK request failed (${response.status})`);
      err.code = payload.error?.code || (response.status === 401 ? 'SESSION_EXPIRED' : 'API_ERROR');
      // On SESSION_EXPIRED this is the platform page that relaunches the game
      // with a fresh session: resume.save() then location.assign(err.navigate_url).
      if (payload.error?.navigate_url) err.navigate_url = payload.error.navigate_url;
      throw err;
    }
    const result = payload.data;
    if (result?.navigate_url) {
      window.location.assign(result.navigate_url);
      return { redirecting: true };
    }
    return result;
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutError = new Error(`SDK request timed out: ${method}`);
      timeoutError.code = 'SDK_TIMEOUT';
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
