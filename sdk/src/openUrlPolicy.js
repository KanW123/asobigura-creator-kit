/**
 * platform.openUrl() の行き先許可リスト（純粋関数・DOM非依存）。
 *
 * ゲーム iframe は sandbox（allow-popups / allow-top-navigation なし）なので自分では
 * タブを開けない。代わりに SDK が親ページ（ポータル）へ依頼し、親がここで判定してから開く。
 * sandbox を緩める案（A）は行き先を絞れないため採らない（docs/REQUEST_2026-09-25 ⑥ 案B）。
 *
 * ★判定の正は親（PlatformBridge）側。SDK 側にも同じ関数が同梱されるが（top_level / fallback 用）、
 *   iframe モードでは SDK の判定結果は一切信用せず、生の URL 文字列だけを受け取ってここで判定する。
 *
 * 返り値:
 *   { ok: true,  url: <正規化済み href>, target: 'self' | 'blank' }
 *   { ok: false, code: 'INVALID_URL' | 'URL_NOT_ALLOWED', message }
 *
 * 境界の決め方:
 *   - 解析不能・http(s) 以外のスキーム（javascript: / data: / file: …）→ INVALID_URL
 *   - http:（https でない）・ポート指定・userinfo 付き・リスト外ホスト/パス → URL_NOT_ALLOWED
 *   - ホストは完全一致（`asobigura.com.evil.com` や末尾ドット `asobigura.com.` は不一致）
 *   - パスは URL パーサで正規化済み（`/intent/../home` → `/home`）の値で前方一致を見る
 */

export const OPEN_URL_MAX_LENGTH = 2048;

// host → { target, pathPrefix? }。pathPrefix が無いホストは全パス許可。
const RULES = {
  'asobigura.com': { target: 'self' },
  'www.asobigura.com': { target: 'self' },
  'studio.asobigura.com': { target: 'blank' },
  'x.com': { target: 'blank', pathPrefix: '/intent/' },
  'twitter.com': { target: 'blank', pathPrefix: '/intent/' },
  'play.google.com': { target: 'blank', pathPrefix: '/store/apps/' },
};

function reject(code, message) {
  return { ok: false, code, message };
}

export function classifyOpenUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > OPEN_URL_MAX_LENGTH) {
    return reject('INVALID_URL', 'URL must be a non-empty string (max 2048 chars)');
  }
  let u;
  try {
    // base を渡さない＝絶対URLのみ受け付ける（相対URLは親ページ基準で解決されて危険）
    u = new URL(raw);
  } catch {
    return reject('INVALID_URL', 'URL could not be parsed (absolute https URL required)');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return reject('INVALID_URL', `Scheme not supported: ${u.protocol}`);
  }
  if (u.protocol !== 'https:') {
    return reject('URL_NOT_ALLOWED', 'Only https URLs are allowed');
  }
  if (u.username || u.password || u.port) {
    return reject('URL_NOT_ALLOWED', 'URLs with credentials or an explicit port are not allowed');
  }
  const rule = Object.prototype.hasOwnProperty.call(RULES, u.hostname) ? RULES[u.hostname] : null;
  if (!rule) {
    return reject('URL_NOT_ALLOWED', `Host not allowed: ${u.hostname}`);
  }
  if (rule.pathPrefix && !u.pathname.startsWith(rule.pathPrefix)) {
    return reject('URL_NOT_ALLOWED', `Path not allowed on ${u.hostname}: ${u.pathname}`);
  }
  return { ok: true, url: u.href, target: rule.target };
}
