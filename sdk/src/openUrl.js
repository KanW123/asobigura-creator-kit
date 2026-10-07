/**
 * platform.openUrl(url) — SDK side.
 *
 * iframe モード: 生の URL とユーザー操作状態を親（PlatformBridge）へ送るだけ。
 *   許可リスト判定は親が行う（SDK 側の判定は信用されない）。
 * top_level モード: ゲーム自身がトップ文書なので、同じ許可リストでローカルに開く。
 * fallback（PF外）: 許可リストは適用せず window.open を試す（開発中の動作確認用）。
 *   ただし PF 上では拒否される URL なら console.warn で知らせる。
 */
import { sendRequest, getTransport } from './messaging.js';
import { classifyOpenUrl } from './openUrlPolicy.js';

function codeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// 同期的に読むこと（await の後では transient activation が切れていることがある）
function currentActivation() {
  const ua = typeof navigator !== 'undefined' ? navigator.userActivation : undefined;
  return ua ? ua.isActive : null;
}

// 'noopener' 指定の window.open は成功時も null を返す（仕様）ため、ブロック検出ができない。
// features なしで開いて即 opener を切る。
function openBlank(url) {
  const w = window.open(url, '_blank');
  if (!w) throw codeError('POPUP_BLOCKED', 'The browser blocked the new tab');
  try { w.opener = null; } catch { /* ignore */ }
  return { opened: true, target: 'blank' };
}

export function openUrl(url) {
  const userActivation = currentActivation();
  if (getTransport() === 'top_level') {
    const v = classifyOpenUrl(typeof url === 'string' ? url : String(url ?? ''));
    if (!v.ok) return Promise.reject(codeError(v.code, v.message));
    if (userActivation === false) {
      return Promise.reject(codeError('NO_USER_ACTIVATION', 'openUrl must be called from a user gesture (click/tap/key)'));
    }
    if (v.target === 'self') {
      window.location.assign(v.url);
      return Promise.resolve({ opened: true, target: 'self' });
    }
    try { return Promise.resolve(openBlank(v.url)); } catch (e) { return Promise.reject(e); }
  }
  return sendRequest('nav.openUrl', { url: typeof url === 'string' ? url : String(url ?? ''), userActivation });
}

export function openUrlFallback(url) {
  const raw = typeof url === 'string' ? url : String(url ?? '');
  const v = classifyOpenUrl(raw);
  if (!v.ok && v.code === 'INVALID_URL') return Promise.reject(codeError(v.code, v.message));
  if (!v.ok) {
    console.warn(`[GamePlatform SDK] openUrl: "${raw}" would be rejected on the portal (${v.code}). ` +
      'Opening anyway because the SDK is in fallback mode (outside asobigura.com). See /sdk-reference.md.');
  }
  try { return Promise.resolve(openBlank(v.ok ? v.url : raw)); } catch (e) { return Promise.reject(e); }
}
