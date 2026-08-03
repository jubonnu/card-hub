import type { AuthStatus } from '@/stores/authStore';

export type StatisticsScreenState = 'signedOut' | 'notPremium' | 'loading' | 'error' | 'empty' | 'ready';

export interface StatisticsScreenStateInput {
  authStatus: AuthStatus;
  /** `billing.localEntitlementActive || billing.serverPremiumActive`（呼び出し側で合成、`app/paywall.tsx`と同式）。 */
  isPremium: boolean;
  loading: boolean;
  error: boolean;
  /** premium確認済みで取得したsummaryの保存件数。0件なら「まだデータが無い」空状態を区別する（11章）。 */
  savedCount: number;
}

/**
 * 統計画面（`app/stats/index.tsx`）の表示状態を1箇所で決定する純粋関数（Mobile-G6）。
 * `lib/paywallState.ts`の`derivePaywallState`と同じ設計（Reactから分離しvitestで検証可能にする）。
 */
export function deriveStatisticsScreenState(input: StatisticsScreenStateInput): StatisticsScreenState {
  if (input.authStatus !== 'signedIn') return 'signedOut';
  if (!input.isPremium) return 'notPremium';
  if (input.loading) return 'loading';
  if (input.error) return 'error';
  if (input.savedCount === 0) return 'empty';
  return 'ready';
}
