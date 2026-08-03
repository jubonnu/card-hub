# Mobile-G4: RevenueCat課金基盤 実装計画

ステータス: **G4-1〜G4-4は実装・自動テスト完了（Hardening反映済み）。G4-5の実環境統合検証（RevenueCatダッシュボード・App Store Connect・Sandbox購入・EAS Build等）は未完了。** 詳細は末尾の「G4-1〜G4-4 完了・Hardening改訂」を参照。

前提: Mobile-G1（`docs/mobile-g1-auth-billing-stats-architecture.md`）の8・9・11〜15・16(G5行)・17・18章で、RevenueCat課金の設計は既に相当程度確定済み。本計画はゼロから設計し直すのではなく、**G1の確定事項を土台に、実装可能な粒度へ具体化する**。

**フェーズ番号について**: G1の16章（実装フェーズ分割）は元々このフェーズを「G5」としていたが、実際の実装ではモバイル認証（G1計画のG3）とローカル→サーバー同期（G1計画のG4）を`docs/mobile-g3-auth-sync-plan.md`として**1つのG3にまとめて実施**した経緯がある。そのため実際のフェーズ順序は G1 → G2A → G2B → G3 → **G4**（本計画）となる。内容はG1の「G5: RevenueCat基盤」に相当する。

**未実行**（本計画提示の時点）: `expo install react-native-purchases`、RevenueCatプロジェクト作成、App Store Connectでの商品作成、`eas build`、本番Turso適用、production Workerデプロイ、TestFlight、App Store提出。

---

## 1. フェーズ分割

各完了後にテスト結果を報告し、ユーザー確認を取って停止する運用を提案する（G2A/G2B/G3と同じ進め方）。

| サブフェーズ | 内容 | 対象 | 外部操作 |
|---|---|---|---|
| **G4-1** | RevenueCat SDK導入・設定基盤（config plugin確認、`app.json`/`eas.json`変更、環境変数設計、`Purchases.configure`初期化、ログイン/ログアウト時のApp User ID切替配線） | モバイルのみ | `expo install react-native-purchases`（実行はユーザー確認後） |
| **G4-2** | バックエンドpremium基盤（`subscriptions`/`subscription_entitlements`/`revenuecat_events`テーブル、`POST /webhooks/revenuecat`、`GET /me/entitlements`、`POST /me/subscription/refresh`、premium保護ミドルウェア） | x-post-fetcherのみ | なし（ローカルマイグレーションのみ） |
| **G4-3** | 購入・復元UI（課金画面、Offering取得・表示、購入/復元フロー、失敗・キャンセル・復元失敗のハンドリング） | モバイルのみ | なし（Offering自体はG4-5のProduct作成が前提のため、UIは先にモック/仮Offeringで組む） |
| **G4-4** | entitlement同期の結合（Webhook反映確認、`refresh`フォールバック、オフライン表示ポリシー、ログイン/ログアウト時の実同期確認） | 両方 | なし |
| **G4-5** | RevenueCatプロジェクト作成・App Store Connect商品作成・Sandboxテスト | 両方 | **ここで初めて外部サービス操作に着手するかを判断する**（本計画では未着手） |

G4-1〜G4-4はコード実装のみで進められ、G4-5で初めて外部操作（RevenueCatプロジェクト作成・Product作成）が必要になる。

---

## 2. 変更予定ファイル

### モバイル（`CardHub/apps/mobile`）

新規:
```
lib/purchases.ts                    # RevenueCat SDKの薄いラッパー（configure/logIn/logOut/
                                     # getOfferings/purchasePackage/restorePurchases/getCustomerInfo）
lib/entitlements.ts                 # CustomerInfoから表示用premium状態を解決する純粋関数
                                     # （UI表示専用、実際の許可判定には使わない。1章9番の確定方針）
schemas/billingApi.ts               # GET /me/entitlements, POST /me/subscription/refresh のZodスキーマ
stores/entitlementsStore.ts         # 表示用premiumキャッシュ（永続化はCustomerInfo側に委ね、
                                     # このストア自体は永続化しない案を第一候補とする、10章）
app/paywall.tsx                     # 課金画面（8.6節の状態一覧に対応）
components/billing/PaywallOfferingCard.tsx
components/billing/RestorePurchasesButton.tsx
lib/purchases.test.ts
lib/entitlements.test.ts
```

変更:
```
package.json                        # react-native-purchases追加（G4-1、実行前にユーザー確認）
app.json                            # config plugin登録要否をexpo-dev-clientの時と同じ方式で確認してから
                                     # 必要最小限のみ追加（4章）
eas.json                            # env: EXPO_PUBLIC_REVENUECAT_IOS_API_KEY を development/preview/
                                     # production で出し分け
lib/authActions.ts                  # signInWithApple成功時にPurchases.logIn(publicUserId)、
                                     # signOut/signOutAllDevices/deleteAccount成功時にPurchases.logOut()
app/(tabs)/profile.tsx               # premiumバッジ・課金導線の追加
app/stats/index.tsx                 # premiumロック画面への切替（現状は無条件表示、11章）
```

### バックエンド（`x-post-fetcher/apps/worker`）

新規:
```
src/routes/billingWebhook.ts        # POST /webhooks/revenuecat
src/routes/meEntitlements.ts        # GET /me/entitlements, POST /me/subscription/refresh
src/services/revenuecatWebhook.ts   # 12章のイベント処理ロジック
src/services/revenuecatClient.ts    # REST API再照会用（refresh フォールバック、8.4節）
src/repositories/subscriptionRepository.ts
src/repositories/subscriptionEntitlementRepository.ts
src/validation/billingSchemas.ts
src/auth/premiumMiddleware.ts       # requirePremium（14章のIDOR対策と同じ`WHERE userId=`方式を踏襲）
```

変更:
```
src/db/schema.ts                    # subscriptions, subscription_entitlements, revenuecat_events
                                     # の3テーブル追加（G1 4.11〜4.13節のスキーマ通り）
src/app.ts                          # Webhookルート・premium系ルートの登録（/lotteries系CORSは適用しない、12章）
src/env.ts                          # REVENUECAT_WEBHOOK_SECRET, REVENUECAT_SECRET_API_KEY追加
```

---

## 3. RevenueCat App User ID設計

G1 20-2節で既に確定済み: **RevenueCat App User ID = `publicUserId`**（内部integer `id`は一切使用しない）。

- `signInWithApple()`成功時（`toAuthUser`でuserがセットされた後）に`Purchases.logIn(publicUserId)`を呼ぶ
- `signOut()` / `signOutAllDevices()` / `deleteAccount()`のローカルクリーンアップ（`localSignOutCleanup`）に`Purchases.logOut()`を追加する
- 未ログイン時はRevenueCat SDKの匿名ID（`$RCAnonymousID:...`）のまま。1章の確定方針「購入はログイン必須」により、匿名IDでの実購入は通常発生しない設計
- サーバー側`subscriptions.revenuecatAppUserId`列は`publicUserId`の値を保持し、Webhook受信時の逆引き専用に使う（Webhook payloadには内部`id`が含まれないため）。JOINキーとしては内部`users.id`のFKを主に使う（20-2節の通り）

---

## 4. entitlement設計

- entitlement名: **`premium`**（固定、10章の最終確認事項）
- 月額商品・買い切り商品の両方を同一`premium` entitlementへ紐づける（RevenueCat Dashboard側の設定、コード変更不要）
- **premium判定の正はサーバーの`subscription_entitlements`テーブル**（1ユーザー1行、常に最新へupsert、G1 4.12節）
- モバイル側は`CustomerInfo.entitlements.active['premium']`を**表示専用**に使う。実際のAPI許可判定には使わない（1章9番の確定方針、`lib/entitlements.ts`はこの区別を型で明示する）

---

## 5. 月額・買い切りの扱い

- **機能差を付けない**（G1 9章の第一候補、本計画もこれを踏襲）。月額・買い切りどちらでも同一の`premium`機能一式が使える
- Product ID（仮、12章の最終確認事項）: `cardhub_premium_monthly` / `cardhub_premium_lifetime`
- 買い切りはApp Store上Non-Consumable（非消費型）として登録。RevenueCat側は`lifetime`パッケージとして扱い、`subscriptions.expiresAt=null`固定
- **Transfer Behavior**: 「購入は最初にログインしたアカウントに紐づいたままにする」方針を第一候補とする（G1 8.3節、1つのApple購入が複数アカウントのpremiumを解放し続ける事態を防ぐため）。RevenueCat Dashboard側の設定が必要（G4-5）

---

## 6. ログイン前後のユーザー切替

```
サインイン成功（lib/authActions.ts signInWithApple）
  → toAuthUserでuser確定
  → Purchases.logIn(publicUserId) を呼ぶ（匿名購入があれば自動統合、RevenueCat標準機能）
  → 以降のCustomerInfoはこのpublicUserIdに紐づく

ログアウト（signOut / signOutAllDevices / deleteAccount → localSignOutCleanup）
  → Purchases.logOut() を呼ぶ
  → 以降はRevenueCat SDKが新しい匿名IDを発行する

restoreSession（アプリ起動時のセッション復元）
  → RevenueCat SDK自体は端末内でログイン状態を永続化するため、Purchases.configure()時点で
    前回ログイン状態を引き継ぐのが標準。明示的なlogIn呼び出しは、
    authStore.user.publicUserIdとPurchases.getAppUserId()が不一致の場合のみ行う
    （G4-1実装時に実機で挙動を検証するポイントとして残す）
```

**namespace切替との関係**: `lib/accountNamespace.ts`のnamespace切替とRevenueCatのユーザー切替は独立した仕組みだが、どちらも同じ`authActions.ts`のライフサイクル関数（signIn/signOut/deleteAccount）から呼ばれる。呼び出し順序はnamespace切替→RevenueCat切替のどちらが先でも機能的には影響しないが、実装時は`ensureNamespaceAndBootstrap`と同様にベストエフォート（RevenueCat側のエラーでログイン/ログアウト自体を失敗させない）とする。

---

## 7. 購入・復元フロー

```
1. Purchases.getOfferings() で現在のOffering（月額・買い切りパッケージ）を取得
2. 価格は必ずlocalizedPriceStringから表示する（固定文字列をハードコードしない、8.6節）
3. ユーザーがパッケージを選択 → Purchases.purchasePackage(package)
4. 成功: 返ってきたCustomerInfoでUIを即時反映（表示専用のオプティミスティック更新）
   → サーバー側はWebhook経由で非同期にsubscription_entitlementsを更新
   → premium機能への実際のアクセスは次回のAPI呼び出し時にサーバーが最終判定
5. 失敗: エラー種別ごとに文言を出し分ける（8番参照）
6. 復元: Purchases.restorePurchases() → 同様にCustomerInfoを更新
```

---

## 8. バックエンドpremium認可

- `src/auth/premiumMiddleware.ts`の`requirePremium`を、premium必須API（`/me/statistics/*`等）の手前に配置
- 判定は必ず`subscription_entitlements.premiumActive`を参照する。RevenueCat SDKの結果をクライアントから信じない（1章9・11番）
- 未加入時は`403 { error: { code: "PREMIUM_REQUIRED", message, requestId } }`
- IDOR対策として、既存の`/me/*`共通ルール通り`WHERE userId = <認証済みID>`を必須化（G1 14章）

---

## 9. Webhook要否

**必要**。1章の確定事項10「RevenueCat状態はモバイル・サーバー両方で検証可能にする」により、クライアントの自己申告（CustomerInfo）だけで課金状態を確定させない設計のため。

- エンドポイント: `POST /webhooks/revenuecat`（`/lotteries`系の公開CORS設定は適用しない、サーバー間通信のみ、G1 12章）
- 認証: RevenueCatが送るヘッダの共有シークレットを`REVENUECAT_WEBHOOK_SECRET`（Cloudflare Secrets）で検証
- 冪等性: `revenuecat_events.eventId`のunique制約で重複処理を防止
- イベント種別ごとの処理はG1 12章の表をそのまま踏襲（`INITIAL_PURCHASE`/`RENEWAL`/`CANCELLATION`/`EXPIRATION`/`BILLING_ISSUE`/`REFUND`等）
- ユーザー不明時（`appUserId`が`users`テーブルと不一致）はエラーにせず`revenuecat_events`へ記録した上で200を返す（RevenueCat側の再送ループを防ぐ、G1 12章）
- Webhook遅延・欠落時のフォールバック: `POST /me/subscription/refresh`でRevenueCat REST API（`GET /subscribers/{app_user_id}`）へ再照会

---

## 10. オフライン時のpremium表示

- モバイル側はRevenueCat SDKがローカルキャッシュする直近の`CustomerInfo`を表示に使う
- 「オフラインのため最新状態と異なる場合があります」等の注記をUIに出す（8.4節）
- **実際のpremium API呼び出しは常にサーバーが最終判定する**ため、UIのロック解除状態を長期間Zustandへ永続化しない。毎回`CustomerInfo`から再評価する方針とする（1章9番）

---

## 11. Sandboxテスト計画

1. **Xcode StoreKit Configuration File**でのローカル検証（シミュレータ、G4-3実装中に並行して可能）
2. 実機Sandboxアカウントでの実購入フロー確認（G4-5、App Store Connect Product作成後）
3. 組み合わせテスト: 月額/買い切り × 購入成功/キャンセル/失敗/復元/既に購入済み/オフライン
4. Webhook到達確認（RevenueCat Dashboardのイベントログとサーバー側`revenuecat_events`テーブルの突合）
5. TestFlightでの実配布テストはG1計画の**G7相当**（本計画のスコープ外、別途）

---

## 12. ユーザー判断が必要な項目

G1 18章・20-12節で挙げられていた項目のうち、本フェーズに直接関わるものを整理する（すでに確定した項目は除外済み）。

1. 月額価格
2. 買い切り価格
3. 無料トライアルの有無・日数
4. Family Sharing対応の要否
5. Product ID最終値（`cardhub_premium_monthly` / `cardhub_premium_lifetime`でよいか）
6. Entitlement名・Offering名の最終確定（`premium`でよいか）
7. Transfer Behavior設定（「購入は最初にログインしたアカウントのまま」でよいか、5章）
8. アカウント削除後、同一Apple IDでの買い切り購入を新規アカウントへ再付与してよいか（G1 15章は「再付与しない」を第一候補としている）
9. 利用規約・自動更新の説明文言・購入復元導線の文言を誰が作成するか（G1 8章では未作成）
10. 特定商取引法表記・EULA選択（Apple標準EULAか独自規約か、G1 15章）

---

## 13. 開始前Blocker

| 項目 | 状態 | 影響 |
|---|---|---|
| Apple Developer Program登録 | **完了**（G3-5で確認済み） | ブロックなし |
| RevenueCatアカウント・プロジェクト作成 | 未着手 | G4-5まではコード実装のみで進められるため、G4-1〜G4-4には影響しない |
| App Store Connectでの月額・買い切り商品作成 | 未着手 | 実際のOfferingを使ったテストはG4-5以降。G4-3のUI実装自体はモック/仮のOfferingデータで進行可能 |
| Sandboxテスターアカウント準備 | 未着手 | G4-5で必要 |
| `.p8`鍵・Team ID・Key ID | 未発行（22章の既存Blocker） | RevenueCat課金には**不要**（Apple側のtoken exchangeとは無関係な別機能のため）。ただしG1 15章の「アカウント削除時のApple側トークン失効」機能とは引き続き独立したBlockerとして残る |

---

## 14. G3-5手動確認との依存関係

- G3-5の手動確認（表示名・bootstrapの422解消・ログアウト後の再ログイン・通常同期・namespace分離）は、**本計画の提示（コード変更を伴わない）を妨げない**
- **G4-2（バックエンドpremium基盤）はG3の実装コードに依存しない**ため、G3-5の手動確認と並行して着手可能
- **G4-1（RevenueCat SDK導入・ログイン/ログアウト時のPurchases.logIn/logOut配線）の実装着手前には、G3-5の「ログアウト後の再ログイン」「namespace分離」の手動確認が完了していることが望ましい**。理由: `Purchases.logIn`/`logOut`を`signInWithApple`/`signOut`等、既存の認証ライフサイクル関数に追加する設計のため、そのライフサイクル自体（特にnamespace切替のタイミング）が実機で正しく動作することを前提にする
- G4-3（購入・復元UI）はG4-1完了後、G4-4（entitlement同期の結合）はG4-1・G4-2両方の完了後に着手する

---

## 15. G4-1〜G4-4 完了・Hardening改訂

**ステータス: 実装・自動テスト完了。** モバイル194 tests / バックエンド379 tests、いずれもtypecheck・lint（モバイルのみ、バックエンドにlintスクリプト無し）クリーン。G4-5（RevenueCatダッシュボード・App Store Connect商品作成・Sandbox購入・EAS Build・本番Turso・production Worker等の実環境統合検証）は**未完了のまま**。

初回実装後、ユーザーレビューにより以下4点のHardeningを実施済み:

1. **CustomerInfoのユーザー照合**: `CustomerInfo.originalAppUserId`（RevenueCatが最初にそのユーザーを識別した時点のID、anonymous IDのままのことがある）を現在ユーザー照合に使うのは誤りだったため廃止。`Purchases.getAppUserID()`で取得した現在のSDK App User IDと`authStore.user.publicUserId`・namespace世代の一致を確認してから反映する方式に変更（`lib/billingLifecycle.ts`）。
2. **Webhook処理をREST照合ベースに変更**: イベント種別（INITIAL_PURCHASE/RENEWAL等）から直接premiumのgrant/revokeを判定する旧方式を廃止。Webhookを受けたら都度RevenueCat REST API（`GET /subscribers/{app_user_id}`）で現在のsubscriber状態を取得し、それを正として`subscription_entitlements`へ反映する方式に変更（`src/services/revenuecatWebhookProcessor.ts`）。RevenueCat REST APIが一時失敗した場合やSecret API Key未設定の場合は`failed_retryable`として記録し、イベント種別からの推測でpremium状態を変更することはしない。
3. **TRANSFER専用処理**: `transferred_from`/`transferred_to`（複数可）を持つ専用スキーマ・専用フローとして分離。両側それぞれのApp User IDについて個別にREST照合・反映する（移譲元・移譲先どちらがpremiumを持つべきかをコードで仮定しない）。
4. **Webhook HMAC検証をRevenueCat公式形式に限定**: `X-RevenueCat-Webhook-Signature: t=<unix_timestamp>,v1=<hmac_sha256_hex>`（署名対象`<timestamp>.<raw_json_body>`）のみを受理。旧来の「raw bodyのみへの署名」方式は削除。HMAC設定時はAuthorization・HMAC両方が必須。
5. （追加）**イベント順序逆転対策**: `event.event_timestamp_ms`から生成した`eventTimestamp`と、既存の`subscription_entitlements.lastRevenueCatEventAt`を比較し、より古いイベントの反映はスキップする（`superseded`）。
6. （追加）**productType判定の誤推測防止**: Product ID文字列の部分一致推測（`includes('monthly')`等）を廃止し、設定済みProduct IDとの完全一致マップに変更（モバイル・バックエンド両方）。Product ID最終値が未確定の間は`'unknown'`を返す。`premiumActive`判定自体はこの値を使わない。

### 15.1 イベント順序比較の前提固定（eventTimestamp）

`subscription_entitlements.lastRevenueCatEventAt`との順序逆転ガードは辞書式文字列比較（`>`）を使っている。この比較が数値としての時系列比較と一致するのは、`eventTimestamp`が必ず`Date.prototype.toISOString()`の出力するUTC固定形式（`YYYY-MM-DDTHH:mm:ss.sssZ`）であることが前提。この前提を`src/services/revenuecatWebhookProcessor.ts`の`toEventTimestamp`関数のコメントとして固定し、`tests/revenuecatEventTimestamp.test.ts`（6 tests）で形式・順序一致・年月境界・ゼロ埋め・冪等性を検証している。`subscription_entitlements`スキーマの`lastRevenueCatEventAt`列にも同様の注記を追加済み。

**残課題（将来の改善候補、リリースブロッカーではない）**: 現状は文字列比較のみで運用しており、フォーマットの前提が将来的に崩れると静かに誤動作しうる。`event_timestamp_ms`という数値そのものを`revenuecat_events`・`subscription_entitlements`へ保持し数値比較へ移行する方が本質的に安全（フォーマット依存を無くせる）。スキーマ変更を伴うため今回は見送った。

### 15.2 リリース前Blocker

- ~~`failed_retryable`イベントの自動再処理が未実装~~ **2026-08-02: 通常イベントについて解消**（`src/services/revenuecatEventRetryService.ts`、18章参照）。訂正: 当初「解消」と報告したが、TRANSFERイベントは`transferred_from`/`transferred_to`をrawPayloadとして保持していなかったため自動再試行できず、**Transfer Behaviorを使用する本仕様では残存Blockerだった**。同日中に`transferredFromJson`/`transferredToJson`列（migration 0017）を追加し、TRANSFERの自動再試行にも対応した（19章参照）。この対応より前に`failed_retryable`になった古い行（コンテキスト未保存）のみ引き続き手動対応が必要（`skippedTransferNoContext`として可視化）。
- **再試行基盤の高度化（retryCount・指数バックオフ・最大試行回数・failed_permanent・CASによる二重処理防止）が未実装**: 既存のApple失効再試行（`appleRevocationRetryRepository.ts`）と同等の仕組みは無く、現在は「毎回`failed_retryable`全件を再スキャンし、成功したら状態遷移で自然に対象から外れる」という単純な設計に留まる。データ破損リスクは低い（`upsertSubscriptionEntitlement`のupsert+順序逆転ガードにより冪等）が、真に同時実行するCronが重なった場合の二重REST呼び出し等は未対策。19章参照。
- RevenueCatダッシュボードの実際のHMAC署名仕様（ヘッダ名・タイムスタンプ付き署名形式）が公式ドキュメント記載通りか、G4-5で実際のWebhook送信を見て確認が必要。
- TRANSFERイベントの`transferred_from`/`transferred_to`の実際のフィールド名・型がRevenueCatの本番Webhookペイロードと一致するか、G4-5で確認が必要。

---

# 改訂（G4-5事前確認、2026-08-02・提示のみ・外部操作未実行）

## 16. G4-5事前確認: Apple/RevenueCat認証情報の整理（ユーザー承認・確定事項）

価格・ID等の確定事項（**月額¥400・買い切り¥2,000**（2026-08-03最終確定、当初案の¥680/¥3,980から変更。買い切りは¥1,980を希望したがApple価格Tierに存在しないため最も近い¥2,000を採用）・トライアル無し・Product ID/Entitlement ID/Offering ID/Package ID・Transfer Behavior・Family Sharing無効・Webhook認証=Authorization header+公式HMAC併用）に加え、以下を確定事項として記録する。

**App Store Connect API Key**（商品・価格インポート用）
- 必要情報: .p8ファイル・Key ID・Issuer ID・Vendor番号
- 作成: Users and Access → Integrations → App Store Connect API
- 必要ロール: App Manager以上

**In-App Purchase Key**（Apple取引の検証・記録用、StoreKit 2で必須）
- 必要情報: **.p8ファイル・Key ID・Issuer ID**（Bundle IDはキー自体の情報ではない）
- 作成: Users and Access → Integrations → In-App Purchase
- **必要ロール: Account HolderまたはAdmin**（App Store Connect API Keyより厳しい。App Managerでは作成できない）
- Bundle ID（`com.cardhub.mobile`）はキー情報としてではなく、**RevenueCatダッシュボード側のiOSアプリ設定**として登録する
- App-Specific Shared Secretは不要（StoreKit 1専用のため、react-native-purchases v10.6.0では対象外）

**トラブルシュート**: App Store ConnectでApp Store Connect API・In-App Purchaseのメニューが見えない場合、Paid Apps Agreement未締結だけでなく、**現在のユーザーロールがAccount Holder/Adminに満たない可能性**も確認すること。

## 17. G4-5ステップ2: ユーザー自身による事前確認（実行中）

ユーザーがApp Store Connect上で以下8項目を直接確認する（Claude側では確認不可能な外部サービスの状態のため）。確認結果の報告を待ち、その後の手順（キー生成・商品作成・RevenueCat設定等）を案内する。

1. Paid Apps Agreementの状態
2. 銀行口座情報の状態
3. 税務情報の状態
4. 現在のユーザーロール
5. App Store Connect APIメニューの有無
6. In-App Purchaseメニューの有無
7. CardHubアプリ登録の有無
8. Bundle IDが`com.cardhub.mobile`か

この時点でキー生成・商品作成・RevenueCat設定のいずれも未実行。

---

## 18. G4-5準備中の並行実装（2026-08-02、外部操作は未実行）

App Store Connect側の確認をユーザーが進めている間、外部サービスに依存しないバックエンド実装を並行して完了させた。

**1. `failed_retryable`イベントの自動再処理**（`docs/known-gaps.md`記載の課金公開前Blockerを解消）
- `src/services/revenuecatEventRetryService.ts`新設: `revenuecat_events`から`processingStatus='failed_retryable'`を古い順に取得し、REST再照合→反映を試みる
- `revenuecatWebhookProcessor.ts`の`resolveCandidateAppUserId`・`verifyAndApplyForResolvedUser`をexportし、Webhook受信経路と再試行経路の両方から再利用（ロジック重複を避ける）
- TRANSFERイベントは`revenuecat_events`がrawPayload（`transferred_from`/`transferred_to`）を保持しない設計のため自動再試行の対象外とし、`skippedTransfer`件数として可視化（手動対応が必要）
- 内部API`POST /internal/revenuecat-events/retry-batch`（`INGEST_TOKEN`によるBearer認証、既存の`/internal/apple-revocation/retry-batch`と同じ方式）と、`src/index.ts`の`scheduled`ハンドラ（Cron Trigger、既存のApple失効再試行と同じ`ctx.waitUntil`パターン）の両方から呼べる
- `wrangler.toml`の`[triggers]`（実際のCron設定）は既存のApple失効再試行と同様、本フェーズではまだ追加していない（実デプロイ時に設定）
- テスト8件追加（REST成功/失敗/Secret未設定/alias解決/未知ユーザーの終了処理/TRANSFERスキップ/順序逆転ガード/複数イベント一括処理）

**2. staging環境のscaffolding**
- `wrangler.toml`に`[env.staging]`ブロックを追加（`name = "x-post-ingest-staging"`）。実デプロイはまだ行っていない
- Webhook疎通確認は本番Turso/production Workerではなく、まずこのstaging Worker + 別のTurso DBで行う方針をコメントで明記（Sandboxイベントが本番DBへ混入しないことを構造的に担保する）

**3. 環境変数ドキュメントの整備**
- `wrangler.toml`にRevenueCat関連の環境変数名（値は書かない）を追記
- `apps/mobile/.env.example`に`EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`等をコメントとして追記
- App Store Connect API Key・In-App Purchase Keyはこのリポジトリのどこにも保存しない（RevenueCatダッシュボードへ直接アップロードするもの）ことを明記

**テスト結果**: バックエンド392 tests（新規8件）、typecheckクリーン。モバイル側のコード変更は無し（`.env.example`のコメント追記のみ）。

---

## 19. TRANSFERイベントの自動再処理対応（2026-08-02、訂正・追加実装）

18章で「`failed_retryable`イベントの自動再処理」を完了と報告したが、ユーザー指摘により**TRANSFERイベントは対象外のままだった**ことが判明。Transfer Behaviorを使用する本仕様では、これは残存Blockerとして扱うべき、との訂正を受け、以下を追加実装した。

**1. TRANSFER再試行に必要な最小コンテキストの保存**
- `revenuecat_events`へ`transferred_from_json`・`transferred_to_json`列を追加（migration `0017_keen_red_hulk.sql`、空DB・0016→0017の両方の適用を再検証済み）
- rawPayload全体は保存しない方針を維持（`transferred_from`/`transferred_to`のみ）。`event_timestamp`・`environment`は元々`revenuecat_events`の既存列（`event_timestamp`・`environment`）にTRANSFER以外も含め全イベント共通で保存済みだったため、追加不要だった
- Webhook受信時（`processTransferEvent`、`revenuecatWebhookProcessor.ts`）にパース成功直後、`updateRevenuecatEventTransferContext`でこの2列へ保存する

**2. Cron再試行時の双方向REST再照合**
- `processTransferEvent`内の「移譲元・移譲先それぞれをREST照合」ロジックを`processTransferSides`として切り出し、Webhook受信経路（`revenuecatWebhookProcessor.ts`）・Cron再試行経路（`revenuecatEventRetryService.ts`）の両方から共通利用
- `retryFailedRevenuecatEventsBatch`は`eventType === "TRANSFER"`の行について、保存済み`transferredFromJson`/`transferredToJson`を復元し、両側を再照合する（`retryTransferRow`）
- コンテキストが保存されていない古い行（この対応より前に`failed_retryable`になったもの）は`skippedTransferNoContext`として区別し、手動対応が必要なことを可視化する

**3. 再試行基盤の実装状況（正直な報告）**

| 項目 | 状況 |
|---|---|
| retryCount | ❌ 未実装。試行回数を記録する列・ロジックが無い |
| nextRetryAt | ❌ 未実装。毎回のCron実行で`failed_retryable`全件を無条件に再スキャンする（指数バックオフによる次回時刻の制御は無い） |
| 指数バックオフ | ❌ 未実装 |
| 最大再試行回数 | ❌ 未実装（上限が無いため、恒久的に失敗し続けるイベントも際限なく再スキャンされ続ける） |
| failed_permanent | ❌ 未実装。恒久的失敗を終了状態として分離する仕組みが無い |
| CASまたは二重処理防止 | ⚠️ 部分的。DB列レベルのフェンシングトークン（Apple失効再試行の`claimId`相当）は無い。ただし`upsertSubscriptionEntitlement`のupsert＋順序逆転ガードにより、同一イベントが二重に適用されてもデータ破損はしない（冪等）。真に同時実行するCron同士が同一行を重複処理した場合の無駄なREST呼び出しは未対策 |
| Cron間隔 | ❌ 未設定。`wrangler.toml`の`[triggers]`自体、本番・staging問わずまだ追加していない（既存のApple失効再試行と同じ状態） |
| 1回の処理上限 | ✅ 実装済み。`limit`パラメータ（既定50件）で1バッチあたりの処理件数を制御 |
| internal API用Secretの分離 | ❌ 未分離。既存の`/internal/apple-revocation/retry-batch`と同じ`INGEST_TOKEN`を流用している（専用シークレットは無い） |
| staging Cron/DBの分離 | ⚠️ 準備のみ。`wrangler.toml`に`[env.staging]`のscaffoldingはあるが、Cron Trigger自体（本番・staging問わず）はまだ設定・デプロイしていない |

上記のうちretryCount・nextRetryAt・指数バックオフ・最大試行回数・failed_permanent・CAS・internal API Secret分離は、Apple失効再試行（`appleRevocationRetryRepository.ts`・`appleRevocationBackoff.ts`）に既にある仕組みと同等のものが無く、意図的に単純化した設計のまま残っている。個人開発規模のイベント量では実害が出にくいと判断しているが、本番の課金運用を継続する上ではいずれ同等の仕組みが必要になる可能性が高い。

**4. TRANSFER追加テスト**（`tests/revenuecatEventRetry.test.ts`、`tests/billingWebhook.test.ts`）
- A→B再照合成功／REST一時失敗後のCron成功／移行元のみ未知／移行先のみ未知／同一イベントへの2回連続Cron実行が二重反映しないこと／順序逆転ガード、の6件を追加
- 「最大再試行回数超過」のテストは**追加していない**（上記の通りこの機能自体が未実装のため、テストしようがない）

**テスト結果**: バックエンド398 tests（新規6件+既存1件へのアサーション追加）、typecheckクリーン、空DB・0016→0017移行の両方を再検証済み。

---

## 20. G4-5ステップ3: RevenueCat外部設定・ステージング環境構築（2026-08-03、実施済み）

App Store Connect側の事前確認（16章・17章）完了後、実際にRevenueCat・Cloudflare・Turso側の外部設定を実施した。

**RevenueCatダッシュボード側（完了）**
- Project「CardHub」（Project ID: `proj55666d03`）作成済み（※同一アカウント内に無関係な別プロジェクト「Bakushi Log」が存在するため、作業時は必ずプロジェクト選択を確認すること）
- App「CardHub (App Store)」登録済み（Bundle ID: `com.cardhub.mobile`）
- Entitlement `premium`、Offering `default`（`$rc_monthly`/`$rc_lifetime`）、実Apple商品（`cardhub_premium_monthly`/`cardhub_premium_lifetime`）の紐付け確認済み
- Public (SDK) API Key・Secret API Key（V1、`GET /v1/subscribers`用）発行済み
- Webhook「CardHub Staging」登録済み: URL・Authorization header・HMAC signing有効化・配信対象「Sandbox only」

**Turso DB（新規作成）**
- CardHub用の本番DBはまだ存在しないため、まずステージング専用DB `cardhub-staging` を新規作成し、既存マイグレーションを適用
- 本番DBは未作成のまま（実リリース直前にまとめて作成する方針）

**Cloudflare Workers（新規デプロイ）**
- `wrangler.toml`の`[env.staging]`を使い`x-post-ingest-staging`を初回デプロイ: `https://x-post-ingest-staging.bakushi-log.workers.dev`
- 登録済みSecret（`--env staging`）: `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` / `ENVIRONMENT=development`（後に`preview`→`development`へ変更、詳細は22章）/ `REVENUECAT_SECRET_API_KEY` / `REVENUECAT_MONTHLY_PRODUCT_ID` / `REVENUECAT_LIFETIME_PRODUCT_ID` / `REVENUECAT_WEBHOOK_AUTH_HEADER`（ランダム生成）/ `REVENUECAT_WEBHOOK_HMAC_SECRET`（RevenueCat発行）/ `APPLE_CLIENT_ID`（`com.cardhub.mobile`）/ `JWT_SIGNING_KEY_CURRENT_KID`（`v1`）/ `JWT_SIGNING_KEY_CURRENT_SECRET`（ランダム生成）
- `POST /webhooks/revenuecat`・`POST /auth/apple`とも、Secret未設定時の503ではなく想定通りのバリデーション/認証エラーを返すことを確認済み
- 未登録: `INGEST_TOKEN`・Apple authorizationCode交換用の任意4項目（`APPLE_TEAM_ID`等、.p8鍵発行までは不要）

**モバイル側（`apps/mobile/.env`、gitignore対象）**
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` / `EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID` / `EXPO_PUBLIC_REVENUECAT_LIFETIME_PRODUCT_ID` を設定済み
- `EXPO_PUBLIC_API_BASE_URL`をステージングWorker URL（`https://x-post-ingest-staging.bakushi-log.workers.dev`）へ変更済み

---

## 21. G4-5ステップ4: Webhookスキーマ不具合の発見・修正（2026-08-03）

RevenueCatダッシュボードの「Send a Test Webhook」機能でE2E疎通確認を行ったところ、`POST /webhooks/revenuecat`が422 VALIDATION_ERRORを返す不具合を発見した。

**原因**: `validation/billingSchemas.ts`の`revenueCatWebhookEventSchema`で、`entitlement_id` / `entitlement_ids` / `transaction_id` / `original_transaction_id`が`.optional()`のみ（`.nullable()`無し）だった。RevenueCatは該当イベント種別に存在しないフィールドを「キー省略」ではなく明示的に`null`で送るため、Zodの`.optional()`（`undefined`のみ許容）では拒否されていた。`services/revenuecatWebhookProcessor.ts`側の型（`originalAppUserId?: string | null`等）は元々nullを想定していたため、スキーマ側だけが実態とズレていた。

**影響範囲**: RevenueCatのTESTイベントに限らず、`entitlement_ids`が無い実イベント（対象外プロダクトの通知等）や`transaction_id`/`original_transaction_id`が無いイベントも同様に422で拒否され、RevenueCat側は自動リトライの末に配信を諦める＝premium状態が更新されないままになる、公開前に必ず踏む本番影響のあるバグだった。

**修正**: 該当4フィールド + 他の「Sometimesフィールド」（`original_app_user_id` / `aliases` / `environment` / `event_timestamp_ms` / `product_id` / `period_type` / `purchased_at_ms` / `store` / `ownership_type`）すべてに`.nullable()`を追加。`tests/billingWebhook.test.ts`に回帰テストを1件追加（399 tests全パス、typecheckクリーン）。ステージングへ再デプロイ後、RevenueCatダッシュボードから再度Test Webhookを送信し200 OK・`ignored_unknown_event`を確認した。

## 22. G4-5ステップ5: 実機Sandbox購入テストの実施（2026-08-03、完了）

ユーザー操作（Sandbox Tester作成・実機UDID登録・開発ビルド作成・実機での購入操作）と、Claude側の作業（Worker設定・ビルドコマンド実行・DB検証）を分担して完走した。

1. **Sandbox Tester Apple ID作成**（App Store Connect → Users and Access → Sandbox → Testers）: `tesutowant@gmail.com`（国: 日本）を作成
2. **実機のUDID登録**（`eas device:create` → Webサイト経由でプロビジョニングプロファイルをインストール）: iPhone実機を登録
3. **開発ビルド作成**（`eas build --profile development --platform ios`）: 既存のDistribution証明書・Push Keyを再利用（他プロジェクトと共有、Team単位のリソースのため問題無し）。ビルドID `51054c34-17cc-484a-812a-1be44f2890fd`
4. 実機にインストール後、`expo start --dev-client`でMetro接続 → RevenueCatネイティブモジュールが正常動作することを確認（以前の「Native module (RNPurchases) not found」エラーは、RevenueCat導入前の古いビルドが実機に残っていたことが原因と判明、新ビルドで解消）

### 追加で発覚・修正した設定不備

実機でSign in with Appleがすべて失敗する不具合が発覚。原因は、ステージングの`ENVIRONMENT`を`preview`に設定していたため、`routes/auth.ts`の`STRICT_APPLE_EXCHANGE_ENVIRONMENTS`（`production`/`preview`）に該当し、まだ発行していないApple Sign-In用鍵一式（`APPLE_TEAM_ID`等、authorizationCode交換・失効の任意機能用）が必須化されてしまっていたため。ステージングは実態として開発環境であり、この任意機能の鍵もまだ不要なため、`ENVIRONMENT`を`preview`から`development`へ変更して解決（`STRICT_APPLE_EXCHANGE_ENVIRONMENTS`は`development`/`test`を含まない）。

### Sandbox購入テスト結果（成功）

Sign in with Apple成功後、Paywall画面から月額プラン（¥400）を購入。Sandbox決済シート・生体認証確認を経て購入完了。ステージングDB（`cardhub-staging`）で以下を確認済み:
- `revenuecat_events`: `INITIAL_PURCHASE`イベントを受信し`processing_status = processed`
- `subscription_entitlements`: 該当ユーザーで`premium_active = 1`、`product_id = cardhub_premium_monthly`、`product_type = subscription`、`environment = SANDBOX`

購入直後の即時照合（`source = refresh`）・Webhook受信の両経路とも正しく機能し、「アプリでの購入操作 → RevenueCat → CardHubサーバー → DB反映」の一連のフローが実機で完全に検証できた。テスト用サブスクリプションはSandbox上でキャンセル済み。
