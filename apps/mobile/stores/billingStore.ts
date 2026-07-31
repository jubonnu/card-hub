import { create } from 'zustand';

import type { BillingStatus, VerificationStatus } from '@/types/billing';
import type { EntitlementsResponse } from '@/schemas/revenueCat';

/**
 * RevenueCat表示状態とサーバー確定状態を別フィールドで保持する（Mobile-G4-4）。
 * 永続化はしない（長期間キャッシュを信用しない、10章の確定方針）。ログアウト時は
 * `reset()`を呼ぶ（`lib/authActions.ts`の`localSignOutCleanup`から、`useSyncConflictsStore`と
 * 同じパターンで呼ばれる）。
 */
interface BillingState {
  billingStatus: BillingStatus;
  /** RevenueCat CustomerInfo由来。表示専用、実際の許可判定には使わない。 */
  localEntitlementActive: boolean;
  /** サーバー`subscription_entitlements`由来。premium APIの実際の許可判定はサーバー側の
   * 個々のAPI呼び出し時に行われるため、ここでの値もあくまで表示・UI分岐用。 */
  serverPremiumActive: boolean;
  verificationStatus: VerificationStatus;
  lastVerifiedAt: string | null;
  productType: string | null;
  expiresAt: string | null;
  setBillingStatus: (status: BillingStatus) => void;
  applyLocalCustomerInfo: (active: boolean, productType: string | null) => void;
  applyServerEntitlements: (data: EntitlementsResponse) => void;
  setVerificationStatus: (status: VerificationStatus) => void;
  reset: () => void;
}

const DEFAULT_STATE: Pick<
  BillingState,
  'billingStatus' | 'localEntitlementActive' | 'serverPremiumActive' | 'verificationStatus' | 'lastVerifiedAt' | 'productType' | 'expiresAt'
> = {
  billingStatus: 'notConfigured',
  localEntitlementActive: false,
  serverPremiumActive: false,
  verificationStatus: 'unverified',
  lastVerifiedAt: null,
  productType: null,
  expiresAt: null,
};

export const useBillingStore = create<BillingState>()((set) => ({
  ...DEFAULT_STATE,
  setBillingStatus: (status) => set({ billingStatus: status }),
  applyLocalCustomerInfo: (active, productType) => set({ localEntitlementActive: active, productType }),
  applyServerEntitlements: (data) =>
    set({
      serverPremiumActive: data.premiumActive,
      productType: data.productType,
      expiresAt: data.expiresAt,
      lastVerifiedAt: data.lastVerifiedAt,
      verificationStatus: data.stale ? 'stale' : 'verified',
    }),
  setVerificationStatus: (status) => set({ verificationStatus: status }),
  reset: () => set(DEFAULT_STATE),
}));
