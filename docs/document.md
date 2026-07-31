G3-5の実施計画を承認します。
G3-5へ進んでください。

ただし、開始前に以下を実施してください。

1. 会話内へ貼られた開発用JWT Secretは使用しない
- 漏えい済みとして破棄する
- ローカル端末で新しい値を生成する
- 値をチャット・ログ・完了報告へ表示しない
- x-post-fetcher/.envへ直接設定する
- .envがgitignore対象であることを再確認する

生成例:
openssl rand -base64 48

2. x-post-fetcher/.gitignoreへ以下を追加する
- *.p8
- AuthKey_*.p8

Apple秘密鍵は原則リポジトリ外で管理し、
将来発行してもリポジトリ内へ置かないでください。

3. eas.jsonには実機用とシミュレータ用を分離する

必要プロファイル:
- development
  - developmentClient: true
  - distribution: internal
- development-simulator
  - developmentClient: true
  - ios.simulator: true
- preview
- production

シミュレータ用コマンド:
eas build --platform ios --profile development-simulator

実機用コマンド:
eas build --platform ios --profile development

==================================================
G3-5 実施範囲
==================================================

実施してよい:
- expo-dev-clientのインストール
- インストール後のconfig plugin要否確認
- app.jsonの必要最小限の修正
- eas.json作成
- eas login
- eas init
- eas build:configure
- iOS Development Build
- シミュレータ用Development Build
- 開発用Worker起動
- ローカルSQLite経由での初期確認
- 開発用Turso作成・マイグレーション
- wrangler devまたはCloudflare Preview経由の確認
- 開発環境の認証・同期確認
- 実機またはシミュレータでの手動確認

まだ実施しない:
- 本番Turso適用
- production Workerデプロイ
- .p8鍵発行
- Apple code exchangeの本番相当確認
- Apple revokeの実処理確認
- RevenueCat
- 課金
- 統計
- TestFlight
- eas submit
- App Store Connect提出

==================================================
実施順序
==================================================

1. Secretを再生成しローカル.envへ設定
2. x-post-fetcher/.gitignoreを更新
3. expo-dev-clientを追加
4. config plugin実体を確認
5. app.jsonを必要最小限だけ更新
6. eas.jsonを作成
7. eas login / eas init / eas build:configure
8. シミュレータ用Development Build
9. NodeローカルWorker＋SQLiteで接続確認
10. 開発用Tursoを作成してマイグレーション
11. wrangler devまたはCloudflare Previewで接続確認
12. 可能なら実機用Development Build
13. 認証・同期・ログアウト等の手動テスト
14. 結果をドキュメントへ記録

==================================================
G3-5 完了条件
==================================================

最低限:
- Development Buildが起動する
- 公開抽選APIが表示できる
- Sign in with Appleでログインできる
- Refresh Tokenから起動時セッション復元できる
- guest bootstrapが動作する
- 自分の抽選が同期できる
- お気に入り・フォロー・チェックリスト・通知設定が同期できる
- オフライン操作が復帰後に再送される
- ログアウトできる
- 全端末ログアウトできる
- アカウント削除要求が動作する
- namespace間でデータが混在しない
- wrangler devまたはCloudflare Preview経由でも認証・同期できる
- SecretやApple一過性トークンがログへ出ていない

G3-5では未検証として残してよい:
- Apple authorizationCode exchange
- Apple Refresh Token保存
- Apple側revoke実処理

これらは.p8 / Team ID / Key IDを準備した後、
本番公開前に必ず別途確認してください。

==================================================
完了報告
==================================================

1. .gitignore変更
2. Secret再生成・設定確認（値は表示しない）
3. expo-dev-client導入結果
4. config pluginの要否
5. app.json変更
6. eas.json最終内容
7. EAS初期化結果
8. Development Build結果
9. ローカルWorker接続結果
10. 開発用Tursoマイグレーション結果
11. wrangler dev / Preview接続結果
12. Sign in with Apple確認結果
13. セッション復元結果
14. bootstrap・通常同期結果
15. オフライン復帰結果
16. ログアウト・全端末ログアウト結果
17. アカウント削除結果
18. namespace分離結果
19. 手動テスト結果
20. G3-5を完了扱いにできるか
21. .p8取得後に残る検証
22. RevenueCat開始前Blocker

G3-5完了後に停止してください。
RevenueCat、課金、統計、本番デプロイ、TestFlight、
App Store Connectには進まないでください。