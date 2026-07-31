import { beforeEach, describe, expect, it } from 'vitest';

import { useBillingStore } from '@/stores/billingStore';

describe('billingStore', () => {
  beforeEach(() => {
    useBillingStore.getState().reset();
  });

  it('初期状態はnotConfigured・未検証', () => {
    const state = useBillingStore.getState();
    expect(state.billingStatus).toBe('notConfigured');
    expect(state.localEntitlementActive).toBe(false);
    expect(state.serverPremiumActive).toBe(false);
    expect(state.verificationStatus).toBe('unverified');
  });

  it('applyServerEntitlementsはserverPremiumActive・verificationStatusを更新する', () => {
    useBillingStore.getState().applyServerEntitlements({
      premiumActive: true,
      productType: 'monthly',
      expiresAt: '2026-12-31T00:00:00.000Z',
      lastVerifiedAt: '2026-08-01T00:00:00.000Z',
      stale: false,
    });

    const state = useBillingStore.getState();
    expect(state.serverPremiumActive).toBe(true);
    expect(state.productType).toBe('monthly');
    expect(state.verificationStatus).toBe('verified');
  });

  it('staleなサーバー応答はverificationStatus=staleになる', () => {
    useBillingStore.getState().applyServerEntitlements({
      premiumActive: true,
      productType: 'lifetime',
      expiresAt: null,
      lastVerifiedAt: '2026-01-01T00:00:00.000Z',
      stale: true,
    });

    expect(useBillingStore.getState().verificationStatus).toBe('stale');
  });

  it('resetで初期状態へ戻る', () => {
    useBillingStore.getState().applyLocalCustomerInfo(true, 'monthly');
    useBillingStore.getState().setBillingStatus('configured');

    useBillingStore.getState().reset();

    const state = useBillingStore.getState();
    expect(state.billingStatus).toBe('notConfigured');
    expect(state.localEntitlementActive).toBe(false);
  });
});
