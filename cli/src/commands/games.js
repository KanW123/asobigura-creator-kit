import { apiRequest } from '../api.js';

export async function gamesCommand() {
  const { games } = await apiRequest('/developer/games');

  if (!games || games.length === 0) {
    console.log('No games found. Deploy one with: gameplatform deploy <zip> --title "My Game"');
    return;
  }

  console.log(`\n  ${'ID'.padEnd(25)} ${'TITLE'.padEnd(25)} ${'VERSION'.padEnd(10)} ${'STATUS'.padEnd(12)} GENRE`);
  console.log('  ' + '-'.repeat(85));

  for (const g of games) {
    const status = g.taken_down_reason ? 'TAKEN DOWN' : g.status.toUpperCase();
    console.log(
      `  ${(g.id || '').padEnd(25)} ${(g.title || '').padEnd(25)} ${('v' + (g.current_version || '?')).padEnd(10)} ${status.padEnd(12)} ${g.genre || ''}`
    );
    if (g.publish_at) {
      const at = new Date(g.publish_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' });
      console.log(`  ${''.padEnd(25)} └ 予約公開: ${at}（日本時間）`);
    }
  }
  console.log();
}
