import Purchases from 'react-native-purchases';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetPurchasesForTests,
  addCustomerInfoUpdateListener,
  configurePurchases,
  getAppUserId,
  getBillingStatus,
  getCurrentOffering,
  getCustomerInfo,
  purchasePackage,
  purchasesLogIn,
  purchasesLogOut,
  restorePurchases,
} from '@/lib/purchases';

const customerInfo = { entitlements: { active: {} } } as any;

describe('lib/purchases', () => {
  beforeEach(() => {
    __resetPurchasesForTests();
    vi.clearAllMocks();
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  });

  it('APIキー未設定ならnotConfiguredのままで、SDKのconfigureは呼ばれない', () => {
    configurePurchases();
    expect(getBillingStatus()).toBe('notConfigured');
    expect(Purchases.configure).not.toHaveBeenCalled();
  });

  it('APIキー設定時はconfiguredになりSDK.configureが呼ばれる', () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-public-key';
    configurePurchases();
    expect(getBillingStatus()).toBe('configured');
    expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: 'test-public-key' });
  });

  it('configureは1度しか実行されない', () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-public-key';
    configurePurchases();
    configurePurchases();
    configurePurchases();
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
  });

  it('notConfiguredの間はlogIn/logOut/getCustomerInfo/getOfferings/getAppUserIdがnullを返す', async () => {
    configurePurchases();
    expect(await purchasesLogIn('user-1')).toBeNull();
    expect(await purchasesLogOut()).toBeNull();
    expect(await getCustomerInfo()).toBeNull();
    expect(await getCurrentOffering()).toBeNull();
    expect(await getAppUserId()).toBeNull();
  });

  it('notConfiguredの間はpurchasePackage/restorePurchasesが安全にfailedを返す（クラッシュしない）', async () => {
    configurePurchases();
    const purchaseResult = await purchasePackage({} as any);
    expect(purchaseResult).toEqual({ type: 'failed', message: 'RevenueCatが未設定です' });

    const restoreResult = await restorePurchases();
    expect(restoreResult).toEqual({ type: 'failed', message: 'RevenueCatが未設定です' });
  });

  it('configured時、purchasesLogInはCustomerInfoを返す', async () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-public-key';
    configurePurchases();
    vi.mocked(Purchases.logIn).mockResolvedValue({ customerInfo, created: false } as any);

    const result = await purchasesLogIn('publicUserId-1');
    expect(Purchases.logIn).toHaveBeenCalledWith('publicUserId-1');
    expect(result).toBe(customerInfo);
  });

  it('月額プラン購入成功時はsuccessを返す', async () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-public-key';
    configurePurchases();
    vi.mocked(Purchases.purchasePackage).mockResolvedValue({ customerInfo, productIdentifier: 'cardhub_premium_monthly', transaction: {} } as any);

    const result = await purchasePackage({} as any);
    expect(result).toEqual({ type: 'success', customerInfo });
  });

  it('買い切りプラン購入成功時もsuccessを返す', async () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-public-key';
    configurePurchases();
    vi.mocked(Purchases.purchasePackage).mockResolvedValue({ customerInfo, productIdentifier: 'cardhub_premium_lifetime', transaction: {} } as any);

    const result = await purchasePackage({} as any);
    expect(result).toEqual({ type: 'success', customerInfo });
  });

  it('getCurrentOfferingはOfferings.currentを返す', async () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-public-key';
    configurePurchases();
    const current = { identifier: 'default', monthly: {}, lifetime: {} } as any;
    vi.mocked(Purchases.getOfferings).mockResolvedValue({ current, all: { default: current } } as any);

    const result = await getCurrentOffering();
    expect(result).toBe(current);
  });

  it('notConfiguredの間、getCurrentOfferingはSDKを呼ばずnullを返す', async () => {
    configurePurchases();
    const result = await getCurrentOffering();
    expect(result).toBeNull();
    expect(Purchases.getOfferings).not.toHaveBeenCalled();
  });

  it('ユーザーキャンセルはcancelledとして分類される（userCancelled=true）', async () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-public-key';
    configurePurchases();
    vi.mocked(Purchases.purchasePackage).mockRejectedValue({ code: 'other', userCancelled: true, message: 'canceled' });

    const result = await purchasePackage({} as any);
    expect(result).toEqual({ type: 'cancelled' });
  });

  it('ユーザーキャンセルはcancelledとして分類される（PURCHASE_CANCELLED_ERRORコード）', async () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-public-key';
    configurePurchases();
    vi.mocked(Purchases.purchasePackage).mockRejectedValue({ code: '1', userCancelled: false, message: 'canceled' });

    const result = await purchasePackage({} as any);
    expect(result).toEqual({ type: 'cancelled' });
  });

  it('Store側の失敗はfailedとして分類される', async () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-public-key';
    configurePurchases();
    vi.mocked(Purchases.purchasePackage).mockRejectedValue({ code: 'store_problem', userCancelled: false, message: 'ストアエラー' });

    const result = await purchasePackage({} as any);
    expect(result).toEqual({ type: 'failed', message: 'ストアエラー' });
  });

  it('復元成功時はsuccessを返す', async () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-public-key';
    configurePurchases();
    vi.mocked(Purchases.restorePurchases).mockResolvedValue(customerInfo);

    const result = await restorePurchases();
    expect(result).toEqual({ type: 'success', customerInfo });
  });

  it('復元失敗時はfailedを返す', async () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-public-key';
    configurePurchases();
    vi.mocked(Purchases.restorePurchases).mockRejectedValue(new Error('復元できませんでした'));

    const result = await restorePurchases();
    expect(result).toEqual({ type: 'failed', message: '復元できませんでした' });
  });

  it('addCustomerInfoUpdateListenerはunsubscribe関数を返し、呼ぶとremoveが呼ばれる', () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-public-key';
    configurePurchases();
    const listener = vi.fn();
    const unsubscribe = addCustomerInfoUpdateListener(listener);
    expect(Purchases.addCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);

    unsubscribe();
    expect(Purchases.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
  });

  it('notConfiguredの間はaddCustomerInfoUpdateListenerが登録せず、no-opのunsubscribeを返す', () => {
    configurePurchases();
    const listener = vi.fn();
    const unsubscribe = addCustomerInfoUpdateListener(listener);
    expect(Purchases.addCustomerInfoUpdateListener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });
});
