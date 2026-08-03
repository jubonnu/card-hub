# 既知の設計ギャップ

フェーズ横断で残っている、意図的に対応を保留している設計ギャップを記録する。各項目は
対応するフェーズのドキュメントとは別にここへ集約し、対応方針が決まり次第このファイルから
該当フェーズのドキュメントへ反映・削除する。

---

## アカウント削除（`DELETE /me`）まわりの未実装

2026-08-01、Mobile-G4シミュレーター動作確認中に発見。アカウント削除を実行→再起動→
再ログインしたところ、`accountStatus: pending_deletion`・`scheduledDeletionAt`が
維持されたまま通常ログインできてしまう挙動を確認した。調査の結果、これはバグではなく
以下の機能が最初から未実装であることが原因と判明した。

- **`pending_deletion`のキャンセル機能が未実装**: `accountDeletionRepository.ts`には
  `requestAccountDeletion`のみ存在し、削除要求を取り消す関数が無い。`routes/auth.ts`の
  `/auth/apple`ログイン処理も`accountStatus`・`scheduledDeletionAt`を一切見ておらず、
  削除予約中でも素通りで通常ログインとして扱われる。
- **`scheduledDeletionAt`到来後の削除バッチが未実装**: `src/db/schema.ts`の
  `accountDeletionRequests`テーブル定義コメントに明記の通り、`DELETE /me`は
  `pending_deletion`への状態遷移のみを行い、実際の物理削除を実行するバッチ処理は
  G2Aの時点から意図的にスコープ外とされていた。現状、`scheduledDeletionAt`を過ぎても
  何も削除されない。
- **削除予約中ユーザーの再ログイン仕様が未確定**: 再ログインを「削除キャンセルの意思表示」
  として扱うのか、明示的なキャンセル操作を別途必須にするのか、あるいはそもそも削除予約中は
  ログイン自体を拒否すべきなのか、product判断が行われていない。
- **RevenueCat entitlement・認証セッション・関連ユーザーデータの削除/匿名化方針が未確定**:
  物理削除バッチを実装する際、`subscription_entitlements`・`revenuecat_events`・
  Refresh Token・Apple関連の暗号化トークン等をどう扱うか（完全削除／匿名化／保持）の方針が
  Mobile-G4時点でも決まっていない。

**対応方針**: 現時点では対応しない。上記4点が解消されるまでは、削除要求後にユーザーが
再ログインすると削除予約表示が残り続ける状態が続く。対応するタイミング・担当フェーズは未定。

### CardHubアカウント削除とApple購入の関係（確定仕様、2026-08-02）

G4-5準備にあたりユーザー承認済みの確定事項として記録する。

- **CardHubアカウントを削除してもApp Storeの購入履歴は削除されない**（購入記録はApple ID側に帰属し、CardHub側のアカウント削除とは独立している）
- **有効な月額契約はCardHubアカウント削除だけでは解約されない**（Appleのサブスクリプションは自動更新され続ける）
- **解約はAppleのサブスクリプション管理画面（設定アプリまたはApp Store）でユーザー自身が行う**必要がある。CardHub側に解約を代行する機能は無い
- **同じApple Accountで新しいCardHubアカウントを作成し「購入を復元」を実行した場合、新しいアカウントへの権利移行を許可する**（Transfer Behavior: Transfer to new App User ID。RevenueCat/Appleの標準的な`restorePurchases()`挙動をそのまま採用し、CardHub側で復元を制限する実装は行わない）

この方針により、10章（アカウント削除後の買い切り復元方針）の実装要否についても「新規実装不要、既存の`restorePurchases()`をそのまま使う」という結論を維持する。

---

## 統計機能: `skipped`ステータスの経路を区別できない（Mobile-G6、2026-08-03）

`user_lotteries.status`の遷移ホワイトリスト（`services/lotteryStatusTransitions.ts`）上、`skipped`には2つの異なる経路がある。

- `planned → skipped`: 応募自体を見送った（未応募のまま終わらせた）
- `won → skipped`: 当選したが購入を見送った（購入見送り）

現在の`user_lotteries.status`カラムは**直前の遷移元を保持しない**（現在値が`skipped`であるという事実のみ）。区別するには`user_lottery_status_history`テーブルの該当行を`userLotteryId`で引き、直前の`fromStatus`が`'won'`か`'planned'`かを確認する必要があるが、統計API（`GET /me/statistics/summary`ほか、`repositories/statisticsRepository.ts`）はこの追加参照を行っていない。

**現状の扱い**: `skippedCount`は集計レスポンス上、区別のない単一の件数として返す（「応募見送り」「購入見送り」を合算した値）。当選率の分子・分母のどちらにも含めない（`docs/mobile-g1-...`10.4節に確定定義を記載）。

**対応方針**: 現時点では対応しない。区別して表示する価値が出てきた場合（例: 「購入見送り率」を独立指標として出したい等）、`user_lottery_status_history`を`fromStatus='won'`で絞り込むクエリを追加する形で拡張可能。対応するタイミング・担当フェーズは未定。
