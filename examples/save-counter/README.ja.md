# Save Counter

同梱SDKを使う最小サンプルです。配布ZIPにはplatform-sdk.jsも入っています。
ソースからビルドする場合はsdkをビルドしてからscripts/build.mjsを実行してください。

```sh
node scripts/package-game.mjs examples/save-counter sample.zip
node cli/bin/gameplatform.js deploy sample.zip --title "あなた専用のテスト名" --draft --agree-terms
```

規約同意は本人が内容を確認してから指定します。PFの本人向け下書きから起動し、+1→保存→読込を確認します。保存は手動、戻る際の自動保存はありません。未保存状態を保護したい製品では確認UIを追加してください。

ゲームIDはasobigura.netのサブドメイン、従来配信URLの先頭パスから取得します。独自の開発URLでは?gameId=登録IDを指定できます。PF外では保存しません。

これは日本語の機能サンプルです。製品向けの自動同期・移行・6言語UI・音声エンジンは含みません。APIの使用例を示すもので、すべてのリリース要件を満たす完成ゲームではありません。
