/**
 * Resume helper — survive the checkout round-trip.
 *
 * A payment redirects the whole tab to Stripe; on return the platform rebuilds
 * the game iframe from the canonical URL, so the game's in-memory state (which
 * menu the player was in) is lost. The only thing that survives that reload is
 * same-origin localStorage. Call save() right before starting a checkout, then
 * consume() on boot to restore where the player was.
 *
 * Namespaced by gameId so games sharing the game-server origin don't collide,
 * and TTL'd so a stale "resume" can't fire days later.
 *
 * SAFETY: restore only up to a confirmation screen (e.g. the stamina/buy
 * dialog). NEVER auto-start a battle or auto-trigger another purchase from a
 * restored state — that would risk an unintended charge.
 */
const KEY_PREFIX = 'gp:resume:';
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null; // storage blocked (e.g. strict third-party storage)
  }
}

export function createResume(gameId) {
  const key = KEY_PREFIX + (gameId || 'unknown');

  function read() {
    const ls = getStorage();
    if (!ls) return null;
    let raw;
    try {
      raw = ls.getItem(key);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const o = JSON.parse(raw);
      if (!o || typeof o.t !== 'number') return null;
      const ttl = typeof o.ttl === 'number' ? o.ttl : DEFAULT_TTL_MS;
      if (Date.now() - o.t > ttl) return null;
      return o.data ?? null;
    } catch {
      return null;
    }
  }

  return {
    /**
     * Save a small, JSON-serializable resume payload before a checkout.
     * @param state where the player was (screen/menu ids — nothing that should
     *   auto-execute on restore). @param opts.ttlMs validity window (default 10m).
     * @returns true if persisted.
     */
    save(state, { ttlMs = DEFAULT_TTL_MS } = {}) {
      const ls = getStorage();
      if (!ls) return false;
      try {
        ls.setItem(key, JSON.stringify({ v: 1, t: Date.now(), ttl: ttlMs, data: state }));
        return true;
      } catch {
        return false;
      }
    },

    /** Read AND delete (one-shot). Returns the state, or null if missing/expired. */
    consume() {
      const data = read();
      this.clear();
      return data;
    },

    /** Read without deleting. Returns the state, or null if missing/expired. */
    peek() {
      return read();
    },

    /** Discard any saved resume state. */
    clear() {
      const ls = getStorage();
      if (!ls) return;
      try {
        ls.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}
