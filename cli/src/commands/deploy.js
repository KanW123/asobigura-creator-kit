import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { config } from '../config.js';
import { getValidToken } from '../auth.js';
import { analyzeZipBuffer, reportZipSize } from '../zipinfo.js';

export async function deployCommand(zipPath, options) {
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
  // Always show size + breakdown; abort here if over the 90MB hard limit.
  if (reportZipSize(analyzeZipBuffer(fileBuffer))) process.exit(1);

  if (!options.title) {
    console.error('--title is required');
    process.exit(1);
  }

  // Creator terms consent (the API requires the current version). Passing
  // --agree-terms affirms the creator agreement; without it we refuse.
  if (!options.agreeTerms) {
    console.error('クリエイター規約への同意が必要です。');
    console.error(`規約: ${config.PLATFORM_URL}/creator-terms`);
    console.error('内容を確認のうえ、同意して再実行してください: gameplatform deploy ... --agree-terms');
    process.exit(1);
  }

  // Validate pricing flags up front (e.g. --price and --coins together) so a
  // mistake is caught before the upload, not after the game is already live.
  if (options.pricing && options.pricing !== 'free') {
    try {
      const { buildPricingBody } = await import('./pricing.js');
      buildPricingBody(options.pricing, options);
    } catch (err) {
      console.error(`Pricing error: ${err.message}`);
      process.exit(1);
    }
  }

  const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
  console.log(`Uploading ${options.title} (${sizeMB}MB)...`);

  // 同じタイトルの再デプロイでは、指定しなかった項目（ジャンル・説明・公開状態・
  // 起動方式・課金など）はサーバ側で現状維持になる。だから省略時は送らない
  // （既定値を送ると「明示した」扱いで上書きされる）。新規ゲームの既定値はサーバが持つ。
  const params = {
    title: options.title,
    version: options.ver || '1.0.0',
    terms_version: config.CREATOR_TERMS_VERSION,
  };
  if (options.genre !== undefined) params.genre = options.genre;
  if (options.description !== undefined) params.description = options.description;
  if (options.draft) params.draft = 'true';
  if (options.launchMode) params.launch_mode = options.launchMode;
  // 出稿先ブランド（カンマ区切り）。省略時は main（アソビグラ）に出る。
  if (options.storefront) params.storefronts = options.storefront;
  const qs = new URLSearchParams(params);

  const res = await fetch(`${config.API_BASE}/submissions?${qs}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      'Authorization': `Bearer ${token}`,
    },
    body: fileBuffer,
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Upload failed:', data.error?.message || 'Unknown error');
    process.exit(1);
  }

  if (data.validation?.errors?.length > 0) {
    console.error('Validation errors:');
    data.validation.errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(data.draft ? 'Uploaded as draft!' : data.published ? 'Published!' : data.game_id ? 'Uploaded!' : 'Submitted!');
  console.log(`  Game ID: ${data.game_id || data.submission?.id}`);
  console.log(`  Status: ${data.draft ? 'draft (preview only)' : data.status || (data.published ? 'published' : data.submission?.status)}`);
  if (data.updated_existing) console.log('  (existing game updated — settings you did not pass were kept)');
  (data.notices || []).forEach(n => console.log(`  ⚠ ${n}`));

  if (data.validation?.warnings?.length > 0) {
    console.log('  Warnings:');
    data.validation.warnings.forEach(w => console.log(`    - ${w}`));
  }

  // Optional: set monetization in the same step. Only works once the game row
  // exists (direct publish). If it went to review, set it after approval with
  // `gameplatform pricing <game-id> --model ...`.
  if (options.pricing && options.pricing !== 'free') {
    const gameId = data.game_id;
    if (!gameId) {
      console.log(`\n  承認後に価格を設定してください: gameplatform pricing <game-id> --model ${options.pricing} ...`);
    } else {
      try {
        const { applyPricing } = await import('./pricing.js');
        const res = await applyPricing(gameId, options);
        console.log(`  Pricing: ${res.pricing}`);
      } catch (err) {
        console.error(`  価格未設定: ${err.message}`);
        console.error(`  手動で: gameplatform pricing ${gameId} --model ${options.pricing} ...`);
      }
    }
  }

  // Optional: sync the in-game item catalog (direct ¥ permanent unlocks)
  // declaratively from a JSON manifest, in the same step.
  if (options.items) {
    const gameId = data.game_id;
    if (!gameId) {
      console.log(`\n  承認後にアイテムを登録してください: gameplatform items <game-id> --file ${options.items}`);
    } else {
      try {
        const { readItemsFile, syncItems } = await import('./items.js');
        const result = await syncItems(gameId, readItemsFile(resolve(options.items)));
        console.log(`  Items: ${result.filter(i => i.active).length} 件 有効`);
      } catch (err) {
        console.error(`  アイテム未登録: ${err.message}`);
        console.error(`  手動で: gameplatform items ${gameId} --file ${options.items}`);
      }
    }
  }
}
