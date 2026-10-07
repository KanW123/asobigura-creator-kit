// 共有版（プレス・共同開発者向け）の確認・管理。
//
// 共有版はどのリストにも出ないので、URLと合言葉を知る手段はここだけ。
//   gameplatform share <game-id>            配布用のURL・合言葉・そのまま送れる文面
//   gameplatform share <game-id> --rotate   合言葉を作り直す（漏れたとき）
//   gameplatform share <game-id> --stop     共有をやめる（配布済みURLは死ぬ）
//
// ビルドを差し替えても合言葉は変わらないので、一度配れば以後は
// `gameplatform update <game-id> game.zip --ver X --share` だけでよい。
import { apiRequest } from '../api.js';

export async function shareCommand(gameId, options = {}) {
  try {
    if (options.stop) {
      const res = await apiRequest(`/developer/games/${encodeURIComponent(gameId)}/share/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      console.log(res.cleared
        ? `共有を停止しました: ${gameId}（配布済みのURLはもう開けません）`
        : `${gameId} は共有されていません。`);
      return;
    }

    if (options.rotate) {
      const res = await apiRequest(`/developer/games/${encodeURIComponent(gameId)}/share/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      console.log('合言葉を作り直しました。以前の合言葉はもう使えません。');
      printShare(gameId, { ...res, version: null });
      return;
    }

    const res = await apiRequest(`/developer/games/${encodeURIComponent(gameId)}/share`);
    if (!res.shared) {
      console.log(`${gameId} は共有されていません。`);
      console.log(`共有するには: gameplatform update ${gameId} game.zip --ver <version> --share`);
      return;
    }
    printShare(gameId, res);
  } catch (err) {
    console.error('share failed:', err.message);
    process.exit(1);
  }
}

function printShare(gameId, res) {
  if (res.version) console.log(`共有中のバージョン: v${res.version}`);
  console.log(`URL     : ${res.url}`);
  console.log(`合言葉  : ${res.passphrase}`);
  console.log('');
  console.log('--- そのまま送れる文面 ---');
  console.log(`「${gameId}」を先行してお試しいただけます。`);
  console.log('');
  console.log(`  ${res.url}`);
  console.log('');
  console.log('・上のURLを開いてログインすると遊べます（ログインが必要です）');
  console.log('・一般公開はされていません。URLの共有はお控えください');
  console.log('--------------------------');
  console.log('');
  console.log('※ URLに合言葉が入っています。別々に伝えたい場合は、合言葉を外したURLを送り、');
  console.log(`   相手に「${res.passphrase}」を別経路で伝えてください。`);
}
