import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isLocalEntitlementActive, localExpirationDate, localProductType } from '@/lib/entitlements';

function customerInfoWith(active: Record<string, { productIdentifier: string; expirationDate: string | null }>) {
  return { entitlements: { active } } as any;
}

describe('isLocalEntitlementActive', () => {
  it('premium entitlementがactiveならtrue', () => {
    const info = customerInfoWith({ premium: { productIdentifier: 'cardhub_premium_monthly', expirationDate: null } });
    expect(isLocalEntitlementActive(info)).toBe(true);
  });

  it('premium entitlementが無ければfalse', () => {
    expect(isLocalEntitlementActive(customerInfoWith({}))).toBe(false);
  });

  it('customerInfoがnullならfalse', () => {
    expect(isLocalEntitlementActive(null)).toBe(false);
  });
});

describe('localProductType', () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID;
    delete process.env.EXPO_PUBLIC_REVENUECAT_LIFETIME_PRODUCT_ID;
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID;
    delete process.env.EXPO_PUBLIC_REVENUECAT_LIFETIME_PRODUCT_ID;
  });

  it('設定済みmonthlyProductIdと一致すれば"subscription"', () => {
    process.env.EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID = 'cardhub_premium_monthly';
    const info = customerInfoWith({ premium: { productIdentifier: 'cardhub_premium_monthly', expirationDate: null } });
    expect(localProductType(info)).toBe('subscription');
  });

  it('設定済みlifetimeProductIdと一致すれば"lifetime"', () => {
    process.env.EXPO_PUBLIC_REVENUECAT_LIFETIME_PRODUCT_ID = 'cardhub_premium_lifetime';
    const info = customerInfoWith({ premium: { productIdentifier: 'cardhub_premium_lifetime', expirationDate: null } });
    expect(localProductType(info)).toBe('lifetime');
  });

  it('Product ID未確定（マップ未設定）で有効なentitlementがある場合は誤推測せず"unknown"', () => {
    const info = customerInfoWith({ premium: { productIdentifier: 'cardhub_premium_monthly', expirationDate: null } });
    expect(localProductType(info)).toBe('unknown');
  });

  it('マップに存在しないproductIdentifierは"unknown"（部分一致による推測はしない）', () => {
    process.env.EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID = 'cardhub_premium_monthly';
    const info = customerInfoWith({ premium: { productIdentifier: 'some_other_product', expirationDate: null } });
    expect(localProductType(info)).toBe('unknown');
  });

  it('entitlementが無ければnull', () => {
    expect(localProductType(customerInfoWith({}))).toBeNull();
  });
});

describe('localExpirationDate', () => {
  it('expirationDateを返す', () => {
    const info = customerInfoWith({ premium: { productIdentifier: 'cardhub_premium_monthly', expirationDate: '2026-12-31T00:00:00.000Z' } });
    expect(localExpirationDate(info)).toBe('2026-12-31T00:00:00.000Z');
  });

  it('entitlementが無ければnull', () => {
    expect(localExpirationDate(customerInfoWith({}))).toBeNull();
  });
});
