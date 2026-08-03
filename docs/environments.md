# CardHub 環境構成リファレンス（2026-08-03時点）

CardHubのバックエンド（`x-post-fetcher/apps/worker`）・モバイルアプリ（`CardHub/apps/mobile`）が
現在どの環境を持ち、それぞれ何のためにあり、どう起動・デプロイするかをまとめる。

---

## 1. 全体像

| 環境 | Worker | Turso DB | 用途 |
|---|---|---|---|
| ローカル | `node src/node-server.ts`（Node直接起動） | ローカルSQLiteファイル（`file:local.db`） | 手元での動作確認・実装中の検証。外部コストゼロ |
| ステージング | `x-post-ingest-staging`（Cloudflare Workers） | `cardhub-staging`（Turso） | 実機での動作確認・Sandbox課金テスト・リリース前の最終確認。本番データとは物理的に分離 |
| 本番 | `x-post-ingest`（Cloudflare Workers） | `x-post-fetcher`（Turso） | 実際に稼働中のサービス本体。2026-07-27から抽選収集用として稼働、2026-08-03にモバイルアプリ向け機能（認証・同期・課金・統計）を追加 |

モバイル側はEAS Buildの4つのビルドプロファイル（`development` / `development-simulator` / `preview` / `production`）で、上記のうちどの環境と通信するかが決まる（3章参照）。

---

## 2. バックエンド環境ごとの詳細

### 2.1 ローカル

- **DB**: ローカルファイル（`file:local.db`）。`npm run db:migrate`実行時に自動生成される。抽選データは無し（クローラーもローカルでは動かさない前提）
- **起動コマンド**:
  ```
  cd x-post-fetcher
  INGEST_TOKEN=dev-secret TURSO_DATABASE_URL=file:local.db npm run worker:dev
  ```
  デフォルトで`http://localhost:8787`で待ち受ける
- **用途**: バックエンドのコード変更を最速で試す。認証・課金系のSecretは通常未設定のままなので、`/auth/*`・`/webhooks/revenuecat`等は503 fail-closedになる（`/lotteries`等の公開APIは動く）

### 2.2 ステージング

- **Worker名**: `x-post-ingest-staging`
- **URL**: `https://x-post-ingest-staging.bakushi-log.workers.dev`
- **DB**: `cardhub-staging`（Turso、`aws-ap-northeast-1`）
- **ENVIRONMENT設定**: `development`（本番の厳格な必須チェック——Apple Sign-In鍵一式の必須化等——を回避しつつ、本番と同じ鍵を追加登録することで実行挙動は本番相当にしてある）
- **データ状態（2026-08-03時点）**:
  - `lotteries` 126件・`lottery_sources` 125件・`lottery_field_history` 337件（本番`x-post-fetcher`から読み取り専用でコピー済み、本番側は無変更）
  - `users`等の認証・課金テーブルは、これまでのテスト操作で作成されたテストユーザーのみ
- **RevenueCat連携**: Webhook「CardHub Staging」（配信対象 Sandbox only）
- **再デプロイコマンド**:
  ```
  cd x-post-fetcher/apps/worker
  npx wrangler deploy --env staging
  ```
- **Secret登録コマンド例**:
  ```
  echo "<値>" | npx wrangler secret put <NAME> --env staging
  ```
- **用途**: 実機での機能確認、Apple Sandboxでの課金テスト、リリース前の「本番相当」動作確認。ここでの操作は本番DBに一切影響しない

### 2.3 本番

- **Worker名**: `x-post-ingest`
- **URL**: `https://x-post-ingest.bakushi-log.workers.dev`
- **DB**: `x-post-fetcher`（Turso、2026-07-27から稼働中の本体DB。抽選収集Cronの書き込み先でもある）
- **ENVIRONMENT設定**: `production`（Apple Sign-In鍵一式・`ACCOUNT_DELETION_GRACE_DAYS`等の必須チェックが有効）
- **データ状態**: 実際に収集され続けている抽選データ（本稿執筆時点126件、増加中）。認証・課金・統計テーブルは2026-08-03にマイグレーション追加したばかりで、実ユーザーデータはまだこれから
- **RevenueCat連携**: Webhook「CardHub Production」（配信対象 Production only）
- **再デプロイコマンド**:
  ```
  cd x-post-fetcher/apps/worker
  npx wrangler deploy
  ```
  （`wrangler.toml`に`[env.staging]`が定義されているため、`--env`省略時は警告が出るが、トップレベル＝本番設定へ正しくデプロイされる）
- **Secret登録コマンド例**:
  ```
  echo "<値>" | npx wrangler secret put <NAME>
  ```
- **用途**: 実際にリリースするアプリが接続する唯一の環境。TestFlight・App Store配信のビルドはすべてここを向く

---

## 3. モバイル（EAS Build プロファイル）

`CardHub/apps/mobile/eas.json`で定義。`EXPO_PUBLIC_*`環境変数はローカル`.env`ではなく、**EAS Environment Variables**（プロファイルの`environment`フィールドで指定した環境名にひも付く、Expoのクラウド側管理機能）から読み込む。ローカル`.env`はgitignore対象でビルドにもアップロードされないため、両者が競合することはない。

| プロファイル | `environment` | 接続先 | 配布形式 | 用途 |
|---|---|---|---|---|
| `development` | 未設定（ローカル`.env`依存） | 通常ローカル/ステージング | 内部（devClient、Metro必須） | 開発中のライブリロード確認 |
| `development-simulator` | 未設定 | 同上 | シミュレーター専用 | Macのシミュレーターでの確認 |
| `preview` | `preview` | **ステージング** | 内部（Ad Hoc、Metro不要） | 実機での本番相当動作確認、Sandbox課金テスト |
| `production` | 未設定（EAS側は`production`環境に自動解決） | **本番** | store（TestFlight/App Store経由のみ） | 実リリース用ビルド |

### ビルドコマンド

```
cd CardHub/apps/mobile

# 実機で今すぐ試したい（本番相当・ステージング接続）
eas build --profile preview --platform ios

# リリース用（TestFlight/App Store提出前提）
eas build --profile production --platform ios

# 開発中のライブリロード確認（Metro併用）
eas build --profile development --platform ios
npx expo start --dev-client
```

### EAS環境変数の確認・登録コマンド

```
# 一覧（値は表示されない）
npx eas env:list --environment preview
npx eas env:list --environment production

# 登録
npx eas env:create <preview|production> --name <NAME> --value "<値>" --visibility plaintext --non-interactive
```

現在`preview`・`production`それぞれに登録済みの変数名（値は非公開）:
`EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` / `EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID` / `EXPO_PUBLIC_REVENUECAT_LIFETIME_PRODUCT_ID`

---

## 4. RevenueCat（プロジェクト共通、環境をまたいで1つ）

- Project: **CardHub**（同一Apple/Cloudflareアカウント内に無関係な別プロジェクト「Bakushi Log」が存在するため操作時は要注意）
- Entitlement: `premium`
- Offering: `default`（Package: `$rc_monthly` / `$rc_lifetime`）
- Product: `cardhub_premium_monthly`（月額¥400） / `cardhub_premium_lifetime`（買い切り¥2,000）
- Webhook: 「CardHub Staging」（Sandbox only、ステージングWorkerへ）と「CardHub Production」（Production only、本番Workerへ）の2本を個別登録済み
- Secret API Key・Product IDはプロジェクト単位の値のため、ステージング・本番のWorker Secretで同じ値を使い回している（Sandbox/Productionの区別はイベント側の`environment`フィールドで行われる）

---

## 5. 補足: 本番データのステージングへの反映について

ステージングDBの`lotteries`系テーブルは本番からの**一度きりのコピー**であり、自動同期はしていない。本番側で新しい抽選が追加されても、ステージング側には反映されない。再度最新化したい場合は、同様の読み取り専用コピー手順を再実行する必要がある（自動化はまだしていない）。
