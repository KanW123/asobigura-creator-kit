// 大容量アップロード（manifest方式）のクライアント側。
//
// ZIPを1リクエストで送ると Workers のボディ上限(100MB)に当たり、ゲーム全体で
// 90MBまでしか送れなかった。R2には元々「個別ファイル」で展開して置かれるので、
// ZIPは転送の都合でしかない。ここではZIPをローカルで展開して1ファイルずつ送る。
// 1リクエスト=1ファイルになるため、ゲーム全体のサイズ上限は事実上なくなる。
//
// 流れ: begin（manifest検証＋version予約） → file を並列PUT → commit
import { createHash } from 'crypto';
import { extractZip } from './isolated-zip.js';
import { config } from './config.js';
import { fetchWithRetry } from './api.js';

const PARALLEL = 6;          // 同時PUT数
const MAX_RETRY = 5;         // 1ファイルあたりの再試行回数

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** ZIPを展開して {path: Uint8Array} にする。ディレクトリとゴミは落とす */
export function expandZip(buffer) {
  const files = extractZip(buffer);
  const out = {};
  for (const [path, data] of Object.entries(files)) {
    if (path.endsWith('/')) continue;                 // ディレクトリ
    if (path.startsWith('__MACOSX/')) continue;       // macOSのゴミ
    if (path.split('/').some(p => p.startsWith('.'))) continue;  // ドットファイル
    out[path] = data;
  }
  return out;
}

export function buildManifest(files) {
  const list = Object.entries(files).map(([path, data]) => ({
    path,
    size: data.length,
    sha256: sha256(Buffer.from(data)),
  }));
  return {
    files: list,
    file_count: list.length,
    total_bytes: list.reduce((a, f) => a + f.size, 0),
  };
}

// retry: 429/5xx を待って再試行する（begin / commit / abort 用）。
// ファイル本体のPUTは下の worker が独自の再試行ループを持つので false のまま。
async function api(token, method, path, { body, headers, retry = false, label = '' } = {}) {
  const url = `${config.API_BASE}${path}`;
  const init = {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(headers || {}) },
    body,
  };
  const res = retry ? await fetchWithRetry(url, init, { label }) : await fetch(url, init);
  let data = null;
  try { data = await res.json(); } catch { /* 空ボディ */ }
  return { res, data };
}

/**
 * ZIPの中身を1ファイルずつアップロードする。
 * @returns {Promise<{version:string, staged:boolean, files:number}>}
 */
export async function uploadByManifest({ token, gameId, version, stage, share, files, onProgress }) {
  const manifest = buildManifest(files);

  // 1) begin — サーバがmanifestを検証し、(game_id, version) を予約する
  // 行き先スロット: share=共有版 / stage=開発版 / 既定=公開版
  const beginQS = `?version=${encodeURIComponent(version)}`
    + (share ? '&share=true' : stage ? '&stage=true' : '');
  const { res: bRes, data: begun } = await api(
    token, 'POST', `/developer/games/${encodeURIComponent(gameId)}/upload/begin${beginQS}`,
    {
      body: JSON.stringify(manifest),
      headers: { 'Content-Type': 'application/json' },
      retry: true, label: 'アップロード開始',
    }
  );
  if (!bRes.ok) throw new Error(begun?.error?.message || `begin に失敗しました (${bRes.status})`);
  const uploadId = begun.upload_id;

  // 2) file — 並列でPUT。失敗は指数バックオフで再試行する
  const queue = manifest.files.slice();
  let done = 0;
  let failure = null;

  const worker = async () => {
    while (queue.length && !failure) {
      const f = queue.shift();
      const body = Buffer.from(files[f.path]);
      let lastErr = null;
      for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, Math.min(8000, 300 * 2 ** attempt)));
        try {
          const qs = `?upload_id=${encodeURIComponent(uploadId)}&path=${encodeURIComponent(f.path)}`;
          const { res, data } = await api(
            token, 'PUT', `/developer/games/${encodeURIComponent(gameId)}/upload/file${qs}`,
            { body, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(body.length) } }
          );
          if (res.ok) { lastErr = null; break; }
          // 400系は再試行しても直らない（サイズ/ハッシュ不一致・manifest外のパス）
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            throw new Error(data?.error?.message || `${f.path}: HTTP ${res.status}`);
          }
          lastErr = new Error(data?.error?.message || `${f.path}: HTTP ${res.status}`);
        } catch (e) {
          if (String(e.message).includes(': HTTP 4')) { failure = e; return; }
          lastErr = e;
        }
      }
      if (lastErr) { failure = lastErr; return; }
      done++;
      if (onProgress) onProgress(done, manifest.files.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, manifest.files.length) }, worker));

  if (failure) {
    // 予約を解放しておく。放置すると同じversionで再試行できない
    await api(token, 'POST',
      `/developer/games/${encodeURIComponent(gameId)}/upload/abort?upload_id=${encodeURIComponent(uploadId)}`,
      { retry: true, label: '中断処理' }
    ).catch(() => {});
    throw failure;
  }

  // 3) commit — 揃っているか確認して版を有効化
  const { res: cRes, data: committed } = await api(
    token, 'POST',
    `/developer/games/${encodeURIComponent(gameId)}/upload/commit?upload_id=${encodeURIComponent(uploadId)}`,
    { retry: true, label: 'アップロード確定' }
  );
  if (!cRes.ok) throw new Error(committed?.error?.message || `commit に失敗しました (${cRes.status})`);
  return {
    version: committed.version, staged: committed.staged, target: committed.target,
    passphrase: committed.passphrase, files: committed.files,
  };
}
