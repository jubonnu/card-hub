# CardHub

トレカ抽選情報を一元管理するモバイルアプリ（React Native + Expo / Expo Router）。

現在は **Phase Mobile-F1** まで完了した状態です。抽選一覧・抽選詳細・商品統合ビュー・「自分の抽選」・フォロー中は x-post-fetcher の実API（`GET /lotteries`, `GET /lotteries/:id`）＋ローカル保存（AsyncStorage）で動作します。統計・分析とお気に入り（抽選単位）は実装が伴っていないため、このリリースでは導線を非表示または空状態にしています。認証・DB変更・Worker変更・リモートPush送信は未実装です（ローカル通知・OSカレンダー登録は実装済み、Expo Go範囲内）。

## リポジトリ構成と独立プロジェクト方針

```
CardHub/
├── CardHub/          # 本リポジトリ。React Native + Expo モバイルアプリ（UI・ユーザー体験）
└── x-post-fetcher/   # 別リポジトリ。GitHub Actions / Playwright / Worker / Turso（X取得・解析・抽選マスタAPI）
```

- `CardHub`（本リポジトリ）と `x-post-fetcher` は**別々のnpmプロジェクト**として運用し、`node_modules` や `package.json` の依存関係を共有しません。
- 責務分担:
  - **CardHub**: モバイルUI・ユーザー体験（画面、状態管理、表示ロジック）
  - **x-post-fetcher**: X投稿取得・解析、抽選マスタAPI、DB（Turso）、スクレイパー、GitHub Actions
- 両者は将来的に**HTTP API経由でのみ**接続します（型やコードを直接importしません）。バックエンド側の実装変更（DBスキーマ、Worker内部構造など）が本リポジトリの依存関係更新を強制することはありません。
- APIレスポンスとの整合性は、型の直接共有ではなく **Zodスキーマ + 実レスポンスfixtureテスト** で担保します（詳細は [`docs/api-integration.md`](./docs/api-integration.md)）。
- 例外として、x-post-fetcher の `/lotteries` 系エンドポイントへWeb（ブラウザ）からアクセスするために必要なCORS設定のみ、x-post-fetcher側に追加しています（`apps/worker/src/publicCors.ts`）。モバイル側のロジック・型・DBには一切踏み込んでいません。

## 開発

```bash
cd apps/mobile
npm install   # ルートで npm install した場合は不要
npm run start        # Expo dev server
npm run web           # Web (Expo Router / react-native-web)
npm run typecheck
npm run lint
npm run test          # Zodスキーマのfixtureテスト（vitest）
```

UIの確認は **Expo Go** で行えます（追加のネイティブモジュールを必要としないため）。

抽選一覧・抽選詳細で実データを見るには、別ターミナルで x-post-fetcher の Worker をローカル起動してください（`EXPO_PUBLIC_API_BASE_URL` のデフォルトは `http://localhost:8787`）。

```bash
cd ../x-post-fetcher/apps/worker
npm run dev
```

Workerを起動しない場合でも、通信エラー時の表示（オフライン相当のエラー画面・再読み込み）が確認できます。

## Development Build（将来対応）

以下の機能は将来 Phase で実装予定であり、いずれも **Expo Go では動作しないネイティブモジュール**を必要とします。

- `expo-calendar`（OSカレンダー連携）
- `expo-notifications`（Push通知送信）
- `expo-secure-store`（認証トークン等の安全な保存）

これらを実装する段階（Mobile-D想定）で **Development Build**（`npx expo prebuild` / EAS Build によるカスタム開発クライアント）への移行が必要です。現時点ではこれらのパッケージは導入しておらず、`app.json` の `plugins` 配列に追記していく形で拡張できる構成になっています。EAS設定（`eas.json`）自体もMobile-D以降に着手します。

## API接続方針

Mobile-B以降のAPI接続方針は [`docs/api-integration.md`](./docs/api-integration.md) を参照してください。

## リリース設定（`app.json`）

- `ios.bundleIdentifier`: 現在は仮値 `com.cardhub.mobile` を設定しています。正式なアプリ／会社のドメインが決まり次第、確定した値に変更してください（一度App Store Connectに登録すると変更できません）。
- `ios.buildNumber`: App Store Connectへ提出するビルドごとに、**必ず1つ前の値より大きい整数の文字列**へ更新してください（例: `"1"` → `"2"` → `"3"`）。同じ `version`（例: `1.0.0`）内で複数回ビルド・提出する場合も、`buildNumber` は毎回インクリメントが必須です（同一の組でも再提出はできません）。`version`（マーケティングバージョン）を上げた場合は `buildNumber` を `"1"` に戻して構いません。
- `EXPO_PUBLIC_API_BASE_URL`: 本番ビルド時に必ずENVで実値（本番Worker URL）を設定してください。未設定のまま本番ビルドすると、アプリはlocalhostへ暗黙フォールバックせず、明確な設定エラーとして扱います（詳細は [`docs/api-integration.md`](./docs/api-integration.md)）。
