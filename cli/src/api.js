import { config } from './config.js';
import { getValidToken } from './auth.js';

// 待てば直るステータス。429（レート制限）と、サーバ側の一時障害。
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * 429/5xx を待って再試行する fetch。
 *
 * 以前は upload/file だけが429を再試行し、begin / commit / promote など他は
 * 素通しで即エラーになっていた。デプロイの最後（promote）で落ちると、
 * アップロード自体は終わっているのに公開できない状態になって分かりにくい。
 *
 * 429は Retry-After（秒）を返すのでそれに従う。無ければ指数バックオフ。
 * body は文字列かBufferである前提（ストリームだと再送できない）。
 */
export async function fetchWithRetry(url, options = {}, { retries = 4, label = '' } = {}) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok || !RETRYABLE.has(res.status)) return res;
    last = res;
    if (attempt === retries) break;

    const retryAfter = parseInt(res.headers.get('Retry-After') || '', 10);
    const waitMs = Number.isFinite(retryAfter)
      ? Math.min(retryAfter * 1000, 65_000)
      : Math.min(8000, 500 * 2 ** attempt);

    const what = res.status === 429 ? 'レート制限' : `サーバエラー(${res.status})`;
    console.log(
      `  ${what}${label ? `（${label}）` : ''}。${Math.round(waitMs / 1000)}秒待って再試行します` +
      ` [${attempt + 1}/${retries}]`
    );
    await new Promise(r => setTimeout(r, waitMs));
  }
  return last;
}

export async function apiRequest(path, options = {}) {
  const token = await getValidToken();
  if (!token) {
    console.error('Session expired. Run: gameplatform login');
    process.exit(1);
  }

  const url = `${config.API_BASE}${path}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  const res = await fetchWithRetry(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
