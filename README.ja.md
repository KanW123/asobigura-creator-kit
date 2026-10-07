# あそびぐら開発キット

Node.js 24 LTSを導入し、完成ZIPを解凍して使う第三者向けキット。npm操作・管理者権限・グローバルインストールは利用者には不要です。

WindowsとmacOS向けの公開候補版です。Macで本人ログイン・下書き投稿・更新・ゲーム内SDK連携を確認しています。Linuxは動作保証対象外です。公開候補版の試験範囲はリリースノートを参照してください。

## 利用者の入口

完成ZIPのルートで次を実行します。ソースZIPには依存が入っていないため、GitHubの「Code → Download ZIP」と完成キットを混同しないでください。

```sh
node cli/bin/gameplatform.js --version
node cli/bin/gameplatform.js --help
node cli/bin/gameplatform.js login --browser
```

認証はブラウザで行います。PC内の `~/.asobigura-creator-kit/` にセッションを保存します。従来CLIの `~/.gameplatform/` は読み書きしません。管理者側のログイン・ログアウトには影響しません。ZIPを入れ替えてもゲームID・ゲームデータは変更されません。

公式サイトから案内された配布元を使ってください。チェックサムは破損検出であり、同じ場所から取得したハッシュだけでは配布者を保証できません。

## SDKとリリース

SDKは同梱の `sdk/dist/platform-sdk.js` をゲームへコピーして読み込めます。`examples/save-counter` に保存・読込・戻るのサンプルがあります。同梱版は固定版なので、更新時はゲーム側のコピーも入れ替えて検証します。ソースは公開リポジトリの `sdk/src` にあります。既存の公開JS URLも引き続き利用できます。
`https://game-server.ailovedirector.workers.dev/sdk/platform-sdk.js`

API仕様: https://asobigura.com/sdk-reference.md

新規作品は `deploy <zip> --title <title> --draft --agree-terms`。規約を読み作者本人が同意してから指定してください。
公開作品の更新は `update <id> <zip> --ver <version> --stage`、検証後は `promote <id> --expect <version> --confirmed`。
`--confirmed`はセーブ互換性・主要動作を確認したことの表明です。検証版も同じゲームIDのセーブを使うので試験前に退避してください。

売上受取のStripe Connectは第三者作者向けです。運営アカウントの作業には不要です。
新規下書きを一般公開する操作はPFの開発者ダッシュボードで行います。第三者の公開には本人確認・運営の公開条件が別途適用されます。下書き投稿が通っただけで公開権限があるとは限りません。キットの導入でこれらの条件が解除されることはありません。
音声・言語・セーブ・戻る導線は `docs/GAME_INTEGRATION.ja.md` を参照してください。

## キット開発者向け

```sh
cd cli
npm ci --ignore-scripts
cd ..
npm ci --prefix sdk --ignore-scripts
npm run build --prefix sdk
node --test test/*.test.mjs
node scripts/build.mjs
node scripts/smoke.mjs
```

完成ZIPとSHA256はdistへ出力します。リリース手順は `docs/RELEASE.ja.md`。キット独自コードのライセンスはMIT、依存の通知はTHIRD_PARTY_NOTICES.mdです。PFのサービス利用には別途利用規約が適用されます。

## 制限と更新

- ZIPは圧縮256MiB・展開512MiB・単体128MiB・10000エントリまで、解析は15秒で中断します。新規投稿は従来APIの90MiB制限も適用されます。大きい作品は配信ビルドを軽量化してください。
- 新版は別フォルダへ解凍して試します。自動更新は行いません。旧npm CLIも残っている場合、このガイドのnodeコマンドを使うと取り違えを防げます。npm版をアンインストールする必要はありません。
- `logout` はこのキットのローカルセッション削除です。漏えい済みトークンの遠隔失効や他端末のログアウトではありません。
- 下書きはPFの一覧・起動権限を制限する仕組みです。ビルドの静的URLを知る相手から内容を完全に秘匿する保証はありません。秘密情報をゲームへ同梱しないでください。
- CLIを更新してもゲームIDは維持してください。セーブと購入はゲームIDに紐づきます。
