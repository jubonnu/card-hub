# Mobile-G1: 認証・課金・統計アーキテクチャ設計

ステータス: **設計のみ。コード変更・DB変更・EAS操作・RevenueCat操作・Apple Developer操作は未実施。**
対象リポジトリ: `CardHub/CardHub`（モバイル）, `CardHub/x-post-fetcher`（バックエンド）
前提根拠: 本設計は以下の実コードを確認した上で作成した。
- `apps/mobile/stores/*.ts`（myLotteriesStore / checklistStore / favoritesStore / notificationSettingsStore / calendarEventStore）
- `apps/mobile/types/models.ts`, `apps/mobile/theme/colors.ts`（`LotteryStatus`）
- `apps/mobile/schemas/lotteryApi.ts`（`LotteryRecord`, `id: number`）
- `apps/mobile/lib/notifications.ts`, `apps/mobile/lib/calendar.ts`
- `apps/mobile/utils/publicProductDisplay.ts`（`productKey = normalizedProductName`、バックエンドに商品テーブルは存在しない）
- `apps/mobile/app.json`, `apps/mobile/package.json`
- `x-post-fetcher/apps/worker/src/db/schema.ts`（Drizzle + Turso、命名規則）
- `x-post-fetcher/apps/worker/src/app.ts`, `src/env.ts`（Hono、`INGEST_TOKEN` によるBearer認証パターン、`publicCors.ts`）

---

## 1. 全体方針（確定事項）

| # | 方針 | 状態 |
|---|---|---|
| 1 | 認証はサーバー側ユーザー管理を前提 | 確定 |
| 2 | 同一アカウントを複数端末で利用可能 | 確定 |
| 3 | 自分の抽選・お気に入り・フォロー・チェックリスト・通知設定はサーバー同期 | 確定 |
| 4 | 端末ローカル保存はオフライン利用・キャッシュのため併用 | 確定 |
| 5 | 未ログインでも一部機能をローカルで利用可能 | 確定 |
| 6 | ログイン時に既存ローカルデータを失わずサーバー統合 | 確定 |
| 7 | ログアウト後に別ユーザーのデータを混在させない | 確定 |
| 8 | 統計・分析はRevenueCat premium entitlementで解禁 | 確定 |
| 9 | premium判定をAsyncStorage/Zustandのみで行わない（サーバー再検証必須） | 確定 |
| 10 | RevenueCat状態はモバイル・サーバー両方で検証可能にする | 確定 |
| 11 | premium必須APIはサーバー側でも保護する | 確定 |
| 12 | 認証トークン・秘密情報をモバイルへ直書きしない | 確定 |

---

## 2. 認証方式の比較

### 比較表

| 候補 | iOS審査適合 | SIWA統合 | Expo54統合 | CF Worker統合 | Turso統合 | 実装工数 | 月額費用 | 無料枠 | Android将来対応 | 複数端末同期 | vendor lock-in | 障害時影響 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Sign in with Apple（自前検証）** | ◎必須要件を満たす | ◎そのもの | ◎`expo-apple-authentication`はDev Build要 | ◎`jose`でJWT検証可 | ◎自前セッションテーブル | 中（JWKS検証+Refresh設計） | ¥0 | 無制限（Apple自体は無料） | △Android用に別途Google等が必要 | ◎自前実装で完全制御 | なし | 自社Workerのみ |
| メール+マジックリンク（自前） | ○可（SIWA併用時は追加扱いでOK） | - | ◎ | ◎（メール送信サービスのみ外部依存） | ◎ | 中〜大（メール到達性・トークン失効） | メール送信費（Resend等）実費 | 送信量に応じ無料枠あり | ◎ | ◎ | 低（メール送信のみ） | メール到達遅延の影響 |
| メール+パスワード（自前） | ○可 | - | ◎ | △ハッシュ管理・漏洩対策要 | ◎ | 大（bcrypt/argon2、漏洩監視、リセットフロー） | ¥0 | - | ◎ | ◎ | なし | パスワードDB漏洩が最大リスク |
| Googleログイン | △iOSのみで提供する場合SIWA併用必須（Appleガイドライン4.8） | 要併用 | ○`expo-auth-session`等 | ○ | ○ | 中 | ¥0 | - | ◎Android本命 | ◎ | 低〜中 | Google側障害の影響 |
| Supabase Auth | ○ | ○対応 | ○ | △Postgres中心、Turso併存で二重DB化 | ✕別DBが増える | 中 | 無料枠あり、MAU課金 | あり（変動） | ◎ | ◎ | 中（別クラウド依存） | Supabase障害の影響 |
| Clerk | ○ | ○対応良好 | ◎Expo公式連携あり | ○Webhook/JWT検証で連携可 | ○（IDのみ同期） | 小〜中（SDK任せ） | 無料枠あり、MAU課金（要最新確認） | あり（変動、要 clerk.com/pricing 確認） | ◎ | ◎（Clerk側で提供） | 中〜高（認証全体を委託） | Clerk障害=ログイン不能 |
| Firebase Authentication | ○ | ○対応 | ○ | ○IDトークン検証で連携可 | ○（IDのみ同期） | 小〜中 | 無料枠大きい（要最新確認） | あり | ◎ | ◎ | 中（Google Cloud依存） | Firebase障害の影響 |
| Auth0 | ○ | ○対応 | ○ | ○ | ○ | 中 | 無料枠は小規模向け（要最新確認） | あり（変動） | ◎ | ◎ | 中〜高 | Auth0障害の影響 |
| CF Worker + Turso 独自認証 | ○ | ◎（SIWAと組み合わせ） | ◎ | ◎そのもの | ◎そのもの | 中 | ¥0（追加費用なし） | 無制限 | ◎ | ◎ | **なし（最小）** | 自社内で完結 |

### アカウント復旧・メール変更・退会（自前 or 外部サービス共通の論点）
- **アカウント復旧**: SIWA単独運用ならApple ID自体の復旧に委ねられる（自社でパスワードリセットの仕組みを持たなくてよい）ため運用負荷が最小。
- **メールアドレス変更**: Apple Private Relayメールは配信元によって変わる場合があるため、`user_identities.email`は「その時点のサインイン時にAppleから受け取った値」として都度更新する設計にする（同一性の主キーは`sub`であり`email`ではない）。
- **退会処理**: 15章参照。

### RevenueCat App User IDとの連携しやすさ
- 自前認証・Clerk・Firebase・Auth0・Supabaseいずれも「サーバー側`userId`をRevenueCatの`App User ID`としてそのまま使う」設計に統一可能（8章参照）。この観点は差別化要因にならない。

### 推奨: **案B（Sign in with Appleのみで初回リリース）+ 認証基盤は自作（Cloudflare Worker + Turso）**

理由:
1. iOS優先・個人開発という前提に対し、外部認証サービス（Clerk/Firebase/Auth0/Supabase Auth）はいずれも「もう1つの外部ベンダー」を増やし、CardHubがこれまで貫いてきた「バックエンドとモバイルはHTTP APIのみで疎結合」という設計思想（`docs/api-integration.md`）とも整合する。
2. Sign in with Apple単独なら、パスワード管理・メール到達性・ソーシャルログインの複雑さを一切持たずに済み、実装範囲が「Appleが発行するIdentity TokenをWorker側でJWKS検証し、自前セッション（Access/Refresh JWT）を発行する」ことに閉じる。既存の`INGEST_TOKEN`のBearer検証パターン（`env.ts`）と同じ思想を拡張できる。
3. 将来のAndroid対応時にGoogleログインやメール認証を`user_identities`テーブルへ追加する形で自然に拡張できる（1ユーザー=複数`identity`の設計を最初から取っているため）。
4. 追加の月額費用・SLA依存・障害点が発生しない。

**トレードオフとして許容する点**: Refresh Tokenローテーションや再利用検知など、外部サービスなら「built-in」の機能を自前実装する必要がある（6章で設計）。ここが唯一の実装コストだが、個人開発規模では一度作れば保守コストは低い。

パスワード自前保存は不採用（明確な理由: SIWA単独運用のためパスワードという概念自体が不要）。

---

## 3. 認証基盤の責務分担

| 責務 | モバイル | Sign in with Apple (Apple側) | Cloudflare Worker | Turso |
|---|---|---|---|---|
| OAuth開始 | ◯ `expo-apple-authentication`呼び出し | - | - | - |
| Apple IDトークン取得 | ◯ | ◯発行 | - | - |
| IDトークン検証 | - | - | ◯ Apple JWKS (`https://appleid.apple.com/auth/keys`) で署名検証 | - |
| ユーザー作成 | - | - | ◯ | ◯ `users`/`user_identities` へ書き込み |
| 既存ユーザー照合 | - | - | ◯ `sub`で照合 | ◯ |
| Access Token発行 | - | - | ◯ 自前JWT署名 | - |
| Refresh Token発行 | - | - | ◯ | ◯ `refresh_tokens`へ保存（ハッシュ化） |
| Refresh Tokenローテーション | - | - | ◯ | ◯ |
| セッション失効 | - | - | ◯ | ◯ |
| ログアウト | ◯ ローカル破棄要求 | - | ◯ 該当refresh_token失効 | ◯ |
| 全端末ログアウト | ◯ 起点 | - | ◯ userId単位で全失効 | ◯ |
| アカウント削除 | ◯ 起点 | - | ◯ | ◯ |
| RevenueCat App User ID設定 | ◯ `Purchases.logIn(userId)` | - | - | - |
| RevenueCat entitlement確認 | ◯（表示用キャッシュ） | - | ◯（正）Webhook経由 | ◯ |
| ユーザーデータ同期 | ◯ | - | ◯ | ◯ |
| 統計計算 | -（premiumはサーバー計算を第一候補） | - | ◯ | ◯ |
| 課金Webhook受信 | - | - | ◯ | ◯ |
| 監査ログ | - | - | ◯ | ◯ |
| レート制限 | - | - | ◯（Workers標準機能 or KV/Durable Object） | - |

### 全体アーキテクチャ図

```
[認証]
Mobile App (Expo)
  │  1. Sign in with Apple (expo-apple-authentication)
  ▼
Apple ID (identityToken, authorizationCode)
  │  2. POST /auth/apple { identityToken }
  ▼
Cloudflare Worker
  │  3. Apple JWKS で identityToken 検証
  │  4. users / user_identities 照合 or 作成
  │  5. Access Token(JWT, 短命) + Refresh Token(乱数, 長命) 発行
  ▼
Turso（users, user_identities, refresh_tokens）
  │
  ▼
Mobile App
  - Access Token → メモリ / expo-secure-store
  - Refresh Token → expo-secure-store のみ

[以降のAPI呼び出し]
Mobile App
  │ Authorization: Bearer <AccessToken>
  ▼
Cloudflare Worker（認証ミドルウェア: JWT検証 → userId確定）
  ▼
Turso（user_lotteries 等 owner=userId のみ操作可）

[課金]
Mobile App
  │ Purchases.configure + Purchases.logIn(userId)
  ▼
RevenueCat SDK (react-native-purchases)
  ▼
RevenueCat（Project）
  │ Webhook (INITIAL_PURCHASE / RENEWAL / EXPIRATION 等)
  ▼
Cloudflare Worker  POST /webhooks/revenuecat（署名検証、公開CORS非適用）
  ▼
Turso（subscriptions, subscription_entitlements, revenuecat_events）

[premium API保護]
Mobile App
  │ GET /me/statistics/summary (Authorization: Bearer <AccessToken>)
  ▼
Cloudflare Worker
  │ 1. 認証ミドルウェアでuserId確定
  │ 2. subscription_entitlementsでpremium有効か確認（Webhook反映が正）
  │ 3. 不足時は RevenueCat REST API へ再照会 or 403 PREMIUM_REQUIRED
  ▼
Turso
```

---

## 4. バックエンドDB設計

既存 `lotteries` / `source_posts` / `lottery_sources` / `lottery_field_history` / `processing_jobs` テーブルは変更しない。新規テーブルは既存の命名規則（`sqliteTable`、snake_case列名、`integer().primaryKey({autoIncrement:true})`、`text` timestamp + `CURRENT_TIMESTAMP` default、物理削除せず`lifecycleStatus`/`deletedAt`列で論理管理）に揃える。

共通ルール:
- 全テーブルに`createdAt`必須。更新のある行は`updatedAt`も必須。
- 個人データを含むテーブル（`users`, `user_lotteries`, `user_favorites`, `followed_products`, `checklist_progress`, `notification_preferences`）は**論理削除**（`deletedAt`）を基本とし、アカウント削除の猶予期間終了時のみバッチで物理削除する（15章）。
- `sessions`系・`revenuecat_events`・`audit_logs`は履歴・セキュリティ目的のため物理削除しない（保持期間ポリシーのみで管理）。

### 4.1 `users`

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| displayName | text | nullable |
| email | text | nullable（SIWA初回のみ取得できるケースがあるため必須にしない） |
| emailIsPrivateRelay | integer(boolean) | nullable |
| accountStatus | text | not null, default `'active'`（`active`/`pending_deletion`/`deleted`） |
| deletionRequestedAt | text | nullable |
| scheduledDeletionAt | text | nullable |
| lastLoginAt | text | nullable |
| createdAt | text | not null, default CURRENT_TIMESTAMP |
| updatedAt | text | not null, default CURRENT_TIMESTAMP |
| deletedAt | text | nullable（物理削除前の論理マーク） |

- 一意制約: なし（emailは複数ユーザーで同一の可能性を許容しない設計にはしない。一意性は`user_identities`の`(provider, providerUserId)`で担保）
- インデックス: `accountStatus`（削除バッチ抽出用）
- Apple `sub`は本テーブルに直接持たず`user_identities`に正規化する（将来Android/Google追加時に同じ構造で拡張できるため）。

### 4.2 `user_identities`

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userId | integer FK→users.id | not null |
| provider | text | not null（`'apple'` / 将来`'google'` / `'email'`） |
| providerUserId | text | not null（Appleの`sub`） |
| email | text | nullable（サインイン時点でAppleから受領した値） |
| createdAt | text | not null default CURRENT_TIMESTAMP |

- 一意制約: `unique(provider, providerUserId)`
- インデックス: `userId`
- カスケード: `users`削除（物理削除バッチ時）で`user_identities`もカスケード削除

### 4.3 `refresh_tokens`（sessionsは発行せずJWT Access Token + 本テーブルで代替）

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userId | integer FK→users.id | not null |
| tokenHash | text | not null（生トークンは保存せずSHA-256ハッシュのみ） |
| deviceId | text | not null |
| deviceName | text | nullable |
| rotatedFromId | integer FK→refresh_tokens.id | nullable（ローテーション連鎖の追跡、再利用検知用） |
| issuedAt | text | not null default CURRENT_TIMESTAMP |
| expiresAt | text | not null |
| lastUsedAt | text | nullable |
| revokedAt | text | nullable |
| revokedReason | text | nullable（`'rotated'`/`'logout'`/`'logout_all'`/`'reuse_detected'`/`'account_deleted'`） |

- 一意制約: `unique(tokenHash)`
- インデックス: `userId`, `deviceId`
- JSON列: なし
- Turso/SQLite注意点: `tokenHash`検索はインデックス必須（毎リクエストではなくRefresh時のみ参照するため負荷は小さい）

### 4.4 `user_devices`（push token登録用。将来のリモートPush実装に備えたスキーマ先行、G1では書き込み処理は未実装）

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userId | integer FK→users.id | not null |
| deviceId | text | not null |
| platform | text | not null（`'ios'`/`'android'`） |
| pushToken | text | nullable |
| appVersion | text | nullable |
| lastSeenAt | text | not null default CURRENT_TIMESTAMP |
| createdAt | text | not null default CURRENT_TIMESTAMP |
| updatedAt | text | not null default CURRENT_TIMESTAMP |

- 一意制約: `unique(userId, deviceId)`

### 4.5 `user_lotteries`（サーバー版「自分の抽選」。現行`myLotteriesStore`の`SavedLottery{record, savedAt}`を置き換える）

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userId | integer FK→users.id | not null |
| lotteryId | integer FK→lotteries.id | not null |
| status | text | not null default `'unknown'`（10章の状態遷移） |
| statusUpdatedAt | text | not null default CURRENT_TIMESTAMP |
| snapshotJson | text (JSON) | nullable（保存時点の`LotteryRecord`スナップショット。バックエンド`lotteries`行が将来`orphaned`/`archived`になっても表示継続するため。現行モバイル実装の設計意図を踏襲） |
| snapshotUpdatedAt | text | nullable |
| savedAt | text | not null |
| syncVersion | integer | not null default 1（楽観的ロック用） |
| createdAt | text | not null default CURRENT_TIMESTAMP |
| updatedAt | text | not null default CURRENT_TIMESTAMP |
| deletedAt | text | nullable（論理削除。統計は削除後も過去実績として参照するため物理削除しない） |

- 一意制約: `unique(userId, lotteryId)` ※SQLiteの部分一意インデックス（`WHERE deleted_at IS NULL`）で「削除済みは重複可、有効な保存は1件のみ」を表現
- インデックス: `userId`, `(userId, status)`（統計集計用）
- 既存`lotteries`との関係: 参照のみ（FK、直接JOIN）。物理削除はしない前提（既存スキーマの`lifecycleStatus`方針と一致）

### 4.6 `user_lottery_status_history`（統計の元データ・監査用）

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userLotteryId | integer FK→user_lotteries.id | not null |
| fromStatus | text | nullable |
| toStatus | text | not null |
| changedAt | text | not null default CURRENT_TIMESTAMP |
| source | text | not null（`'user'` / `'system_auto_expire'`） |

- インデックス: `userLotteryId`, `changedAt`（月別集計用）
- 物理削除しない（統計の正当性を保つため）

### 4.7 `user_favorites`

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userId | integer FK→users.id | not null |
| lotteryId | integer FK→lotteries.id | not null |
| createdAt | text | not null default CURRENT_TIMESTAMP |
| deletedAt | text | nullable |

- 一意制約: `unique(userId, lotteryId)`（部分一意、`deleted_at IS NULL`）
- 履歴価値が低いため、将来的にストレージ肥大化が問題になれば物理削除に切り替え可

### 4.8 `followed_products`

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userId | integer FK→users.id | not null |
| productKey | text | not null（**`normalizedProductName`をそのまま保存**。バックエンドに正式な商品テーブルは存在しないため文字列一致で管理） |
| createdAt | text | not null default CURRENT_TIMESTAMP |
| deletedAt | text | nullable |

- 一意制約: `unique(userId, productKey)`（部分一意）
- **⚠️ 設計上のリスク（Important）**: `normalizedProductName`は`lotteries.normalizerVersion`が示す通り正規化ロジックが将来変わりうる値であり、商品の永続的な識別子ではない。正規化ロジック変更で同一商品の`normalizedProductName`が変化すると、既存のフォローが静かに無効化される（エラーにならず単に一致しなくなる）。恒久対応にはバックエンド側に安定した`products`テーブル（正規化名の変更履歴を持つ）を持つ必要があるが、これは`x-post-fetcher`側の設計変更でありMobile-G1のスコープ外。**現時点では「productKey文字列一致」で妥協し、正規化ロジック変更時は移行スクリプトで`followed_products.productKey`を一括更新する運用でカバーする**方針を提案する。

### 4.9 `checklist_progress`（現行`checklistStore`の`groups: Record<lotteryId, ChecklistStep[]>`を正規化）

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userId | integer FK→users.id | not null |
| lotteryId | integer FK→lotteries.id | not null |
| stepId | text | not null（`default-0`等の固定ID、または`custom-<timestamp>`） |
| label | text | not null |
| done | integer(boolean) | not null default 0 |
| completedAt | text | nullable |
| completedNote | text | nullable |
| sortOrder | integer | not null default 0 |
| createdAt | text | not null default CURRENT_TIMESTAMP |
| updatedAt | text | not null default CURRENT_TIMESTAMP |
| deletedAt | text | nullable（カスタムステップの削除用。デフォルトステップは削除不可想定） |

- 一意制約: `unique(userId, lotteryId, stepId)`
- インデックス: `(userId, lotteryId)`
- JSON列は使わない（行単位にした方が「端末Aと端末Bで同じ項目を別々に更新」の競合解決がシンプルになる。7章参照）

### 4.10 `notification_preferences`

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userId | integer FK→users.id | not null, unique（1ユーザー1行） |
| deadlineReminder | integer(boolean) | not null default 1 |
| announcementReminder | integer(boolean) | not null default 1 |
| purchaseReminder | integer(boolean) | not null default 1 |
| newLotteryAlert | integer(boolean) | not null default 0 |
| favoriteUpdateAlert | integer(boolean) | not null default 0 |
| pushEnabled | integer(boolean) | not null default 1 |
| emailEnabled | integer(boolean) | not null default 0 |
| quietHoursEnabled | integer(boolean) | not null default 0 |
| quietHoursStart | text | nullable |
| quietHoursEnd | text | nullable |
| deadlineReminderHoursBefore | integer | not null default 24 |
| announcementReminderHoursBefore | integer | not null default 24 |
| purchaseReminderHoursBefore | integer | not null default 24 |
| updatedAt | text | not null default CURRENT_TIMESTAMP |

- `NotificationToggleSettings`（`types/models.ts`）とほぼ1:1対応。JSON列にせず列展開する理由: サーバー側で個別項目のバリデーション・将来のPush送信判定クエリを書きやすくするため。

### 4.11 `subscriptions`

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userId | integer FK→users.id | not null |
| revenuecatAppUserId | text | not null（= `userId`を文字列化した値を第一候補、9章参照） |
| entitlementName | text | not null（`'premium'`） |
| productId | text | not null（`cardhub_premium_monthly` / `cardhub_premium_lifetime`） |
| purchaseType | text | not null（`'subscription'` / `'lifetime'`） |
| store | text | not null（`'app_store'`、将来`'play_store'`） |
| status | text | not null（`'active'`/`'expired'`/`'grace_period'`/`'billing_issue'`/`'revoked'`/`'refunded'`） |
| expiresAt | text | nullable（lifetimeは`null`固定） |
| purchasedAt | text | not null |
| originalTransactionId | text | not null |
| environment | text | not null（`'sandbox'`/`'production'`） |
| lastVerifiedAt | text | not null |
| createdAt | text | not null default CURRENT_TIMESTAMP |
| updatedAt | text | not null default CURRENT_TIMESTAMP |

- 一意制約: `unique(originalTransactionId, environment)`
- インデックス: `userId`, `revenuecatAppUserId`
- 1ユーザーが月額→買い切りへ変更等で複数行持つ可能性あり（履歴として全件保持、現在有効な権限は`subscription_entitlements`が正）

### 4.12 `subscription_entitlements`（premium判定の正 — サーバー側で参照する唯一のテーブル）

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userId | integer FK→users.id | not null, unique（1ユーザー1行、常に最新状態へupsert） |
| premiumActive | integer(boolean) | not null default 0 |
| source | text | nullable（`'monthly'`/`'lifetime'`、どちらの購入由来か） |
| expiresAt | text | nullable（lifetimeは`null`） |
| isLifetime | integer(boolean) | not null default 0 |
| gracePeriod | integer(boolean) | not null default 0 |
| billingIssue | integer(boolean) | not null default 0 |
| revoked | integer(boolean) | not null default 0 |
| refunded | integer(boolean) | not null default 0 |
| lastEventAt | text | nullable |
| updatedAt | text | not null default CURRENT_TIMESTAMP |

- premium API保護は必ずこのテーブルを参照する（RevenueCat SDKの結果をクライアントから信じない）

### 4.13 `revenuecat_events`（Webhookの冪等性・監査用）

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| eventId | text | not null, unique（RevenueCatの`event.id`、重複排除の主キー） |
| eventType | text | not null |
| appUserId | text | not null |
| environment | text | not null（`'sandbox'`/`'production'`） |
| rawPayload | text (JSON) | not null（原文保持、将来のバグ調査・再処理用） |
| processedAt | text | nullable |
| processingError | text | nullable |
| createdAt | text | not null default CURRENT_TIMESTAMP |

- 一意制約: `unique(eventId)` — 同一イベント再送時はここでスキップ（冪等性の要）

### 4.14 `account_deletion_requests`

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userId | integer FK→users.id | not null |
| requestedAt | text | not null default CURRENT_TIMESTAMP |
| scheduledDeletionAt | text | not null（猶予期間後の実行予定日） |
| status | text | not null（`'pending'`/`'completed'`/`'cancelled'`） |
| cancelledAt | text | nullable |
| completedAt | text | nullable |
| reason | text | nullable（任意アンケート） |

### 4.15 `audit_logs`

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userId | integer FK→users.id | nullable（ユーザー起点でない内部処理もあるため） |
| action | text | not null（`'login'`/`'logout'`/`'logout_all'`/`'account_deletion_requested'`/`'premium_granted'`/`'premium_revoked'`等） |
| detailJson | text (JSON) | nullable |
| ipHash | text | nullable（生IPは保持せずハッシュ化） |
| requestId | text | nullable |
| createdAt | text | not null default CURRENT_TIMESTAMP |

- 物理削除しない。保持期間は15章参照。

---

## 5. API設計

共通ルール（全premium/認証必須APIに適用、個別表には差分のみ記載）:
- **認証ヘッダー**: `Authorization: Bearer <AccessToken>`
- **エラー形式**:
```json
{
  "error": {
    "code": "PREMIUM_REQUIRED",
    "message": "この機能にはプレミアムプランが必要です",
    "requestId": "..."
  }
}
```
主なcode: `UNAUTHORIZED` / `TOKEN_EXPIRED` / `PREMIUM_REQUIRED` / `NOT_FOUND` / `FORBIDDEN`（他ユーザーのリソース）/ `VALIDATION_ERROR` / `CONFLICT`（楽観ロック不一致）/ `RATE_LIMITED`
- **所有者チェック**: 全`/me/*`系は`WHERE userId = <認証済みuserId>`を必ず条件に含める（IDORを構造的に防止、14章）
- **楽観的ロック**: `user_lotteries` / `checklist_progress`は`updatedAt`（またはPUT時に送る`syncVersion`）が一致しない場合`409 CONFLICT`
- **オフライン重複排除**: 端末側で生成した`clientRequestId`をPUT系リクエストに付与し、サーバー側で同一`clientRequestId`の再送は前回結果をそのまま返す（べき等）

### 5.1 認証

| API | 認証 | premium | リクエスト | レスポンス | 冪等性 | レート制限 |
|---|---|---|---|---|---|---|
| `POST /auth/apple` | 不要 | - | `{identityToken, authorizationCode?, deviceId, deviceName?}` | `{accessToken, refreshToken, expiresIn, user: {...}}` | 同一identityTokenの再送は同一ユーザーを返す | IP単位 10req/min |
| `POST /auth/magic-link/request` | 不要 | - | 将来Android対応時まで**未実装**（G1では設計のみ） | - | - | - |
| `POST /auth/magic-link/verify` | 不要 | - | 同上 | - | - | - |
| `POST /auth/refresh` | Refresh Token（Bearer） | - | `{refreshToken, deviceId}` | `{accessToken, refreshToken(new), expiresIn}` | 再利用検知対象（6章） | deviceId単位 30req/min |
| `POST /auth/logout` | 必須 | - | `{deviceId}` | `{ok:true}` | 冪等（既失効でも200） | - |
| `POST /auth/logout-all` | 必須 | - | `{}` | `{ok:true, revokedCount}` | 冪等 | - |
| `GET /me` | 必須 | - | - | `{id, displayName, email, accountStatus, premium:{...}}` | - | - |
| `PATCH /me` | 必須 | - | `{displayName?}` | `{...}` | - | - |
| `DELETE /me` | 必須 | - | `{}` | `{ok:true, scheduledDeletionAt}` | 冪等（既にpending中なら現在値を返す） | - |

Zodスキーマ案（例、`POST /auth/apple`）:
```ts
const authAppleRequestSchema = z.object({
  identityToken: z.string(),
  authorizationCode: z.string().optional(),
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
});
```

### 5.2 自分の抽選

| API | 認証 | premium | 備考 |
|---|---|---|---|
| `GET /me/lotteries` | 必須 | - | ページネーション（`limit`/`offset`、既存`/lotteries`と統一） |
| `PUT /me/lotteries/:lotteryId` | 必須 | - | 新規保存 or 更新（status含む）。`{status, clientRequestId, updatedAt?}` |
| `PATCH /me/lotteries/:lotteryId` | 必須 | - | statusのみ部分更新。楽観ロック対象 |
| `DELETE /me/lotteries/:lotteryId` | 必須 | - | 論理削除（`deletedAt`セット） |
| `POST /me/lotteries/sync` | 必須 | - | 初回ログイン時の一括マージ専用（7章の移行シナリオ用）。`{items: [{lotteryId, status, savedAt}], deviceId}` → `{merged, skippedDuplicates, conflicts}` |

### 5.3 お気に入り・フォロー

| API | 認証 | premium |
|---|---|---|
| `GET /me/favorites` | 必須 | - |
| `PUT /me/favorites/:lotteryId` | 必須 | - |
| `DELETE /me/favorites/:lotteryId` | 必須 | - |
| `GET /me/followed-products` | 必須 | - |
| `PUT /me/followed-products/:productKey` | 必須 | - |
| `DELETE /me/followed-products/:productKey` | 必須 | - |

`:productKey`はURLエンコードされた`normalizedProductName`をそのまま使う（4.8節のリスク注記を参照）。

### 5.4 チェックリスト

| API | 認証 | premium |
|---|---|---|
| `GET /me/checklists/:lotteryId` | 必須 | - |
| `PUT /me/checklists/:lotteryId` | 必須 | - `{steps: [{stepId, label, done, completedAt?}], clientRequestId}` 全体置換ではなく行単位upsert |
| `DELETE /me/checklists/:lotteryId` | 必須 | - カスタムステップのみ削除可、デフォルトステップは`done=false`へリセット |

### 5.5 通知設定・デバイス

| API | 認証 | premium |
|---|---|---|
| `GET /me/notification-preferences` | 必須 | - |
| `PUT /me/notification-preferences` | 必須 | - |
| `POST /me/devices` | 必須 | - push token登録（将来のリモートPush用に先行実装可） |
| `DELETE /me/devices/:deviceId` | 必須 | - |

### 5.6 課金

| API | 認証 | premium | 備考 |
|---|---|---|---|
| `GET /me/subscription` | 必須 | - | 現在の`subscriptions`最新行を返す |
| `POST /billing/revenuecat/webhook` | RevenueCat専用認証（12章） | - | ユーザー認証ではなくWebhook署名検証 |
| `POST /me/subscription/refresh` | 必須 | - | Webhook未到達時にRevenueCat REST APIへ再照会するフォールバック |
| `GET /me/entitlements` | 必須 | - | `{premium: {active, source, expiresAt, isLifetime}}` |

### 5.7 統計（全てpremium必須）

| API | 認証 | premium |
|---|---|---|
| `GET /me/statistics/summary` | 必須 | **必須** |
| `GET /me/statistics/monthly` | 必須 | **必須** |
| `GET /me/statistics/stores` | 必須 | **必須** |
| `GET /me/statistics/categories` | 必須 | **必須** |
| `GET /me/statistics/activity` | 必須 | **必須** |

premium未加入時は`403 { error: { code: "PREMIUM_REQUIRED" } }`（一覧のプレビュー用に「件数のみ返す軽量版」を用意するかは11章のユーザー判断事項）。

---

## 6. セッション・トークン設計

| 項目 | 方針 |
|---|---|
| Access Token形式 | JWT（署名: HS256、鍵はCloudflare Secrets管理。将来的な鍵ローテーションを見据えるならRS256/EdDSA+JWKS配布も選択肢だが、単一Worker運用のためHS256で十分） |
| Access Token有効期限 | 15分（短命。漏洩時の被害を最小化） |
| Refresh Token形式 | 暗号論的乱数（32byte以上）。DBには**SHA-256ハッシュのみ**保存（生値は保存しない） |
| Refresh Token有効期限 | 60日（スライディング、使用の都度延長） |
| ローテーション | Refresh利用ごとに新トークンを発行し旧トークンを`revokedAt`+`revokedReason='rotated'`、`rotatedFromId`で連鎖を記録 |
| 再利用検知 | 既に`revoked`な旧Refresh Tokenが再送された場合、**そのuserIdの全Refresh Tokenを即時失効**（盗難の兆候として扱う）+ `audit_logs`記録 |
| セッション失効 | `refresh_tokens.revokedAt`をセットするのみ（Access Tokenは自己失効性がないため、最大15分は有効期限切れまで通る点を許容） |
| ログアウト | 該当`deviceId`の`refresh_tokens`を`revokedReason='logout'`で失効 |
| 全端末ログアウト | `userId`の全`refresh_tokens`を`revokedReason='logout_all'`で失効 |
| 複数端末管理 | `refresh_tokens`の`deviceId`/`deviceName`/`lastUsedAt`一覧を`GET /me/devices`（将来UI: 「ログイン中の端末」画面、G1では設計のみ） |
| 盗難端末の無効化 | 特定`deviceId`のみ`DELETE /me/devices/:deviceId`で個別失効 |
| JWTかランダムセッションIDか | Access=JWT（検証コストを抑えDB往復不要）、Refresh=ランダム文字列+DB照合（失効・ローテーションを確実に制御するため） |
| Worker側検証方法 | `jose`ライブラリでHS256署名検証+`exp`確認。Honoミドルウェアとして実装（既存`publicApiCors()`と同じ「ミドルウェアを`app.use`で差し込む」パターン踏襲） |
| 鍵管理 | Cloudflare Secrets（`wrangler secret put JWT_SIGNING_SECRET`）。`.env`や`app.json`等モバイル側には一切含めない |
| CSRF | ネイティブアプリ+Bearerトークン方式のためCookieを使わず、CSRF対策は原則不要（Webは対象外のため考慮しない） |
| リプレイ攻撃対策 | Access Tokenは短命化で緩和。Refreshはワンタイム性（ローテーション）で対応 |
| deviceIdの扱い | モバイル側で`expo-application`等から取得可能な安定IDが無い場合、初回起動時にクライアント生成したUUIDを`expo-secure-store`へ保存し使い回す |
| requestId付与 | 全レスポンスにUUIDの`requestId`を付与しログと突合可能にする |
| 監査ログ | login/logout/logout_all/reuse_detected/account_deletion等を`audit_logs`へ記録 |

### モバイル側の保存方針

| データ | 保存先 | 理由 |
|---|---|---|
| Access Token | `expo-secure-store`（またはメモリ+アプリ復帰時に再Refresh） | 短命だが漏洩リスクを避けるためKeychain/Keystore |
| Refresh Token | `expo-secure-store`のみ | 長期間有効な最重要シークレット。AsyncStorageは平文でありNG |
| deviceId | `expo-secure-store` | 端末識別の安定性のため |
| userId・displayName・premiumキャッシュ等の非秘匿情報 | AsyncStorage可 | UI表示用の非機密キャッシュ |
| RevenueCat Secret API Key / OAuthクライアントシークレット | **モバイルに置かない** | サーバーのみ保持 |
| アプリ再インストール時 | iOSの`expo-secure-store`（Keychain）はアプリ削除後も**残存する場合がある**ため、`kSecAttrAccessible`設定で「端末再設定時に消える」挙動にするか、再インストール後の初回起動でRefresh失敗（401）時は静かに未ログイン状態へフォールバックする設計にする |
| 生体認証必須化 | G1では必須にしない（Nice to have、将来`LocalAuthentication`と組み合わせて「アプリ起動時にFace ID」等をオプション提供する余地を残す） |
| SecureStore読み取り失敗時 | 例外を握りつぶさず未ログイン扱いにフォールバック（クラッシュさせない） |

---

## 7. ローカルデータからサーバー同期への移行

### 7.1 現状の実装（確認済み）

| ストア | AsyncStorageキー | データ形状 |
|---|---|---|
| `myLotteriesStore` | `cardhub-my-lotteries-v2` | `SavedLottery[] = {record: LotteryRecord, savedAt}[]`（statusは持っていない＝新規追加項目） |
| `checklistStore` | `cardhub-checklist` | `groups: Record<lotteryId, ChecklistStep[]>` |
| `favoritesStore` | `cardhub-favorites` | `favoriteLotteryIds: string[]`, `followedProductKeys: string[]` |
| `notificationSettingsStore` | `cardhub-notification-settings` | フラットな`NotificationToggleSettings` |
| `calendarEventStore` | `cardhub-calendar-events` | `registeredKeys: string[]`（実際のOSカレンダーイベントIDは保持していない、重複登録防止フラグのみ） |
| 通知ID | 未保存 | `identifierFor(lotteryId, kind)`で決定的に算出（`cardhub-{lotteryId}-{kind}`）。再スケジュール可能なため移行不要 |

**重要な発見**: `myLotteriesStore`には現在「応募予定/当選/落選」等のユーザー入力ステータスが存在しない（`SavedLottery`は`record`のスナップショットと`savedAt`のみ）。10章の状態遷移モデルは**新規追加機能**であり、既存データからの変換は「全件`status='unknown'`として移行」する。カレンダーイベントIDも同様に保存されていないため、サーバー同期対象は「登録済みフラグ」のみで、OS側の実イベントとの照合は行わない（既存実装と同じ制約を維持）。

### 7.2 移行方針（要件を満たす設計）

- 未ログイン中もローカル利用可能 → 現行Zustand+AsyncStorageの挙動は維持。認証状態は別ストア（`authStore`、`expo-secure-store`ベース）で管理し、既存4ストアとは独立させる。
- 初回ログイン成功時、以下の順で実行:
  1. `POST /auth/apple`成功→`accessToken`/`refreshToken`取得
  2. ローカル4ストア（my-lotteries / favorites / checklist / notification-settings）の内容を読み出し
  3. `POST /me/lotteries/sync`等の一括マージAPIへ送信（`clientRequestId`にデバイスUUID+タイムスタンプを付与し冪等性確保）
  4. サーバーからマージ結果（正規化後の全件）を受け取り、ローカルストアをサーバー結果で上書き（以後はサーバーが正）
  5. 通知・カレンダーはサーバー同期後のデータで`rescheduleAllApiReminders`相当を再実行

### 7.3 マージルール

- **同一`lotteryId`の重複**: サーバー側`unique(userId, lotteryId)`（部分一意）で自然に統合。ローカルに既存があれば「ローカルの`savedAt`は保持、`status`は下記競合規則」
- **チェックリスト進捗の統合**: `stepId`単位でマージ。`done=true`が一方にでもあれば`true`を優先（進捗を後退させない）。`completedAt`はより古い方を採用（実際に完了した時刻に近いため）
- **通知設定の競合**: 項目単位マージ。ブール値は「より制限が少ない方（true）」を優先しない——通知は「ユーザーが最後に触った設定」を尊重すべきなので、**`updatedAt`が新しい方を優先**する（`notification_preferences`は1ユーザー1行のためサーバー側にまだ無ければローカル値をそのまま初期値として送る）
- 一般則: 個別データ（favorites, followed_products, user_lotteries）は**追加のみのマージ**（片方にあれば採用、両方にあれば新しい`updatedAt`を優先）。チェックリストのみ「後退させない」特別ルール。

### 7.4 具体シナリオ

| シナリオ | 挙動 |
|---|---|
| 未ログインで3件保存後に初ログイン | `sync` APIへ3件送信→サーバーに無ければ全件新規作成、`status='unknown'`、`savedAt`はローカル値を保持 |
| すでにサーバーに同じ抽選が存在 | `unique(userId,lotteryId)`違反を検知し、サーバー側`updatedAt`が新しければサーバー優先、ローカルが新しければステータスのみ更新（`user_lottery_status_history`に記録） |
| 端末Aと端末Bで同じチェック項目を別々に更新 | `stepId`単位で`done=true`優先ルールを適用。`completedAt`は古い方。矛盾があってもエラーにせず自動マージ（ユーザーへの確認UIは出さない、CardHub規模では過剰） |
| ログアウト後に別アカウントでログイン | ログアウト時にローカル4ストアを**クリア**（AsyncStorageキー削除）してから未ログイン状態に戻す。別アカウントログイン後は再度サーバーから取得して初期化（別ユーザーのデータ混在を構造的に防止） |
| アカウント削除後に端末ローカルデータが残っている | アカウント削除確定後はログアウトと同じくローカル4ストアをクリア。再インストールや別アカウント作成時にサーバー参照するデータは当然存在しない |
| API同期中にアプリを終了 | `sync`は単一リクエストで完結させる設計とし、部分適用状態を残さない（サーバー側はトランザクション内で一括処理）。次回起動時に再度未同期ローカルデータがあれば再送（`clientRequestId`で冪等） |
| RevenueCat匿名ユーザーからログインユーザーへ移行 | 8章「App User ID」節参照。`Purchases.logIn(userId)`をログイン成功直後に呼び出す |

- `syncVersion`/`migrationVersion`: `user_lotteries.syncVersion`として実装済み（4.5節）。将来のマージロジック変更時に「このバージョン以降のクライアントのみ新マージ規則を使う」判定に利用可能。
- オフライン時: APIエラーはすべて`ApiClientError`（既存パターン踏襲、`kind: 'network'`等）でキャッチし、ローカルストアのデータはそのまま表示継続（アプリをクラッシュさせない）。

---

## 8. RevenueCat課金設計

### 8.1 構成案

| 項目 | 値（候補、未確定） |
|---|---|
| Entitlement | `premium` |
| Offering | `default` |
| Packages | `monthly`, `lifetime` |
| Product ID | `cardhub_premium_monthly`, `cardhub_premium_lifetime`（命名規則: `<app>_<tier>_<period>`、Android対応時は`play_`接頭辞等ストア別に分けるかは要検討） |

### 8.2 月額プラン
- 自動更新月額。無料トライアル・初回割引の有無は18章の要判断事項（未確定のまま進める）
- 解約後は現在の課金期間終了まで利用可能（`expiresAt`まで`status='active'`のまま、Apple側の解約フラグは`RENEWAL`が来なくなることで検知）
- billing retry / grace period / billing issue: RevenueCatが検知しWebhookで通知→`subscriptions.status`と`subscription_entitlements.gracePeriod`/`billingIssue`へ反映
- 返金・revoke: `REFUND`イベントで`subscription_entitlements.premiumActive=false`, `refunded=true`
- store account変更・再インストール・別端末復元: `Purchases.restorePurchases()`で対応（RevenueCatがApple IDに紐づく購入を復元）

### 8.3 買い切りプラン
- App Store上は非消費型(Non-Consumable)購入として登録（RevenueCat側は`lifetime`パッケージとして`premium` entitlementに恒久的に紐づけ、`expiresAt=null`）
- 返金/Apple側取消時: `REFUND`/`revoke`相当のWebhookで`revoked=true`または`refunded=true`へ更新
- 同一Apple IDでの再インストール復元: `restorePurchases()`で対応
- **複数CardHubアカウントへ同一Apple購入を重複付与しない方針**: RevenueCatの`Purchases.logIn`は「匿名→ログイン」の紐付けを行うが、「同じApple ID購入済み端末で別のCardHubアカウントにログイン」した場合の挙動はRevenueCatの**Transfer Behavior設定**に依存する。第一候補は「購入は最初にログインしたアカウントに紐づいたままにし、他アカウントへは移譲しない（`Transfer Behavior: Current Owner`相当）」——1つのApple購入が複数アカウントのpremiumを解放し続ける事態を防ぐため。
- 永久ライセンスでも**サーバー側で最新状態を再検証する**（`lastVerifiedAt`更新、`revoked`/`refunded`の検知のため定期的なRevenueCat REST API再照会をNice to haveとして計画、G1では設計のみ）

### 8.4 有料権限判定

**モバイル側**:
- RevenueCatの`CustomerInfo.entitlements.active['premium']`を参照するが、**UI表示専用**。実際のAPI許可判定には使わない
- オフライン時は直近のCustomerInfoキャッシュ（RevenueCat SDKが自動キャッシュ）をUI表示に使い、「オフラインのため最新状態と異なる場合があります」等の注記を出す
- 実際のpremium API呼び出しは常にサーバーが`403 PREMIUM_REQUIRED`で最終判定するため、モバイル側のUIロック解除状態をZustandへ永続化しない（毎回`CustomerInfo`から再評価）

**サーバー側**:
- Webhookで`subscription_entitlements`を更新するのが正
- Webhook遅延・欠落時のフォールバック: `POST /me/subscription/refresh`でRevenueCat REST API（`GET /subscribers/{app_user_id}`）へ再照会
- Webhook署名検証: RevenueCatが送る`Authorization`ヘッダ（設定した共有シークレット）をCloudflare Secretsで検証（12章）
- 重複イベント冪等処理: `revenuecat_events.eventId`のunique制約で二重処理を防止
- Sandbox/Production区別: `environment`列で分離、Sandbox購入がProductionのentitlementに影響しないようクエリ条件に必ず含める
- RevenueCat障害時: Webhookが来ない間は`lastVerifiedAt`が古いまま→一定期間（例: 24時間）経過で`refresh`を促すUIを検討（Nice to have）

### 8.5 RevenueCat App User ID
- 認証`userId`（サーバー内部ID、整数を文字列化したもの）を**RevenueCat App User IDとして採用**する第一候補
- 未ログイン時: RevenueCat SDKが自動生成する匿名ID（`$RCAnonymousID:...`）をそのまま使う（未ログインでも購入自体は試せる設計にするかは18章の要判断事項——本設計では「購入はログイン必須」を推奨。統計がpremium機能でありサーバー同期前提のため、未ログイン購入を許すと後のアカウント紐付けが複雑化するのを避けるため）
- ログイン成功時: `Purchases.logIn(userId)`を呼び出し、匿名購入があれば自動的にログインユーザーへ統合（RevenueCat標準機能）
- ログアウト時: `Purchases.logOut()`
- アカウント削除時: RevenueCat側の顧客情報は基本削除しない（購入履歴の正当性証跡として保持、Apple/RevenueCat側のプライバシー要件次第でRevenueCat Customer削除APIの利用を検討、Nice to have）

### 8.6 購入画面（状態一覧）
- プレミアム紹介 / 月額プラン / 買い切りプラン / 購入ボタン / 購入復元 / 利用規約 / プライバシーポリシー / 自動更新の説明 / 買い切りの説明 / 現在のプラン表示 / 月額契約者向け管理導線（App Store設定画面への誘導） / 購入処理中 / 購入成功 / 購入キャンセル / 購入失敗 / 既に購入済み / オフライン / RevenueCat設定未完了(開発時エラー) / entitlement反映待ち（Webhook遅延中の一時表示）
- **価格は`Purchases.getOfferings()`から取得した`localizedPriceString`を表示**し、アプリ内に固定価格文字列をハードコードしない

### 8.7 実装候補（Expo SDK 54）
- SDK: `react-native-purchases`（公式Expo config plugin対応）
- config plugin必要: あり（`app.json`の`plugins`に追加）
- Development Build必須: あり（Expo Goでは動作しない）
- Expo Goで確認できない範囲: 購入フロー全般、StoreKitとの実連携
- StoreKit Configuration File: ローカル開発時のシミュレータテストに利用可（Xcode）。実機Sandboxテストと併用
- TestFlightテスト: G7フェーズで実施予定
- EAS Buildとの統合: Development/Preview/Productionプロファイルそれぞれで公開APIキーを環境変数分離
- API Key管理: `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`（**Public SDK Key**のみ）。**Secret API KeyはWorker側のみに保持し、モバイルには絶対含めない**

---

## 9. 無料・有料機能の境界

### 無料
- 抽選一覧 / 抽選詳細 / 商品統合ビュー / 自分の抽選保存 / 基本チェックリスト / OSカレンダー登録 / 基本ローカル通知 / 商品フォロー / 最低限のプロフィール / アカウント同期（複数端末での基本データ同期自体は無料——同期を有料の差別化要因にすると「アカウントを作るメリット」が下がり離脱を招くため）

### premium
- 統計・分析全般（月別推移・店舗別実績・カテゴリ別実績） / 高度な締切管理（複数条件のリマインダーカスタマイズ等） / 高度な通知設定（詳細な時間指定等、基本のON/OFFは無料） / データ履歴の長期保持・可視化 / 将来のデータエクスポート / 将来の高度なフィルター

### 将来premiumへ移す候補
- 現時点で無料としている「高度な通知設定」の一部を将来切り出す可能性あり（初回は無料範囲を広めに取り、後から段階的に有料化する方が既存ユーザー体験を壊さない）

### 無料ユーザーが価値を感じられる最低ライン
- 抽選情報の網羅性・自分の抽選管理・チェックリスト・通知・カレンダー連携という「日常的に使う実用機能」はすべて無料に残し、premiumは「振り返り・分析」という上位ニーズに限定する。これはApp Store審査上も「基本機能を人質にした不自然なロック」に該当しないための線引き。

### 月額と買い切りの機能差
- **第一候補: 機能差を付けず、同一`premium` entitlementで完全に同等の機能を提供**（1章の確定事項通り）。理由: 機能差を付けると「どちらを選ぶべきか」の意思決定コストが上がり、買い切りの魅力（複雑な判断なしに一度払えば終わり）を損なう。

---

## 10. 統計機能のデータモデル

### 10.1 ステータス定義

| ステータス | 表示名 | 意味 | 統計への反映 |
|---|---|---|---|
| `unknown` | 未設定 | ユーザーがまだ状態を入力していない（移行データの初期値含む） | 「結果未入力数」に計上、当選率の分母から除外 |
| `planned` | 応募予定 | 応募するつもりで保存した | 「応募予定数」に計上 |
| `applied` | 応募済み | 応募を完了した | 当選率の分母に含む |
| `won` | 当選 | 当選が確定した | 当選率の分子、購入関連統計の対象 |
| `lost` | 落選 | 落選が確定した | 当選率の分母のみ |
| `purchased` | 購入済み | 当選後、購入まで完了した | 「購入完了数」に計上 |
| `skipped` | 見送り | 当選したが購入しなかった、または応募自体を見送った | 「購入見送り数」に計上（`won`経由）／応募自体の見送りとしても許容 |

### 10.2 状態遷移

```
unknown ──┬─→ planned ──┬─→ applied ──┬─→ won ──┬─→ purchased
          │             │             │         └─→ skipped
          │             └─→ skipped   └─→ lost
          ├─→ applied
          ├─→ won
          └─→ lost
```

- `unknown`からは任意の状態へ直接遷移可（過去分をまとめて記録するケースを許容）
- `won → purchased` / `won → skipped`のみ許可（`won`から`lost`への遷移は不正——「取り消し」は`元に戻せるか`の節で扱う）
- **元に戻せるか**: 直前の状態へは戻せる（`user_lottery_status_history`から1つ前の`toStatus`を復元するUIをNice to haveとして提案）。ただし`purchased → won`のような「購入したことにした後に取り消す」操作は誤操作対策のため確認ダイアログを必須にする
- **不正な状態遷移の扱い**: サーバー側APIでホワイトリスト方式の遷移テーブルを持ち、許可されない遷移は`400 VALIDATION_ERROR`で拒否。UIレベルでも選択肢自体を許可された遷移のみに絞り、ユーザーが不正操作を試みる余地自体を減らす
- **締切前後・当選発表前後の扱い**: 締切通過後も`planned`のまま放置されている場合、`system_auto_expire`として`lost`または`unknown`のままにするかは要判断（統計の「応募忘れ件数」を出すには「締切通過時に`planned`のままだったもの」を検出する必要があり、自動遷移させると本来の応募有無が分からなくなる。**自動では状態を書き換えず、締切通過×`planned`のまま、を「応募忘れ」として別途カウントする**方針を推奨）

### 10.3 統計項目（元データ・集計式・注意点）

| 統計 | 元データ | 集計式 | unknownの扱い | 分母0件 | 計算主体 |
|---|---|---|---|---|---|
| 保存した抽選数 | `user_lotteries`（`deletedAt IS NULL`） | `COUNT(*)` | 含む | 0を表示 | サーバー |
| 応募予定数 | 同上 `status='planned'` | `COUNT(*)` | - | 0 | サーバー |
| 応募済み数 | `status IN ('applied','won','lost','purchased','skipped')` | `COUNT(*)` | - | 0 | サーバー |
| 未応募数 | `status IN ('unknown','planned')` | `COUNT(*)` | 含む | 0 | サーバー |
| 当選数 | `status IN ('won','purchased','skipped')`（wonを経由した全て） | `COUNT(*)` | - | 0 | サーバー |
| 落選数 | `status='lost'` | `COUNT(*)` | - | 0 | サーバー |
| 結果未入力数 | `status IN ('unknown','planned','applied')` | `COUNT(*)` | 含む | 0 | サーバー |
| 当選率 | 当選数 / (当選数+落選数) | 分母=応募済みで結果が出たもののみ | 分母から除外 | **分母0件は「計算不可（データ不足）」と表示、0%と表示しない** | サーバー |
| 購入完了数 | `status='purchased'` | `COUNT(*)` | - | 0 | サーバー |
| 購入見送り数 | `status='skipped'`（wonから遷移したもの、`user_lottery_status_history`で`fromStatus='won'`を確認） | `COUNT(*)` | - | 0 | サーバー |
| 月別応募数/当選数 | `user_lottery_status_history`を`changedAt`の月でGROUP BY | `COUNT(*)` | - | 0 | サーバー |
| 店舗別応募数/当選率 | `user_lotteries JOIN lotteries`の`normalizedStoreName` | 同上 | 店舗名null→「店舗情報なし」でグルーピング | 0 | サーバー |
| カテゴリ別実績 | `lotteries.cardType` | 同上 | null→「不明」でグルーピング | 0 | サーバー |
| 締切前に対応できた割合 | `user_lottery_status_history`で締切前に`applied`へ遷移したか | 分子/分母=`planned`だったもの | - | 計算不可表示 | サーバー |
| 応募忘れ件数 | 締切通過時点で`status='planned'`のまま | `COUNT(*)`（バッチ判定 or クエリ時にオンザフライ判定） | - | 0 | サーバー |
| 購入期限対応率 | `won`後、`purchaseDeadlineAt`までに`purchased`へ遷移したか | 分子/分母=`won`だったもの | - | 計算不可表示 | サーバー |
| 連続記録日数 | `user_lottery_status_history.changedAt`の日次存在有無 | 連続日数カウント | - | 0 | サーバー |
| 累計利用期間 | `users.createdAt`から現在まで | 日数差 | - | - | サーバー |

- **タイムゾーン**: サーバーは常にUTC（`CURRENT_TIMESTAMP`はUTC）で保存し、月別集計等の「月」境界判定は**JST（Asia/Tokyo）に変換してから**月次バケットに入れる（ユーザーは日本在住前提のため）
- **重複抽選の扱い**: `unique(userId, lotteryId)`で構造的に重複不可
- **削除済みデータの扱い**: `deletedAt IS NOT NULL`の行は現在の一覧には出さないが、統計の「過去実績」には含める（過去に応募して落選した記録を「自分の抽選」から消しても、当選率の分母からは消えない方が実態に即する）——ただし18章で最終確認が必要な論点
- **キャッシュ方法**: サーバー計算結果を短時間（例: 5分)Cloudflare Cache APIまたはKVでキャッシュし、`user_lotteries`更新時に該当userIdのキャッシュを無効化
- **原則**: premium統計はサーバー側集計を第一候補とし、モバイル側だけで改ざん可能な集計は行わない。課金状態（`subscription_entitlements`）を確認してから返す。架空のサンプル数値を実績のように表示しない（無料ユーザーへのプレビューでも同様、11章）。

### 10.4 当選率の最終定義（Mobile-G6実装確定、2026-08-03）

上表の「当選数 = `status IN ('won','purchased','skipped')`」は、`skipped`が`won`経由（購入見送り）と`planned`経由（応募見送り）の2経路を持つ実際の状態遷移ホワイトリスト（`services/lotteryStatusTransitions.ts`）と矛盾するため、実装時に以下へ確定した（`repositories/statisticsRepository.ts`）。

- **分子**: `wonCount = COUNT(status='won') + COUNT(status='purchased')`。`purchased`は遷移ホワイトリスト上`won`からしか到達できないため、常に安全に合算できる
- **分母**: `wonCount + lostCount`（`lostCount = COUNT(status='lost')`）。**`planned`・`skipped`・`unknown`・`applied`（結果未確定のもの）は分母に含めない**——「結果が確定したものだけ」を対象にするため
- **`skipped`の扱い**: 分子・分母のどちらにも含めない。上表の「wonを経由した全て」という定義は採用しない（2経路を区別できないため）。`skippedCount`は集計レスポンス上の独立フィールドとして返すのみ（12章参照＝`docs/known-gaps.md`）
- **0除算（分母=0）**: `winRate: null`を返す（「計算不可」）。`0%`とは表示しない
- **`deletedAt`の扱い**: 18章で未確定だった論点（削除済みデータを含めるか）は、今回は`GET /me/lotteries`一覧と一貫させるため`deletedAt IS NULL`（現在保存中のもののみ）に確定した。削除済み実績を含める案は将来の再検討事項として残す

---

## 11. Premium統計画面設計

### 無料ユーザー
- 統計画面への導線は常に表示（グレーアウト等でロック状態を明示）
- 「premiumに加入すると見られる内容」を文言で説明（数値プレビューは行わない、または「あなたの実データの一部のみ」を見せるなら架空値ではなく実件数（例: 「保存した抽選 12件」まで）を無料開放し、詳細分析のみpremiumにする案も18章で検討）
- 「まだデータがありません」（保存0件）と「premium未加入」（データはあるがロック）を明確に区別する2つの空状態を用意
- 月額・買い切りの選択肢、購入復元ボタンを表示

### premiumユーザー
- 統計サマリー / 月別推移 / 店舗別実績 / カテゴリ別実績 / 期間フィルター / 空状態（データ0件、premiumだが未使用） / 集計中（サーバー計算のローディング） / APIエラー / entitlement失効（月額切れ等、購入画面へ再誘導） / オフラインキャッシュ（直近取得結果を表示しつつ「最新でない場合があります」注記）

### 状態の区別
未ログイン / ログイン済み無料 / 月額premium(有効) / 買い切りpremium(有効) / 月額失効 / grace period / billing issue / RevenueCat確認中(SDK初期化直後) / **サーバー権限との不一致**（RevenueCat SDKは有効と言うがサーバー`subscription_entitlements`が無効——Webhook遅延時に発生しうる。この場合は`POST /me/subscription/refresh`を自動で1回試行し、それでも解消しなければ「反映まで少々お待ちください」表示とサポート導線を出す）

---

## 12. RevenueCat Webhook設計

エンドポイント: `POST /webhooks/revenuecat`（既存`/lotteries`系CORS設定とは完全分離、公開CORSを適用しない）

| イベント | 月額への影響 | 買い切りへの影響 | 主な更新 |
|---|---|---|---|
| `INITIAL_PURCHASE` | `subscriptions`新規行、`status='active'` | 同左、`purchaseType='lifetime'`, `expiresAt=null` | `subscription_entitlements.premiumActive=true` |
| `RENEWAL` | `expiresAt`更新 | 対象外 | `lastVerifiedAt`更新 |
| `CANCELLATION` | 自動更新OFF、`expiresAt`まで有効 | 対象外 | `status`は`active`のまま（期限まで） |
| `UNCANCELLATION` | 解約取り消し | 対象外 | `status='active'`維持 |
| `NON_RENEWING_PURCHASE` | 非該当（買い切りがこれに該当する場合あり、RevenueCatの分類確認要） | 該当しうる | 上記`INITIAL_PURCHASE`相当 |
| `EXPIRATION` | `status='expired'`、`premiumActive=false` | 通常発生しない（lifetimeは失効しない） | - |
| `BILLING_ISSUE` | `billingIssue=true`、grace period中は`premiumActive`維持 | 対象外 | - |
| `PRODUCT_CHANGE` | 月額↔買い切りの切替 | 同左 | 新旧`subscriptions`行を整合させる |
| `TRANSFER` | 購入の別ユーザーへの移譲（8.3節のTransfer Behavior方針次第で発生させない運用を目指す） | 同左 | 発生時は監査ログに必ず残す |
| `SUBSCRIBER_ALIAS` | 匿名→ログインの統合 | 同左 | `revenuecatAppUserId`の整合確認 |
| `REFUND` | `revoked`または`refunded=true`、`premiumActive=false` | 同左 | - |

各イベント共通:
- **冪等性**: `revenuecat_events.eventId`のunique制約でスキップ
- **ユーザー不明時**: `appUserId`が`users`テーブルと一致しない場合はエラーにせず`revenuecat_events`に保存した上で`processingError`に記録（後から調査可能にする、Webhookには200を返しRevenueCat側の再送ループを防ぐ）
- **Sandbox/Production分離**: `environment`列で完全分離、Production側のentitlement判定にSandboxイベントを混在させない
- **再送時の処理**: 同上eventId冪等性で対応
- **ログ・失敗時の再処理**: `processingError`が残っている行は定期バッチ（Nice to have）で再試行

要件:
- RevenueCat専用認証（Webhookに設定する共有シークレットをCloudflare Secretsで保持し、リクエストヘッダで検証）
- 公開CORS不要（サーバー間通信のみ）、`/lotteries`のCORS設定を適用しない
- リクエストサイズ制限・Zod検証・不正payload拒否
- 200応答条件: 正常処理 or 「処理不能だが再送不要」なエラー（ユーザー不明等）は200、一時的なDB障害等は5xxを返しRevenueCat側の自動リトライに委ねる

---

## 13. Development Build / EAS移行方針（設計のみ、実行しない）

目的: Sign in with Apple本番構成 / RevenueCat SDK / StoreKit購入 / 本番Bundle Identifier / SecureStore / 将来のリモートPush / Preview Build / TestFlight

**本フェーズでは以下を一切実行しない**: `eas login` / `eas init` / `eas build` / `eas submit` / Apple Developer連携 / App Store Connect操作 / RevenueCatプロジェクト作成 / Product作成 / Entitlement作成 / Offering作成 / 本番DBマイグレーション

### 設定案（提示のみ）

`eas.json`（案）:
```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview"
    },
    "production": {
      "channel": "production",
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

- `ios.bundleIdentifier`: 正式ドメイン確定後に`app.json`で確定（README既知の課題、変更不可の制約は既存記載通り）
- `ios.buildNumber`: `autoIncrement: true`をEAS側に持たせるか手動管理かは18章の判断事項
- `extra.eas.projectId`: `eas init`実行時に払い出される値。**現時点では存在しない**（未実行のため）
- `app.config.tsへの移行要否`: 環境（development/preview/production）ごとに`EXPO_PUBLIC_API_BASE_URL`等を出し分ける必要が出るため、静的`app.json`から**`app.config.ts`への移行を推奨**（環境変数を条件分岐で切り替えられるため）
- 環境変数の分離案:

| 変数 | development | preview | production |
|---|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | localhost:8787 | ステージングWorker URL | 本番Worker URL |
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | Sandbox用Public Key | Sandbox用Public Key | Production用Public Key |

- Cloudflare Secrets: `JWT_SIGNING_SECRET`, `REVENUECAT_WEBHOOK_SECRET`, `REVENUECAT_SECRET_API_KEY`（サーバーのみ）
- EAS Environment Variables: EAS側の`EXPO_PUBLIC_*`はEAS Secretsまたは`eas.json`の`env`で管理、リポジトリにコミットしない
- Sandbox RevenueCat / Production RevenueCat: RevenueCat上で1プロジェクト内に環境分離が可能（要RevenueCat側最新仕様確認）
- StoreKitテスト: Xcodeの StoreKit Configuration File でローカル検証、実機はSandboxアカウントで検証
- TestFlightテスト: Mobile-G7で実施予定（16章）

---

## 14. セキュリティ設計

| 項目 | 方針 |
|---|---|
| 個人情報最小化 | メールアドレスは表示・通知目的以外に使わない。Apple Private Relayメールをそのまま保存し実メールへの解決を試みない |
| Access Token漏洩対策 | 短命化(15分)、Secure Store保存、ログへ出力しない |
| Refresh Tokenローテーション | 6章参照。再利用検知で即時全失効 |
| セッション失効 | 論理失効（`revokedAt`）、Access Tokenは自然失効を待つ設計と明記（完全即時失効が必要な場面は「全端末ログアウト」ボタンで能動的に対応） |
| 不正ログイン対策 | `POST /auth/apple`はIP単位レート制限、異常な連続失敗を`audit_logs`で検知可能にする |
| レート制限 | Cloudflare Workers標準のRate Limiting APIまたはKVベースのトークンバケットを想定（実装はG2で詳細化） |
| ブルートフォース対策 | パスワード自体が存在しないため対象外（SIWA単独運用の副次的メリット） |
| 監査ログ | 14.1参照 |
| RevenueCat webhook検証 | 12章、共有シークレットのヘッダ検証必須 |
| 課金状態改ざん対策 | クライアントのRevenueCat状態を信じず、サーバー`subscription_entitlements`のみを正とする（1章・8章の確定方針） |
| premium APIのサーバー保護 | 5章の全premium APIでミドルウェアにより強制 |
| IDOR対策 | 全`/me/*`クエリに`WHERE userId = <認証済みID>`を必須化（4章共通ルール） |
| 所有者チェック | 同上 |
| SQLインジェクション対策 | Drizzle ORMのプリペアドクエリを使用、生SQL文字列結合を避ける（既存`lotteryRepository.ts`と同じ流儀を踏襲） |
| 外部URL検証 | 既存の`applicationUrlHttpStatus`等URL解決ロジックには影響を与えない（本設計スコープ外） |
| エラーメッセージで内部情報を漏らさない | スタックトレース・SQLエラー文言をクライアントへ返さない、共通エラー形式に統一 |
| ログへトークンを出さない | Access/Refresh Tokenをログ出力対象から除外するロガー実装（G2で実装） |
| 削除済みユーザーのデータ保持期間 | 15章 |
| バックアップの扱い | Turso側のバックアップ機構に依存（既存運用と同一方針、追加のバックアップ設計はG1スコープ外） |
| インシデント時の全セッション失効 | `refresh_tokens`を`userId`単位、または全ユーザー一括で失効させる管理コマンドを用意（G2で実装、G1では手順のみ設計） |

---

## 15. アカウント削除・法務

- **アプリ内アカウント削除**: `DELETE /me`で開始。**即時削除ではなく猶予期間付き**（推奨14日、18章で確定要）。`account_deletion_requests`に記録し`users.accountStatus='pending_deletion'`
- **猶予期間中**: ログインは可能だが「削除予定」であることを明示し、キャンセル可能（`account_deletion_requests.status='cancelled'`）
- **猶予期間終了後の物理削除**: バッチ処理で`users`, `user_identities`, `refresh_tokens`, `user_lotteries`等を物理削除。ただし`audit_logs`と`revenuecat_events`は監査・課金証跡として保持（法務要件次第で匿名化のみに留める選択肢もあり、18章）
- **Appleログイン連携解除**: Apple側の「Sign in with Appleを使用するAppの管理」はユーザーがApple ID設定から行うものであり、CardHub側から強制解除する手段はない（アプリ側は自社`user_identities`の削除のみ担当)
- **Refresh Token失効**: 削除確定と同時に全失効
- **RevenueCat App User IDの扱い**: 課金中ユーザーの削除は「サブスクの解約はApp Store側で必要」であることをアプリ内で明確に案内する（Appleの課金契約はApple/ユーザー間のものであり、アプリ側のアカウント削除だけでは自動解約されないため）
- **買い切り購入履歴の扱い**: アカウント削除後も購入自体はApple ID側に残る。同一Apple IDで再登録した場合の復元は`restorePurchases()`で可能——ただし新しいCardHubアカウント（新`userId`）に対して同じ買い切りを再度紐づけてよいかは8.3節のTransfer Behavior方針と一致させる必要がある（要18章で最終確認）
- **再登録時の復元**: 新規アカウント作成時、同一Apple IDでの過去データ復元は行わない（アカウント削除=データ削除という原則を優先。ユーザーには削除前に明確に警告する）
- 監査ログ・RevenueCatイベント履歴の最低保持期間: 要18章確定（法務相談推奨、一般的には会計・紛争対応目的で1〜7年保持されるケースが多いが確定値ではない）
- データエクスポート要否: 現時点ではNice to have（個人情報保護法上の開示請求対応として将来検討)
- プライバシーポリシー・利用規約・サブスクリプション規約・自動更新の説明・購入復元の導線・問い合わせ窓口: いずれも**未作成**（Mobile-G8でApp Store提出資料として作成予定）
- 特定商取引法表記の要否: デジタルコンテンツ販売のため要否含め要確認（個人開発でのApp Store課金は多くの場合Appleが販売主体となるため対象外となるケースが一般的だが、断定はできないため18章で「確認先」を整理する）
- Apple標準EULAか独自利用規約か: App Store Connectのデフォルト使用許諾契約（EULA）をそのまま使うか、独自の利用規約をアプリ内リンクとして用意するかは18章で判断

---

## 16. 実装フェーズ分割

| フェーズ | 目的 | 対象repo | DB変更 | API変更 | モバイル変更 | ユーザー確認事項 | 外部操作 | ロールバック | 想定リスク |
|---|---|---|---|---|---|---|---|---|---|
| **G1**（本フェーズ） | 認証・課金・統計アーキテクチャ設計 | 両方（設計文書のみ） | なし | なし | なし | 本文書の承認 | なし | 文書破棄のみ | 設計の見落としが後工程の手戻りを生む |
| **G2** | バックエンドのユーザーDB基盤・マイグレーション・認証ミドルウェア | x-post-fetcher | `users`〜`audit_logs`全テーブル追加マイグレーション | `POST /auth/apple`, `/auth/refresh`, `/auth/logout(-all)`, `/me` (GET/PATCH) | なし（バックエンドのみ） | マイグレーション実行タイミング、JWT鍵管理方法の最終確認 | Cloudflare Secrets設定（本番シークレット投入は要承認） | マイグレーションのdown定義、または新テーブルのみのため既存テーブル無傷でdrop可能 | 中（新規テーブルのみのため既存`lotteries`系への影響は低い） |
| **G3** | モバイル認証実装 | CardHub | なし | なし（G2のAPIを利用） | `expo-apple-authentication`, `expo-secure-store`導入、ログイン/ログアウト/アカウント削除導線、Development Build移行 | Development Build移行の実施タイミング | EAS Build（development profile）の実行 | ネイティブモジュール追加のrevert（package.json/app.json差し戻し） | 中（Expo Go運用からの初のネイティブ化） |
| **G4** | ローカル→サーバー同期 | 両方 | なし（G2で作成済み） | `/me/lotteries`, `/me/favorites`, `/me/followed-products`, `/me/checklists`, `/me/notification-preferences`, `/me/lotteries/sync` | 各Zustandストアをサーバー同期対応に改修、7章のマージロジック実装 | マージルールの最終合意（7.3節） | なし | 既存ローカルストアのフォールバック維持 | 高（オフライン競合・複数端末同期はバグの温床になりやすい） |
| **G5** | RevenueCat基盤 | 両方 | `subscriptions`, `subscription_entitlements`, `revenuecat_events`（G2で作成済みなら反映確認のみ） | `POST /billing/revenuecat/webhook`, `/me/subscription`, `/me/entitlements` | `react-native-purchases`導入、購入/復元UI | Product ID確定、価格確定、RevenueCatプロジェクト作成の実施タイミング | RevenueCatプロジェクト作成、App Store Connect Product作成（要ユーザー承認） | Webhookエンドポイント無効化で新規イベント処理停止のみ（購入自体はApple側に残る） | 高（外部ストア審査・課金は差し戻しが効きにくい） |
| **G6** | 統計機能実装 | 両方 | なし（既存テーブル活用） | `/me/statistics/*` | premium統計画面、ロック画面 | 統計項目の最終選定（10章） | なし | APIの単純無効化で復旧可能 | 中 |
| **G7** | ストアテスト | CardHub | なし | なし | なし（テストのみ） | Sandboxテスターアカウント準備 | TestFlight配信、Sandbox購入試験 | なし（テストのみ） | 中（購入フロー特有の不具合はここで初めて顕在化しやすい） |
| **G8** | 法務・提出 | CardHub | なし | なし | プライバシーポリシー等のリンク組み込み | 規約文面の最終承認 | App Store審査提出 | 審査却下時は修正して再提出 | 中〜高（審査基準は変動しうる） |

想定工数はチーム規模・稼働時間に強く依存するため本文書では算出しない（18章で必要なら別途見積もる）。

---

## 17. 想定コスト

| 項目 | 金額の性質 | 内容 |
|---|---|---|
| Apple Developer Program | 固定・既知 | 年額 $99（USD）。Apple公式サイトで確認 |
| RevenueCat | 変動・要最新確認 | 無料枠あり（過去は月間収益(MTR)一定額まで無料の体系）。**正確な閾値・料率は revenuecat.com/pricing で要確認**（本設計時点の記憶に基づく数字を断定しない） |
| 認証基盤 | 自作のため¥0 | 本設計では自前実装（Cloudflare Worker + Turso）のため追加コストなし |
| メール送信 | 該当なし（G1範囲では未使用） | マジックリンクを将来導入する場合のみ発生（Resend等、送信数に応じ無料枠あり、要最新確認） |
| Cloudflare Worker | 既存契約に準拠 | 現行運用プランの範囲内か、リクエスト数増加でプラン変更が必要かは既存のWorker利用状況次第（要x-post-fetcher側の現行プラン確認） |
| Turso | 既存契約に準拠 | 新規テーブル追加によるストレージ・行数増加が無料枠を超えるかは要確認（turso.tech/pricing） |
| EAS Build | 変動・要最新確認 | Expoの無料枠は月あたりのビルド数に制限あり、超過分は従量課金（要 expo.dev/pricing 確認） |
| App Store手数料 | 固定・既知の体系 | 標準は売上の30%、Small Business Program適用（年間売上$1M未満）で15%（要Apple公式最新規約確認） |
| 月額課金のApple手数料 | 同上 | 定期購読は1年継続後15%に低減される制度あり（Appleの規約変更に留意） |
| 買い切り課金のApple手数料 | 同上 | 非消費型は上記標準/Small Business手数料体系に準ずる |
| 将来Android対応時の追加費用 | 固定・既知 | Google Play Developer登録費（一時金、要最新確認）+ Google Play手数料（同様に15%/30%体系） |
| サポート運用 | 見積不可 | 個人開発の稼働時間次第 |
| 法務文書 | 変動 | 自作（テンプレートベース）なら¥0、弁護士レビューを入れる場合は実費 |
| 障害監視 | 変動 | 現行運用に監視ツールを追加する場合のみ発生（未導入なら¥0） |

**金額を断定しない理由**: RevenueCat・EAS・Turso・Cloudflareの料金体系は改定頻度が高く、本書作成時点の記憶による数値を事実として提示するとリリース時に誤りうる。実行前に必ず各サービスの公式Pricingページで再確認すること。

---

## 18. ユーザー判断が必要な質問

1. 推奨認証方式（案B: Sign in with Apple単独 + 自前Cloudflare Worker認証）を採用するか
2. メールマジックリンクを初回リリースから入れるか、Android対応まで待つか
3. 未ログイン状態での機能利用をどこまで許可するか（一覧・詳細閲覧のみか、保存も許すか）
4. ログイン必須にする機能の最終リスト（本書9章の案でよいか）
5. ローカルデータの自動同期（確認なしでマージ）でよいか、それとも初回のみ確認ダイアログを挟むか
6. 月額価格
7. 買い切り価格
8. 無料トライアルの有無・日数
9. 月額と買い切りの機能差（本書は「差を付けない」を第一候補としているが最終確認）
10. RevenueCat entitlement名・Product ID・Offering名の最終確定
11. Family Sharing対応の要否
12. アカウント削除の猶予期間（本書は14日を提案、最終日数の確定）
13. 統計対象ステータスの最終確定（本書10章の7状態でよいか）
14. 無料ユーザーに見せる統計プレビューの範囲（件数のみ見せるか、完全非表示か）
15. Android対応時期の目安（設計の先取り範囲に影響）
16. 認証基盤（自前実装）にかける開発期間の予算感
17. サポートメールアドレス
18. 利用規約・プライバシーポリシーの公開先（アプリ内Webビューか、外部ホスティングか）
19. 削除済みユーザーの`audit_logs`/`revenuecat_events`保持期間
20. アカウント削除後、同一Apple IDでの買い切り購入を新規アカウントへ再付与してよいか（15章）

---

## 19. 最初の報告（サマリー）

| # | 項目 | 結論 | 重大度 |
|---|---|---|---|
| 1 | 推奨認証方式 | Sign in with Apple単独（初回リリース）、Android対応時にGoogle/メール追加 | Blocker |
| 2 | 認証基盤 | 自作（Cloudflare Worker + Turso、JWT Access + DB管理Refresh）。外部認証サービスは不採用（vendor lock-in回避、既存の疎結合方針と整合） | Blocker |
| 3 | 推奨RevenueCat構成 | 1 Project、Entitlement`premium`、Offering`default`、Packages`monthly`/`lifetime` | Blocker |
| 4 | 月額・買い切り商品構成 | 同一`premium` entitlementに紐づく2商品、機能差なし | Important |
| 5 | Entitlement/Offering/Package/Product ID候補 | `premium` / `default` / `monthly`,`lifetime` / `cardhub_premium_monthly`,`cardhub_premium_lifetime`（未確定候補） | Important |
| 6 | RevenueCat App User ID設計 | サーバー`userId`をそのまま採用、`Purchases.logIn`/`logOut`で匿名⇄ログインを制御 | Blocker |
| 7 | RevenueCat Webhook設計 | `POST /webhooks/revenuecat`、専用認証、`revenuecat_events`で冪等処理 | Blocker |
| 8 | 全体アーキテクチャ | 3章参照。Mobile→Worker→Turso、RevenueCat SDK→RevenueCat→Webhook→Worker→Turso | Blocker |
| 9 | DBテーブル案 | 15テーブル（4章）、既存`lotteries`系は無変更 | Blocker |
| 10 | API一覧案 | 認証8本、自分の抽選5本、お気に入り/フォロー6本、チェックリスト3本、通知/デバイス4本、課金4本、統計5本（計35本） | Important |
| 11 | セッション・トークン設計 | Access=JWT15分、Refresh=DB管理60日+ローテーション+再利用検知 | Blocker |
| 12 | ローカルデータ移行方針 | 実コード確認済み（5ストア）。`sync` APIで一括マージ、チェックリストは「後退させない」特別ルール | Blocker |
| 13 | 統計データモデル | サーバー計算を正とする17項目、月次はJST基準 | Important |
| 14 | 状態遷移案 | 7状態、ホワイトリスト方式の遷移制御、自動遷移はさせず「応募忘れ」は別集計 | Important |
| 15 | 無料・premium機能の境界 | 日常機能は無料、振り返り/分析のみpremium | Important |
| 16 | premium APIの保護方法 | サーバー`subscription_entitlements`を必ず参照、クライアント状態を信用しない | Blocker |
| 17 | Development Build移行時期 | Mobile-G3で実施（認証実装と同時、SecureStore/SIWAのネイティブ要件のため） | Blocker |
| 18 | 実装フェーズ分割 | G2〜G8の7フェーズ（16章） | Important |
| 19 | 想定コスト | Apple Developer $99/年のみ既知確定、他は要最新確認（17章） | Important |
| 20 | セキュリティ上の注意 | IDOR対策の構造的徹底、Webhook署名検証、トークンのログ非出力が最重要 | Blocker |
| 21 | 法務・アカウント削除要件 | 猶予期間付き削除、規約類はG8で作成、特商法要否は要確認 | Important |
| 22 | ユーザー判断が必要な質問 | 20件（18章） | Important |
| 23 | 最初に着手すべきフェーズ | **Mobile-G2**（バックエンドDB基盤・認証ミドルウェア）。理由: G3以降の全てがG2のAPI/DBに依存するため | Blocker |
| 24 | 最大の技術リスク | オフライン/複数端末の同期競合処理（G4）。次点でRefresh Token再利用検知の実装漏れ（セキュリティ直結） | Blocker |
| 25 | 最大の運用リスク | RevenueCat Webhookの取りこぼし・遅延によるサーバー/クライアントのentitlement不一致。個人開発での審査対応・課金トラブル一次対応の負荷 | Important |

---

**本設計文書に基づき、コード変更・DB変更・EAS操作・RevenueCat操作・Apple Developer操作のいずれも未実施です。次のアクションについてご確認をお願いします。**

---
---

# 改訂（ユーザーフィードバック反映）

ステータス: **引き続き設計のみ。コード変更・DB変更・EAS操作・RevenueCat操作・Apple Developer操作は未実施。**

本改訂は1〜19章の該当箇所を置き換える。特に4章（DB設計）・5章（API設計）・6章（セッション・トークン）・7章（ローカル移行）・8.5節（RevenueCat App User ID）・16章（フェーズ分割）の内容がここで更新される。

---

## 20-1. publicUserIdを含むusers設計

### ID形式の選定: UUIDv4を採用

| 候補 | タイムスタンプ埋め込み | 登録順の推測可能性 | Cloudflare Workersでの生成 |
|---|---|---|---|
| UUIDv4 | なし | **不可能（完全ランダム122bit）** | `crypto.randomUUID()`で標準サポート、追加依存なし |
| UUIDv7 | あり（先頭48bitがミリ秒精度のタイムスタンプ） | **作成時刻が近似的に判明する** | 標準サポートなし、`uuidv7`等の追加npm依存が必要 |
| ULID | あり（先頭48bitがタイムスタンプ） | 同上 | 標準サポートなし、`ulid`等の追加npm依存が必要 |

理由: 本要件は「ユーザー数や登録順を推測されにくくする」ことが明示目的であり、UUIDv7/ULIDの主な利点（ソート可能性によるDBインデックス局所性の向上）は今回**内部主キーが`id` integer autoincrementのまま**であるため不要（`publicUserId`は非クラスタ化のunique index列に過ぎない）。ソート可能性を得るメリットがない一方、タイムスタンプ埋め込みは要件と正面から矛盾する。したがって完全ランダムなUUIDv4を採用する。副次的利点として、Cloudflare Workers/Node双方で`crypto.randomUUID()`がネイティブ実装されており追加ライブラリが不要。

### `users`テーブル改訂

| 列 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | integer PK autoincrement | not null | **内部専用**。他テーブルからのFK参照・DB内JOINは全てこの列を使う。外部（RevenueCat・JWT・ログ・URL）へは絶対に出力しない |
| publicUserId | text | not null, unique | UUIDv4（`crypto.randomUUID()`で生成、挿入時に確定）。外部公開用の唯一の識別子 |
| displayName | text | nullable | （G1のまま） |
| email | text | nullable | （G1のまま） |
| emailIsPrivateRelay | integer(boolean) | nullable | （G1のまま） |
| accountStatus | text | not null default `'active'` | （G1のまま） |
| deletionRequestedAt / scheduledDeletionAt / lastLoginAt / createdAt / updatedAt / deletedAt | — | — | （G1のまま） |

インデックス追加: `unique(publicUserId)`

### 内部ID/外部IDの使い分け（アーキテクチャ上の原則）

- **DB内部のJOIN・FK**: 常に整数`id`を使用（パフォーマンス・ストレージ効率を優先、他の全新設テーブルの`userId`列は整数`id`を参照する方針は変更しない）
- **JWTの`sub`**: `publicUserId`（UUIDv4文字列）
- **RevenueCat App User ID**: `publicUserId`
- **監査ログ・ユーザー向けAPIレスポンスの`id`フィールド**: `publicUserId`のみを返す。内部`id`はAPIレスポンスに一切含めない

### JWT検証時の内部ID解決方法（実装詳細、要判断）

認証ミドルウェアは`sub`（=`publicUserId`）から内部`id`を解決する必要がある。2案:

- **案1（推奨）**: JWTペイロードに`sub`（`publicUserId`）に加え、非標準プライベートクレーム`uid`（内部整数`id`）を**サーバーが自己署名の一部として埋め込む**。JWTはサーバーと本人の端末間でのみやり取りされ、RevenueCat等の外部サービスへJWT自体を渡すことはない（外部へ渡すのは`publicUserId`という値そのものだけ）ため、「内部IDを外部サービスへ露出しない」という本来の目的には抵触しない。毎リクエストのDB参照が1回減り高速。
- **案2（より保守的）**: JWTには`sub`（`publicUserId`）のみを含め、リクエスト毎に`users`テーブルを`publicUserId`のunique indexで引いて内部`id`を解決する。クライアントへ渡す情報を最小化したい場合はこちら。

**推奨は案1**（実質的なリスク増加はなく、レイテンシ面で有利）。ただし本項目自体は18章の「ユーザー判断が必要な質問」に追加する（21項目目、後述）。

---

## 20-2. RevenueCat App User IDの修正版

- **RevenueCat App User ID = `publicUserId`**（8.5節を置き換え）。整数`id`は一切使用しない。
- `Purchases.logIn(publicUserId)` / `Purchases.logOut()`の呼び出し箇所は変更なし（値がinteger idからUUIDv4文字列に変わるのみ）。
- `subscriptions.revenuecatAppUserId`, `subscription_entitlements`とのJOINキーは、`users.id`（内部FK）を主とし、`revenuecatAppUserId`列（=`publicUserId`の値）はRevenueCat側との照合・Webhook受信時の逆引き専用に保持する（Webhook payloadにはRevenueCat App User IDしか含まれないため、`users.publicUserId`のunique indexで内部`id`へ逆引きする）。

---

## 20-3. 安定商品マスタの設計

`followed_products.productKey`（＝`normalizedProductName`文字列）を恒久IDとして扱わない。新設3テーブルで解決する。

### `products`

| 列 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | integer PK autoincrement | not null | 内部ID（`lottery_products`/`followed_products`からのFK参照に使用） |
| publicProductId | text | not null, unique | UUIDv4（`users.publicUserId`と同じ理由・同じ形式で統一） |
| canonicalName | text | not null | 表示用の正式名称（初期値は代表的な`productNameRaw`、将来手動補正可） |
| normalizedName | text | not null | 現在の正規化名（`lotteries.normalizedProductName`と同じ値域） |
| normalizerVersion | text | nullable | この`normalizedName`を生成した正規化ロジックのバージョン |
| cardType | text | nullable | 表示用に非正規化保持 |
| mergedIntoProductId | integer FK→products.id | nullable | このproduct行が別のproduct行に統合された場合の遷移先（自己参照） |
| createdAt | text | not null default CURRENT_TIMESTAMP | |
| updatedAt | text | not null default CURRENT_TIMESTAMP | |

### `product_aliases`

| 列 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | integer PK autoincrement | not null | |
| productId | integer FK→products.id | not null | |
| aliasNormalizedName | text | not null, **unique** | 過去または別バージョンの正規化名。1つの別名文字列は1つの商品にのみ対応（曖昧な解決を防ぐ） |
| source | text | not null | `'initial_migration'` / `'re_normalization'` / `'manual_merge'` |
| createdAt | text | not null default CURRENT_TIMESTAMP | |

### `lottery_products`

| 列 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | integer PK autoincrement | not null | |
| lotteryId | integer FK→lotteries.id | not null, unique | 1抽選=1商品の現在の対応（`lotteries`テーブル自体は無変更） |
| productId | integer FK→products.id | not null | |
| createdAt | text | not null default CURRENT_TIMESTAMP | |

### 解決アルゴリズム（`resolveProductId(normalizedProductName)`、ingestionとfollowed_products移行の両方で共通利用）

1. `product_aliases.aliasNormalizedName`を完全一致で検索 → 見つかれば`productId`を取得し、`products.mergedIntoProductId`が設定されていれば**そのチェーンを辿って**最終的な統合先`productId`を返す
2. 見つからなければ`products.normalizedName`を完全一致で検索
3. それでも見つからなければ**新規`products`行を作成**し、その`normalizedName`自体を指す自己エイリアス行（`product_aliases`, `source='initial_migration'`または`'re_normalization'`）も同時に作成する（以後は常に手順1のパスで解決できるようにするため）

`mergedIntoProductId`のチェーンは**書き込み時にlottery_products/followed_productsの行を書き換えない**（統合をO(1)にするため）。統合結果は常に読み取り時にチェーンを解決する共通関数を経由する。

### 4.8節を置き換え: `followed_products`

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| userId | integer FK→users.id | not null |
| productId | integer FK→products.id | not null（**旧`productKey: text`を置き換え**） |
| createdAt | text | not null default CURRENT_TIMESTAMP |
| deletedAt | text | nullable |

- 一意制約: `unique(userId, productId)`（部分一意、`deleted_at IS NULL`）

### 既存normalizedProductNameからの非破壊マイグレーション案

1. **バックフィルスクリプト**（冪等・再実行可能）: `lotteries`テーブルから`normalizedProductName IS NOT NULL`の distinct 値を抽出し、各値について`resolveProductId`の手順2〜3相当のロジックで`products`行+自己`product_aliases`行を新規作成する。`canonicalName`はその`normalizedProductName`を持つ代表行（最新の`productNameRaw`が非nullなもの）から採用、無ければ`normalizedProductName`自体をフォールバック値にする
2. **`lottery_products`の一括生成**: `normalizedProductName`が非nullな全`lotteries`行について、対応する`productId`を解決し`lottery_products`へ挿入
3. これらは**`lotteries`テーブルに一切書き込まない**新規テーブルへのINSERTのみであり、完全に非破壊。既存の`/lotteries`系APIへの影響もゼロ
4. **継続運用**: 新規抽選の取り込み時（`x-post-fetcher`の`services/normalize.ts`まわり）に`resolveProductId`呼び出しを追加し`lottery_products`を都度更新する処理が必要——これは新規テーブル追加だけでなく**既存の取り込みパイプラインへのコード追加**であるため、G2Bのスコープに明示的に含める（後述）
5. **モバイル側`followedProductKeys`（ローカルの`normalizedProductName`文字列配列）の移行**: 初回ログイン時の`sync`APIで送信された文字列を、サーバー側で`resolveProductId`により`productId`へ解決してから`followed_products`へ保存する（解決に失敗するケースは想定しないが、万一未知の文字列であれば手順3のフォールバックで新規`products`行を作成し、ユーザーのフォローを失わない）

### 自動統合条件（保守的方針）

同一商品の判定は完全自動化しない。**G2Bでは自動統合ロジックを一切実装しない**。

- 唯一の自動的な同一視は「**完全一致する`normalizedProductName`文字列の再利用**」のみ（`product_aliases`経由の厳密一致、あいまい一致は行わない）
- 正規化ロジックが変わり同一の実商品が新しい`normalizedProductName`を生成した場合、**自動では統合せず新規`products`行として作成する**（重複を許容する）。人間（管理者）が事後にレビューし、同一と判断した場合のみ手動で`mergedIntoProductId`を設定し、旧`normalizedName`を新しい商品への`product_aliases`（`source='manual_merge'`）として追加する
- 理由: 重複商品は「似たカードが2枚表示される」程度の低コストな問題で気づきやすく修正も容易だが、誤統合は「別の商品のフォロー/抽選が混ざる」という発見しにくく訂正コストの高い問題であるため、**重複を許容し誤統合を避ける**方を常に優先する
- 手動統合の操作導線（管理API `/internal/products/:id/merge`等）はG2B範囲外・将来のNice to haveとする

---

## 20-4. チェックリスト競合解決の修正版

「`done=true`が一方にあれば常に優先」は**不採用**。以下に置き換える。

### `checklist_progress`テーブル改訂（4.9節を置き換え）

| 列 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | integer PK autoincrement | | |
| userId | integer FK→users.id | not null | |
| lotteryId | integer FK→lotteries.id | not null | |
| stepId | text | not null | |
| label | text | not null | |
| done | integer(boolean) | not null default 0 | |
| completedAt | text | nullable | `done=false`になった時点で**必ずnullへ戻す** |
| completedNote | text | nullable | |
| updatedAt | text | not null | **勝者となった編集の「クライアント宣言時刻」**（下記参照、サーバー受信時刻ではない） |
| serverReceivedAt | text | not null default CURRENT_TIMESTAMP | 監査専用。サーバーが実際にこの書き込みリクエストを受信した時刻（クライアント時計を全く信用しない値として別途保持） |
| serverVersion | integer | not null default 1 | 楽観的ロック用カウンタ。書き込みが確定するたび+1 |
| lastClientRequestId | text | nullable | 直近処理済みの`clientRequestId`（同一リクエストの再送を検知し再適用しないため） |
| sortOrder | integer | not null default 0 | |
| createdAt | text | not null default CURRENT_TIMESTAMP | |
| deletedAt | text | nullable | |

一意制約: `unique(userId, lotteryId, stepId)`（変更なし）

### リクエスト形式

```
PUT /me/checklists/:lotteryId
{
  steps: [{
    stepId, done, completedNote?,
    clientActionAt,       // 端末がユーザー操作を記録した時刻（タイブレーク用シグナル、認可には使わない）
    baseServerVersion,     // このstepIdについてクライアントが最後に把握していたserverVersion
    clientRequestId
  }]
}
```

### サーバー側解決アルゴリズム（stepId単位）

1. **冪等性チェック**: `lastClientRequestId`が今回の`clientRequestId`と一致すれば再適用せず前回結果をそのまま返す
2. `baseServerVersion == 現在のserverVersion` の場合（クライアントは最新状態を見てから変更した）→ **競合なし**。そのまま適用: `done`, `completedNote`更新、`done=false`なら`completedAt=null`、`updatedAt=clientActionAt`、`serverReceivedAt=now()`、`serverVersion += 1`
3. `baseServerVersion < 現在のserverVersion` の場合（他端末の変更が既に反映された後の書き込み）→ **競合あり**。以下の優先順で解決:
   1. `incoming.clientActionAt > stored.updatedAt` → **incomingが勝つ**（新しい方を採用）
   2. `incoming.clientActionAt == stored.updatedAt` → `serverVersion`（既存の値、今回の書き込みで得られるはずだった次のバージョン番号との比較材料）で判定するが、実運用上ここまで一致するのは稀。同値の場合は次の規則へ
   3. それでも同じ → **サーバー側（既存の値）を採用**し、incomingを破棄
4. 勝者が確定したら`serverVersion += 1`し、レスポンスには**解決後の権威ある状態**を必ず返す（負けた端末のローカルZustandキャッシュをそのレスポンスで補正させるため、サイレントに古い値を残さない）
5. `done=false`への変更は特別扱いせず、上記と全く同じ手順で通常の操作として扱う（要件反映）

### 端末時計を完全には信用しない、という要件への対応

- 上記の`clientActionAt`は**タイブレークのシグナルとしてのみ**使用し、認証・認可・トークン有効期限など安全性に関わる判定には一切使わない（そちらは引き続き100%サーバー時計、6章は変更なし）。チェックボックス1つの勝ち負けという影響範囲の小さい判断に限定して許容する
- `serverReceivedAt`を常に別列で保持するため、端末時計が大きく狂っている場合の検知・調査が後から可能（例: `clientActionAt > serverReceivedAt`が続くデバイスの検出、Nice to have）

### 代替案（より保守的、要判断）

**Option B: サーバー受信時刻のみで解決（クライアント時刻を一切使わない）**
- `updatedAt`を常に`serverReceivedAt`とし、「サーバーに先に届いた変更が現在値になり、後から届いた変更が上書きする」という**到着順のみ**で解決する
- 利点: 端末時計のスキュー・改ざんに完全に免疫
- 欠点: オフラインファーストの本アプリでは「実際にユーザーが操作した順序」と「サーバーへの到着順序」が一致しない（例: 端末Aで9時に操作→11時にオンライン復帰・同期、端末Bで10時に操作→即座に同期）。この場合Option Bでは端末Bの10時の変更がいったん反映された後、端末Aの**より古い**9時の変更が11時の同期で上書きしてしまい、直感に反する結果になる

**推奨は本文中のOption A（`clientActionAt`をタイブレークシグナルとして使う方式）**。理由: オフラインファーストのチェックリスト機能では「ユーザーが実際にいつ操作したか」を反映する方がUX上自然であり、認可に使わない限り時計スキューの実害は「まれに小さな取りこぼしが起きる」程度に限定されるため。

---

## 20-5. Mobile-G2A/G2B/G2Cの詳細スコープ

### Mobile-G2A（認証基盤 — 最優先着手）

**新規DBテーブル**:
- `users`（20-1節の改訂版、`publicUserId`含む）
- `user_identities`（Apple `sub`照合用。**追加列**: `appleRefreshToken`（text, nullable、`authorizationCode`をAppleのトークンエンドポイントと交換して得たrefresh token。アカウント削除時のApple側失効に使用。将来Cloudflare Secretsをキーとした暗号化保存を必須要件とする——平文保存はしない）
- `refresh_tokens`
- `audit_logs`
- `account_deletion_requests`

**新規API**（G1の5.1節からG2Aに関係する範囲のみ抜粋、`sub`/App User IDは`publicUserId`に統一済み）:

| API | 概要 |
|---|---|
| `POST /auth/apple` | identityToken検証→ユーザー作成/照合→Access/Refresh Token発行 |
| `POST /auth/refresh` | ローテーション+再利用検知 |
| `POST /auth/logout` | 単一端末のRefresh Token失効 |
| `POST /auth/logout-all` | 全端末失効 |
| `GET /me` | `{publicUserId, displayName, email, accountStatus}`（内部`id`は返さない） |
| `DELETE /me` | 猶予期間付き削除フローの開始、Apple側トークン失効は削除確定バッチ内で実行 |

**この段階で行わないこと**: `user_lotteries`等のユーザーデータ系テーブル、RevenueCat関連テーブル、実際のApple Developer Portal操作（Sign in with Apple用の`.p8`鍵発行等）、EAS操作。

### Mobile-G2B（ユーザーデータ同期基盤）

**新規DBテーブル**:
- `products`, `product_aliases`, `lottery_products`（20-3節）
- `user_lotteries`, `user_lottery_status_history`
- `user_favorites`
- `followed_products`（`productId`版、20-3節）
- `checklist_progress`（20-4節の競合解決対応版）
- `notification_preferences`

**バックエンドの追加コード変更**（新規テーブルだけでなく既存コードにも触れる点に注意）:
- `x-post-fetcher`の取り込みパイプライン（`services/normalize.ts`周辺）へ`resolveProductId`呼び出しを追加し、新規抽選ごとに`lottery_products`を更新する処理を組み込む

**新規API**: `/me/lotteries`系、`/me/favorites`系、`/me/followed-products`系、`/me/checklists`系、`/me/notification-preferences`、`/me/devices`、`/me/lotteries/sync`（G1の5.2〜5.5節、productKey→productId変更を反映）

**この段階で行わないこと**: RevenueCat関連、統計API。

### Mobile-G2C（課金基盤の受け口のみ）

**新規DBテーブル**: `subscriptions`, `subscription_entitlements`, `revenuecat_events`

**新規API**: `POST /billing/revenuecat/webhook`（受信基盤のみ）、premium認可ミドルウェア（`subscription_entitlements`参照）

**この段階で行わないこと**: RevenueCatプロジェクト作成、実商品(Product)登録、App Store Connect操作、モバイル側`react-native-purchases`導入（これらはG5）。G2Cは「Webhookを受けてDBへ反映する土台」と「premium APIをサーバー側で保護する仕組み」だけを先に用意し、実際に課金イベントが発生する前にテストできる状態を作ることが目的（ダミーのWebhook payloadで動作確認する）。

**各段階（G2A/G2B/G2C）は個別にレビュー・テスト・停止する。次段階には進まない。**

---

## 20-6. 自前認証のセキュリティチェックリスト

| # | 項目 | 方針 |
|---|---|---|
| 1 | `iss`検証 | `https://appleid.apple.com`と完全一致することを確認 |
| 2 | `aud`検証 | アプリのBundle Identifier（確定後の値）と一致することを確認 |
| 3 | `exp`検証 | 期限切れトークンを拒否。Apple identityTokenは短命（数分)のため、受信後すぐに検証しキャッシュ・再利用しない |
| 4 | `sub`検証 | `user_identities.providerUserId`としてのみ利用、これ自体をJWTの`sub`（=`publicUserId`）と混同しない |
| 5 | `nonce`検証 | クライアントが生成したnonceのSHA-256ハッシュをApple認可リクエストへ渡し、返却されたidentityToken内のnonceがそのハッシュと一致することをサーバーで確認（トークンのリレー攻撃対策） |
| 6 | JWKS取得・`kid`選択・キャッシュ | `https://appleid.apple.com/auth/keys`を取得し`kid`ヘッダで鍵を選択、`jose`の`createRemoteJWKSet`等でキャッシュ（TTL 1時間程度、Appleの鍵ローテーション頻度は低い） |
| 7 | `authorizationCode`を使う処理 | 初回サインイン時にApple `https://appleid.apple.com/auth/token`エンドポイントと交換しApple側Refresh Tokenを取得、`user_identities.appleRefreshToken`へ保存。**アカウント削除時のApple側失効にのみ使用**し、日常の認証フローでは使わない |
| 8 | `credentialState`確認の役割 | `AppleAuthentication.getCredentialStateAsync`は**クライアント側・UXのみの補助チェック**（アプリ起動時にApple側で認可が取り消されていないか確認し、取り消されていれば再ログインを促す）。サーバー側のセキュリティ判定の代替には一切ならない |
| 9 | Refresh Tokenのハッシュ保存 | 生値は保存せずSHA-256ハッシュのみ（6章のまま） |
| 10 | Refresh Tokenローテーション | 使用毎に新規発行+旧トークン失効（6章のまま） |
| 11 | 再利用検知時の全セッション失効 | 失効済みトークンの再送を検知した場合、該当userIdの全Refresh Tokenを即時失効＋`audit_logs`記録（6章のまま） |
| 12 | JWT signing keyのローテーション | JWTヘッダに`kid`（例: `"cardhub-jwt-v1"`）を含め、Cloudflare Secretsに`{kid: secret}`の複数世代を保持。新規発行は常に最新`kid`、検証は非失効の`kid`全てを許容。旧鍵は「発行しうる最長Access Token有効期限(15分)を十分に超えた」後に安全に失効可能 |
| 13 | Cloudflare Secretsでの鍵管理 | `wrangler secret put`、リポジトリ・`.env`に一切含めない |
| 14 | トークン・個人情報をログへ出さない | 構造化ロガーで`Authorization`ヘッダ、`identityToken`、`refreshToken`、`email`をログ出力対象から除外（コードレビュー時のチェック項目化） |
| 15 | 認証APIのレート制限 | `/auth/apple`: IP単位 10req/min、`/auth/refresh`: deviceId単位 30req/min（6章のまま、具体値を明記） |
| 16 | アカウント削除時のAppleトークン失効 | 削除確定バッチで`user_identities.appleRefreshToken`を用いApple `/auth/revoke`へリクエスト。**ベストエフォート**（失敗してもCardHub側の削除処理は継続、失敗はログに記録） |
| 17 | テスト用認証を本番で有効にしない仕組み | ランタイムのenv変数フラグによる「検証スキップ」コードパスは**一切実装しない**。テスト用ログインが必要な場合は別ルート（例: `/auth/test-login`）を用意し、`createApp()`側で本番用Wrangler環境（`production`）には**そもそもルート自体を登録しない**（実行時if分岐ではなく、環境ごとに別々にビルド・デプロイされるWorker設定で構造的に排除する） |

**HS256 + 鍵ローテーション対応**: 上記12番の通り、JWTヘッダに`kid`（`keyVersion`）を持たせる設計を確定事項とする。

---

## 20-7. G2Aで作成するDBテーブル（再掲・確定版）

`users`（`publicUserId`含む）, `user_identities`（`appleRefreshToken`含む）, `refresh_tokens`, `audit_logs`, `account_deletion_requests`。以上5テーブル。既存`lotteries`系テーブルへの変更は一切なし。

## 20-8. G2Aで作成するAPI（再掲・確定版）

`POST /auth/apple`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /me`, `DELETE /me`。以上6本。認証ミドルウェア（JWT検証+`publicUserId`→内部`id`解決）を横断的に実装。

## 20-9. G2Aのテスト計画

| 種別 | 内容 |
|---|---|
| Unit | Apple identityToken検証（正常/署名改ざん/期限切れ/`aud`不一致/`nonce`不一致の各fixtureで検証。JWKSはモック） |
| Unit | Refresh Tokenローテーション（正常ローテーション、再利用検知→全失効のシナリオ） |
| Unit | JWT署名・検証の往復テスト（`kid`ローテーションのシミュレーション、旧鍵での検証が退役後に失敗することの確認） |
| Integration | login→refresh→logout→logout-allの一連のフローをローカルTurso（`local.db`、既存の`npm run dev`と同じ運用）に対して実行 |
| Integration | `GET /me`/`DELETE /me`の所有者チェック回帰テスト（他ユーザーのデータへアクセスできないことの確認、IDOR対策の検証） |
| Security | `/auth/apple`への連続リクエストでレート制限が発火することの確認 |
| 手動（G3以降） | 実機でのSign in with Appleフルフロー（Sandbox Apple ID）。**Development Build（G3）が無いと実施不可**なため、G2A自体のテストはバックエンド単体で完結させる（整形済みテスト用JWT＋JWKSモックで代替） |

## 20-10. G2Aのロールバック方法

- 新規5テーブルは既存`lotteries`系テーブルに対して**完全に追加のみ**（ALTER無し）。ロールバックはdownマイグレーションで5テーブルをdropするのみで、既存の抽選データ・既存API（`/lotteries`系）への影響はゼロ
- 新規ルート（`/auth/*`, `/me`）は`createApp()`内での追加登録に過ぎず、ロールバックは登録解除+前バージョンへのWorker再デプロイ（Cloudflare Workersの即時ロールバック機能を利用）
- G2Aではモバイル側のコード変更を一切行わない（モバイルがこれらのAPIを呼び始めるのはG3以降）ため、**既にストアに出ているアプリへの影響は皆無**で、バックエンドのみで完全に切り戻し可能

---

## 20-11. 今回確定した方針（反映済み）

6章の内容を確定事項として反映: Sign in with Apple単独/未ログイン許可/購入はログイン必須/RevenueCat正式採用/月額+買い切り/`premium` entitlement/機能差なし/統計のみpremium/基本機能無料/RevenueCat App User ID=`publicUserId`/premium最終判定はサーバー/サーバー同期+ローカルキャッシュ/パスワード認証・メールマジックリンクは初回リリース非実装/GoogleログインはAndroid対応時に再検討。未確定のまま維持: 月額価格・買い切り価格・無料トライアル・Family Sharing・アカウント削除の猶予期間・Product ID正式値。

---

## 20-12. ユーザーが次に判断すべき項目

18章の20項目に加え、以下を追加する。

21. JWTに内部`id`をプライベートクレーム`uid`として埋め込む案（推奨、20-1節）を採用するか、DB参照のみに留める保守的案にするか
22. `products.canonicalName`の初期値決定ロジック（代表`productNameRaw`の選び方: 最新1件か、頻度最多か）の最終確認
23. 商品統合の手動レビュー運用（誰が・どの頻度で`product_aliases`の重複候補を確認するか）をG2B完了までに決めるか、後回しにするか
24. チェックリスト競合解決でOption A（クライアント時刻タイブレーク、推奨）とOption B（サーバー受信順のみ）のどちらを採用するか
25. Apple Sign in用の`.p8`秘密鍵発行（Apple Developer Portal操作）を、アカウント削除時のトークン失効機能と合わせてG2Aで先に着手するか、G3以降に後回しにするか（G2Aの基本ログイン機能自体はこの鍵がなくても実装可能）

---

**この改訂に基づき、コード変更・DB変更・EAS操作・RevenueCat操作・Apple Developer操作のいずれも未実施です。Mobile-G2Aから着手してよいか、上記25項目の確認を含めご指示をお願いします。**
