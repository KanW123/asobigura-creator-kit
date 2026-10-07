import { apiRequest } from '../api.js';
import { printReleaseChecklist } from '../checklist.js';

// 予約公開: 下書きを指定時刻に公開する（サーバの毎分 cron が公開する）。
//   gameplatform schedule <id> "2026-10-08 18:00" --confirmed   予約（タイムゾーン省略＝日本時間）
//   gameplatform schedule <id> --cancel                          取り消し（下書きのまま）
// 公開されるのは「その時刻の下書きの最新版」。予約後に下書きを差し替えれば差し替えた版が出る。

/** "2026-10-08 18:00" / "2026-10-08T18:00:00+09:00" → ISO 8601（タイムゾーン付き）。省略時は +09:00。 */
export function toPublishAt(input) {
  const s = String(input || '').trim().replace(' ', 'T');
  const m = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?$/);
  if (!m) return null;
  const iso = m[1] + (m[2] || '+09:00');
  return Number.isFinite(Date.parse(iso)) ? { iso, assumedJst: !m[2] } : null;
}

const jst = (iso) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' });

export async function scheduleCommand(gameId, time, options) {
  if (options.cancel) {
    const data = await apiRequest(`/developer/games/${encodeURIComponent(gameId)}/schedule`, { method: 'DELETE' });
    console.log(`予約を取り消しました: ${gameId}（いまの状態: ${data.status}）`);
    return;
  }

  if (!time) {
    console.error('エラー: 公開する時刻を指定してください。例: gameplatform schedule ' + gameId + ' "2026-10-08 18:00" --confirmed');
    process.exit(1);
  }
  const at = toPublishAt(time);
  if (!at) {
    console.error(`エラー: 時刻の形式が読めません: ${time}\n  例: "2026-10-08 18:00"（日本時間）／ "2026-10-08T09:00:00Z"`);
    process.exit(1);
  }

  // 予約＝その時刻に確認なしで公開される。公開と同じチェックを予約の時点で求める。
  if (!options.confirmed) {
    printReleaseChecklist(`gameplatform schedule ${gameId} "${time}" --confirmed`);
    process.exit(1);
  }

  let data;
  try {
    data = await apiRequest(`/developer/games/${encodeURIComponent(gameId)}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish_at: at.iso }),
    });
  } catch (err) {
    console.error('予約できませんでした:', err.message);
    process.exit(1);
  }

  console.log('予約しました。');
  console.log(`  ゲーム: ${data.game_id}`);
  console.log(`  公開予定: ${jst(data.publish_at)}（日本時間）${at.assumedJst ? ' ※タイムゾーン省略のため日本時間として解釈' : ''}`);
  console.log(`  いまの下書き: v${data.version || '?'}（その時刻の下書きの最新版が公開されます）`);
  console.log('  公開は1分おきの確認で行われ、一覧への反映はさらに最大1分ほど遅れます。');
  console.log(`  取り消し: gameplatform schedule ${data.game_id} --cancel`);
}
