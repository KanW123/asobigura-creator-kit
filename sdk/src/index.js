import { initMessaging, initTopLevelMessaging, sendRequest, destroyMessaging } from './messaging.js';
import * as scores from './scores.js';
import * as saves from './saves.js';
import * as auth from './auth.js';
import * as events from './events.js';
import * as multiplayer from './multiplayer.js';
import { createFallback } from './fallback.js';
import { createResume } from './resume.js';
import { openUrl } from './openUrl.js';

/**
 * GamePlatform SDK — loaded inside game iframes.
 *
 * Usage:
 *   const platform = await GamePlatform.init({ gameId: 'click-counter' });
 *   if (platform.ready) {
 *     const result = await platform.scores.submitScore({ score: 100 });
 *   }
 *
 * 課金は2系統ある。使い分けを間違えないこと:
 *   platform.wallet.*  コイン建て（1コイン=1円・PF共通通貨）。消費型のゲーム内資産
 *                      （魔石・スタミナ等）に向く。ゲーム内で完結し、残高不足なら
 *                      promptCharge() でその場でチャージできる。
 *   platform.shop.*    直¥決済の永続アンロック（スキン・章・DLC）。残高を作らないので
 *                      1回きりの大きめの買い切りに向く。
 * 実際に何が有効かの正は `docs/SPEC_REALITY.md`。
 */
const GamePlatform = {
  async init({ gameId, version = '1.0.0', timeout = 5000, onDisconnect } = {}) {
    if (!gameId) {
      console.warn('[GamePlatform] gameId is required');
      return createFallback(gameId);
    }

    try {
      if (window.parent === window) {
        // Top-level XR/device mode: the HttpOnly game session stays in the
        // browser cookie and SDK calls use the reserved same-origin endpoint.
        initTopLevelMessaging({ gameId, sdkVersion: version });
      } else {
        const handshake = await waitForHandshake(timeout);
        initMessaging({
          bridgeId: handshake.bridgeId,
          gameId,
          sdkVersion: version,
          portalOrigin: handshake.origin,
        });
      }

      // Confirm init with portal
      const initResult = await sendRequest('sdk.init', { gameId, version }, timeout);

      const instance = {
        ready: true,
        user: initResult?.user || null,
        purchased: initResult?.purchased || false,
        features: initResult?.features || {},

        async isPurchased() {
          const result = await sendRequest('sdk.isPurchased', { gameId });
          return result?.purchased || false;
        },

        purchase: {
          async isOwned() {
            const result = await sendRequest('sdk.isPurchased', { gameId });
            return result?.purchased || false;
          },
          async getGameInfo() {
            return sendRequest('purchase.getGameInfo', { gameId });
          },
          async promptPurchase() {
            return sendRequest('purchase.promptPurchase', { gameId }, 120000);
          },
        },

        stamina: {
          // Current stamina state: { stamina, stamina_max, next_regen_at,
          // stamina_refill_price_jpy, buyout_price_jpy, purchased? } or null
          // (not logged in / not a stamina game / outside the platform).
          async get() {
            return sendRequest('stamina.get', { gameId });
          },
          // Consume one unit for a battle: { allowed, stamina, next_regen_at, ... }.
          // stamina === -1 means unlimited (buyout owner or non-stamina game).
          async consume() {
            return sendRequest('stamina.consume', { gameId });
          },
          // Redirect the portal to Stripe Checkout. kind: 'refill' | 'buyout'
          async checkout(kind = 'refill') {
            return sendRequest('stamina.checkout', { gameId, kind }, 120000);
          },
        },

        scores: {
          submitScore: scores.submitScore,
          getLeaderboard: scores.getLeaderboard,
        },
        saves: {
          saveProgress: saves.saveProgress,
          loadProgress: saves.loadProgress,
          listSaveSlots: saves.listSaveSlots,
        },
        auth: {
          getUser: auth.getUser,
          requestLogin: auth.requestLogin,
          onAuthChange: auth.onAuthChange,
        },
        ugc: {
          async getItems(options = {}) {
            return sendRequest('ugc.list', { ...options, gameId });
          },
          async getItem(itemId) {
            return sendRequest('ugc.get', { gameId, itemId });
          },
          async submit(data) {
            return sendRequest('ugc.submit', { gameId, ...data });
          },
          async rate(itemId, rating) {
            return sendRequest('ugc.rate', { gameId, itemId, rating });
          },
        },
        // コイン（プラットフォーム共通通貨・1コイン=1円）。
        // 前払式支払手段（資金決済法）にあたるため、対応を終えた 2026-09-04 に解禁した。
        // ゲーム独自の通貨を作りたいときは「コインで買う消費型アイテム」として設計し、
        // 変換時は必ず consume() を通すこと（docs/PREPAID_COMPLIANCE.md）。
        // 買い切り等の永続アンロックは `platform.shop.*`（直¥）を使う。
        wallet: {
          // { balance_coins, paid_coins, free_coins, total_charged, total_spent }
          // balance_coins は有償＋無償の合計。消費は無償分から先に行われる。
          async getBalance() {
            return sendRequest('wallet.getBalance', { gameId });
          },
          // このゲームのコイン建てアイテム一覧
          async getShopItems() {
            return sendRequest('wallet.getShopItems', { gameId });
          },
          // 所持しているアイテムと個数
          async getMyItems() {
            return sendRequest('wallet.getMyItems', { gameId });
          },
          // コインでアイテムを買う（PF側で確認モーダルを出す）
          async purchase(itemId) {
            return sendRequest('wallet.purchase', { gameId, itemId });
          },
          // 消費型アイテムを使う。ゲーム内資産へ変換するときは必ずこれを通し、
          // consumed:true が返ったときだけ資産を付与すること。
          // 所持フラグだけ見て変換すると、セーブを消すたびに再変換できてしまう。
          async consume(itemId, quantity = 1) {
            return sendRequest('wallet.consume', { gameId, itemId, quantity });
          },
          // 残高が足りないときにコイン購入モーダルを出す。確定するとPFが決済ページへ
          // 遷移するので、呼ぶ前に進行状況を保存しておくこと（platform.resume を使う）。
          // shortfall に不足コイン数を渡すと、それを賄える最小パックが既定で選ばれる。
          async promptCharge(shortfall = 0) {
            return sendRequest('wallet.promptCharge', { gameId, shortfall }, 120000);
          },
        },
        // Direct-¥ item purchases = permanent unlocks (skins, chapters, DLC).
        // Account-bound entitlements (server-side, independent of save data).
        // Not coins, so unaffected by COINS_ENABLED.
        shop: {
          // { items: [{ id, name, description, price_jpy, current_price_jpy, sale, owned }] }
          //   price_jpy         = 通常価格（この環境の。items.json の price_by_env 適用後）
          //   current_price_jpy = 今の有効価格（期間限定の特別価格があればそれ。0 = 期間限定無料）
          //   sale              = 適用中の特別価格 { label, price_jpy, start, end, mode }（UTC ISO）or null
          //     mode = 'free_play'（期間中だけ無料で遊べる。付与されない＝owned は false のまま。
          //            ゲーム側が sale.mode === 'free_play' の間だけ中身を開放する）
          //          | 'giveaway'（buy() で0円・永続付与）| 'sale'（有料セール）
          // (SDK 1.2.1〜。それ以前のポータルでは current_price_jpy / sale が無い。mode は 1.2.2〜)
          async getItems() {
            return sendRequest('shop.getItems', { gameId });
          },
          // string[] of owned item ids
          async getOwned() {
            const r = await sendRequest('shop.owned', { gameId });
            return r?.owned || [];
          },
          async owns(itemId) {
            return (await this.getOwned()).includes(itemId);
          },
          // Redirect the portal to Stripe Checkout for this item (¥).
          // Resolves { completed, embedded } / { redirecting }. 期間限定無料配布
          // （sale.mode === 'giveaway'）の間は Stripe を通さず即付与され
          // { completed: true, granted: true, embedded: false } で返る。
          // 無料プレイ期間（sale.mode === 'free_play'）は購入不要のため
          // Error（e.code === 'FREE_PLAY_PERIOD'）で reject される（付与されない）。
          async buy(itemId) {
            return sendRequest('shop.buy', { gameId, itemId }, 120000);
          },
        },
        multiplayer: {
          joinQueue: multiplayer.joinQueue,
          leaveQueue: multiplayer.leaveQueue,
          onMatchFound: multiplayer.onMatchFound,
          connect: multiplayer.connect,
          send: multiplayer.send,
          onMessage: multiplayer.onMessage,
          reportResult: multiplayer.reportResult,
          disconnect: multiplayer.disconnect,
          onOpponentDisconnect: multiplayer.onOpponentDisconnect,
          getLatency: multiplayer.getLatency,
          getCurrentMatch: multiplayer.getCurrentMatch,
          getIceServers: multiplayer.getIceServers,
          reportVoid: multiplayer.reportVoid,
          getMyRating: multiplayer.getMyRating,
          getRatingLeaderboard: multiplayer.getRatingLeaderboard,
        },
        events: {
          reportEvent: events.reportEvent,
        },
        // Open an allowlisted URL (PF top / studio / X share intent / Google Play)
        // via the portal. Call only from a click/tap handler. → {opened, target}
        // Rejects with e.code: URL_NOT_ALLOWED | NO_USER_ACTIVATION | INVALID_URL | POPUP_BLOCKED
        openUrl,
        // Survive the checkout round-trip: save() before a purchase redirect,
        // consume() on boot to restore where the player was. See resume.js.
        resume: createResume(gameId),
        destroy() {
          multiplayer.disconnect();
          events.destroy();
          destroyMessaging();
        },
      };

      if (onDisconnect) {
        window.addEventListener('beforeunload', onDisconnect);
      }

      return instance;
    } catch (err) {
      console.warn('[GamePlatform] Init failed, using fallback:', err.message);
      return createFallback(gameId);
    }
  },
};

function waitForHandshake(timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Handshake timeout'));
    }, timeout);

    function handler(event) {
      const data = event.data;
      if (data?.type === 'PLATFORM_SDK_HANDSHAKE') {
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve({
          bridgeId: data.bridgeId,
          origin: event.origin,
        });
      }
    }

    window.addEventListener('message', handler);

    // Signal parent that SDK is ready for handshake
    window.parent.postMessage({ type: 'PLATFORM_SDK_READY' }, '*');
  });
}

export default GamePlatform;
