# Mobile-G2B: ユーザーデータ同期基盤 実装計画

ステータス: **計画のみ。コード変更・DB変更は未実施。**
前提: Mobile-G2A（認証基盤）は正式完了。本計画は`docs/mobile-g1-auth-billing-stats-architecture.md`の4章（DB設計）・5章（API設計）・7章（ローカル移行）・20章（改訂）を土台に、G2A実装で確定した実際の規約（Drizzle `sqliteTable`、snake_case列名、`text` timestamp + `CURRENT_TIMESTAMP`既定値、`DbOrTx`型によるトランザクション対応、条件付きUPDATEによる排他制御、フェンシングトークン等）に合わせて具体化・一部改訂する。

対象リポジトリ: `x-post-fetcher`（バックエンドDB・API）。モバイル側実装（Zustandストアの同期対応）はG2Bのスコープ外（別フェーズ）。

---

## 1. 対象とするDBテーブル

既存`lotteries`系・G2A認証系テーブルは無変更。新規10テーブル。

### 1.1 商品マスタ（`docs/mobile-g1-...20-3`を継承）

**`products`**

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| public_product_id | text | not null, unique（UUIDv4、`users.public_user_id`と同じ理由） |
| canonical_name | text | not null |
| normalized_name | text | not null |
| normalizer_version | text | nullable（`x-post-fetcher`の`NORMALIZER_VERSION`定数と対応） |
| card_type | text | nullable |
| merged_into_product_id | integer | nullable（自己参照、統合先） |
| created_at / updated_at | text | not null default CURRENT_TIMESTAMP |

**`product_aliases`**

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| product_id | integer | not null |
| alias_normalized_name | text | not null, **unique** |
| source | text | not null（`initial_migration` / `re_normalization` / `manual_merge`） |
| created_at | text | not null default CURRENT_TIMESTAMP |

**`lottery_products`**

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| lottery_id | integer | not null, **unique**（1抽選=現在の対応商品1件） |
| product_id | integer | not null |
| created_at | text | not null default CURRENT_TIMESTAMP |

### 1.2 ユーザーデータ（同期対象）

**`user_lotteries`**（「自分の抽選」。G2Aの`users.id`をFK参照）

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| user_id | integer | not null |
| lottery_id | integer | not null |
| status | text | not null default `'unknown'` |
| snapshot_json | text (JSON) | nullable（保存時点の`LotteryRecord`スナップショット、既存モバイル実装の設計思想を継承） |
| snapshot_updated_at | text | nullable |
| saved_at | text | not null |
| server_version | integer | not null default 1 |
| last_client_request_id | text | nullable（冪等性チェック用） |
| created_at / updated_at | text | not null default CURRENT_TIMESTAMP |
| deleted_at | text | nullable（論理削除） |

一意制約: `unique(user_id, lottery_id)`（部分一意、`deleted_at IS NULL`）。SQLiteの部分一意インデックスで表現。

**`user_lottery_status_history`**（状態遷移履歴、統計用の元データとしてG6で使う想定だがG2Bで先に記録開始する）

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| user_lottery_id | integer | not null |
| from_status | text | nullable |
| to_status | text | not null |
| changed_at | text | not null default CURRENT_TIMESTAMP |
| source | text | not null（`'user'` / `'sync_merge'`） |

**`user_favorites`**

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| user_id | integer | not null |
| lottery_id | integer | not null |
| server_version | integer | not null default 1 |
| last_client_request_id | text | nullable |
| created_at | text | not null default CURRENT_TIMESTAMP |
| deleted_at | text | nullable |

一意制約: `unique(user_id, lottery_id)`（部分一意）。

**`followed_products`**（**G1 20-3節の通り`productKey`文字列ではなく`product_id`参照**）

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| user_id | integer | not null |
| product_id | integer | not null |
| server_version | integer | not null default 1 |
| last_client_request_id | text | nullable |
| created_at | text | not null default CURRENT_TIMESTAMP |
| deleted_at | text | nullable |

一意制約: `unique(user_id, product_id)`（部分一意）。

**`checklist_progress`**（項目10で競合解決を詳述）

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| user_id | integer | not null |
| lottery_id | integer | not null |
| step_id | text | not null |
| label | text | not null |
| done | integer(boolean) | not null default 0 |
| completed_at | text | nullable |
| completed_note | text | nullable |
| server_version | integer | not null default 1 |
| server_received_at | text | not null default CURRENT_TIMESTAMP（監査専用） |
| client_action_at | text | nullable（参考値のみ、下記参照） |
| last_client_request_id | text | nullable |
| sort_order | integer | not null default 0 |
| created_at | text | not null default CURRENT_TIMESTAMP |
| deleted_at | text | nullable（カスタムステップの削除用） |

一意制約: `unique(user_id, lottery_id, step_id)`。

**`notification_preferences`**（項目11で競合解決を詳述）

| 列 | 型 | 制約 |
|---|---|---|
| id | integer PK autoincrement | |
| user_id | integer | not null, **unique**（1ユーザー1行） |
| deadline_reminder / announcement_reminder / purchase_reminder / new_lottery_alert / favorite_update_alert / push_enabled / email_enabled / quiet_hours_enabled | integer(boolean) | not null（既定値は`types/models.ts`の`NotificationToggleSettings`に準拠） |
| quiet_hours_start / quiet_hours_end | text | nullable |
| deadline_reminder_hours_before / announcement_reminder_hours_before / purchase_reminder_hours_before | integer | not null default 24 |
| server_version | integer | not null default 1 |
| last_client_request_id | text | nullable |
| updated_at | text | not null default CURRENT_TIMESTAMP |

**`user_devices`**（push token登録の先行実装、G1 4.4節を継承。同期の対象ではないがこのフェーズで作成しておく）

G1 4.4節のまま変更なし（`unique(user_id, device_id)`）。

---

## 2. 既存lotteriesからproductsを生成する移行方針

`x-post-fetcher`の`services/normalize.ts`で確認済み: `NORMALIZER_VERSION = "phase2-norm-1"`、正規化はNFKC正規化+記号除去+空白圧縮のみの軽量処理。`lotteries.normalizedProductName`はこの関数の出力がそのまま入っている。

**バックフィル手順**（新規テーブルへの追加のみ、`lotteries`へは一切書き込まない）:

1. `SELECT DISTINCT normalized_product_name FROM lotteries WHERE normalized_product_name IS NOT NULL`
2. 各値について、代表行（同一`normalizedProductName`を持つ行のうち`productNameRaw`が非nullかつ`createdAt`が最新のもの）を選び、`canonicalName`の初期値とする（無ければ`normalizedProductName`自体をフォールバック）
3. `products`へ1行INSERT（`normalizedName`=対象値、`normalizerVersion`=代表行の`normalizerVersion`、`cardType`=代表行の`cardType`）
4. 同時に`product_aliases`へ自己エイリアス行（`aliasNormalizedName`=同じ値、`source='initial_migration'`）をINSERT（以後すべての解決を`product_aliases`経由に統一するため）
5. `normalizedProductName`が非nullな全`lotteries`行について、対応する`productId`（手順1〜4で解決済み）を`lottery_products`へINSERT（`unique(lottery_id)`）

**継続運用**: `x-post-fetcher`の取り込みパイプライン（`services/normalize.ts`を呼び出す箇所）に、新規/更新された抽選の`normalizedProductName`に対して`resolveProductId`（下記）を呼び出し`lottery_products`を追随更新するコード追加が必要。これは新規テーブルへの追加だけでなく**既存の取り込みコードへの変更を伴う**ため、G2Bの中でも独立した作業項目として扱う（後述17章のサブフェーズ分割を参照）。

**`resolveProductId(normalizedProductName)`共通関数**（バックフィルと継続運用の両方で使う）:
1. `product_aliases.aliasNormalizedName`の完全一致を検索 → 見つかれば`productId`を取得し、`products.mergedIntoProductId`のチェーンを辿って最終的な統合先IDを返す
2. 見つからなければ`products.normalizedName`の完全一致を検索
3. それでも見つからなければ新規`products`行＋自己エイリアスを作成

---

## 3. 商品の誤統合を防ぐルール

G1 20-3節の方針を継続する。

- **G2Bでは商品の自動統合ロジックを一切実装しない**。唯一の自動的な同一視は`product_aliases`経由の完全一致のみ。
- 正規化ロジックが変わり同一商品が新しい`normalizedProductName`を生成しても、自動では統合せず新規`products`行として作成する（重複を許容する）。
- 統合は人間のレビュー後、手動で`mergedIntoProductId`を設定し、旧`normalizedName`を新しい商品への`product_aliases`（`source='manual_merge'`）として追加する運用のみ。管理API（`/internal/products/:id/merge`等）は本フェーズでは実装しない（将来課題）。
- 理由（再掲）: 重複商品は「似た商品が2件表示される」程度の低コストな問題で気づきやすいが、誤統合は「別商品のフォロー/抽選が混ざる」という発見しにくく訂正コストの高い問題であるため、常に重複許容側に倒す。

---

## 4. API一覧

共通ルール（G1 5章の共通ルールを継承）: `Authorization: Bearer <AccessToken>`必須、エラー形式`{"error":{"code","message","requestId"}}`、`WHERE user_id = <認証済みuserId>`を全クエリに必須化（IDOR対策）。

| API | 認証 | 備考 |
|---|---|---|
| `GET /me/lotteries` | 必須 | ページネーション（`limit`/`offset`） |
| `PUT /me/lotteries/:lotteryId` | 必須 | 新規保存 or 更新（status含む）、`serverVersion`楽観ロック |
| `PATCH /me/lotteries/:lotteryId` | 必須 | statusのみ部分更新 |
| `DELETE /me/lotteries/:lotteryId` | 必須 | 論理削除 |
| `POST /me/lotteries/sync` | 必須 | 初回ログイン時の一括マージ専用（項目5で詳述） |
| `GET /me/favorites` | 必須 | |
| `PUT /me/favorites/:lotteryId` | 必須 | |
| `DELETE /me/favorites/:lotteryId` | 必須 | |
| `GET /me/followed-products` | 必須 | レスポンスは`productId`＋商品の表示用情報（`canonicalName`等）を含む |
| `PUT /me/followed-products/:productId` | 必須 | **G1初期案の`:productKey`から`:productId`に変更**（1章参照） |
| `DELETE /me/followed-products/:productId` | 必須 | 同上 |
| `GET /me/checklists/:lotteryId` | 必須 | |
| `PUT /me/checklists/:lotteryId` | 必須 | 行単位upsert、項目10の競合解決 |
| `DELETE /me/checklists/:lotteryId/:stepId` | 必須 | カスタムステップのみ削除可（**G1案の抽選単位DELETEからstep単位に変更、下記参照**） |
| `GET /me/notification-preferences` | 必須 | |
| `PUT /me/notification-preferences` | 必須 | 項目11の競合解決 |
| `POST /me/devices` | 必須 | push token登録（先行実装、送信機能は別フェーズ） |
| `DELETE /me/devices/:deviceId` | 必須 | |

**変更点の理由**: `DELETE /me/checklists/:lotteryId`（抽選単位の一括削除）は「カスタムステップのみ削除可」という要件と噛み合わないため、`:stepId`単位に変更した。デフォルトステップの削除は引き続き不可（`done=false`へのリセットのみ、`PUT`で表現）。

---

## 5. 同期APIのリクエスト・レスポンス

### `POST /me/lotteries/sync`

初回ログイン時、未ログイン中にローカル保存された「自分の抽選」をまとめてサーバーへ送る専用API。

```json
// Request
{
  "items": [
    { "lotteryId": 123, "status": "planned", "savedAt": "2026-01-01T00:00:00.000Z", "clientRequestId": "uuid-per-item" }
  ],
  "deviceId": "device-uuid"
}
```

```json
// Response
{
  "merged": [
    { "lotteryId": 123, "status": "planned", "serverVersion": 1, "savedAt": "2026-01-01T00:00:00.000Z" }
  ],
  "conflicts": [
    { "lotteryId": 456, "resolvedStatus": "won", "reason": "server_already_had_newer_status" }
  ]
}
```

- サーバーは`items`を1件ずつ、既存の`PUT /me/lotteries/:lotteryId`と同じマージロジックで処理する（項目8参照）。
- `clientRequestId`は項目6の冪等性キーとして各行に個別に必要（1リクエスト内で複数アイテムを送るため、リクエスト全体のIDでは粒度が粗すぎる）。
- レスポンスは常に**サーバー側の最終状態**を返す（クライアントはこれでローカルストアを上書きする、G1 7.2節の方針を継承）。

### `PUT /me/lotteries/:lotteryId`（通常の単一アイテム更新の例）

```json
// Request
{ "status": "applied", "expectedServerVersion": 1, "clientRequestId": "uuid" }
// Response（成功時）
{ "lotteryId": 123, "status": "applied", "serverVersion": 2, "updatedAt": "..." }
// Response（楽観ロック競合時、409）
{ "error": { "code": "CONFLICT", "message": "...", "requestId": "..." }, "current": { "status": "won", "serverVersion": 3 } }
```

`checklist`・`favorites`・`followedProducts`・`notificationPreferences`の各PUT系も同様の形（`expectedServerVersion`＋`clientRequestId`必須、レスポンスに`serverVersion`を含む）に統一する。

---

## 6. clientRequestIdによる冪等性

各同期対象テーブルに`last_client_request_id`列を持たせ、書き込み系エンドポイントは以下の手順で処理する:

1. リクエストの`clientRequestId`が対象行の`last_client_request_id`と一致する場合、**再適用せず前回の結果をそのまま返す**（ネットワーク再送によるリトライ・重複実行を安全にする）
2. 一致しない場合は通常の処理（項目7の楽観的ロック）へ進み、成功時に`last_client_request_id`を今回の値で更新する

**設計判断**: G1で検討した「専用の冪等性台帳テーブル（`sync_operations`等）」ではなく、**行ごとの単一スロット方式**を採用する。理由: 同一行に対する再送は「直前と同じ操作」であることがほとんどで、複数世代の冪等性キーを保持する必要性が薄く、追加テーブル無しで実装をシンプルに保てるため。ただし複数行にまたがる`POST /me/lotteries/sync`は行ごとに`clientRequestId`を持つため、この方式でも各行独立に冪等性が保たれる。

---

## 7. serverVersionによる競合制御

全同期対象テーブルに`server_version`（integer, not null default 1）を持たせ、以下を統一ルールとする（**G2Aの過程でチェックリスト向けに確定した方針を、他の全同期対象データへ一般化する**）:

- クライアントは書き込み時に`expectedServerVersion`（最後に把握しているサーバー側の値）を送る
- サーバー側の現在値と一致すれば適用し`server_version`をインクリメント
- 一致しなければ409 CONFLICTを返し、**サーバー側の現在の値を正**とする（クライアント側の変更は破棄）。ただし、この「一律サーバー優先」で良いか、データ種別ごとに項目8の個別マージルールを優先するかは、409を返す前に個別マージルールを試すかどうかの設計判断であり、下記項目8で種別ごとに定める。
- 同一`server_version`が発生しない構造にする＝**単一行に対する更新は必ずこのCAS（条件付きUPDATE）を通す**。G2Aのrefresh_tokenローテーション・Apple失効クレームで実証済みの「`WHERE id=? AND server_version=?`の条件付きUPDATE＋`.returning()`で成否判定」というパターンをそのまま踏襲する。
- `server_received_at`（監査専用、チェックリストに限らず全テーブルへ展開するかは項目18の判断事項）とは別に、業務的な`updated_at`／`client_action_at`（参考値）を区別する。

---

## 8. ローカルとサーバーのマージルール

データ種別ごとに、項目7の一般ルールに対する上乗せ・例外を定める。

| データ種別 | マージルール |
|---|---|
| `user_lotteries`（status） | 追加は無条件マージ（新規lotteryIdは常に採用）。既存行の状態競合は「新しい`server_version`を持つ側が勝つ」＝通常のCASで自然に解決。ただし状態遷移は10章のホワイトリスト（G1 10章）に従い、不正な遷移はサーバー側で拒否（422） |
| `user_favorites` / `followed_products` | 追加のみのマージ（片方にあれば採用）。削除は論理削除のタイムスタンプが新しい方を優先（削除操作自体も`server_version`を持つ更新として扱う） |
| `checklist_progress` | 項目10で詳述（項目単位、`done=false`も正規操作） |
| `notification_preferences` | 項目11で詳述 |

---

## 9. 論理削除と復元の扱い

- `user_lotteries` / `user_favorites` / `followed_products`は`deleted_at`列で論理削除する。物理削除は行わない（将来の統計・監査のため、G1 10.3節の方針を継承）。
- **復元**: 削除済み行に対して再度`PUT`（同一lotteryId/productId）が来た場合、既存行を`deleted_at=NULL`へ戻して復元する（新規行を追加しない、`unique(user_id, lottery_id)`の部分一意インデックスにより新規行作成は元から不可）。
- `checklist_progress`のカスタムステップも同様に論理削除＋復元可能。デフォルトステップ（`step_id`が`default-`始まり）は削除不可の制約をAPI層で強制する。
- 一覧系GET APIは`deleted_at IS NULL`のみを返す。統計（G6）は論理削除済みも含めて集計する方針を維持。

---

## 10. チェックリスト競合解決

**G2A着手前のフィードバックで確定した方針をそのまま採用する**（clientActionAtを競合判定の第一優先にしない、という明示的な訂正を反映済み）:

- 各更新に一意な`clientRequestId`（またはoperationId）を付与する（項目6）
- サーバーが更新を受理した時点で`server_version`を単調増加させる
- `server_version`が大きい更新を正とする（＝項目7の一般CASルールそのもの）
- 同一`server_version`が発生しない構造にする（CASで保証）
- `server_received_at`を監査用に保存する
- `client_action_at`は表示・調査用の参考値として保存してよいが、**競合の勝敗判定には使わない**
- `client_action_at`だけで既存データを上書きしない
- 端末時計のずれや意図的な改変に影響されないようにする（＝勝敗判定はサーバー側の`server_version`のみに依存させる）
- `done=false`も正規操作として扱う（特別扱いしない）
- `done=false`の場合は`completed_at`をnullに戻す

**同時書き込み時の具体的な処理**: 端末Aと端末Bが同じ`stepId`をほぼ同時に更新した場合、先にサーバーへ到達した方が`expectedServerVersion`一致でCASに成功し`server_version`が上がる。後から到達した方は`expectedServerVersion`不一致で409（G2Aのrefresh_token同時ローテーションで確立した「正常な競合は安全に1件だけ成功させ、もう1件はエラーにする」パターンと同型）。**オフライン時に貯めた複数の操作を後からまとめて送る場合**（`POST /me/checklists/:lotteryId`が複数stepの配列を受け取る設計、G1想定）は、各stepごとに独立してこのCASを適用し、一部だけ成功・一部だけ409という「部分成功」を許容するレスポンス設計にする。

---

## 11. 通知設定競合解決

G1 7.3節の初期案は「`updatedAt`が新しい方を優先」だったが、**チェックリスト向けに確立したクライアント時計を信用しない方針との一貫性を保つため、ここでも`server_version`ベースのCASへ統一することを推奨する**（G1からの改訂）。

- `notification_preferences`は1ユーザー1行のため、複数端末からの同時更新は同一行への競合になる
- 通常のCAS（項目7）で解決: 先着の更新が`server_version`をインクリメントし、後着は409＋サーバー側の現在値を返す
- モバイル側は409を受けたら「他の端末で設定が変更されています」等のUIで現在のサーバー値を表示し、ユーザーに選択させる（自動マージしない）。これは通知設定が「オンオフのリスト」であり、チェックリストのような項目単位の部分マージが自然に定義しにくいための判断。
- 項目18に「この一貫性重視の改訂を採用するか、G1の`updatedAt`優先案を維持するか」をユーザー判断事項として残す。

---

## 12. 複数端末の具体シナリオ

| シナリオ | 挙動 |
|---|---|
| 端末Aと端末Bが同じ抽選のstatusをほぼ同時に別の値へ変更 | 先着がCAS成功、後着は409＋サーバー現在値。モバイル側は409受信時にローカルをサーバー値で上書きし再提示 |
| 端末Aで抽選を保存後、端末Bでは未保存のまま同じ抽選を開く | 端末Bの`GET /me/lotteries`で同期時に反映される（プッシュ通知は無いためポーリング/フォアグラウンド復帰時取得が前提） |
| 端末Aでチェックリスト項目を完了、端末Bで同じ項目を未完了に戻す（意図的） | どちらが後にサーバーへ届いてCASに成功したかで決まる。`done=false`も正規操作のため「元に戻す」操作は正しく反映される |
| 端末Aと端末Bで異なる商品をフォロー | 追加のみのマージのため両方とも反映される（競合なし） |
| オフラインの端末Aが再接続し、古い`expectedServerVersion`を大量に送信 | 全て409で拒否され、端末Aは最新状態を取得してからローカルを補正する必要がある（**モバイル側の再送ロジック設計はG2Bのモバイル実装フェーズで詳細化、本計画はAPI仕様のみ**） |
| 同一ユーザーが同時に2台から初回`POST /me/lotteries/sync`を送る（同一アカウントへの複数端末からの初回ログイン直後等） | 各アイテムの`clientRequestId`は端末ごとに異なるため冪等性キーとしては独立して機能するが、同一`lotteryId`への同時マージはCASで解決（先着優先） |

---

## 13. マイグレーション順序

1. `products` / `product_aliases` / `lottery_products`（他テーブルからの参照は無いため独立して作成可能）
2. `user_lotteries` / `user_lottery_status_history`
3. `user_favorites`
4. `followed_products`（`products`に依存するため1の後）
5. `checklist_progress`
6. `notification_preferences`
7. `user_devices`

DrizzleマイグレーションはG2Aと同様に`drizzle-kit generate`で1本にまとめる想定（本番未適用のため複数回に分けて生成し直すことも可能）。バックフィルスクリプト（項目2）はマイグレーション適用後、コードとして別途実行する（マイグレーションSQL自体には含めない）。

---

## 14. テスト計画

- **商品解決**: `resolveProductId`の単体テスト（完全一致・エイリアス経由・新規作成・`mergedIntoProductId`チェーン解決）
- **バックフィル**: 冪等性（2回実行しても重複作成しない）、既存`lotteries`への非破壊性
- **CRUD**: 各テーブルの基本CRUD＋所有者チェック（他ユーザーのデータへアクセスできないこと、IDOR回帰）
- **冪等性**: 同一`clientRequestId`の再送が重複適用されないこと
- **競合制御**: `expectedServerVersion`不一致で409になること、同時更新で片方のみ成功すること（G2Aの同時アクセステストと同じ手法：`Promise.all`＋実際のSQLite挙動を確認）
- **チェックリスト**: `done=false`遷移・`completedAt`リセット・部分成功レスポンス
- **論理削除・復元**: 削除→復元で新規行が増えないこと
- **マイグレーション**: 空DB適用・既存DB（G2A完了状態）からの非破壊マイグレーション
- **回帰**: 既存218テスト全件

---

## 15. ロールバック方法

全テーブルが新規追加のみ（既存`lotteries`・G2A認証テーブルへの変更なし）。ロールバックはdownマイグレーションで新規テーブルをdropするのみ。バックフィルで作成した`products`/`lottery_products`データも同時に消える（既存`lotteries`データ自体は無傷）。新規ルートも`app.ts`での登録解除＋前バージョンへの再デプロイで即座に切り戻し可能（G2Aと同じ考え方）。

---

## 16. 想定リスク

| リスク | 重大度 | 備考 |
|---|---|---|
| 正規化ロジック変更時の商品誤フォロー無効化（G1 20-3節で既出） | Important | 保守的な統合ルール（項目3）で緩和、根本解決は将来のバックエンド設計変更 |
| `expectedServerVersion`不一致（409）の多発によるモバイル側UX悪化 | Important | オフライン期間が長いほど発生しやすい。モバイル側の再送戦略（最新取得→再試行）が別途必要 |
| バックフィルの実行時間（既存`lotteries`件数次第） | Nice to have | 現状件数は少ない想定（個人開発規模）だが、将来件数が増えた場合はバッチ分割が必要 |
| `checklist_progress`の行単位設計によるレコード数増加 | Nice to have | 1ユーザー×1抽選あたり数行程度、実害は小さい想定 |
| 通知設定の競合をCASのみで解決するとUXが硬い（項目11の改訂案） | Important | ユーザー判断事項（項目18）として明示 |

---

## 17. G2Bをさらに分割すべきか

**分割を推奨する。** G2A/G2B/G2Cの3段階分割が有効だったのと同じ理由（各段階でレビュー・テスト・停止し、手戻りを局所化する）。

- **G2B-1**: `products` / `product_aliases` / `lottery_products` ＋ バックフィルスクリプト ＋ 取り込みパイプラインへの`resolveProductId`組み込み。ユーザー向けAPIはまだ無し。
- **G2B-2**: `user_lotteries` / `user_lottery_status_history` ＋ 関連API（`GET/PUT/PATCH/DELETE /me/lotteries`, `POST /me/lotteries/sync`）
- **G2B-3**: `user_favorites` / `followed_products` ＋ 関連API
- **G2B-4**: `checklist_progress` ＋ 関連API（競合解決の実装・テストが最も複雑なため独立させる）
- **G2B-5**: `notification_preferences` / `user_devices` ＋ 関連API

各サブフェーズ完了ごとにレビュー・停止する運用を提案する。

---

## 18. ユーザー判断が必要な項目

1. 通知設定の競合解決をG1の「`updatedAt`優先」からG2Bの「`server_version`ベースCAS＋自動マージしない」へ改訂してよいか（項目11）
2. `DELETE /me/checklists/:lotteryId`（抽選単位）を`:stepId`単位へ変更してよいか（項目4）
3. `POST /me/lotteries/sync`のレスポンスで、競合した項目をどこまで詳細にモバイルへ返すか（`reason`文言の設計はモバイル実装フェーズと合わせる必要あり）
4. `followed_products`のエンドポイントを`:productKey`から`:productId`に変更することに伴う、モバイル側実装への影響（productId取得のための追加GET呼び出しが必要になる可能性）の許容
5. 冪等性を「行ごとの単一スロット」ではなく専用台帳テーブルにする必要性の有無（複数世代の冪等性キー保持が将来必要になるか）
6. G2B-1〜G2B-5のサブフェーズ順序・分割で問題ないか、または統計（G6）に必要な`user_lottery_status_history`をG2B-2より前倒しする必要があるか
7. `server_received_at`列（監査専用）をチェックリスト以外の全同期テーブルにも展開するか

---

**本計画に基づき、コード変更・DB変更は未実施です。G2B-1（商品マスタ＋バックフィル）から着手してよいか、上記7項目の確認を含めご指示をお願いします。**

---
---

# 改訂（ユーザー承認・G2B-1詳細設計）

ステータス: **引き続き計画のみ。コード変更・DB変更は未実施。** 今回はG2B-1のみ着手対象として詳細設計を報告する。

## 20-1. 確定した方針

- **サブフェーズ順序**: G2B-1（商品マスタ）→ G2B-2（自分の抽選）→ G2B-3（お気に入り・フォロー）→ G2B-4（チェックリスト）→ G2B-5（通知設定）で確定。各完了後にテスト結果を報告しユーザー確認を取って停止する。今回はG2B-1のみ着手対象。
- **API方針確定**: `followed_products`は`productId`使用、チェックリスト削除は`stepId`単位、`notification_preferences`は自動マージせず`serverVersion`による行全体CAS、`clientActionAt`は参考値のみ、競合判定は`serverVersion`を正とする。
- **serverVersionの適用範囲を絞り込み**: 全テーブルへ機械的に追加しない方針に修正。
  - **必須**: `user_lotteries`, `checklist_progress`, `notification_preferences`
  - **不要（G2Bの必須対象から除外）**: `user_lottery_status_history`（履歴追加型のため）, `user_favorites`（単純な追加・削除のためunique制約＋論理削除で対応可能）, `followed_products`（同上）
- **`user_devices`をG2Bから削除**: ローカル通知のみの現状では不要。G2Bでスキーマだけ先行追加せず、将来のリモートPush実装フェーズで追加する（G1で「先行実装」としていた方針を撤回）。`notification_preferences`にはdeviceId依存を一切持ち込まない。
- **deviceIdの役割整理**: 認証層の`refresh_tokens.deviceId`（G2A実装済み、セッション/端末管理が目的、DBに永続化）と、同期APIのリクエストに含めてよい「リクエスト単位のdeviceId」（DBへ新規列として保存せず、ログ・トレース目的の一過性パラメータとしてのみ扱う）は役割が異なる。後者は`notification_preferences`等の同期テーブルへ列として持ち込まない。

## 20-2. G2B-1: products/product_aliases/lottery_products 最終スキーマ

### `products`

| 列 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | integer PK autoincrement | not null | 内部専用、他テーブルからのFK参照にのみ使用 |
| public_product_id | text | not null, **unique** | UUIDv4 |
| canonical_name | text | not null | 表示用の正式名称 |
| normalized_name | text | not null | 現在の正規化名（`x-post-fetcher`の`normalizeProductName`出力と同一値域） |
| normalizer_version | text | nullable | この`normalizedName`を生成した正規化ロジックのバージョン |
| lifecycle_status | text | not null default `'active'` | `active` / `merged` / `archived`（`archived`は将来予約、G2B-1では使用しない） |
| merged_into_product_id | integer | nullable | 自己参照。`lifecycleStatus='merged'`になった際に設定する |
| created_at / updated_at | text | not null default CURRENT_TIMESTAMP | |

インデックス: `unique(public_product_id)`、`index(normalized_name)`（解決時の直接一致検索用）、`index(lifecycle_status)`。

### `product_aliases`

| 列 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | integer PK autoincrement | not null | |
| product_id | integer | not null | |
| alias_name | text | not null | 表示用の別名（生の代表`productNameRaw`等、非正規化形） |
| normalized_alias | text | not null, **unique** | 解決の実キー（旧設計の`aliasNormalizedName`に相当） |
| normalizer_version | text | nullable | この別名を生成した時点の正規化ロジックのバージョン |
| source | text | not null | `initial_migration` / `re_normalization` / `manual_merge` |
| created_at | text | not null default CURRENT_TIMESTAMP | |

インデックス: `unique(normalized_alias)`（解決の一意性を保証する要）、`index(product_id)`。

### `lottery_products`

将来の「1抽選に複数商品」を見据えた中間テーブルとして設計する（**G1初期案の`unique(lottery_id)`単独制約は撤回**）。

| 列 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | integer PK autoincrement | not null | |
| lottery_id | integer | not null | `lotteries.id`参照（既存テーブルは無変更） |
| product_id | integer | not null | |
| created_at | text | not null default CURRENT_TIMESTAMP | |

インデックス: `unique(lottery_id, product_id)`（同一ペアの重複行のみ防止、1抽選に複数`productId`を許容）、`index(product_id)`（逆引き用）。G2B-1のバックフィルでは**原則1抽選1商品**（1行のみ）を作成するが、スキーマ上は複数行を妨げない。

## 20-3. G2B-1実装前の報告（項目1〜9）

**1. products系3テーブルの最終スキーマ**: 20-2節の通り。

**2. unique制約とインデックス**: `products.public_product_id`（unique）、`product_aliases.normalized_alias`（unique、解決キー）、`lottery_products.(lottery_id, product_id)`（unique、複合）。検索性能のための非unique indexを`products.normalized_name`・`product_aliases.product_id`・`lottery_products.product_id`に付与。

**3. publicProductIdの生成方法**: `crypto.randomUUID()`（UUIDv4）。G2Aの`users.publicUserId`と同じ理由（完全ランダムでタイムスタンプ情報を含まない、Workers/Node双方でネイティブ対応、追加ライブラリ不要）。

**4. 完全一致判定の具体的条件**: `resolveProductId(normalizedProductName)`は`product_aliases.normalized_alias = 入力値`の**厳密な文字列完全一致**のみで判定する。あいまい一致・部分一致・大文字小文字正規化等の追加ロジックは一切行わない（`x-post-fetcher`の`normalizeProductName`が既にNFKC正規化・空白圧縮・引用符除去を行った後の値をそのまま比較するため、二重の正規化はしない）。一致すれば`products.merged_into_product_id`のチェーンを辿って最終的な統合先`productId`を返す。

**5. サイズ・色・型番の誤統合防止方針**: `normalizeProductName`（NFKC正規化・空白圧縮・引用符除去のみ）はサイズ/色/型番等の識別トークンを削除しないため、**入力文字列自体に差異があれば正規化後も差異は残り、異なる商品として扱われる**（自動統合のリスクは低い）。残るリスクは「そもそも元の投稿本文に区別情報が含まれていない」というデータ品質側の問題であり、正規化ロジックでは解決できない。この場合の対策は自動化せず、`canonicalName`とcard_typeを人手でレビューする運用（3章で確定済みの「重複許容・誤統合回避」方針）に委ねる。

**6. null・空文字・不正名称の扱い**: `normalizeProductName`は入力がnull/空/トリム後空文字の場合`null`を返す実装を確認済み（`services/normalize.ts`）。よって`lotteries.normalized_product_name`がnullのものはバックフィル対象から除外する（モバイル側の`groupLotteriesByProduct`が`if (!key) continue`としている既存挙動と整合）。念のためバックフィルクエリでは`WHERE normalized_product_name IS NOT NULL AND normalized_product_name != ''`の両方でガードする。極端に短い文字列（1〜2文字等）や数字のみの名称を弾く追加バリデーションは行わない（誤検知リスクの方が大きいため）。

**7. バックフィルアルゴリズム**:
```
1. SELECT DISTINCT normalized_product_name FROM lotteries
   WHERE normalized_product_name IS NOT NULL AND normalized_product_name != ''
2. 各値について:
   a. product_aliases.normalized_alias で既存を検索 → あれば手順3へ進まずスキップ（冪等性）
   b. 代表行（同一normalizedNameを持つ行のうちproductNameRawが非nullかつcreatedAt最新）を選ぶ
   c. products へ1行INSERT
      (canonicalName=代表行のproductNameRaw, normalizedName=対象値,
       normalizerVersion=代表行のnormalizerVersion, lifecycleStatus='active')
   d. product_aliases へ自己エイリアス行をINSERT
      (aliasName=代表行のproductNameRaw, normalizedAlias=対象値,
       normalizerVersion=代表行のnormalizerVersion, source='initial_migration')
3. normalized_product_name が非nullな全lotteries行について:
   a. resolveProductId(normalizedProductName) で productId を解決
   b. lottery_products に (lotteryId, productId) が無ければINSERT（あればスキップ）
```

**8. バックフィルの冪等性**: 手順2-aで`product_aliases.normalized_alias`のunique制約を検索の正とするため、同じ値に対して2回目以降の実行は新規`products`行を作成しない。手順3-bも`(lottery_id, product_id)`の存在チェック（またはunique制約への違反をG2Aで確立した`isUniqueConstraintViolation`パターンで捕捉しスキップ）により重複行を作らない。`lotteries`テーブルへは一切書き込まないため、既存データへの影響はゼロ。

**9. 正規化バージョン更新時の扱い**: `normalizerVersion`を`products`・`product_aliases`双方に保存する目的は、将来`x-post-fetcher`側の正規化ロジック（`NORMALIZER_VERSION`定数）が変わった際に「この商品/別名がどのバージョンの正規化結果か」を人手でのレビュー時に判別できるようにするため。G2B-1では正規化バージョン変更を検知して自動的に何かを行う処理は実装しない（3章の方針通り、バージョンが変わり新しい`normalizedProductName`が生成されても自動統合はせず新規`products`行として作成する）。将来、正規化ロジックが変わった場合の運用は「`normalizerVersion`が古い`products`行を定期的に一覧し、対応する新しい正規化名の商品と実際に同一かどうかを人手で確認し、同一であれば`manual_merge`として統合する」という手動レビューフローを想定する（自動化はしない）。

**商品分割が必要になった場合の移行方法**（6章で要求された追加項目）: 統合の逆操作として、以下の手順を想定する（G2B-1では実装せず、将来の管理操作として設計のみ示す）。
1. 分割後の新しい実体を表す`products`行を新規作成する（新しい`publicProductId`・`canonicalName`）
2. 分割対象に該当する`lottery_products`行を洗い出し、該当行の`productId`を新しい商品IDへ更新する（どの抽選が分割後のどちらに属するかは人手判断、自動分割ロジックは持たない）
3. 分割対象に特有の`product_aliases`行があれば、新しい商品IDへ付け替える
4. 将来`followed_products`（G2B-3）が存在する時点で分割が発生した場合、旧商品をフォローしていたユーザーがどちらの新商品を意図していたかは自動判定できないため、影響を受けるユーザーへの通知や両方への暫定フォロー付与等の運用は別途検討する（本計画のスコープ外、既知の残課題として記録する）

## 20-4. 想定リスク（追加分）

| リスク | 重大度 |
|---|---|
| 商品分割時のユーザーフォロー先の自動判定不可（20-3節末尾） | Nice to have（G2B-3実装時に再検討） |
| `lifecycleStatus`と`mergedIntoProductId`の二重管理（片方だけ更新されて不整合になる可能性） | Important（更新は必ず両方を同一トランザクションで変更するルールを実装時に徹底する） |

---

**本追記に基づき、コード変更・DB変更は未実施です。G2B-1（products/product_aliases/lottery_products＋バックフィル）の実装に着手してよいか、ご確認をお願いします。**

---
---

# 改訂2（unique制約の最終判断・実装着手）

## 20-5. `product_aliases`のunique制約: `unique(normalized_alias, normalizer_version)`を採用

**採用**: `unique(normalized_alias, normalizer_version)`（第二候補）。
**不採用**: `unique(product_id, normalized_alias, normalizer_version)`（第一候補）。

**理由**: 第一候補（`productId`を制約に含む）は、`productId`が異なれば同じ`(normalizedAlias, normalizerVersion)`の組み合わせが**複数行存在できてしまう**。これは「同一の別名文字列＋同一バージョンが2つの異なる商品を指す」状態をDB制約レベルで防げないことを意味し、`resolveProductId`の検索が本質的に非一意になり得る（＝要求されている「同一normalizedAliasに複数候補がある異常系」を防ぐのではなく、むしろ発生を許容してしまう）。

第二候補（`productId`を含めない）は、「この別名文字列＋このバージョンの正規化ロジックが生成した値」は常に1つの商品を指す、という不変条件をDB制約で保証する。一方で、**同じ別名文字列が異なる`normalizerVersion`の下では別々の行として独立に存在できる**ため、将来正規化ロジックが変わり、たまたま無関係な別商品が同じ文字列に正規化された場合でも、バージョンが異なれば制約違反にならず正しく別行として扱える（＝ユーザーが懸念した「将来の別商品衝突」を回避する設計）。

**`resolveProductId`への反映**: 検索は`(normalizedAlias, normalizerVersion)`の完全一致を第一に試みる。見つからない場合、同じ`normalizedAlias`を持つ他バージョンの行を横断検索し、それらが指す`productId`が単一であれば同一商品とみなし新バージョンのエイリアス行を追加する。複数の異なる`productId`を指していれば、自動選択せず要レビュー扱いにする（実装詳細は20-6節）。

**同じnormalizedAliasを別productへ関連付ける必要が生じた場合の移行方法**（コメントとしてもスキーマに残す）: `unique(normalized_alias, normalizer_version)`のもとでは、同一`(normalizedAlias, normalizerVersion)`の組を持つ行は常に1つしか存在しないため、「付け替え」は新規行の追加ではなく、**既存のその1行の`productId`を直接UPDATEする**operationになる（制約違反は起きない）。人手による訂正操作として、`audit_logs`テーブル（G2A実装済み）に`action: 'product_alias_repointed'`等の記録を残すことを推奨する（G2B-1では自動化しない、将来の管理操作の設計指針として記録）。

---

# 改訂3（G2B-Hardening 完了・ユーザー承認・正式完了）

ステータス: **正式完了**（コード変更・DB変更を含む実装済み。以降の章は完了確認の記録）。

## 23. 承認内容（ユーザー確認済み）

- G2B-1〜G2B-5 実装済み
- 全書き込みAPIを`idempotency_records`へ統一
- 台帳確認・業務更新・台帳記録を同一トランザクションで実行
- 古い操作の遅延再送を防止
- 異なるpayload / operationType / resourceKeyの再利用を409（`IDEMPOTENCY_CONFLICT`）で拒否
- 論理削除からの復元で同じ行IDを維持
- `status_history`の参照先を維持
- 同時追加・同時復元で重複なし
- `0015`マイグレーション検証済み
- cleanup SQL（`cleanup-duplicate-soft-deletes.sql`）は未実行
- 全315テスト成功
- typecheck / wrangler dry-run / 全マイグレーション経路成功
- 本番Turso・モバイル・EAS・RevenueCatは未実行

## 24. G2B完了を妨げない残課題（登録）

**1. `idempotency_records`の保持期間**
- 現時点では削除バッチを有効化しない
- 14日削除はまだ確定しない（モバイルのオフライン操作有効期限と合わせて後で決定する）
- `responseJson`へトークン・Secret・認証情報を保存しない
- `responseJson`のサイズ上限を設ける
- 将来削除する場合、期限切れ操作をモバイル側でも送信しない設計にする（[[mobile-g3-auth-sync-plan]]15章で設計指針として反映済み）

**2. 商品の事後統合**
- 商品統合API実装時に`followed_products`を統合先へ移行する
- `lottery_products`も統合先へ移行する
- 重複フォローを解消する
- `GET /me/followed-products`でもcanonical productを解決する
- 統合処理は同一トランザクションで行う

**3. 削除済み重複データ**
- `cleanup-duplicate-soft-deletes.sql`は本番でまだ実行しない
- 実行前にプレビュー・バックアップ・ステージング相当リハーサルを行う

**本改訂により、Mobile-G2B（G2B-Hardening含む）は正式完了とする。次はMobile-G3（`docs/mobile-g3-auth-sync-plan.md`）へ進む。**

---
