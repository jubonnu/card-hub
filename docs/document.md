Mobile-G4 の計画を条件付きで承認します。

G4-1〜G4-4 を一括実装してください。
各内部フェーズで typecheck・lint・test を通し、
失敗時は修正してから次へ進んでください。

G4-5 の RevenueCat Dashboard、App Store Connect、
Sandbox 購入などの外部操作には進まず、
G4-1〜G4-4 完了時点で停止してください。

==================================================
確定方針
==================================================

-   RevenueCat App User ID は users.publicUserId
-   DB 内部 integer ID は RevenueCat へ渡さない
-   entitlement ID は premium
-   月額と非消耗型買い切りの機能差は設けない
-   購入には CardHub ログイン必須
-   未ログイン状態で購入・復元を許可しない
-   モバイル CustomerInfo は表示用キャッシュ
-   premium API の認可はバックエンドが行う
-   本番 Turso、本番 Worker、RevenueCat 外部設定は今回行わない

==================================================

1. # RevenueCat SDK のユーザーライフサイクル

SDK はアプリ起動中に 1 回だけ configure してください。

使用するキー:

-   EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
-   RevenueCat の public platform-specific SDK key のみ

禁止:

-   RevenueCat Secret API key
-   Webhook secret
-   HMAC signing secret
-   App Store Connect private key
    をモバイルへ置かないこと。

キー未設定時:

-   アプリをクラッシュさせない
-   billingStatus = notConfigured として扱う
-   購入ボタンを無効化
-   開発用の安全な案内を表示
-   公開抽選・無料機能・認証・同期は引き続き利用可能

ログイン成功時:

1. CardHub authStore が signedIn
2. publicUserId を取得
3. Purchases.logIn(publicUserId)
4. RevenueCat の current App User ID を照合
5. 一致後にのみ購入・復元を許可
6. CustomerInfo を取得
7. entitlement 表示キャッシュを更新

ログアウト時:

-   Purchases.logOut()を実行してよい
-   logOut 後に生成される匿名 App User ID を premium 所有者として扱わない
-   CustomerInfo 表示キャッシュを破棄
-   premium UI を即座にロック
-   匿名状態では購入・復元を禁止
-   次の CardHub ユーザーで Purchases.logIn が完了するまで課金操作を許可しない

signOutAllDevices:

-   当該端末では通常 signOut と同じ RevenueCat 処理

deleteAccount:

-   RevenueCat logOut
-   対象 CardHub ユーザーのローカル entitlement キャッシュ削除
-   RevenueCat 顧客削除までは今回行わない
-   アカウント削除後の買い切り再付与は G4-5 判断事項として残す

ユーザー切替:

-   user A の RevenueCat 処理完了前に user B の購入 UI を表示しない
-   sessionGeneration を照合
-   古い CustomerInfo 結果を別ユーザーへ反映しない
-   App User ID 不一致時は購入を拒否

================================================== 2. G4-1 SDK 基盤
==================================================

追加候補:

-   lib/purchases.ts
-   lib/entitlements.ts
-   stores/billingStore.ts
-   schemas/revenueCat.ts
-   types/billing.ts

実装:

-   configure 一度のみ
-   logIn / logOut ラッパー
-   getCustomerInfo
-   getOfferings
-   purchasePackage
-   restorePurchases
-   CustomerInfo listener
-   entitlement premium 判定
-   キャンセルと失敗の分類
-   API キー未設定時の安全な no-op adapter
-   React Native / native module を vitest でモック可能にする adapter 境界

CustomerInfo listener:

-   同じユーザー・同じ sessionGeneration の場合のみ反映
-   premium 表示状態を更新
-   バックエンド権限が確定したとは扱わない

Development Build のネイティブ依存が変わるため、
コード実装後に再ビルドが必要であることを報告してください。
今回は eas build を実行しないでください。

================================================== 3. G4-2 バックエンド premium 基盤
==================================================

追加候補テーブル:

subscription_entitlements:

-   id
-   userId unique
-   entitlementId
-   premiumActive
-   productId
-   productType
-   environment
-   store
-   originalTransactionId
-   purchasedAt
-   expiresAt nullable
-   ownershipType nullable
-   lastRevenueCatEventAt
-   source
-   createdAt
-   updatedAt

revenuecat_events:

-   id
-   revenueCatEventId unique
-   eventType
-   appUserId
-   originalAppUserId nullable
-   aliasesJson
-   environment
-   eventTimestamp
-   payloadHash
-   processingStatus
-   processedAt
-   errorCode nullable
-   createdAt

subscriptions テーブルを追加する場合は、
subscription_entitlements と役割が重複しないようにしてください。

第一候補:

-   subscription_entitlements = 現在の認可状態
-   revenuecat_events = イベント監査・冪等性
-   subscriptions = 履歴や期間管理が本当に必要な場合のみ

不要なら subscriptions テーブルを無理に追加しないでください。

================================================== 4. Webhook
==================================================

API:

-   POST /webhooks/revenuecat

認証:

-   RevenueCat Dashboard で設定した Authorization header を検証
-   可能なら X-RevenueCat-Webhook-Signature の HMAC-SHA256 も検証
-   HMAC は JSON parse 前の raw body に対して検証
-   timestamp 許容差を設ける
-   constant-time 比較を使用
-   Secret をログへ出さない

冪等性:

-   event.id を unique
-   同じ event.id の再送は 200
-   同じ event.id で異なる payloadHash は要調査扱い
-   RevenueCat の Sometimes フィールドは optional として解析
-   app_user_id だけでなく original_app_user_id と aliases も考慮
-   publicUserId 形式に一致する CardHub ユーザーのみ関連付け
-   未知ユーザーを勝手に作成しない

処理:

-   entitlement_ids に premium が含まれるか確認
-   INITIAL_PURCHASE
-   RENEWAL
-   NON_RENEWING_PURCHASE
-   CANCELLATION
-   EXPIRATION
-   BILLING_ISSUE
-   UNCANCELLATION
-   PRODUCT_CHANGE
-   TRANSFER
-   REFUND 相当
    など、現在利用する RevenueCat イベントを明示的に分類

不明イベント:

-   200 で受領し監査記録
-   premium 状態を勝手に変更しない

レスポンス:

-   RevenueCat の再送を不要にするため迅速に 200 を返す構造を検討
-   今回キュー基盤を追加しない場合は、
    同期処理を短時間・トランザクション内に限定
-   失敗時の再処理方法を文書化

================================================== 5. 購入直後の即時照合
==================================================

Webhook 到達だけを待たないでください。

追加 API 第一候補:

-   POST /me/entitlements/refresh
-   GET /me/entitlements

POST /me/entitlements/refresh:

-   CardHub 認証必須
-   認証ユーザーの publicUserId のみ使用
-   リクエスト本文から任意 App User ID を受け取らない
-   バックエンドから RevenueCat REST API へ照会
-   premium entitlement の現在状態を検証
-   subscription_entitlements を更新
-   照会結果を返す
-   RevenueCat Secret API key は Worker Secret のみ
-   モバイルへ返さない
-   timeout、429、5xx を適切に分類
-   短時間の連続呼び出しを抑止

GET /me/entitlements:

-   subscription_entitlements のサーバー確定状態を返す
-   premiumActive
-   productType
-   expiresAt
-   lastVerifiedAt
-   stale 判定用情報
-   RevenueCat 生レスポンスを返さない

購入成功後:

1. CustomerInfo で画面を「購入確認中」に更新
2. POST /me/entitlements/refresh
3. premiumActive=true 確認後に premium API を解放
4. 照合が一時失敗なら購入失敗とは表示しない
5. 「購入済み・確認中」と表示して再試行可能にする

復元成功後も同じ流れにしてください。

今回 RevenueCat Secret API key が未設定の場合:

-   refresh API は 503 BILLING_NOT_CONFIGURED
-   公開 API や既存認証 API へ影響させない
-   テストでは RevenueCat API client をモック

================================================== 6. requirePremium
==================================================

追加:

-   requirePremium middleware

判定:

-   認証済み userId
-   subscription_entitlements.premiumActive = true
-   必要なら lastVerifiedAt の stale 方針を定義

未加入:

-   403 PREMIUM_REQUIRED

課金基盤未設定:

-   503 BILLING_NOT_CONFIGURED
    または既存 premium 状態の参照だけ可能にするかを設計して報告

重要:

-   クライアントの CustomerInfo
-   リクエスト本文の premium=true
-   RevenueCat entitlement の自己申告
    を信頼しない

今回まだ統計 API へ接続しない場合、
requirePremium 自体とテスト用保護ルートまたは service 単体テストまででよいです。
既存無料機能を premium 化しないでください。

================================================== 7. G4-3 購入・復元 UI
==================================================

追加候補:

-   app/paywall.tsx
-   components/billing/PremiumStatus.tsx
-   components/billing/PurchaseButton.tsx
-   components/billing/RestorePurchasesButton.tsx

表示:

-   月額
-   買い切り
-   同一 premium 機能を解放すること
-   実際のストア価格・通貨
-   月額の自動更新説明
-   購入復元
-   利用規約
-   プライバシーポリシー
-   サブスクリプション管理への導線

価格:

-   RevenueCat Package/StoreProduct から取得
-   仮のハードコード価格を表示しない

状態:

-   notConfigured
-   signedOut
-   loadingOfferings
-   ready
-   purchasing
-   purchasePendingVerification
-   premium
-   restoring
-   cancelled
-   failed
-   offlineCached
-   serverVerificationFailed

キャンセル:

-   通常のユーザー操作として扱う
-   エラー警告を出しすぎない

購入ボタン:

-   多重タップ防止
-   signedIn かつ RevenueCat App User ID 一致時のみ有効
-   Offerings に対象 Package が無ければ無効
-   purchase 完了後に即時照合 API を呼ぶ

復元:

-   必ずユーザー操作で実行できる導線を用意
-   signedIn 時のみ
-   restore 後に即時照合
-   他 CardHub アカウント所有の場合のエラーを安全に表示
-   元アカウントの publicUserId 等を漏らさない

================================================== 8. G4-4 entitlement 結合
==================================================

billingStore:

-   RevenueCat 表示状態
-   サーバー確定状態
    を別フィールドで保持してください。

例:

-   localEntitlementActive
-   serverPremiumActive
-   verificationStatus
-   lastVerifiedAt

premium 表示:

-   SDK キャッシュが active でサーバー未確認:
    「購入済み・確認中」
-   サーバー premiumActive=true:
    正式 premium
-   SDK キャッシュのみでサーバーが false:
    不整合として再照合
-   オフライン:
    直近の表示キャッシュは表示可能
    premium API の認可成功を保証しない

アプリ起動:

-   signedIn 後に Purchases.logIn
-   CustomerInfo 取得
-   GET /me/entitlements
-   必要時 POST /me/entitlements/refresh
-   sessionGeneration 不一致の結果を破棄

ログアウト:

-   billingStore を即時リセット
-   古い CustomerInfo listener の結果を無視
-   premium 画面を guest へ漏らさない

================================================== 9. Transfer Behavior
==================================================

G4-1〜G4-4 ではコードを特定の Transfer Behavior へ依存させないでください。

G4-5 で以下を Sandbox 検証して最終決定します。

候補:

-   Transfer to new App User ID
-   Keep with original App User ID

必須テスト:

-   user A が月額購入
-   A ログアウト、user B ログイン
-   B が復元
-   B が同じ商品を購入しようとする
-   A へ再ログイン
-   月額有効中
-   月額失効後
-   買い切り購入済み
-   アカウント削除後の復元
-   同一 Apple Account・異なる CardHub アカウント

現時点では
「Keep with original App User ID」を確定値にしないでください。

================================================== 10. Family Sharing
==================================================

今回は無効を第一候補としてください。

理由:

-   CardHub アカウントと Apple 家族メンバーの対応が複雑
-   entitlement 移動・共有のテスト範囲が増える
-   一度有効化すると戻せない可能性がある

G4-5 で明示的にユーザー承認を得るまで有効化しないでください。

================================================== 11. テスト
==================================================

モバイル:

-   SDK キー未設定
-   configure 一度のみ
-   logIn 成功・失敗
-   publicUserId 一致確認
-   user A→guest→user B
-   古い CustomerInfo 結果破棄
-   signedOut 購入拒否
-   Offerings 取得
-   月額購入成功
-   買い切り購入成功
-   ユーザーキャンセル
-   Store 失敗
-   復元成功・失敗
-   購入後 server refresh 成功
-   購入後 server refresh 一時失敗
-   offline cached 表示
-   多重購入防止
-   ログアウト時 billingStore リセット

バックエンド:

-   Webhook Authorization 不正
-   HMAC 不正
-   timestamp 期限切れ
-   raw body 署名成功
-   event.id 冪等
-   payloadHash 不一致
-   optional field 欠落
-   未知イベント
-   未知 App User ID
-   aliases/original_app_user_id 解決
-   premium 付与
-   renewal
-   expiration
-   refund
-   transfer
-   entitlement refresh 正常
-   RevenueCat API 401/429/5xx/timeout
-   他ユーザー照会不可
-   requirePremium 成功
-   PREMIUM_REQUIRED
-   BILLING_NOT_CONFIGURED
-   既存公開 API 回帰

================================================== 12. 実行範囲
==================================================

今回実装してよい:

-   G4-1 SDK コード・adapter
-   react-native-purchases 依存追加
-   G4-2 DB・Webhook・premium 基盤
-   G4-3 Paywall コード
-   G4-4 entitlement 結合
-   マイグレーション
-   テスト
-   ドキュメント
-   app.json の必要最小限変更

今回実行しない:

-   RevenueCat プロジェクト作成
-   App Store Connect 商品作成
-   Entitlement/Offering 作成
-   RevenueCat public/secret key の実設定
-   Webhook 外部設定
-   eas build
-   本番 Turso
-   production Worker
-   Sandbox 購入
-   TestFlight
-   App Store 提出
-   Family Sharing 有効化

================================================== 13. 完了報告
==================================================

1. 変更ファイル一覧
2. RevenueCat adapter
3. SDK configure 方式
4. App User ID 配線
5. ログアウト・ユーザー切替
6. billingStore
7. Paywall
8. 購入
9. 復元
10. CustomerInfo 表示状態
11. subscription_entitlements
12. revenuecat_events
13. subscriptions テーブル採否
14. Webhook 認証
15. HMAC 検証
16. event 冪等性
17. entitlement refresh API
18. requirePremium
19. 購入直後の確認フロー
20. Transfer Behavior 非依存性
21. 全テスト結果
22. typecheck/lint/expo-doctor
23. 既存機能回帰
24. G4-1〜G4-4 を完了扱いにできるか
25. G4-5 開始前 Blocker
26. ユーザー判断が必要な項目
27. 残るリスク

完了後に停止してください。
G4-5、外部サービス操作、本番適用、EAS Build には進まないでください。
