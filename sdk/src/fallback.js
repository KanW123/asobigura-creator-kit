import { createResume } from './resume.js';
import { openUrlFallback } from './openUrl.js';
import { STUN_ONLY_ICE_SERVERS } from './multiplayer.js';

// お金が動く操作は、ポータル(asobigura.com)の中でしか成立しない。
// フォールバック（ポータル外・SDK未接続）で 0 や noop を返すと、ゲームは
// 「残高0だから買えない」と誤解したり、買えたつもりで進んでしまう。
// 必ず失敗させて、原因が分かるメッセージを出す。
export function walletUnavailableError() {
  return new Error(
    '[GamePlatform SDK] wallet.* requires the portal. ' +
    'The game is running outside asobigura.com (or the SDK failed to connect), ' +
    'so coin balance and purchases are unavailable. ' +
    'Launch the game from the portal. See /sdk-reference.md.'
  );
}

/**
 * No-op fallback when SDK fails to load or connect.
 * Games continue to work without platform features.
 */
export function createFallback(gameId) {
  const noop = () => Promise.resolve(null);
  const noopSync = () => {};

  return {
    ready: false,
    user: null,
    purchased: false,
    features: {},

    async isPurchased() { return false; },

    stamina: {
      get: noop,
      // Offline / outside the platform: battles are unlimited
      consume: () => Promise.resolve({ allowed: true, stamina: -1 }),
      checkout: noop,
    },

    scores: {
      submitScore: noop,
      getLeaderboard: () => Promise.resolve({ entries: [], total: 0 }),
    },
    saves: {
      saveProgress: noop,
      loadProgress: noop,
      listSaveSlots: () => Promise.resolve([]),
    },
    auth: {
      getUser: noop,
      requestLogin: noop,
      onAuthChange: () => noopSync,
    },
    ugc: {
      getItems: () => Promise.resolve({ items: [] }),
      getItem: noop,
      submit: noop,
      rate: noop,
    },
    // ポータル外では成立しない操作。noopではなく必ず失敗させる。
    wallet: {
      getBalance: () => Promise.reject(walletUnavailableError()),
      getShopItems: () => Promise.reject(walletUnavailableError()),
      getMyItems: () => Promise.reject(walletUnavailableError()),
      purchase: () => Promise.reject(walletUnavailableError()),
      consume: () => Promise.reject(walletUnavailableError()),
      promptCharge: () => Promise.reject(walletUnavailableError()),
    },
    shop: {
      // ポータル内と同じ形 { items: [{ id, name, description, price_jpy, current_price_jpy, sale, owned }] }（空）
      // sale = { label, price_jpy, start, end, mode: 'free_play' | 'giveaway' | 'sale' } or null
      getItems: () => Promise.resolve({ items: [] }),
      getOwned: () => Promise.resolve([]),
      owns: () => Promise.resolve(false),
      buy: noop,
    },
    multiplayer: {
      joinQueue: noop,
      leaveQueue: noopSync,
      onMatchFound: noopSync,
      connect: noop,
      send: noopSync,
      onMessage: noopSync,
      reportResult: noopSync,
      disconnect: noopSync,
      onOpponentDisconnect: noopSync,
      getLatency: () => 0,
      getCurrentMatch: () => null,
      // Outside the portal: no TURN credentials, STUN only (same list as multiplayer.js).
      reportVoid: noopSync,
      getMyRating: () => Promise.reject(Object.assign(new Error('getMyRating requires the portal'), { code: 'AUTH_REQUIRED' })),
      getRatingLeaderboard: () => Promise.resolve({ entries: [], total: 0 }),
      getIceServers: () => Promise.resolve(STUN_ONLY_ICE_SERVERS.map((s) => ({ urls: [...s.urls] }))),
    },
    events: {
      reportEvent: noopSync,
    },
    // Outside the portal: plain window.open (allowlist not enforced, warns instead).
    openUrl: openUrlFallback,
    // Resume works PF-independently (pure localStorage), so it's real even here.
    resume: createResume(gameId),
    destroy: noopSync,
  };
}
