import type { BillingStatus, PaywallState } from '@/types/billing';
import type { AuthStatus } from '@/stores/authStore';

/** 購入・復元操作の直近の結果（ユーザー操作起点、`app/paywall.tsx`のローカル状態）。 */
export type PaywallTransient =
  | 'idle'
  | 'purchasing'
  | 'restoring'
  | 'purchasePendingVerification'
  | 'cancelled'
  | 'failed'
  | 'serverVerificationFailed';

export interface PaywallStateInput {
  billingStatus: BillingStatus;
  authStatus: AuthStatus;
  /** `localEntitlementActive || serverPremiumActive`（呼び出し側で合成する）。 */
  isPremium: boolean;
  offeringsLoaded: boolean;
  offeringsLoadFailed: boolean;
  transient: PaywallTransient;
}

/**
 * 課金画面の表示状態を1箇所で決定する純粋関数（Mobile-G4-3、7章の状態一覧に対応）。
 * Reactコンポーネントから分離することで、Expo/ネイティブ環境が無いvitestでも検証できる。
 */
export function derivePaywallState(input: PaywallStateInput): PaywallState {
  if (input.billingStatus !== 'configured') return 'notConfigured';
  if (input.authStatus !== 'signedIn') return 'signedOut';

  if (input.transient === 'purchasing') return 'purchasing';
  if (input.transient === 'restoring') return 'restoring';
  if (input.transient === 'purchasePendingVerification') return 'purchasePendingVerification';
  if (input.transient === 'serverVerificationFailed') return 'serverVerificationFailed';
  if (input.transient === 'cancelled') return 'cancelled';
  if (input.transient === 'failed') return 'failed';

  if (input.isPremium) return 'premium';

  if (!input.offeringsLoaded) {
    return input.offeringsLoadFailed ? 'offlineCached' : 'loadingOfferings';
  }

  return 'ready';
}
