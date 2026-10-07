import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { config } from '../config.js';
import { getValidToken } from '../auth.js';
import { printReleaseChecklist } from '../checklist.js';
import { analyzeZipBuffer, reportZipSize } from '../zipinfo.js';
import { expandZip, uploadByManifest } from '../manifest-upload.js';

export async function updateCommand(gameId, zipPath, options) {
  if (!options.ver) {
    console.error('--ver is required (e.g. --ver 1.1.0)');
    process.exit(1);
  }
  if (options.launchMode === 'top_level' && !options.agreeTerms) {
    console.error('top_level への切替には --agree-terms が必要です。');
    process.exit(1);
  }

  // Direct publish (no --stage) goes live immediately, so require an explicit
  // pre-release confirmation. Refuse-then-confirm keeps this non-interactive
  // (works for humans and AI agents). --stage is safe (creator-only) → no gate.
  // Gate first, before any token/network work, so the refusal path stays sync-clean.
  // --share は公開しない（招待した相手だけ）ので、--stage と同じくゲート無し。
  if (!options.stage && !options.share && !options.confirmed) {
    printReleaseChecklist(`gameplatform update ${gameId} ${zipPath} --ver ${options.ver} --confirmed`);
    console.error('（公開せず検証版だけ上げるなら --stage を使ってください）');
    process.exit(1);
  }

  const token = await getValidToken();
  if (!token) {
    console.error('Not logged in. Run: gameplatform login');
    process.exit(1);
  }

  const filePath = resolve(zipPath);
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const fileBuffer = readFileSync(filePath);
  // 内訳とロード時間の目安は常に表示する。ただし 90MB で中断はしない——
  // manifest方式ではファイルを1個ずつ送るので、ゲーム全体のサイズ上限は無い。
  reportZipSize(analyzeZipBuffer(fileBuffer), { hardStop: false });

  const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
  const targetLabel = options.share ? 'Sharing (press / co-developers)'
    : options.stage ? 'Staging (creator-only preview)' : 'Updating';
  console.log(`${targetLabel} ${gameId} to v${options.ver} (${sizeMB}MB)...`);
  if (options.title) console.log(`  (also renaming to "${options.title}")`);

  // ZIPをローカルで展開して1ファイルずつ送る（使い方は今までと同じ）。
  // Workers のボディ上限に当たるのは「1リクエストの大きさ」なので、
  // 1ファイルずつにすればゲーム全体が何GBでも通る。
  const files = expandZip(fileBuffer);
  const total = Object.keys(files).length;
  if (total === 0) { console.error('ZIP の中身が空です'); process.exit(1); }

  let data;
  try {
    data = await uploadByManifest({
      token, gameId, version: options.ver,
      stage: !!options.stage, share: !!options.share, files,
      onProgress: (done, all) => {
        const pct = Math.round((done / all) * 100);
        process.stdout.write(String.fromCharCode(13) + `  uploading ${done}/${all} (${pct}%)   `);
      },
    });
    process.stdout.write(String.fromCharCode(10));
  } catch (err) {
    process.stdout.write(String.fromCharCode(10));
    console.error('Update failed:', err.message);
    process.exit(1);
  }

  // タイトル・起動モードの変更は従来のメタ更新API（PATCH /developer/games/:id）で行う
  // （アップロードとは別操作）。サーバは JSON 本文を読む。以前はクエリ文字列で送って
  // いたため、常に失敗して「スキップされました」になっていた（v1.9.0 まで）。
  let metaError = null;
  if (options.title || options.launchMode) {
    const meta = {};
    if (options.title) meta.title = options.title;
    if (options.launchMode) meta.launch_mode = options.launchMode;
    if (options.agreeTerms) meta.terms_version = config.CREATOR_TERMS_VERSION;
    try {
      const r = await fetch(`${config.API_BASE}/developer/games/${encodeURIComponent(gameId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(meta),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        metaError = d.error?.message || `HTTP ${r.status}`;
      }
    } catch (err) {
      metaError = err.message;
    }
  }

  if (data.target === 'share') {
    console.log('Shared! (press / co-developers only — public and staging are untouched)');
    console.log(`  合言葉: ${data.passphrase}`);
    console.log(`  配布URL・説明文は: gameplatform share ${gameId}`);
  } else {
    console.log(data.staged ? 'Staged! (creator-only preview — public still on the current version)' : 'Updated!');
  }
  console.log(`  Game: ${gameId}`);
  console.log(`  Version: ${data.version}`);
  console.log(`  Files: ${data.files}`);
  if (data.staged) console.log('  Promote it from the developer dashboard when ready.');
  if (options.title && !metaError) console.log(`  Title: ${options.title}`);
  if (options.launchMode && !metaError) console.log(`  Launch mode: ${options.launchMode}`);
  if (metaError) {
    // ビルドは上がっているが、タイトル/起動方式は変わっていない。黙って続けない。
    console.error(`タイトル/起動方式の更新に失敗しました: ${metaError}`);
    console.error(`  ビルドのアップロードは完了しています。やり直し: gameplatform launch-mode ${gameId} <mode> [--agree-terms]`);
    process.exit(1);
  }
}
