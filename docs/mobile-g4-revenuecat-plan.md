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

- **`failed_retryable`イベントの自動再処理が未実装**: Secret API Key未設定時・RevenueCat REST APIの一時失敗時、Webhookイベントは`revenuecat_events.processingStatus = 'failed_retryable'`として記録されるのみで、これを拾い直して再照合する仕組み（cron等）が存在しない。現状は手動でのDBクエリ・再送トリガーに依存する。**本番リリース前に実装が必要**。
- RevenueCatダッシュボードの実際のHMAC署名仕様（ヘッダ名・タイムスタンプ付き署名形式）が公式ドキュメント記載通りか、G4-5で実際のWebhook送信を見て確認が必要。
- TRANSFERイベントの`transferred_from`/`transferred_to`の実際のフィールド名・型がRevenueCatの本番Webhookペイロードと一致するか、G4-5で確認が必要。

---

**本計画に基づき、コード変更・DB変更・外部サービス操作のいずれも未実施です。ここで停止します。**
