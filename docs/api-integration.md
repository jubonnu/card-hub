# API連携方針（Mobile-B）

Phase Mobile-Bで `GET /lotteries` と `GET /lotteries/:id` の実API接続を実装済み。対象範囲は**抽選一覧（全国の抽選タブ）と抽選詳細のみ**。ホーム・商品統合ビュー・カレンダー・統計・自分の抽選（お気に入り/フォロー中/チェックリスト/通知設定含む）は引き続き `data/mockData.ts` の静的モックデータで動作する（バックエンドに個人の応募結果や認証の概念が無いため）。

## 基本方針: 型を直接importしない

`CardHub`（本モバイルアプリ）と `x-post-fetcher`（バックエンド）は別npmプロジェクトであり、`packages/shared` 等を介した型の直接共有は行わない。理由:

- バックエンドの内部実装（DBスキーマ、Drizzleの型など）の変更が、モバイル側のビルドを無条件に壊すことを防ぐため
- モバイルアプリが必要とする型は「APIが実際に返すレスポンス」であり、バックエンドの内部型と完全に一致する必要はないため

代わりに、**モバイル側でZodスキーマを定義し、実際のAPIレスポンスに対して検証する**方式を採る（`apps/mobile/schemas/lotteryApi.ts`）。

## 接続設定

- 環境変数 `EXPO_PUBLIC_API_BASE_URL`（`.env` / `.env.example` で管理）。開発ビルド（`__DEV__`）でのみ未設定時に `http://localhost:8787`（x-post-fetcher/apps/worker のローカル開発サーバー）へフォールバックする。本番ビルドで未設定の場合はlocalhostへ暗黙フォールバックせず、`ApiClientError`（`kind: 'config'`）として明確にエラー扱いする（`apps/mobile/lib/apiClient.ts` の `getApiBaseUrl`）
- 実装済みエンドポイント:
  - `GET /lotteries` — 抽選一覧（`apps/mobile/lib/apiClient.ts` の `fetchLotteries`）
  - `GET /lotteries/:id` — 抽選詳細（`fetchLotteryById`）
- サーバー状態管理ライブラリ（TanStack Query等）は導入していない。2エンドポイントのみのため `hooks/useApiRequest.ts`（fetch + useState/useEffectの薄いラッパー）で対応

## 実データの欠損への対応方針

実際のバックエンドデータは「X投稿からのルールベース自動抽出結果」であり、締切日・当選発表日等が未取得のレコードが多く存在する（ローカル検証時点で6件中、締切日ありは2件のみ）。また `verificationStatus` は人手確認前の `extracted` が大半を占める。

これらを理由に一覧から除外せず、以下の方針で表示する:

- 締切日が無い場合は「詳細未定」という中立ステータス（`utils/publicLotteryDisplay.ts` の `derivePublicTimelineStatus`）
- `verificationStatus !== 'approved'` の場合は「要確認」の注意バッジ（`VerificationCautionBadge`）を別軸で表示
- 商品名・店舗名が null の場合は「商品名未確認」「店舗情報なし」等のフォールバック文言を表示し、レイアウトは崩さない

このロジックはPhase-Aのモック `LotteryStatus`（応募予定/当選など個人の応募結果を含む状態）とは意味的に別物のため、`PublicStatusBadge` / `PublicLotteryCard` として別コンポーネントに分離し、既存のモック専用コンポーネント（`StatusBadge` / `LotteryCard`）には手を加えていない。

## Zodスキーマ + fixtureテストの運用

1. x-post-fetcher/apps/worker のローカル開発サーバー（`npm run dev`、`local.db` 使用）から取得した実レスポンスを `apps/mobile/__fixtures__/api/` に保存済み（`lotteries-list.json` / `lottery-detail.json` / `lottery-detail-not-found.json`）
2. `apps/mobile/schemas/lotteryApi.ts` にZodスキーマを定義
3. `apps/mobile/schemas/lotteryApi.test.ts`（vitest）でfixtureをスキーマでパースするテストを追加済み。`npm run test -w @cardhub/mobile` で実行
   - fixtureのパースが失敗する = バックエンドのレスポンス形状が変わった、というシグナルとして機能する
4. バックエンドの型を手動コピーしてそのまま放置する運用は行わない

## CORS（Web向け）

x-post-fetcher/apps/worker の `/lotteries`, `/lotteries/:id` はもともとCORSヘッダーを返しておらず、Web（react-native-web）からのfetchがブラウザにブロックされていた。iOS/Android（Expo Go・ネイティブ）はCORSの対象外のため影響なし。

x-post-fetcher側に `hono/cors` を用いた最小限のミドルウェア（`apps/worker/src/publicCors.ts`）を追加し、`/lotteries` 系のみに適用した（`/ingest`, `/internal/*` には適用しない）。許可Originはローカル開発用のデフォルト（`http://localhost:8081` 等）+ 環境変数 `PUBLIC_WEB_ORIGINS`（カンマ区切り）で本番/ステージングのWeb Originを追加できる。詳細は x-post-fetcher 側のコミット/テスト（`apps/worker/tests/cors.test.ts`）を参照。

## 将来の移行

バックエンドAPIが安定し、エンドポイント数が増えてきた段階で、OpenAPI定義からのスキーマ/クライアント自動生成（例: `openapi-zod-client` 等）への移行を検討する。現時点では手動定義で十分小さい範囲のため、OpenAPI導入は見送る。

## 未実装（Mobile-C以降）

- ホーム・商品統合ビュー・カレンダー・統計・自分の抽選系のAPI接続
- 認証
- TanStack Query等によるキャッシュ/再検証
- ページネーション（`limit`/`offset`はクライアント実装済みだが、モバイル側はUI未接続。現状 `limit=100` 固定取得）
