import { apiRequest } from '../api.js';

// `gameplatform sales [game-id]` — every real payment across your games,
// UNIONing the three payment tables (buyout / item / stamina refill). Unlike
// `earnings` (which only aggregates THIRD-PARTY game revenue), this is the
// authoritative record of whether any charge happened. Read-only.
const SOURCE_LABEL = { buyout: '買い切り', item: 'アイテム', stamina: 'スタミナ回復' };
const STATUS_LABEL = { completed: '完了', refunded: '返金済み', pending: '保留', failed: '失敗' };

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 10);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtBuyer(row) {
  if (row.buyer_email) return row.buyer_email;
  return row.user_id ? row.user_id.slice(0, 8) : '-';
}

function fmtAmount(row) {
  if (row.source === 'stamina') {
    const price = row.amount_jpy != null ? `¥${row.amount_jpy}` : '¥?';
    return `${price} x${row.amount ?? 1}`;
  }
  return row.amount_jpy != null ? `¥${row.amount_jpy.toLocaleString()}` : '-';
}

export async function salesCommand(gameId) {
  const path = gameId ? `/developer/sales?game=${encodeURIComponent(gameId)}` : '/developer/sales';
  const { sales = [] } = (await apiRequest(path)) || {};

  console.log('\n  Sales — 決済の実記録（買い切り / アイテム / スタミナ回復）');
  console.log('  ' + '-'.repeat(90));

  if (!sales.length) {
    console.log('  決済記録なし');
  } else {
    const head =
      '日付'.padEnd(12) + 'ゲーム'.padEnd(24) + '種別'.padEnd(14) +
      '金額'.padEnd(14) + '状態'.padEnd(10) + '購入者';
    console.log('  ' + head);
    for (const r of sales) {
      const line =
        fmtDate(r.created_at).padEnd(12) +
        String(r.game_title || r.game_id).slice(0, 22).padEnd(24) +
        (SOURCE_LABEL[r.source] || r.source).padEnd(14) +
        fmtAmount(r).padEnd(14) +
        (r.status ? (STATUS_LABEL[r.status] || r.status) : '-').padEnd(10) +
        fmtBuyer(r);
      console.log('  ' + line);
    }
    console.log(`\n  ${sales.length} 件`);
  }

  console.log('\n  ※ earnings は第三者ゲーム収益の集計のみ。決済の実記録はこのコマンドが正。\n');
}
