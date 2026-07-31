# Mobile-G3: モバイル側認証・同期クライアント 実装計画

ステータス: **G3-1〜G3-4は正式完了（2026-07-31、ユーザー承認済み）。G3-5は計画確認中（未実行、26章）。**（詳細は23・24・25・26章）
前提: Mobile-G2A（認証基盤）・Mobile-G2B（ユーザーデータ同期基盤、G2B-Hardening含む）は正式完了。本計画はバックエンド（`x-post-fetcher`）が提供する既存API（`/auth/*`, `/me/*`）をモバイルアプリ（`apps/mobile`）から利用するクライアント側実装を対象とする。

本番Turso適用・EAS login/init/build・RevenueCat導入・課金・統計・Apple Developer Portal操作・App Store Connect操作は**未実施**（22章のBlockerの通り。G3-5、またはユーザー承認後の別ステップで対応）。

対象リポジトリ: `CardHub`（`apps/mobile`のみ）。`x-post-fetcher`側の変更は無い。

**未実行**: 本番Tursoマイグレーション、Apple Developer Portal操作、`.p8`鍵発行、EAS login/init/build、RevenueCat導入、課金、統計、TestFlight、App Store Connect操作。

---

## 1. 変更予定ファイル

新規:
```
apps/mobile/stores/authStore.ts
apps/mobile/lib/secureStore.ts          # expo-secure-store の薄いラッパー
apps/mobile/lib/authApiClient.ts        # /auth/*, /me 系エンドポイント呼び出し
apps/mobile/lib/tokenRefresh.ts         # 同時Refresh一本化ロジック
apps/mobile/lib/deviceId.ts             # 端末固有deviceId（refresh_tokens.deviceId用）の生成・永続化
apps/mobile/lib/syncClient.ts           # /me/lotteries, /me/favorites, /me/followed-products,
                                         # /me/checklists, /me/notification-preferences,
                                         # /me/sync/bootstrap のクライアント
apps/mobile/lib/offlineQueue.ts         # オフライン操作キュー（永続化・再送）
apps/mobile/lib/clientRequestId.ts      # UUIDv4生成（各操作のclientRequestId）
apps/mobile/schemas/authApi.ts          # /auth/*, /me/* のレスポンスZodスキーマ
apps/mobile/schemas/syncApi.ts          # 同期API系のレスポンスZodスキーマ
apps/mobile/components/auth/SignInWithAppleButton.tsx
apps/mobile/components/auth/SyncConflictBanner.tsx
apps/mobile/app/(auth)/sign-in.tsx      # 未ログイン時の入口画面（expo-router group）
```

変更:
```
apps/mobile/app/_layout.tsx             # authStoreの初期化・セッション復元・未ログイン時のルーティング分岐
apps/mobile/lib/apiClient.ts            # Authorizationヘッダ付与・401時Refresh・リトライの共通化
apps/mobile/stores/myLotteriesStore.ts  # サーバー同期対応、ストレージキーのアカウント別namespace化
apps/mobile/stores/favoritesStore.ts    # 同上（followedProductKeys→publicProductId移行含む）
apps/mobile/stores/checklistStore.ts    # 同上（stepId・サーバーのserverVersion対応）
apps/mobile/stores/notificationSettingsStore.ts # 同上（serverVersion対応）
apps/mobile/package.json                # expo-secure-store, expo-apple-authentication, expo-dev-client 追加
apps/mobile/app.json                    # expo-apple-authentication plugin, usesAppleSignIn設定
```

設定のみ（提示・未作成）:
```
apps/mobile/eas.json                    # 案のみ提示（18章）、実ファイル作成・EAS実行はしない
```

---

## 2. 認証状態モデル

```ts
export type AuthStatus = 'initializing' | 'signedOut' | 'signedIn';

interface AuthUser {
  publicUserId: string;
  displayName: string | null;
  email: string | null;
  accountStatus: 'active' | 'pending_deletion' | 'deleted';
  scheduledDeletionAt: string | null;
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;      // メモリ保持のみ、永続化しない
  accessTokenExpiresAt: number | null; // epoch ms、事前リフレッシュ判定用
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  signOutAllDevices: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}
```

- `initializing`: 起動直後、SecureStoreからのRefresh Token読み出し・検証中
- `signedOut`: Refresh Tokenが無い/無効。未ログインローカルデータの利用は可能（G1〜G2Bのローカル動作を維持）
- `signedIn`: 有効なセッションあり
- `accessToken`はzustand storeの状態としてはメモリ上のみ保持（`persist`ミドルウェアは`accessToken`を`partialize`で除外し、`user`（表示用の非機微情報）のみ永続化する。3章参照）

---

## 3. SecureStoreへ保存する値

`expo-secure-store`（iOS Keychain / Android Keystore）に保存する値は**Refresh Tokenのみ**:

| キー | 値 | 備考 |
|---|---|---|
| `cardhub.refreshToken` | Refresh Token（生値） | サーバーはハッシュのみ保持、クライアント側の生値保存はSecureStoreに限定する |
| `cardhub.refreshTokenDeviceId` | 発行時に使ったdeviceId | ローテーション・ログアウトAPI呼び出し時に一致確認が必要なため一緒に保持する |

Access Tokenは**SecureStoreにもAsyncStorageにも保存しない**（15分の短寿命、メモリのみ。アプリ再起動時は必ずRefresh Tokenから再取得する）。

---

## 4. AsyncStorageへ保存する値

| ストア/キー | 値 | 理由 |
|---|---|---|
| `authStore`の`persist`（`cardhub-auth`） | `user`（`publicUserId`/`displayName`/`email`/`accountStatus`のみ、非機微） | 起動直後、Refresh Token検証が終わる前に楽観的にユーザー名等を表示するため |
| `cardhub.deviceId` | 端末固有UUIDv4 | `refresh_tokens.deviceId`用。初回生成後は不変（再インストールで変わるのは許容、G2Aの設計通り） |
| `cardhub.bootstrapped.<publicUserId>` | boolean | 12章の初回bootstrap同期を1回だけ実行するためのフラグ |
| `cardhub.offlineQueue` | オフライン操作キュー本体（14章） | 通信不可時も操作を失わないため |
| 既存の各ストア（`cardhub-my-lotteries-v2`等） | ローカルキャッシュ | 11章の通りアカウント別namespace化する |

---

## 5. Access Token更新フロー

```
API呼び出し
  → Authorization: Bearer <accessToken> を付与して送信
  → 401 TOKEN_EXPIRED / 401 UNAUTHORIZED を受信
  → tokenRefresh.ts の refreshAccessToken() を呼ぶ（6章で同時実行を一本化）
  → 成功: 新accessTokenで元のリクエストを1回だけ再試行
  → 失敗（Refresh Token自体が無効・再利用検知等）: signOut() を呼び、signedOut状態へ遷移
```

`accessTokenExpiresAt`を使い、有効期限の**1分前**になったら次のAPI呼び出し前に先回りしてRefreshする（後述する401駆動の受動的リフレッシュと併用。先回りリフレッシュにより通常操作で401を踏む頻度を下げるが、401駆動側を主たる安全網として必ず残す）。

**リトライは1回のみ**（無限リトライ・リトライの多重化を防ぐ。2回目のRefreshで得たAccess Tokenでも401になった場合はそのままエラーを呼び出し元に返す）。

---

## 6. 同時Refresh制御

複数のAPI呼び出しがほぼ同時に401を受けた場合、Refresh Token交換を1回だけ実行し、他の呼び出しはその1回のPromiseを共有して待つ。

```ts
// tokenRefresh.ts
let inFlightRefresh: Promise<string> | null = null;

export async function refreshAccessToken(): Promise<string> {
  if (inFlightRefresh) return inFlightRefresh; // 既に進行中ならそれに相乗りする

  inFlightRefresh = (async () => {
    try {
      const refreshToken = await getRefreshTokenFromSecureStore();
      const deviceId = await getDeviceId();
      const result = await callAuthRefresh(refreshToken, deviceId); // POST /auth/refresh
      await saveRefreshToken(result.refreshToken, deviceId); // ローテーション後の新トークンを保存
      authStore.setState({ accessToken: result.accessToken, accessTokenExpiresAt: Date.now() + result.expiresIn * 1000 });
      return result.accessToken;
    } catch (e) {
      await handleRefreshFailure(e); // 401 UNAUTHORIZED / TOKEN_EXPIRED → signOut()
      throw e;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}
```

`/auth/refresh`はG2A実装で**Refresh Tokenローテーション+再利用検知**を持つため、同時に2つのAPI呼び出しが401を検知しても、上記の一本化により実際にサーバーへ送るRefreshリクエストは1回だけになる（G2Aサーバー側の「同時ローテーション競合」自体はモバイル側のこの一本化により通常発生しなくなるが、複数端末を使うケース等でサーバー側の排他制御は引き続き必要、既存のまま）。

---

## 7. アプリ起動時のセッション復元

```
_layout.tsx マウント時:
1. status = 'initializing'
2. AsyncStorageから user（表示用キャッシュ）を読み出し、あれば楽観的にUIへ反映（ちらつき防止）
3. SecureStoreから refreshToken + deviceId を読み出す
4. 無ければ status = 'signedOut' で確定
5. あれば /auth/refresh を1回呼び、
   - 成功: accessToken取得 → GET /me でユーザー情報を再取得 → status = 'signedIn'
   - 失敗（401等）: SecureStoreをクリア → status = 'signedOut'
```

起動のたびにRefreshする設計を採る（Access Tokenをどこにも永続化しないため。Refresh Token自体のローテーションにより、起動ごとに新しいRefresh Tokenが発行される点に留意——オフライン起動時は5.の`accessTokenExpiresAt`判定より前にそもそもネットワーク要求が必要になるため、**オフライン起動時は直前のキャッシュ表示のみ行い、書き込み系操作はオフラインキュー（14章）へ積む**設計とする）。

---

## 8. Sign in with Appleフロー

```
1. expo-apple-authentication の AppleAuthentication.signInAsync() を呼ぶ
   - requestedScopes: [FULL_NAME, EMAIL]
   - nonce: クライアント側で生成したrawNonceのSHA256ハッシュを渡す（Appleの作法）
2. 戻り値から identityToken, authorizationCode, user(初回のみ氏名/メール) を取得
3. POST /auth/apple へ { identityToken, authorizationCode, rawNonce, deviceId } を送信
   （rawNonceは生値をサーバーへ渡し、サーバー側でidentityToken内のnonceクレームと突合する。
   G2A実装済みの検証ロジックとの対応は9章）
4. レスポンスの accessToken/refreshToken/user を受け取り、SecureStore保存 + authStore更新
5. 初回ログイン判定（12章）→ 必要ならbootstrap同期を実行
```

---

## 9. authorizationCode / identityToken / nonceの扱い

| 値 | 生成場所 | 送信 | 保存 |
|---|---|---|---|
| `rawNonce` | クライアント（`expo-crypto`等で暗号学的乱数） | サーバーへ生値のまま送信 | 送信後は破棄（再利用しない、Apple認可リクエストのnonceパラメータにはこの値のSHA256ハッシュを渡す） |
| `identityToken` | Apple（JWT） | サーバーへそのまま送信 | 送信後は破棄。ローカルに保存・ログ出力しない |
| `authorizationCode` | Apple（単発利用コード） | サーバーへそのまま送信（サーバー側でApple `/auth/token`と交換、G2A-Hardening実装済み） | 送信後は破棄。**再利用不可のため保持する意味が無い** |

3つとも「その場で送って終わり」の一過性値として扱い、`console.log`・クラッシュレポート（Sentry等、未導入）へ含めないことをコードレビュー観点として明記する。

---

## 10. ログアウト時のローカルデータ処理

`signOut()`:
1. `POST /auth/logout`（自端末のRefresh Tokenのみ失効）を呼ぶ（失敗しても以降は継続、ベストエフォート）
2. SecureStoreの`refreshToken`/`refreshTokenDeviceId`を削除
3. `authStore`を`signedOut`・`user=null`・`accessToken=null`にリセット
4. **ローカルの各ストア（自分の抽選・お気に入り・チェックリスト・通知設定）は削除しない**。11章のアカウント別namespaceにより、ログアウト後は「アカウント未紐付けの一時領域」に自動的に切り替わる（サインアウト＝データ消去ではないという現行ローカル運用の体験を壊さないため。次に別アカウントでログインした場合の混在防止は11章で担保する）

`signOutAllDevices()`: `POST /auth/logout-all`を呼び、以降は`signOut()`と同じローカル処理。

---

## 11. アカウント切替時のデータ分離

現状の各ストアは固定キー（`cardhub-my-lotteries-v2`等）のため、端末Aでユーザー甲がログインして同期したデータの上に、同一端末で別ユーザー乙がログインすると混在するリスクがある。

**方針**: 各`persist`ストアのキーを`"<元のキー>::" + (publicUserId ?? 'guest')`へ変更する。

- 未ログイン時（`guest`）: 現行通りローカルのみで完結
- ログイン成功時: `guest`名前空間のデータを一度だけ読み取り、12章のbootstrap同期へ渡した後、当該ユーザーの名前空間（`::<publicUserId>`）へ切り替える。`guest`名前空間は同期成功後にクリアする
- 別アカウントでログイン: 既存の`::<publicUserId>`名前空間があればそれをそのまま使う（サーバーから取得し直す）、無ければ新規に空の状態から開始する
- ログアウト: 名前空間はそのまま保持（再ログイン時に復元される）。物理削除するのはサインイン中に明示的に「アカウント削除」した場合のみ（17章）

Zustandの`persist`は`name`オプションが動的に変更できないため、実装は「ストアのcreate自体をuserId変更時に再構築する」か「storage実装側でキーにprefixを注入する」かの技術選定が必要（19章のテスト計画で両案を比較検証する）。

---

## 12. 初回bootstrap同期

```
ログイン成功後（初回ログイン・再インストール後の初回ログイン含む）:
1. AsyncStorageの cardhub.bootstrapped.<publicUserId> を確認
2. 既にtrueなら何もしない（通常の差分同期13章へ）
3. false/未設定なら:
   a. guest名前空間のローカルストアから未送信データを収集
      - myLotteriesStore → userLotteries[]（lotteryId, status, savedAt, snapshot）
      - favoritesStore.favoriteLotteryIds → favorites[]
      - favoritesStore.followedProductKeys → **productKeyのままでは送れないため11-2章の移行方針が必要**
      - checklistStore.groups → checklistSteps[]
      - notificationSettingsStore → notificationPreferences
   b. 各アイテムにclientRequestId（UUIDv4）を新規採番する
   c. POST /me/sync/bootstrap（batchClientRequestIdも新規採番）
   d. レスポンスのserverStateで対象ストアを丸ごと置き換える
   e. cardhub.bootstrapped.<publicUserId> = true を保存
   f. guest名前空間のストアをクリアする
```

**`followedProductKeys`（文字列）→`publicProductId`の移行方針（要ユーザー判断、21章）**: G2B-1の商品マスタは`normalizedProductName`から`resolveProductId`で解決されるため、ローカルの`productKey`文字列（≒`normalizedProductName`相当）をそのまま`POST /me/followed-products`へ送ることはできない（APIは`publicProductId`を要求する）。案:
- (a) bootstrap専用に「productKey文字列→publicProductId解決」を行う軽量な内部APIをバックエンドへ追加する（G3の前提としてバックエンド側の小さな追加作業が発生、**要ユーザー判断**）
- (b) 該当する`lotteries`の`normalizedProductName`が一致する`products`行を、G2B-1バックフィル結果から間接的に特定できる場合はそれを使う（`GET /lotteries`のレスポンスに商品情報が無いため、現状のAPIだけでは解決不可）
- (c) 移行を諦め、フォロー中商品は「一度だけ再フォローをお願いする」ダイアログを出す（バックエンド変更なしで完結する最も保守的な案）

本計画では(c)を暫定の第一候補とし、(a)の要否をユーザー判断事項とする。

---

## 13. 通常時の差分同期

G2Bバックエンドには「変更分のみ取得する」ためのdelta/cursor APIが無いため、以下の**フル再取得＋比較**方式を採る（将来の差分APIはG2Bのスコープ外、残課題として記録）:

- アプリのフォアグラウンド復帰時・Pull-to-Refresh時に、`GET /me/lotteries`・`GET /me/favorites`・`GET /me/followed-products`・`GET /me/notification-preferences`を呼び、`serverVersion`が変わっている行のみローカルへ反映する
- チェックリストは開いている抽選の分のみ`GET /me/checklists/:lotteryId`を呼ぶ（全抽選分を毎回取得しない）
- ローカルで未送信の変更がある行は、フェッチ結果で単純に上書きせず、14章のオフラインキュー処理を先に完了させてから反映する

---

## 14. オフライン操作キュー

```ts
interface QueuedOperation {
  id: string;              // = clientRequestId（作成時に採番、送信時に使い回す）
  kind: 'lottery.put' | 'lottery.patch' | 'lottery.delete'
      | 'favorite.put' | 'favorite.delete'
      | 'followedProduct.put' | 'followedProduct.delete'
      | 'checklist.put'
      | 'notificationPreferences.put';
  resourceKey: string;     // lotteryId / publicProductId 等
  payload: unknown;
  expectedServerVersion?: number;
  createdAt: string;       // ISO8601、15章のTTL判定に使う
  attempts: number;
}
```

- 操作は**作成時点**でキューへ積み、`clientRequestId`もこの時点で採番する（送信のたびに新しいIDを振らない。再送時も同じIDを使うことで、G2B-Hardeningの冪等性台帳が正しく機能する）
- オンライン復帰・アプリ復帰時にキューを**古い順（FIFO）**に1件ずつ送信する（同一リソースへの操作が入れ替わらないようにするため、リソース単位の並列化はしない。将来的な最適化は残課題）
- 成功: キューから除去。`VERSION_CONFLICT`（409）: 16章のUIへ委ね、キューからは除去（古い`expectedServerVersion`のまま再送し続けても解決しないため）。`IDEMPOTENCY_CONFLICT`（409、通常発生しないはずだが防御的に）: キューから除去しログに記録、UIへは汎用エラーとして通知
- ネットワークエラー: キューに残したまま次回接続時に再試行（`attempts`をインクリメント、上限は設けるが本計画では上限値そのものはユーザー判断事項とする）

---

## 15. idempotency_records保持期間との整合

G2B-Hardeningの`idempotency_records`保持期間は暫定14日（未確定、削除バッチも未実装）。オフラインキュー（14章）の操作が14日を超えて未送信のまま残る可能性は理論上あるため、以下を設計指針とする（削除バッチ実装時期と合わせて最終決定、21章の判断事項）:

- キュー内の各操作に`createdAt`を持たせ、送信前に「保持期間の目安（例: 14日）を大きく超えていないか」を確認する
- 超えている場合、**盲目的に再送しない**。該当リソースの現在状態をGETで取得し直し、ユーザーに「長期間オフラインだったため最新状態を確認してください」と促すフローへ切り替える（16章の競合UIと合流させる）
- サーバー側で保持期間が確定し削除バッチが有効化された段階で、この閾値をサーバー側の実際の値と一致させる

---

## 16. 409競合時のUI

| 状況 | UI |
|---|---|
| `VERSION_CONFLICT`（自分の抽選・チェックリスト） | 軽量なトースト/バナー「他の端末で更新されています。最新の状態を表示します」→ レスポンスの`current`でローカルを即座に上書き。ユーザー操作は再度やり直してもらう |
| `VERSION_CONFLICT`（通知設定） | G2B計画通り自動マージしない。「他の端末で通知設定が変更されています」ダイアログ＋現在のサーバー値を表示し、ユーザーに選択させる（上書き保存 or 破棄） |
| `IDEMPOTENCY_CONFLICT` | 通常発生しない防御的ケース。汎用エラートースト「操作を反映できませんでした。もう一度お試しください」＋ログ記録 |
| 初回同期(`POST /me/sync/bootstrap`)の`conflicts`配列 | 「サーバーに既存のデータがあったため一部の項目は反映されませんでした」という要約バナー＋詳細は設定画面等で確認可能にする（詳細UIの実装粒度は19章のテスト計画と合わせてG3内で調整） |

---

## 17. アカウント削除フロー

```
1. 確認ダイアログ（誤操作対策、二段階確認）
2. DELETE /me を呼ぶ → scheduledDeletionAt を受け取る
3. 「◯月◯日に削除されます。それまでは再ログインで取り消せます」という案内画面を表示
4. authStoreを signOut() 相当の状態にする（accountStatus='pending_deletion'はGET /meで確認可能なため、
   再ログイン時にサーバー側の状態をそのままUIへ反映する。取り消しAPI自体はG2A/G2Bの範囲外——
   現状「取り消し」専用APIは無く、再ログインのみが猶予期間中の唯一の操作)
5. ローカルデータの扱いは10章のログアウトと同じ（削除しない、名前空間は維持）
```

---

## 18. Development Build移行手順（設計のみ・実行しない）

現状`apps/mobile`はExpo Go互換（ネイティブモジュール追加なし）。`expo-apple-authentication`・`expo-secure-store`はネイティブコードを含むため、Expo Goでは動作せずDevelopment Buildが必須になる。

**提示のみ（実行しない）**:
1. 依存追加: `expo-secure-store`, `expo-apple-authentication`, `expo-dev-client`
2. `app.json`へ`expo-apple-authentication`プラグインと`ios.usesAppleSignIn: true`を追加
3. `eas.json`案（作成しない、内容の提示のみ）:
   ```json
   {
     "build": {
       "development": { "developmentClient": true, "distribution": "internal" },
       "preview": { "distribution": "internal" },
       "production": {}
     }
   }
   ```
4. 実機テストの前提として、Apple Developer Portalでの`com.cardhub.mobile`向けSign in with Apple Capability有効化・Services ID作成が必要（22章のBlocker）
5. `eas login` / `eas build:configure` / `eas build --profile development`は本計画では**実行しない**（ユーザー確認後の別ステップ）

---

## 19. テスト計画

既存`vitest`環境（`apps/mobile/package.json`に`test`スクリプト有）を使う。実機・Development Build不要な範囲を最大化する。

- **authStore**: 状態遷移（initializing→signedIn/signedOut）、`user`のみが永続化され`accessToken`が永続化されないことの検証
- **tokenRefresh**: 同時に3つのAPI呼び出しが401を検知した場合、`/auth/refresh`相当のモック呼び出しが1回だけ発生すること
- **apiClient**: 401→refresh→リトライが1回のみで完結し、2回目も401ならエラーを返すこと
- **secureStore/deviceId**: モック経由でRefresh Token保存・削除・読み出し
- **offlineQueue**: FIFO順序、成功時の除去、ネットワークエラー時の残存、`attempts`カウント、TTL超過時の分岐（15章）
- **アカウント別namespace（11章）**: guest→初回ログインでの名前空間切り替え、ログアウト→再ログインでのデータ復元、別アカウントでの非混在
- **syncClient**: `POST /me/sync/bootstrap`のモックレスポンスに対するローカルストア置き換え、`conflicts`のハンドリング
- **Sign in with Apple**: `expo-apple-authentication`はネイティブモジュールのためユニットテストではモック化し、`rawNonce`生成・ハッシュ化ロジックとAPI呼び出しパラメータの組み立てのみを検証する（実機フローの検証はDevelopment Build後、E2Eの範囲外としてG3内の手動テスト項目に位置づける）

---

## 20. フェーズ分割

各完了後にテスト結果を報告し、ユーザー確認を取って停止する運用を提案する（G2A/G2Bと同じ進め方）。

- **G3-1**: 認証コア — `authStore`・SecureStore・`expo-apple-authentication`連携・`apiClient`のAuthorization付与/401リフレッシュ/リトライ/同時Refresh一本化・起動時セッション復元。**正式完了（2026-07-31、23章）**
- **G3-2**: ログアウト・全端末ログアウト・アカウント削除・11章のアカウント別データ分離。**正式完了（2026-07-31、25章）**
- **G3-3**: 同期クライアント — bootstrap同期・通常差分同期・409競合UI。**正式完了（2026-07-31、25章）**。Pull-to-Refresh UIは未実装（G3完了を妨げない残課題、25章）
- **G3-4**: オフライン操作キュー。基盤（`lib/offlineQueue.ts`・`stores/offlineQueueStore.ts`）は**G3-1と同時に実装済み**。各ストアからのenqueue配線・キュー成功応答の反映も**正式完了（2026-07-31、25章）**
- **G3-5**: Development Build移行の実地適用（`eas.json`作成・依存追加の実行）— ここで初めてユーザー確認の上でEAS関連操作に着手するかを判断する。**計画確認中（未実行、26章）**

---

## 21. ユーザー判断が必要な項目

残る未確定項目は以下のみ（1〜4・6・7は24章でユーザー承認済みのため本章から削除）。

1. 差分同期（13章）を将来的にサーバー側delta APIとして拡張する必要性の有無（G2Bのスコープ外、G4以降の検討事項として記録するか）

決定済み事項は24章を参照。

---

## 22. G3開始前Blocker

| 項目 | 状態 | G3コード実装への影響 |
|---|---|---|
| Apple `.p8`鍵・Team ID・Key ID | 未発行 | サーバー側（G2A-Hardening実装済み）のauthorizationCode交換機能は本番運用不可のままだが、development/test環境ではこの機能自体が任意設定のため、モバイル側の**コード実装・ユニットテストは進行可能** |
| Apple Developer PortalでのSign in with Apple Capability / Services ID | 未設定 | **実機でのSign in with Apple動作確認はブロックされる**（コード実装自体はモックで進行可能） |
| EAS未セットアップ | 未着手 | Development Buildが無いとネイティブモジュール（`expo-apple-authentication`等）を含む実機テストができない。G3-5で対応 |
| `x-post-fetcher`本番Turso未適用 | 既知 | モバイル側は開発中サーバー（ローカル/プレビュー環境）に接続して開発を進める前提 |

---

---

# 改訂（G3-1完了・G3-2〜G3-4詳細仕様確定、ユーザー承認・2026-07-31）

## 23. G3-1完了報告（ユーザー承認済み）

ステータス: **正式完了**。認証コア一式を実装し、`npx vitest run` 53 tests passed（8 files）・`npx tsc --noEmit` エラーなしを確認、ユーザー承認済み（2026-07-31）。

実装済みファイル（1章の予定ファイルからの差分を含む）:

新規:
```
apps/mobile/lib/secureStore.ts
apps/mobile/lib/deviceId.ts
apps/mobile/lib/clientRequestId.ts
apps/mobile/lib/tokenRefresh.ts
apps/mobile/lib/authApiClient.ts
apps/mobile/lib/authenticatedApiClient.ts   # 1章計画にはなかったが、認証必須/me系の共通リクエスト実行を担う薄いクライアントとして追加
apps/mobile/lib/authActions.ts              # 1章計画にはなかったが、signInWithApple/restoreSessionの実処理をauthStoreから分離するために追加
apps/mobile/lib/accountNamespace.ts         # 1章計画にはなかったが、11章のアカウント別namespace分離を「storageアダプタでキーprefix注入」方式で実装するために追加（21章旧判断事項2を解決）
apps/mobile/lib/offlineQueue.ts             # 14・15章のキュー本体・TTL・再試行バックオフ
apps/mobile/lib/payloadHash.ts              # 1章計画にはなかったが、キューのpayloadHash算出のために追加
apps/mobile/schemas/authApi.ts
apps/mobile/stores/authStore.ts
apps/mobile/stores/offlineQueueStore.ts     # 1章計画にはなかったが、キューの永続化ストアとして追加
apps/mobile/components/auth/SignInWithAppleButton.tsx
apps/mobile/app/(auth)/sign-in.tsx
```

変更:
```
apps/mobile/app/_layout.tsx   # 起動時セッション復元・アプリ復帰時の先回りRefresh・オフラインキュー処理トリガー
```

**G3-1の時点では未着手**（1章計画にあったが、G3-1のスコープには含めていなかった。24章で仕様確定し実装対象とする）:
- `lib/syncClient.ts`・`schemas/syncApi.ts`・`components/auth/SyncConflictBanner.tsx`
- `myLotteriesStore`・`favoritesStore`・`checklistStore`・`notificationSettingsStore`のサーバー同期対応（G3-1完了時点ではアカウント別namespace化のみ完了しており、オフラインキューへのenqueueやサーバーとの差分反映は未実装）
- `signOut()`・`signOutAllDevices()`・`deleteAccount()`の実処理、およびログイン成功後・ログアウト後・アカウント削除後に`syncNamespaceWithAuthUser()`を呼ぶ配線（`lib/accountNamespace.ts`はG3-1で作成したが、G3-1完了時点ではどこからも呼ばれていない）

## 24. G3-2〜G3-4 詳細仕様確定（ユーザー承認・2026-07-31）

21章の旧判断事項1・2・3・4・6・7を、以下の内容で確定する。

### 24-1. legacy `followedProductKeys` 移行方針（旧21章-1を解決）

`x-post-fetcher`側は既に`POST /me/sync/bootstrap`の`legacyFollowedProductKeys`入力として実装済み（`normalizedAlias`の完全一致のみで解決、あいまい一致・新規商品作成はしない）。モバイル側はこれを前提に以下を実装する:

- `normalizedProductName`（=`productKey`）の完全一致のみで解決する
- 解決候補が1件ならその`publicProductId`へフォローを移行する
- 候補が0件または複数件の場合は「解決不能」として扱い、guest側の`followedProductKeys`にそのまま残す（再フォローを強制しない）
- UIには「一部のフォロー中商品を移行できませんでした」という要約のみ表示し、件数は固定文言とせず実際の未解決件数を表示する

### 24-2. アカウント別データ分離の実装方式（旧21章-2を解決）

`lib/accountNamespace.ts`の「中央管理のaccount-scoped storage adapter」方式（ストア再構築ではない）で確定・実装済み。追加で以下を実装する:

- namespace切替: `guest ⇄ publicUserId`間のみ（ユーザー入力からnamespaceを受け取らない、`syncNamespaceWithAuthUser()`が唯一の公開エントリポイントという制約は維持）
- 切替シナリオ: ログイン（`guest→userA`）・別ユーザーへの切替（`userA→userB`、想定上は`userA→guest→userB`を経由）・ログアウト（`userA→guest`、**11章の記述を本改訂により修正**: 旧文面は「namespaceは切り替えない」としていたが、確定仕様では**ログアウト時にguest namespaceへ切り替える**。ユーザーのnamespace自体（保存データ）は削除しない）
- namespace切替中は登録済み全ストアの書き込み系アクションを停止する（実装済み、`isNamespaceSwitching()`）
- 切替時はメモリ状態を先にリセットしてから新namespaceをrehydrateする（実装済み）
- namespace切替をまたいだ非同期処理（bootstrap・差分同期のGET等）の結果は、開始時に記録した世代（generation）が完了時の現在世代と一致する場合のみ適用し、一致しない場合は破棄する（新規: `useNamespaceStore`に`generation`カウンタを追加し、切替のたびにインクリメントする）
- アカウント削除（17章）成功時は、削除対象namespace（=削除前の`publicUserId`）のストレージを物理的に完全削除する。guest namespaceは維持する
- オフラインキュー（`stores/offlineQueueStore.ts`）は既にaccount-scoped storageを使っているため、アカウントごとに自動的に分離される（実装済み）

### 24-3. ログアウト（10章を具体化）

`signOut()`:
1. `POST /auth/logout`をベストエフォートで呼ぶ（失敗しても後続処理を継続する）
2. SecureStoreのRefresh Token・deviceIdを削除
3. Access Tokenをメモリ（`authStore`）から削除
4. `syncNamespaceWithAuthUser()`でguest namespaceへ切り替える（ログイン中ユーザーのnamespace自体は削除しない、10章の通りデータは保持）
5. 未送信のオフラインキュー操作がある場合も削除しない。キューは元ユーザーのnamespaceに残ったまま、`processQueue()`は`status==='signedIn'`のときのみ動作するため自動的に停止する。他アカウントでログイン中にこのキューが送信されることはない（namespaceが異なるため）
6. 同じアカウントに再ログインした場合のみ、namespace切替で当該キューが再びスコープに入り、`processQueue()`が再開する

### 24-4. 全端末ログアウト（10章を具体化）

`signOutAllDevices()`:
1. `POST /auth/logout-all`を呼ぶ
2. **成功時のみ**24-3のログアウトと同じローカル処理を行う
3. 通信失敗時（network/5xx/timeout等）はローカル状態を変更しない（signedInのまま維持）。UIへエラーを返し、呼び出し元が再試行できるようにする
4. 失敗した場合、UIは「全端末ログアウト済み」という成功メッセージを表示しない（エラーメッセージのみ表示する）

### 24-5. アカウント削除（17章を具体化）

`deleteAccount()`:
1. UI側で二段階確認を行った上で呼び出す（実装はG3-2のUI側の責務）
2. `DELETE /me`を呼び、`scheduledDeletionAt`を受け取る
3. 成功時のローカル処理は24-3の`signOut()`のロジックを再利用する（別ロジックを複製しない）。呼び出し元には`scheduledDeletionAt`を返し、17章の案内画面表示に使う
4. namespace切替（`userA`→`guest`）後に、切替前に発行された非同期処理（例: 削除実行前に飛んでいた差分同期のレスポンス）が遅れて解決しても、24-2のgeneration比較により破棄され、guest namespaceへ書き込まれない

### 24-6. 初回bootstrap同期（12章を具体化）

正式手順:
1. guest namespaceを凍結する（`isSwitching`相当の書き込み停止と同じ仕組みを、bootstrap実行中のguest namespaceにも適用する）
2. guestデータのスナップショットを作成する（送信対象を確定させ、送信中の追加操作の混入を防ぐ）
3. `batchClientRequestId`を新規採番する
4. `POST /me/sync/bootstrap`を送信する
5. レスポンスの`serverState`をZodスキーマで検証する（不正な形式なら7以降へ進まず失敗として扱う）
6. 検証済みの`serverState`をuser namespaceへ一時的に書き込む（まだ本番のuser namespaceへ切り替えない）
7. 全ストアへの書き込みが成功したことを確認する
8. `cardhub.bootstrapped.<publicUserId>`を`true`に設定する
9. namespaceをuser namespaceへ切り替える
10. `results`内の`conflicts`・`legacyFollowedProducts.unresolved`を保存し、16章の競合UIから参照できるようにする
11. guest namespaceを「移行済み」としてマークする（`cardhub.bootstrapMigratedFrom.<publicUserId>`等）
12. guestデータは直ちに削除しない（誤って別アカウントでbootstrapし直した場合等の保険。削除タイミングは残課題として記録する）

失敗時（4〜7のいずれかで失敗した場合）:
- guestデータは一切変更しない
- `cardhub.bootstrapped.<publicUserId>`は`true`にしない
- 同じ`batchClientRequestId`で再試行可能にする（新規に採番し直さない。サーバー側の冪等性台帳と整合させるため）
- 6で開始した部分的なuser namespaceへの書き込みはロールバックまたは破棄し、次回リトライ時に矛盾したuser namespace状態から始まらないようにする
- この間、前ユーザー（前回ログインしていた別アカウント、あれば）のデータを画面に表示しない

### 24-7. legacy `followedProductKeys`（オフラインキュー・TTL文脈での確定事項、24-1と合わせて参照）

- `normalizedProductName`完全一致のみで解決し、あいまい一致はしない
- 解決候補1件ならフォロー移行、0件または複数件はunresolvedとしてguest側に保持し、再フォローを強制しない

### 24-8. オフラインキュー: TTL・再試行上限（旧21章-3・4を解決、`lib/offlineQueue.ts`に実装済み）

- 各操作は`payloadHash`・`attemptCount`・`nextRetryAt`・`createdAt`を保持する（実装済み）
- TTL: 30日（`OFFLINE_QUEUE_TTL_MS`、実装済み）。超過時は古い`clientRequestId`のまま盲目的に再送しない
- 上限: 最大500件（`OFFLINE_QUEUE_MAX_OPERATIONS`）・最大1MB（`OFFLINE_QUEUE_MAX_BYTES`）。超過時は黙って古い操作を削除せず、`OfflineQueueOverflowError`で警告する（実装済み）
- 自動再試行: 最大8回（`OFFLINE_QUEUE_MAX_ATTEMPTS`）。バックオフ間隔は5秒・15秒・30秒・1分・5分・15分・1時間・6時間（`OFFLINE_QUEUE_BACKOFF_MS`、実装済み）
- サーバーの`Retry-After`ヘッダがあれば、上記バックオフより優先する（実装済み）
- 再試行対象: `429`・`5xx`・ネットワークエラーのみ（実装済み、`AuthApiErrorKind`で分類）
- `401`はRefresh後に1回だけ再送する（`authenticatedRequest`が担う、実装済み）
- `409 VERSION_CONFLICT`は競合キュー（`status: 'conflict'`）へ移動する（実装済み）
- それ以外の`4xx`（`validation`・`forbidden`・`not_found`・`conflict`）は恒久失敗として扱う（実装済み、`status: 'failed'`）
- アカウント削除成功時は対象namespaceのキューごと物理削除する（24-2・24-5）
- ログアウト時はキューを保持したまま処理を停止し、同じアカウントで再ログインした場合のみ処理を再開する（24-3）

### 24-9. TTL超過時の分岐（15章を具体化）

- 期限切れの操作について、古い`clientRequestId`のまま単純再送しない
- `expectedServerVersion`を含まない操作（PUT系で新規作成・作成時刻ベースの上書きに相当するもの）は、安全に再適用可能とみなし、新しい`clientRequestId`を採番して新規操作として送り直す（実装済み、`isSafeToReapplyAfterExpiry`）
- `expectedServerVersion`を含む操作・DELETE操作は、サーバー側の最新状態と衝突している可能性を否定できないため、盲目的に再送せず競合UI（16章）へ回す（実装済み、`status: 'conflict'`）

### 24-10. 409競合時のUI（16章を具体化）

`components/auth/SyncConflictBanner.tsx`（新規）で以下を扱う:
- `bootstrap`結果の要約（24-6の`results.conflicts`・`legacyFollowedProducts.unresolved`）
- `VERSION_CONFLICT`
- `IDEMPOTENCY_CONFLICT`
- 解決不能だったフォロー中商品（24-1）
- 通知設定の競合（`notificationPreferences`の`VERSION_CONFLICT`、16章の通り自動マージしない）

表示文言（例、最終的な文言はUI実装時に調整可能とする）:
- 「別の端末で更新されました」（`VERSION_CONFLICT`全般）
- 「一部のデータを移行できませんでした」（bootstrap・legacy follow）

### 24-11. その他の確定事項

- `refreshAccessToken`のinterceptorループへは入らない（実装済み、`authenticatedRequest`は1回のみ再送）
- 同時Refreshは`inFlightRefresh`により1本化されている（実装済み）
- 再送時、`clientRequestId`は変更しない（オフラインキューは作成時に採番したIDを使い回す。実装済み）
- Apple `identityToken`/`authorizationCode`/`rawNonce`はログ・永続化しない（実装済み、9章の通り）
- Appleサインインのキャンセルは通常のキャンセルとして扱い、エラーアラート対象にしない（実装済み、`AppleSignInCancelledError`）
- `GET /lotteries`・`GET /lotteries/:id`（公開API）は未ログインでも利用できる（実装済み、`lib/apiClient.ts`はAuthorizationを付与しない別経路のまま維持する）

### 24-12. 追加テスト（19章に追加）

以下をG3-2〜G3-4の実装と合わせて追加する:
- namespace: `guest→A→guest→B`の遷移でAのデータがBへ混在しないこと
- namespace切替中の書き込みが拒否されること
- ログアウト後、Aのオフラインキューが送信されないこと。Aへ再ログインした場合のみ再開すること
- アカウント削除で対象namespace（旧`publicUserId`）のストレージが削除されること。guest namespaceは維持されること
- bootstrap正常系・失敗系（4〜7のいずれかで失敗）・bootstrap途中でのストア書き込み失敗
- 同一`batchClientRequestId`での再送
- bootstrapの`conflicts`が保存され、UIから参照できること
- legacy follow: 完全一致1件で解決／0件・複数件でunresolvedとしてguest側に保持されること
- namespace切替後に解決した古い非同期レスポンス（sessionGeneration不一致）が破棄されること
- `processQueue`の多重起動防止（`processInFlight`一本化）
- オフラインキューのFIFO順序

上記は24章確定内容に基づき、G3-2〜G3-4実装完了時にまとめて結果を報告する（20章の通り、フェーズごとの個別停止ではなく本改訂によりG3-2〜G3-4を一括のレビュー単位とする。旧21章-7を解決）。

---

# 改訂2（G3-2〜G3-4実装完了、2026-07-31）

## 25. G3-2〜G3-4完了報告

ステータス: **正式完了**（ユーザー承認済み、2026-07-31）。24章の確定仕様に基づき実装した。詳細な変更ファイル一覧・テスト結果・既知の残課題はユーザーへのチャット報告（20項目形式）を参照。要点のみ記録する:

- namespace切替（guest⇄publicUserId、`syncNamespaceWithAuthUser`）をログイン・ログアウト・全端末ログアウト・アカウント削除・強制セッション破棄のすべての経路から呼ぶよう配線した（G3-1完了時点では未配線だった）
- `signOut`/`signOutAllDevices`/`deleteAccount`を`lib/authActions.ts`に実装
- bootstrap同期（`lib/bootstrapSync.ts`）・差分同期（`lib/differentialSync.ts`）・同期クライアント（`lib/syncClient.ts`・`schemas/syncApi.ts`）を新規実装
- 4ストア（自分の抽選・お気に入り・チェックリスト・通知設定）をオフラインキューへ配線し、キュー成功応答をserverVersionへ反映する仕組み（`lib/offlineQueueResultRouter.ts`、新規の登録パターン）を追加
- `SyncConflictBanner`をプロフィール画面へ追加
- **1点、24-6章の記述からの意図的な単純化**: bootstrap時「serverStateをuser namespaceへ一時書き込みしてから切り替える」を、「先に空のuser namespaceへ切り替えてから適用する」に変更した（対象namespaceは初回bootstrap時点で必ず空であり、適用は全ストアの`applyServerState`による冪等な全置換のため、同じ`batchClientRequestId`での再試行のみで安全性を担保できる）
- **既知の残課題**: Pull-to-Refresh UI（既存アプリに元々このパターンが無い）、`followedProductKeys`の新規フォローはpublicProductId解決手段が無く引き続きローカルのみ、`favoriteLotteryIds`は文字列lotteryId（現行UIでは実質未使用の導線）

テスト: `npx vitest run` 118 tests passed（17 files）。`npx tsc --noEmit`・`npx eslint . --max-warnings=0`（新規warningなし、既存2件は本改訂と無関係）・`npx expo-doctor`（18/18）・`npx expo export --platform web`（940モジュール、バンドル成功）を確認。

G3-5（Development Build移行の実地適用・EAS関連操作）には着手していない。

## 25-1. G3完了を妨げない残課題（ユーザー承認・2026-07-31）

以下は正式完了の判断を妨げない残課題として記録する。実機・シミュレータでの手動確認が未実施:
- Sign in with Apple
- ログアウト
- 全端末ログアウト
- アカウント削除
- guest bootstrap
- namespace切替
- オフライン復帰
- 競合表示
- ローカル通知
- カレンダー登録

上記はDevelopment Build（G3-5）が無いと実施できない項目を含むため、G3-5以降で実施する（26章の10章参照）。

---

# 改訂3（G3-5 実施計画、2026-07-31・提示のみ・未実行）

## 26. G3-5 実施計画

**本章は計画・手順の提示のみ。以下は実行していない**: `eas login` / `eas init` / `eas build` / `eas submit`、Apple Developer Portal操作、`.p8`鍵発行、本番Turso適用、RevenueCat、課金、統計、TestFlight、App Store Connect操作。

### 26-1. G3-5で必要な作業一覧

1. `expo-dev-client`の追加（Expo Go非対応のネイティブモジュール — `expo-secure-store`・`expo-apple-authentication` — を含むビルドを実機/シミュレータへ入れるため）
2. EASプロジェクトの初期化（`eas init`、未実行）とアカウント紐付け（`eas login`、未実行）
3. `eas.json`の作成（18章で提示済みの案をベースに、26-5で確定）
4. Apple Developer Portalでの`com.cardhub.mobile`向けSign in with Apple Capability有効化・（必要なら）App ID/プロビジョニングプロファイルの整備
5. Development Buildの作成（`eas build --profile development --platform ios`、未実行）と実機/シミュレータへのインストール
6. 開発用Worker（`x-post-fetcher/apps/worker`）をローカルで起動し、モバイル側の接続先を設定
7. 開発用DBの用意（後述26-8の通り、Turso本番契約は不要。ローカルファイルDBで足りる）
8. Worker側で認証機能を有効化する環境変数の設定（`ENVIRONMENT`・`APPLE_CLIENT_ID`・`JWT_SIGNING_KEY_CURRENT_*`等。`.p8`関連は任意・未設定のままでよい）
9. 実機・シミュレータでの認証・同期の一連の動作確認（26-10・26-11）

### 26-2. ユーザー側で必要なApple情報（訂正: 2026-07-31改訂3-1）

**訂正**: 前回「`.p8`鍵・Team ID・Key IDは不要」と記載したが、これは不正確だった。コードで再確認した正確な整理は以下の通り（`x-post-fetcher/apps/worker/src/auth/appleTokenExchangeConfig.ts` 13-29行、`src/routes/auth.ts` 57・126-142行、`src/services/appleRevocationService.ts` を確認）:

- **identityTokenの署名検証だけ**（`/auth/apple`がログインを成立させる部分）は、Apple公開鍵（JWKS）との照合のみで完結し、`.p8`鍵・Team ID・Key IDは不要。これは`development`/`test`環境限定の話であり、`production`/`preview`では下記の交換機能自体が**必須**になる（`STRICT_APPLE_EXCHANGE_ENVIRONMENTS`、未設定なら503）
- **一方、`authorizationCode`をAppleへ交換してApple Refresh Tokenを取得する処理（G2A-Hardingで実装済み）には`APPLE_TEAM_ID`・`APPLE_KEY_ID`・`APPLE_PRIVATE_KEY`（`.p8`の中身）から生成するClient Secretが必要**。`APPLE_TOKEN_ENCRYPTION_KEY`（取得したApple Refresh Tokenの暗号化用）も合わせて4つとも揃わないと、この機能全体が無効化される（1つでも欠けると`undefined`を返す設計、コード上明示的にドキュメント化されている）
- **アカウント削除時のApple側トークン失効（revoke）処理も同じ4変数に依存する**（実装済み、`appleRevocationService.ts`）。4変数が無い状態でアカウント削除すると、`apple_revocation_status`が`"not_applicable"`（そもそも失効すべきApple Refresh Tokenを取得していないため、明示的な「対象外」終端状態）になる。これは「失効成功」でも「クラッシュ」でもない正しい状態だが、**Apple側への実際のrevoke処理そのものは検証されない**
- 結論: **G3-5の範囲では`.p8`鍵・Team ID・Key IDは依然として不要**（identityToken検証によるログイン・ログアウト・同期・アカウント削除自体の動作確認はできる）。ただし**「authorizationCode交換によるApple Refresh Token取得」「アカウント削除時のApple側revoke実処理」はG3-5では検証されないまま**になる。これらは22章の既存Blocker（`.p8`鍵未発行）のままであり、**本番公開前Blockerとして引き続き必須**（26-13章に判定基準を追記）
- **Apple Developer Program**への登録（有料、個人/組織のApple ID）は、`.p8`の有無に関わらずG3-5に必要（実機ビルドの署名・Sign in with Apple Capability付与のため）
- 上記Apple IDでの**Team ID**（登録後、Apple Developer PortalのMembership画面で確認可能）。Sign in with Apple Capability自体の有効化にはこれで足りる（`.p8`秘密鍵の発行とは別の手続き）
- シミュレータでSign in with Appleを試す場合は、シミュレータの「設定」アプリで実際のApple IDにサインインしておく必要がある（Apple公式にサポートされている、Xcode 11.4以降）

### 26-3. bundle identifier候補

現在の`app.json`には既に`ios.bundleIdentifier: "com.cardhub.mobile"`が設定済み（G3-1時点で設定済み、doc 18章の提示通り）。Apple Developer Portal側でこのbundle identifierに対応するApp IDを作成し、Sign in with Apple Capabilityを有効化する必要がある。変更の必要が無ければこのまま使う。

### 26-4. app.json変更案（訂正: 2026-07-31改訂3-1）

現状で以下は**設定済み**（追加の変更は不要）:
```json
{
  "ios": { "bundleIdentifier": "com.cardhub.mobile", "usesAppleSignIn": true },
  "plugins": ["expo-router", ["expo-calendar", {...}], "expo-notifications", "expo-secure-store", "expo-apple-authentication"]
}
```
`expo-dev-client`パッケージ自体はG3-5で追加する（26-6章）。

**訂正**: 前回「`plugins`配列へ`expo-dev-client`の明示追加が必要」と記載したが、これは`expo-dev-client`を実際にインストールして確認していない状態での推測であり不正確だった。`expo-dev-client`未インストールの現状ではリポジトリ内から検証できない（`node_modules`に実体が無い）。正しい確認手順は:
1. `npx expo install expo-dev-client`でパッケージを追加する（この時点で初めて実体を確認できる）
2. `node_modules/expo-dev-client`に`app.plugin.js`等のconfig plugin実体があるかを確認する
3. `npx expo config`（またはprebuild相当のコマンド）でplugin適用後の実際の設定差分を確認する
4. その結果に基づいて`plugins`配列への追加要否を判断する（不要なら追加しない — launcher設定等を変更しない限り、余計な設定を足さない）

現時点では「追加が必要」と断定せず、G3-5実行時に上記手順で確認する、という計画に修正する。

### 26-5. eas.json変更案（未作成、案の提示のみ）

18章の案をそのまま踏襲する:
```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal" },
    "production": {}
  }
}
```
`development`プロファイルの`env`に開発用Worker URL（26-7参照）を設定する運用を想定（値はローカル`.env`と同様、リポジトリにコミットしない）。

### 26-6. Development Build作成手順（実行しない、手順の提示のみ）

1. `npx expo install expo-dev-client`
2. インストール後の`node_modules/expo-dev-client`にconfig plugin実体が無いか確認する（26-4章）。必要な場合のみ`app.json`の`plugins`へ`"expo-dev-client"`を追加する（不要なら追加しない）
3. `eas login`（Expoアカウントでのログイン）
4. `eas init`（プロジェクトIDの割り当て）
5. `eas build:configure`（`eas.json`の生成、26-5の内容と整合させる）
6. `eas build --profile development --platform ios`（Apple Developer Portal連携の資格情報選択を含む対話が発生する）
7. ビルド完了後、実機はEASが発行するインストールリンク（QRコード）から、シミュレータ向けビルドは`eas build --profile development --platform ios --simulator`でシミュレータ用アーカイブを取得しインストール

### 26-7. 開発用Worker URL設定・実行方式の詳細（訂正: 2026-07-31改訂3-1）

`npm run worker:dev`（= `node src/node-server.ts`）の実装をコードで再確認した結果:

- **実装**: `@hono/node-server`の`serve()`を使う実Nodeサーバー。`wrangler dev`ではない
- **ルーティング・ミドルウェアは本番と完全に共通**: `src/app.ts`の`createApp`ファクトリを本番用Workers entry（`src/index.ts`）と共有しており、DIされる`createDb`のみが異なる。認証・同期のロジック自体に差異は無い
- **DBクライアントが異なる**: `node-server.ts`は`db/client.node.ts`（`@libsql/client`本体、`TURSO_DATABASE_URL`未設定時は`file:local.db`にフォールバックする）を使う。一方、本番Workers entry（`src/index.ts`）は`db/client.web.ts`（`@libsql/client/web`、fetchベース）を使い、こちらは**`TURSO_DATABASE_URL`未設定だと例外を投げ、`file:`ローカルファイルもサポートしない**。つまりローカルファイルDBで動くのは`node-server.ts`経由の場合のみ
- **`scheduled`ハンドラ（Apple失効再試行のCronジョブ）は`node-server.ts`から呼ばれない**: `fetch`のみ`serve()`に渡されており、Cronの自動実行は再現されない。手動実行用に`POST /internal/apple-revocation/retry-batch`（`INGEST_TOKEN`必須）が用意されているため、これを使えば同じ処理を手動トリガーできる
- **環境変数は`process.env`を直接参照**: リポジトリ内に`dotenv`等の`.env`自動読み込みは実装されていない（grep確認済み、ヒットなし）。`x-post-fetcher/.env`を作成しても、シェルが自動で読み込むわけではない点に注意（`direnv`等の外部ツールを使うか、起動コマンド側で明示的に環境変数をエクスポートする必要がある）
- **Node.jsバージョンはリポジトリ内で固定されていない**（`engines`フィールド・`.nvmrc`いずれも見つからず）。開発機のNode 18+（Web Crypto APIが標準搭載）であれば動作すると推測されるが、正式に検証・固定はされていない
- モバイル側の接続先は`apps/mobile/.env`の`EXPO_PUBLIC_API_BASE_URL`（現状値: ローカルネットワークIP、例`http://192.168.3.177:8787`）。実機はPCとスマートフォンが同一Wi-Fiにあり、PCのLAN IPを指す必要がある（`localhost`は実機からは到達不可）。シミュレータからは`http://localhost:8787`でも到達可能
- Development Build後もこの`EXPO_PUBLIC_API_BASE_URL`の仕組みは変わらない（ビルド時に埋め込まれる値のため、値を変える場合は再ビルドが必要）

**日常開発の第一候補**: 現行の`npm run worker:dev`（Node独自サーバー）を使う。ルーティング・認証・同期ロジックは本番と共有されているため、通常の機能開発・デバッグには十分。

**G3-5完了前に追加で必要な確認（新規、26-13章の完了基準に反映）**: `node-server.ts`はCloudflare Workersの実行環境（`ExecutionContext`・`db/client.web.ts`経由のTurso接続・`scheduled`ハンドラ）を再現していないため、**最低1回は`wrangler dev`（または実際のCloudflareプレビュー環境へのデプロイ）を使った認証・同期の動作確認を行う**ことを推奨する。この検証には`db/client.web.ts`が`file:`をサポートしない都合上、**実際のTurso（無料枠で可）データベースが必要**になる点が26-8章からの変更点。この確認自体はG3-5の一部として実行可能（EAS/Apple Developer Portal操作を伴わないため、22章のBlockerとは独立）だが、現時点ではまだ実行していない。

### 26-8. 開発用DB適用手順（訂正: 2026-07-31改訂3-1）

**日常開発（`node-server.ts`使用時）**: 実際のTurso（クラウド）契約は不要。`TURSO_DATABASE_URL`未設定時は`file:local.db`（ローカルSQLiteファイル）へフォールバックする（`db/client.node.ts`で確認済み）。手順:
1. `x-post-fetcher/.env`を`.env.example`を元に作成（`TURSO_DATABASE_URL=file:local.db`のままでよい）。ただし26-7の通り自動読み込みは無いため、起動時に環境変数として渡す方法を別途決める
2. `npm run db:migrate -w @x-post/worker`（`apps/worker/migrations`を`local.db`へ適用）
3. `npm run worker:dev`で起動確認

**`wrangler dev`検証（26-7で追加した確認、まだ未実施）**: `db/client.web.ts`は`file:`未対応・`TURSO_DATABASE_URL`必須のため、無料枠のTursoデータベースを1つ用意し、同じマイグレーションをそちらにも適用する必要がある。本番Turso（22章の既知Blocker）とは別物（開発専用の無料枠DBを指す）。

本番相当のTursoへの適用は本計画の対象外（22章の既知Blocker、G3-5でも未実施）。

### 26-9. Apple認証設定手順（Worker側、実行しない・手順の提示のみ、訂正: 2026-07-31改訂3-1）

`x-post-fetcher/.env`（ローカル開発専用、リポジトリにコミットしない。26-7の通り自動読み込みは無いため起動時に別途環境変数として渡す）へ以下を設定して認証機能を有効化する:
```
ENVIRONMENT=development
APPLE_CLIENT_ID=com.cardhub.mobile
JWT_SIGNING_KEY_CURRENT_KID=dev-v1
JWT_SIGNING_KEY_CURRENT_SECRET=<下記の手順で生成した値>
# ACCOUNT_DELETION_GRACE_DAYS は未設定なら既定値（14日）を使う
# APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY / APPLE_TOKEN_ENCRYPTION_KEY は未設定のままでよい
# （26-2章の訂正の通り、これらが無いとauthorizationCode交換・アカウント削除時のApple側revokeは
#   ベストエフォートで無効化される。ログイン自体・その他の機能には影響しない）
```

**`JWT_SIGNING_KEY_CURRENT_SECRET`の生成方法（訂正: 前回「任意の文字列」とだけ記載したのは不適切だった）**:
```
openssl rand -base64 48
```
暗号学的に安全な乱数生成器（`openssl rand`、またはNodeの`crypto.randomBytes`）を使うこと。手で考えた文字列や短い値は使わない。

**この値の取り扱いルール**（すべて厳守）:
- リポジトリへコミットしない（`x-post-fetcher/.env`は`.gitignore`対象、既存の`.gitignore`で`.env`が除外設定済みであることを確認済み）
- `x-post-fetcher/.env.example`には実値を置かない（プレースホルダーのみ。現状の`.env.example`も実値を含まない形式になっていることを確認済み）
- モバイル側の`EXPO_PUBLIC_*`環境変数へは**絶対に**置かない（`EXPO_PUBLIC_`プレフィックスの値はビルド時にJSバンドルへ埋め込まれ、アプリを入手した誰でも読み取れる。秘密情報を置いてよい場所ではない。現状`apps/mobile`側は`EXPO_PUBLIC_API_BASE_URL`のみを使用しており、これは秘密情報ではない公開URLのため問題ない）
- `.p8`ファイル自体もリポジトリへ含めない。**確認の結果、`x-post-fetcher/.gitignore`には`*.p8`のルールが無い**（`CardHub/apps/mobile/.gitignore`には`*.p8`があるが、`.p8`を実際に置く可能性があるのは`x-post-fetcher`側であり、そちらには保護が無い状態だった）。`.p8`鍵を発行するタイミングまでに`x-post-fetcher/.gitignore`へ`*.p8`を追加することを推奨する（本改訂では未実施、ユーザー確認の上で別途対応）。将来`.p8`鍵を発行した際は、Cloudflare Secrets（`wrangler secret put`）等の外部シークレット管理にのみ保存する

これにより`GET /auth/apple`等が503 `AUTH_NOT_CONFIGURED`にならず、identityTokenの検証（Appleの公開JWKSとの照合、Apple Developer Portal側の秘密情報は不要）でログインが機能する状態になる。

### 26-10. 実機テスト項目

25-1章の残課題リストに対応する具体的な確認手順:
1. **Sign in with Apple**: 初回ログイン→bootstrap同期が走ることを確認（guestデータがあれば移行されること）
2. **ログアウト**: ログアウト後、guest namespaceの表示に戻ることを確認。再ログインでデータが復元されること
3. **全端末ログアウト**: 2台目の端末（またはシミュレータ）で同一アカウントにログインした状態で実行し、両方が失効することを確認
4. **アカウント削除**: 二段階確認後、`scheduledDeletionAt`が案内され、再ログインで取り消せることを確認
5. **guest bootstrap**: ログイン前にいくつか保存・フォロー・チェックリスト操作をしてからログインし、サーバーへ移行されることを確認
6. **namespace切替**: アカウントA→ログアウト→アカウントBでログインし、Aのデータが見えないことを確認
7. **オフライン復帰**: 機内モードで操作→復帰後にオフラインキューが自動送信されることを確認
8. **競合表示**: 2端末で同じ項目をほぼ同時に変更し、`SyncConflictBanner`が表示されることを確認
9. **ローカル通知**: 通知設定に応じたローカル通知が実機で発火することを確認
10. **カレンダー登録**: `expo-calendar`権限付与後、実機のカレンダーアプリに反映されることを確認

### 26-11. シミュレータで確認可能な範囲

- **可能**: SecureStore（Keychain）、Sign in with Apple（Simulatorの「設定」で実際のApple IDにサインイン済みであれば動作する）、namespace切替・bootstrap・差分同期・オフラインキュー・競合表示（いずれもネットワーク層のみでOS機能に依存しない）、ローカル通知（権限ダイアログ・スケジューリングは動作するが実機と挙動が異なる場合がある）、カレンダー登録（Simulator内の既定カレンダーへの登録は可能）
- **実機推奨/制約あり**: 複数端末をまたぐ検証（全端末ログアウト・競合表示の再現には最低2つの独立したセッションが必要、シミュレータ2台構成でも代替可能）、リモートPush（本アプリはローカル通知のみのため対象外）、実際のネットワーク切断挙動（Simulatorの機内モード相当の再現はmacOS側のネットワーク遮断で代替する運用になる）

### 26-12. Worker側スケジュールジョブの扱い（新規、2026-07-31改訂3-1）

`x-post-fetcher`の`scheduled`ハンドラ（`src/index.ts`）はApple失効再試行バッチ（`retryAppleRevocationBatch`）のみを行う。他にidempotency_records等の定期クリーンアップジョブは存在しない（`wrangler.toml`に`[triggers]`設定自体が無く、本番デプロイ時にCron Trigger自体が未設定であることをコード上確認済み）。

G3-5の実機/シミュレータ確認では、`node-server.ts`がこのCronを再現しない（26-7章）ため、Apple失効再試行の自動実行は検証対象外でよい（26-2章の通り、`.p8`が無い限りそもそも失効対象のApple Refresh Tokenが存在しないため、再試行ジョブ自体に意味がない）。将来`.p8`鍵発行後にこの機能を検証する場合は、手動トリガー用の`POST /internal/apple-revocation/retry-batch`（`INGEST_TOKEN`必須）を使う。

### 26-13. G3-5正式完了の判定基準（新規、2026-07-31改訂3-1）

以下を満たせばG3-5を正式完了としてよい（ユーザー確認の上で判定する）:

1. Development Build（`eas build --profile development`）が実機・シミュレータで起動すること
2. 26-10章の実機テスト項目1〜10がすべて確認できること
3. `node-server.ts`経由に加え、**`wrangler dev`（または実際のCloudflareプレビュー環境）経由でも最低1回、認証・同期の一連の動作を確認**していること（26-7章で追加した確認事項。実Turso無料枠DBが必要）

**G3-5完了の判定に含めない（.p8鍵未発行のため、22章の既存Blockerのまま）**:
- `authorizationCode`交換によるApple Refresh Token取得の実処理確認
- アカウント削除時のApple側revoke実処理の確認（`apple_revocation_status`が`"succeeded"`になる経路の確認）
- Apple失効再試行バッチの実行確認

これらは`.p8`鍵発行後（本番公開前）に別途Blockerとして扱う。

---

# 改訂4（G3-5実行開始、2026-07-31）

## 27. G3-5実行状況

26-13章の実施順序（1〜14）のうち、**外部アカウントの対話的ログインを必要としない範囲（1〜6・9）を実行した**。**7・8・10〜13（`eas login`／`eas init`／`eas build:configure`／実際のEAS build／開発用Tursoアカウント作成／`wrangler dev`での実DB接続確認／実機・シミュレータでの手動テスト）はユーザー自身の認証情報・対話操作が必要なため未実行**（理由は27-2章）。

### 27-1. 実行済み（1〜6・9）

1. **Secret再生成**: `openssl rand -base64 48`で新規生成し、`x-post-fetcher/.env`へ直接書き込んだ。値はチャット・ログ・本報告のいずれにも表示していない。旧チャットに貼られた値は実際にはファイルへ書き込まれていなかったことを確認したが、破棄済み・不使用として扱う
2. **`.gitignore`更新**: `x-post-fetcher/.gitignore`へ`*.p8`・`AuthKey_*.p8`を追加（`git diff`で確認済み、他ファイルへの影響なし）
3. **`expo-dev-client`追加**: `npx expo install expo-dev-client`で追加（SDK 54対応版、61パッケージ追加）
4. **config plugin要否確認**: `node_modules/expo-dev-client/app.plugin.js`が実際に`expo-dev-launcher`・`expo-dev-menu`のプラグインへ委譲し、iOS/Android向けの起動用スキームを生成する実プラグインであることをソースで確認した（コメントのみのダミーではない）。**「未検証」ではなく「登録が必要と確認できた」**ため、5で登録した
5. **app.json更新**: `plugins`配列へ`"expo-dev-client"`を追加（1行のみ、他は変更なし）。`npx expo config --type public`・`--type prebuild`で解決エラーが無いことを確認済み
6. **eas.json作成**: `apps/mobile/eas.json`を新規作成。`development`（実機、`developmentClient:true`・`distribution:internal`）・`development-simulator`（`developmentClient:true`・`ios.simulator:true`）・`preview`・`production`の4プロファイル。JSON構文は検証済み（EAS CLIによるスキーマ検証は`eas build:configure`実行時が正式、27-2章の通り未実行）
9. **ローカルWorker＋SQLite接続確認**: `npm run db:migrate -w @x-post/worker`で`local.db`へマイグレーション適用 → `npm run worker:dev`起動 → 実際にHTTPリクエストで確認:
   - `GET /lotteries`（公開API）→ `200`
   - `GET /me`（未認証）→ `401 UNAUTHORIZED`（**`503 AUTH_NOT_CONFIGURED`ではない**＝新しい環境変数で認証機能が有効化されたことの実証）
   - `POST /auth/refresh`（不正なトークン）→ `401 UNAUTHORIZED`（同上）
   確認後、バックグラウンドのWorkerプロセスは停止済み

`npx vitest run`（118 tests）・`npx tsc --noEmit`は上記変更後も引き続きパスすることを確認済み。

### 27-2. 未実行（7・8・10〜13）とその理由

以下はいずれも**私（エージェント）が代行できない、ユーザー本人の対話的操作・アカウント資格情報を必要とする**ため、指示はいただいていますが実行していません:

- **`eas login`**: Expoアカウントでの対話的ログイン（ブラウザ認証またはユーザー名・パスワード）が必要。私はExpoアカウントを持っておらず、代行できません
- **`eas init` / `eas build:configure`**: `eas login`後の実行が前提。加えて`eas build:configure`のiOSフローは、多くの場合Apple Developer Portalの資格情報管理（証明書・プロビジョニングプロファイルの自動生成、または既存の選択）を対話的に求めます。Apple IDでのログイン・2段階認証コードの入力が発生し得るため、これもユーザー本人でなければ実行できません
- **`eas build`（development / development-simulator）**: 上記2つの完了が前提。加えて実際のクラウドビルドジョブを起動するため、Expoアカウントのビルド枠（無料枠には月あたりの制限があります）を消費します。実行前に一度確認いただくのが安全と考え、保留しています
- **開発用Tursoデータベースの作成**: Tursoアカウント（無料枠）の作成・CLIログインが必要。私はTursoアカウントを持っておらず、代行できません
- **`wrangler dev`または実Cloudflare Preview経由の接続確認**: 上記Tursoデータベースの作成が前提（`db/client.web.ts`は`file:`未対応・実際の`TURSO_DATABASE_URL`が必須のため）。加えて`wrangler dev`自体もCloudflareアカウントでの`wrangler login`状態を前提とする場合があります（本リポジトリでの認証状態は未確認）
- **実機・シミュレータでの手動テスト（26-10章の10項目）**: 上記のビルド成果物が無いと実施できません

### 27-3. 進め方の提案

上記6項目はいずれも「ユーザーが自分の資格情報で対話的に実行し、私がその結果を確認・次の作業に反映する」という分担が現実的です。具体的には:

1. ユーザーが`! eas login`のように`!`プレフィックスでこのセッション内から実行する（ターミナル出力がそのまま会話に残ります）、または別ターミナルで実行して結果だけ共有いただく
2. `eas init`・`eas build:configure`も同様（Apple ID関連の入力はユーザー本人が行う）
3. `eas build`実行前に一度「本当に実行してよいか（ビルド枠消費）」を確認する
4. Tursoアカウント作成・`wrangler login`（必要な場合）も同様にユーザー本人が実行
5. 実機・シミュレータでのビルドインストール・手動テストもユーザー本人の作業

私はその間、各ステップの結果（ログ・エラーメッセージ等）を元に次の手順を案内したり、発生した問題の調査・修正を行います。

進め方（上記の分担でよいか、または他に希望があるか）をご確認ください。
