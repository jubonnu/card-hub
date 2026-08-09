# 既知の設計ギャップ

フェーズ横断で残っている、意図的に対応を保留している設計ギャップを記録する。各項目は
対応するフェーズのドキュメントとは別にここへ集約し、対応方針が決まり次第このファイルから
該当フェーズのドキュメントへ反映・削除する。

---

## ～~アカウント削除（`DELETE /me`）まわりの未実装~～ → 解決済み（2026-08-08確認）

2026-08-01、Mobile-G4シミュレーター動作確認中に発見。当時は以下の4点が未実装だった。

- `pending_deletion`のキャンセル機能が無い
- `scheduledDeletionAt`到来後の削除バッチが無い
- 削除予約中ユーザーの再ログイン仕様が未確定
- RevenueCat entitlement・認証セッション等の削除/匿名化方針が未確定

その後（x-post-fetcher側のコミット`a4928a5`「G2A残修正: アカウント猶予期間経過後の物理削除
バッチとCron Trigger登録」）で全て実装済みであることを2026-08-08に確認した。

- `routes/auth.ts`の再ログイン処理が`accountStatus === "pending_deletion"`を検出し、
  `accountDeletionRepository.ts`の`cancelPendingAccountDeletion`で削除要求を取り消す
  （プライバシーポリシー記載の「猶予期間中に再度サインインすると自動的に取り消される」通りの挙動）
- `src/index.ts`の`scheduled`ハンドラ（1時間毎のCron Trigger、`wrangler.toml`で本番稼働中）が
  `runAccountHardDeletionBatch`を呼び、猶予期間経過後のアカウントを物理削除する
  （`hardDeleteUserAccount`: PII消去・認証情報物理削除・抽選等は論理削除・`audit_logs`のみ
  userId参照を残したまま保持）
- `tests/accountDeletionLifecycle.test.ts`（5テスト）で再ログインキャンセル・物理削除の
  両方を検証済み

**対応方針**: 解決済み。追加対応は不要。

### CardHubアカウント削除とApple購入の関係（確定仕様、2026-08-02）

G4-5準備にあたりユーザー承認済みの確定事項として記録する。

- **CardHubアカウントを削除してもApp Storeの購入履歴は削除されない**（購入記録はApple ID側に帰属し、CardHub側のアカウント削除とは独立している）
- **有効な月額契約はCardHubアカウント削除だけでは解約されない**（Appleのサブスクリプションは自動更新され続ける）
- **解約はAppleのサブスクリプション管理画面（設定アプリまたはApp Store）でユーザー自身が行う**必要がある。CardHub側に解約を代行する機能は無い
- **同じApple Accountで新しいCardHubアカウントを作成し「購入を復元」を実行した場合、新しいアカウントへの権利移行を許可する**（Transfer Behavior: Transfer to new App User ID。RevenueCat/Appleの標準的な`restorePurchases()`挙動をそのまま採用し、CardHub側で復元を制限する実装は行わない）

この方針により、10章（アカウント削除後の買い切り復元方針）の実装要否についても「新規実装不要、既存の`restorePurchases()`をそのまま使う」という結論を維持する。

---

## ～~統計機能: `skipped`ステータスの経路を区別できない~~ → 解決済み（2026-08-08対応）

`user_lotteries.status`の遷移ホワイトリスト（`services/lotteryStatusTransitions.ts`）上、`skipped`には2つの異なる経路がある。

- `planned → skipped`: 応募自体を見送った（未応募のまま終わらせた）
- `won → skipped`: 当選したが購入を見送った（購入見送り）

2026-08のMobile-G6統計API書き直し（lotteryId単位→応募試行単位の再構築、`services/lotteryAttempts.ts`）により、`skippedCount`は仕様上すでに「購入見送り」のみを指すようになっていた（応募を経由しない見送りは試行として記録されないため）。ただし「応募見送り」側の件数を独立して返すフィールドが無く、可視化できていなかった。

**対応内容**: `statisticsRepository.ts`の`getStatisticsSummary`に`applicationSkippedCount`（現在ステータスが`skipped`かつ対応する応募試行が存在しない件数＝応募見送り）を追加し、`skippedCount`（購入見送り）と完全に分離して返すようにした。当選率の分子・分母どちらにも含めない扱いは従来通り。`tests/meStatistics.test.ts`にケースを追加して検証済み。

**対応方針**: 解決済み。モバイル側UIへの表示は`app/stats/index.tsx`に反映済み（見出し「見送り内訳」）。
