import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { apiRequest } from '../api.js';

// Read an items manifest. Accepts { "items": [...] } or a bare [...] array.
// Each item: { key, name, description?, price_jpy?, price_coins?, type? }.
// 価格は直¥(¥50〜50,000)/コイン(1〜50,000)の両方に対応（少なくとも一方は必須）。
// type='consumable' は price_coins のみ。
// 直¥アイテムは期間限定価格 schedule と環境別の通常価格 price_by_env も持てる:
//   "price_by_env": { "staging": 50 },
//   "schedule": [{ "label": "リリース記念・期間限定無料", "price_jpy": 0,
//                  "mode": "free_play",
//                  "start": "2026-09-28T00:00+09:00", "end": "2026-10-05T00:00+09:00" }]
//   ¥0 の期間の mode: "free_play"（既定・期間中だけ無料で遊べる。付与しない）/
//                     "giveaway"（0円で永続付与）。有料の期間には付けない。
// 中身はそのままサーバーへ送る（正規化・最終判定はサーバー）。送る前に
// checkItemsPricing で明らかな誤り（¥1〜49・期間の重なり等）を手元で弾く。
export function readItemsFile(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    throw new Error(`${path} を読めません（JSONとして不正）: ${e.message}`);
  }
  const items = Array.isArray(parsed) ? parsed : parsed.items;
  if (!Array.isArray(items)) throw new Error(`${path} は配列、または { "items": [...] } の形にしてください`);
  const errors = checkItemsPricing(items);
  if (errors.length) throw new Error(`${path} の価格設定に誤りがあります:\n  - ${errors.join('\n  - ')}`);
  return items;
}

const MIN_JPY = 50;      // Stripe の最低決済額
const MAX_JPY = 50000;
const ENVS = ['local', 'staging', 'production'];
const FREE_MODES = ['free_play', 'giveaway'];

// 価格の表示: ¥0 は種類も（mode 無しの旧データは free_play 扱い）。例「¥0 [無料プレイ]」。
export function priceWithMode(e) {
  if (e?.price_jpy !== 0) return `¥${e?.price_jpy}`;
  return `¥0 [${e.mode === 'giveaway' ? '無料配布' : '無料プレイ'}]`;
}

// schedule / price_by_env の手元チェック（サーバーの lib/item-pricing.ts と同じ規則の簡易版）。
// 往復せずに誤りを出すため。サーバーが最終判定するので、ここは通っても弾かれることはある。
export function checkItemsPricing(items) {
  const errors = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const key = it.key || '?';
    const p = `Item "${key}": `;
    const yen = (it.price_jpy || 0) > 0;

    if (it.price_by_env != null) {
      if (typeof it.price_by_env !== 'object' || Array.isArray(it.price_by_env)) {
        errors.push(`${p}price_by_env はオブジェクトで指定してください（例 {"staging": 50}）`);
      } else {
        const entries = Object.entries(it.price_by_env);
        if (entries.length && !yen) errors.push(`${p}price_by_env は直¥アイテム（price_jpy > 0）にだけ指定できます`);
        for (const [k, v] of entries) {
          if (!ENVS.includes(k)) errors.push(`${p}price_by_env のキー "${k}" は無効です（local / staging / production のいずれか）`);
          else if (!Number.isInteger(v) || v < MIN_JPY || v > MAX_JPY) {
            errors.push(`${p}price_by_env.${k} は ¥${MIN_JPY}〜¥${MAX_JPY} の整数で指定してください`);
          }
        }
      }
    }

    if (it.schedule == null) continue;
    if (!Array.isArray(it.schedule)) { errors.push(`${p}schedule は配列で指定してください`); continue; }
    if (it.schedule.length && !yen) {
      errors.push(`${p}schedule（期間限定価格）は直¥アイテム（price_jpy > 0）にだけ指定できます`);
      continue;
    }
    const spans = [];
    it.schedule.forEach((e, i) => {
      const label = typeof e?.label === 'string' ? e.label.trim() : '';
      const name = label || `schedule[${i}]`;
      if (!label) errors.push(`${p}schedule[${i}] の label を指定してください`);
      const price = e?.price_jpy;
      if (!Number.isInteger(price) || price < 0) errors.push(`${p}「${name}」の price_jpy は 0 以上の整数で指定してください`);
      else if (price > 0 && price < MIN_JPY) {
        errors.push(`${p}「${name}」の price_jpy ¥${price} は指定できません（0＝無料 か、Stripe の最低額 ¥${MIN_JPY} 以上）`);
      } else if (price > MAX_JPY) errors.push(`${p}「${name}」の price_jpy は ¥${MAX_JPY} 以下で指定してください`);
      if (e?.mode != null) {
        if (Number.isInteger(price) && price > 0) errors.push(`${p}「${name}」: mode は price_jpy 0 の期間だけ指定できます`);
        else if (!FREE_MODES.includes(e.mode)) {
          errors.push(`${p}「${name}」の mode は "free_play"（期間中だけ無料で遊べる）か "giveaway"（0円で永続付与）で指定してください`);
        }
      }
      const s = Date.parse(e?.start), t = Date.parse(e?.end);
      if (Number.isNaN(s)) errors.push(`${p}「${name}」の start が日時として読めません（例 "2026-09-28T00:00+09:00"）`);
      if (Number.isNaN(t)) errors.push(`${p}「${name}」の end が日時として読めません（例 "2026-10-05T00:00+09:00"）`);
      if (!Number.isNaN(s) && !Number.isNaN(t)) {
        if (s >= t) errors.push(`${p}「${name}」は start が end より前になるように指定してください`);
        else spans.push({ name, s, t });
      }
    });
    spans.sort((a, b) => a.s - b.s);
    for (let i = 1; i < spans.length; i++) {
      if (spans[i].s < spans[i - 1].t) {
        errors.push(`${p}「${spans[i - 1].name}」と「${spans[i].name}」の期間が重なっています`);
      }
    }
  }
  return errors;
}

// 日時を JST で表示（例 2026/9/28 0:00:00）。
function jst(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return String(iso);
  return new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

// Declaratively sync a game's item catalog. Items present are upserted; items
// absent are deactivated server-side (never deleted — past purchases survive).
// Shared by `gameplatform items` and `deploy --items`.
export async function syncItems(gameId, items) {
  const res = await apiRequest(`/developer/games/${gameId}/items`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  return res.items || [];
}

function printItem(it) {
  const mark = it.active ? '●' : '○';
  const tail = it.active ? '' : '  (停止中)';
  const price = [
    it.price_jpy > 0 ? `¥${it.price_jpy}` : null,
    it.price_coins > 0 ? `${it.price_coins}コイン` : null,
  ].filter(Boolean).join(' / ') || '-';
  const kind = it.item_type === 'consumable' ? ' [消費型]' : '';
  console.log(`  ${mark} ${it.id}  ${price}${kind}  ${it.name}${tail}`);
  // 以下はサーバーが対応していれば出る（current_price_jpy / sale / price_schedule / price_by_env）。
  if (typeof it.current_price_jpy === 'number' && it.current_price_jpy !== it.price_jpy) {
    console.log(`      今の価格: ¥${it.current_price_jpy}`);
  }
  if (it.sale) {
    console.log(`      セール中: ${it.sale.label} ${priceWithMode(it.sale)}（${jst(it.sale.start)}〜${jst(it.sale.end)}）`);
  }
  for (const e of Array.isArray(it.price_schedule) ? it.price_schedule : []) {
    console.log(`      予定: ${e.label} ${priceWithMode(e)}  ${jst(e.start)} 〜 ${jst(e.end)}`);
  }
  const envs = it.price_by_env && typeof it.price_by_env === 'object' ? Object.entries(it.price_by_env) : [];
  if (envs.length) {
    console.log(`      環境別通常価格: ${envs.map(([k, v]) => `${k} ¥${v}`).join(' / ')}`);
  }
}

export async function itemsCommand(gameId, options) {
  try {
    if (options.list) {
      const res = await apiRequest(`/developer/games/${gameId}/items`);
      const items = res.items || [];
      if (!items.length) { console.log('(商品なし)'); return; }
      console.log(`${gameId} の商品:`);
      items.forEach(printItem);
      return;
    }

    const file = resolve(options.file || 'items.json');
    if (!existsSync(file)) {
      console.error(`商品定義ファイルが見つかりません: ${file}`);
      console.error('例: gameplatform items <game-id> --file items.json');
      console.error('items.json の形:');
      console.error('  [{ "key": "skin",    "name": "炎の剣スキン", "price_jpy": 120 },');
      console.error('   { "key": "gempack", "name": "魔石100個",   "price_coins": 300, "type": "consumable" }]');
      console.error('※ price_jpy と price_coins は片方でも両方でも可。消費型は price_coins のみ。');
      console.error('※ 直¥アイテムは "schedule"（期間限定価格。0 か ¥50以上・重なり禁止・JST可）と');
      console.error('   "price_by_env"（環境別の通常価格。例 {"staging": 50}）も指定できます。');
      console.error('※ ¥0 の期間は "mode": "free_play"（既定・期間中だけ無料で遊べる）か "giveaway"（0円で永続付与）。');
      process.exit(1);
    }
    const items = readItemsFile(file);
    const result = await syncItems(gameId, items);
    const active = result.filter(i => i.active);
    const inactive = result.filter(i => !i.active);
    console.log(`同期しました: ${gameId}（有効 ${active.length}件 / 停止 ${inactive.length}件）`);
    active.forEach(printItem);
    inactive.forEach(printItem);
  } catch (err) {
    console.error('items failed:', err.message);
    process.exit(1);
  }
}
