import { config } from '../config.js';
import { getValidToken } from '../auth.js';
import { fetchWithRetry } from '../api.js';
import { printReleaseChecklist } from '../checklist.js';

// Publish the staged version (staging_version -> current_version).
// Gated by --confirmed: without it, print the pre-release checklist and stop.
export async function promoteCommand(gameId, options) {
  // Gate first, before any token/network work, so the refusal path stays sync-clean.
  if (!options.confirmed) {
    printReleaseChecklist(`gameplatform promote ${gameId} --confirmed`);
    process.exit(1);
  }

  const token = await getValidToken();
  if (!token) {
    console.error('Not logged in. Run: gameplatform login');
    process.exit(1);
  }

  // --expect binds the publish to the exact build you verified. --confirmed says
  // "I ran the checklist"; --expect says "and this is the build I ran it on".
  // (--version は commander の組み込みフラグと衝突するので使えない)
  // Without it, a --stage upload landing between your check and this call would
  // publish the newer build instead.
  const expected = (options.expect || '').trim();
  if (!expected) {
    console.error(
      'エラー: --expect <確認した検証版> が必要です。\n' +
      '  確認した版と、いま公開される版が同じであることを保証するための指定です。\n' +
      '  これが無いと、確認した後に別の検証版が上がっていた場合にそちらが公開されます。\n\n' +
      '  例: gameplatform promote ' + gameId + ' --expect 1.3.0 --confirmed'
    );
    process.exit(1);
  }
  const q = expected ? `?expected_version=${encodeURIComponent(expected)}` : '';

  console.log(`Promoting staged version of ${gameId} to public...`);

  // 429/5xx は待って再試行する。ここで諦めると「アップロードは終わっているのに
  // 公開だけされていない」状態で止まり、原因が分かりにくい。
  const res = await fetchWithRetry(
    `${config.API_BASE}/developer/games/${encodeURIComponent(gameId)}/promote${q}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: '{}',
    },
    { label: '公開' }
  );

  const data = await res.json();
  if (!res.ok) {
    console.error('Promote failed:', data.error?.message || 'Unknown error');
    process.exit(1);
  }

  console.log('Published!');
  console.log(`  Game: ${data.game_id}`);
  console.log(`  Now public: v${data.version || data.current_version}`);
}
