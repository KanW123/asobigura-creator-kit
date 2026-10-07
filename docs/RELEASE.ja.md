# キットのリリース手順

キットの公開と、ゲームの公開・PF本番の更新は別作業です。

1. CLIのversionとlockを更新。Node24でCLI/SDKのnpm ci（ignore-scripts）、audit、SDKビルド、test、build、smokeを実施。
2. SDKソース・サンプル・依存通知・ZIP内容を確認。ソースと完成ZIPの両方に秘密情報や運営資料がないことを確認する。
3. Windows/macOSのCIを通す。Macで実ログイン→draft投稿→stage更新→PFのiframeから保存/読込/戻るを確認。試験用アカウントだけを使う。実ログイン試験をGitHub Actionsに持ち込まず、トークンをCIへ登録しない。
4. GitHub公開リポジトリの権限・多要素認証を確認。Actionsの依存はコミットSHA固定。PR試験には書込権限を与えない。
5. releaseワークフローを手動実行。OS試験が成功した同じコミットからZIPをビルドし、attestationとダウンロード用artifactを生成する。
6. Actionsが作ったZIPを取得し、ハッシュと `gh attestation verify` を確認。タグ・コミット・ZIPのversionが一致したものだけGitHub Releaseへ添付する。手元の別ビルドへ差し替えない。
7. Releaseの説明に対象Node/OS、変更点、検証結果、制約を記載。自動生成Source code ZIPではなく完成ZIPを案内する。
8. 正式な公開後、PF開発者ページから公式配布先へ案内する。既存npmを即座に削除しない。移行案内は別途行い、既存の管理者制作フローは維持する。

不具合時は安全性を確認済みの前版を案内し、ゲームID・サーバの保存データを変更しない。漏えい時は配布を止め、認証の失効・修正版・告知を扱う。古い脆弱版へ無条件に戻さない。
