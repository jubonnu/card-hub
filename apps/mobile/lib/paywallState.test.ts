import { describe, expect, it } from 'vitest';

import { derivePaywallState, type PaywallStateInput } from '@/lib/paywallState';

const base: PaywallStateInput = {
  billingStatus: 'configured',
  authStatus: 'signedIn',
  isPremium: false,
  offeringsLoaded: true,
  offeringsLoadFailed: false,
  transient: 'idle',
};

describe('derivePaywallState', () => {
  it('billingStatusがnotConfiguredなら常にnotConfigured', () => {
    expect(derivePaywallState({ ...base, billingStatus: 'notConfigured' })).toBe('notConfigured');
  });

  it('未サインインならsignedOut', () => {
    expect(derivePaywallState({ ...base, authStatus: 'signedOut' })).toBe('signedOut');
  });

  it('Offering未取得・失敗なしはloadingOfferings', () => {
    expect(derivePaywallState({ ...base, offeringsLoaded: false })).toBe('loadingOfferings');
  });

  it('Offering未取得・取得失敗はofflineCached', () => {
    expect(derivePaywallState({ ...base, offeringsLoaded: false, offeringsLoadFailed: true })).toBe('offlineCached');
  });

  it('Offering取得済み・未premiumはready', () => {
    expect(derivePaywallState(base)).toBe('ready');
  });

  it('premium済みはpremium', () => {
    expect(derivePaywallState({ ...base, isPremium: true })).toBe('premium');
  });

  it.each([
    ['purchasing', 'purchasing'],
    ['restoring', 'restoring'],
    ['purchasePendingVerification', 'purchasePendingVerification'],
    ['serverVerificationFailed', 'serverVerificationFailed'],
    ['cancelled', 'cancelled'],
    ['failed', 'failed'],
  ] as const)('transient=%sはそのまま%sになる', (transient, expected) => {
    expect(derivePaywallState({ ...base, transient })).toBe(expected);
  });

  it('premium済みでもtransientの操作結果が優先される（購入直後の確認中表示等）', () => {
    expect(derivePaywallState({ ...base, isPremium: true, transient: 'purchasePendingVerification' })).toBe(
      'purchasePendingVerification'
    );
  });

  it('notConfigured・signedOutはtransientより優先される', () => {
    expect(derivePaywallState({ ...base, billingStatus: 'notConfigured', transient: 'purchasing' })).toBe('notConfigured');
    expect(derivePaywallState({ ...base, authStatus: 'signedOut', transient: 'purchasing' })).toBe('signedOut');
  });
});
