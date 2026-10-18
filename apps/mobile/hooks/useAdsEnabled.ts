import { useBillingStore } from '@/stores/billingStore';

/**
 * 広告を表示すべきかどうか。プレミアム会員（サブスク加入者）には広告を表示しない。
 * `isPremium`の判定式は`app/(tabs)/profile.tsx`と同一のものを使う。
 */
export function useAdsEnabled(): boolean {
  const localEntitlementActive = useBillingStore((s) => s.localEntitlementActive);
  const serverPremiumActive = useBillingStore((s) => s.serverPremiumActive);
  return !(localEntitlementActive || serverPremiumActive);
}
