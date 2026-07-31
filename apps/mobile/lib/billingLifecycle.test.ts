import Purchases from 'react-native-purchases';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNamespaceStore } from '@/lib/accountNamespace';
import {
  __resetBillingLifecycleForTests,
  ensureRevenueCatLogin,
  isRevenueCatUserMatchingCurrentAuthUser,
  registerCustomerInfoListener,
  revenueCatLogout,
} from '@/lib/billingLifecycle';
import { __resetPurchasesForTests, configurePurchases } from '@/lib/purchases';
import { useAuthStore } from '@/stores/authStore';
import { useBillingStore } from '@/stores/billingStore';

function customerInfoWith(originalAppUserId: string, premiumActive: boolean) {
  return {
    originalAppUserId,
    entitlements: {
      active: premiumActive ? { premium: { productIdentifier: 'cardhub_premium_monthly', expirationDate: null } } : {},
    },
  } as any;
}

function setAuthUser(publicUserId: string | null) {
  useAuthStore.setState({
    user: publicUserId
      ? { publicUserId, displayName: null, email: null, accountStatus: 'active', scheduledDeletionAt: null, cachedAppleDisplayName: null }
      : null,
  });
}

describe('lib/billingLifecycle', () => {
  beforeEach(() => {
    __resetPurchasesForTests();
    __resetBillingLifecycleForTests();
    useBillingStore.getState().reset();
    useNamespaceStore.setState({ namespace: 'guest', isSwitching: false, generation: 0 });
    setAuthUser(null);
    vi.clearAllMocks();
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  });

  describe('ensureRevenueCatLogin', () => {
    it('APIキー未設定ならbillingStoreはnotConfiguredのまま何もしない', async () => {
      await ensureRevenueCatLogin('user-1');
      expect(Purchases.logIn).not.toHaveBeenCalled();
      expect(useBillingStore.getState().billingStatus).toBe('notConfigured');
    });

    it('成功時、CustomerInfoをbillingStoreへ反映する', async () => {
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-key';
      const info = customerInfoWith('user-1', true);
      vi.mocked(Purchases.logIn).mockResolvedValue({ customerInfo: info, created: false } as any);
      vi.mocked(Purchases.getAppUserID).mockResolvedValue('user-1');

      await ensureRevenueCatLogin('user-1');

      expect(Purchases.logIn).toHaveBeenCalledWith('user-1');
      expect(useBillingStore.getState().localEntitlementActive).toBe(true);
      expect(useBillingStore.getState().productType).toBe('unknown'); // Product ID未確定のため誤推測せずunknown
    });

    it('App User IDが一致しない場合は反映しない', async () => {
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-key';
      const info = customerInfoWith('user-1', true);
      vi.mocked(Purchases.logIn).mockResolvedValue({ customerInfo: info, created: false } as any);
      vi.mocked(Purchases.getAppUserID).mockResolvedValue('someone-else'); // 不一致

      await ensureRevenueCatLogin('user-1');

      expect(useBillingStore.getState().localEntitlementActive).toBe(false);
    });

    it('logIn処理中に世代が変わったら結果を破棄する（user切替の割り込み）', async () => {
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-key';
      const info = customerInfoWith('user-1', true);
      vi.mocked(Purchases.getAppUserID).mockResolvedValue('user-1');
      vi.mocked(Purchases.logIn).mockImplementation(async () => {
        // logIn実行中に別のnamespace切替が割り込んだ状況を模す。
        useNamespaceStore.setState((s) => ({ generation: s.generation + 1 }));
        return { customerInfo: info, created: false } as any;
      });

      await ensureRevenueCatLogin('user-1');

      expect(useBillingStore.getState().localEntitlementActive).toBe(false);
    });

    it('logInが例外を投げても呼び出し元へは伝播しない（ベストエフォート）', async () => {
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-key';
      vi.mocked(Purchases.logIn).mockRejectedValue(new Error('network'));

      await expect(ensureRevenueCatLogin('user-1')).resolves.toBeUndefined();
    });

    it('user A → guest → user Bと遷移すると、Bの状態のみが反映されAの状態は残らない', async () => {
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-key';

      // user Aとしてログイン、premium状態を反映。
      vi.mocked(Purchases.getAppUserID).mockResolvedValue('user-a');
      vi.mocked(Purchases.logIn).mockResolvedValue({ customerInfo: customerInfoWith('user-a', true), created: false } as any);
      await ensureRevenueCatLogin('user-a');
      expect(useBillingStore.getState().localEntitlementActive).toBe(true);

      // guestへ戻る（ログアウト相当）。
      await revenueCatLogout();
      expect(useBillingStore.getState().localEntitlementActive).toBe(false);

      // user Bとしてログイン、Bはpremiumではない。
      vi.mocked(Purchases.getAppUserID).mockResolvedValue('user-b');
      vi.mocked(Purchases.logIn).mockResolvedValue({ customerInfo: customerInfoWith('user-b', false), created: false } as any);
      await ensureRevenueCatLogin('user-b');

      expect(useBillingStore.getState().localEntitlementActive).toBe(false);
    });
  });

  describe('revenueCatLogout', () => {
    it('configured時、Purchases.logOutを呼びbillingStoreをリセットする', async () => {
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-key';
      vi.mocked(Purchases.logIn).mockResolvedValue({ customerInfo: customerInfoWith('user-1', true), created: false } as any);
      vi.mocked(Purchases.getAppUserID).mockResolvedValue('user-1');
      await ensureRevenueCatLogin('user-1');
      expect(useBillingStore.getState().localEntitlementActive).toBe(true);

      await revenueCatLogout();

      expect(Purchases.logOut).toHaveBeenCalled();
      expect(useBillingStore.getState().localEntitlementActive).toBe(false);
      expect(useBillingStore.getState().billingStatus).toBe('notConfigured');
    });

    it('notConfigured時もクラッシュせずbillingStoreをリセットする', async () => {
      await expect(revenueCatLogout()).resolves.toBeUndefined();
      expect(Purchases.logOut).not.toHaveBeenCalled();
    });
  });

  describe('isRevenueCatUserMatchingCurrentAuthUser', () => {
    it('signedOutならfalse', async () => {
      expect(await isRevenueCatUserMatchingCurrentAuthUser()).toBe(false);
    });

    it('App User IDが一致すればtrue', async () => {
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-key';
      configurePurchases();
      setAuthUser('user-1');
      vi.mocked(Purchases.getAppUserID).mockResolvedValue('user-1');

      expect(await isRevenueCatUserMatchingCurrentAuthUser()).toBe(true);
    });

    it('App User IDが一致しなければfalse', async () => {
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-key';
      configurePurchases();
      setAuthUser('user-1');
      vi.mocked(Purchases.getAppUserID).mockResolvedValue('different-user');

      expect(await isRevenueCatUserMatchingCurrentAuthUser()).toBe(false);
    });
  });

  describe('registerCustomerInfoListener', () => {
    it('getAppUserID()が現在のログインユーザーと一致する場合のみ反映する（originalAppUserIdは無視）', async () => {
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-key';
      let capturedListener: ((info: any) => void) | undefined;
      vi.mocked(Purchases.addCustomerInfoUpdateListener).mockImplementation((listener) => {
        capturedListener = listener;
      });

      configurePurchases();
      setAuthUser('user-1');
      registerCustomerInfoListener();

      vi.mocked(Purchases.getAppUserID).mockResolvedValue('user-2'); // SDK上は別ユーザー
      capturedListener?.(customerInfoWith('user-1', true)); // originalAppUserIdは一致していても
      await vi.waitFor(() => {
        expect(useBillingStore.getState().localEntitlementActive).toBe(false);
      });

      vi.mocked(Purchases.getAppUserID).mockResolvedValue('user-1'); // SDK上も一致
      capturedListener?.(customerInfoWith('user-1', true));
      await vi.waitFor(() => {
        expect(useBillingStore.getState().localEntitlementActive).toBe(true);
      });
    });

    it('anonymous IDからpublicUserIdへlogIn後も、originalAppUserIdがanonymous IDのままなら反映のみgetAppUserID()基準で行う', async () => {
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-key';
      let capturedListener: ((info: any) => void) | undefined;
      vi.mocked(Purchases.addCustomerInfoUpdateListener).mockImplementation((listener) => {
        capturedListener = listener;
      });

      configurePurchases();
      setAuthUser('user-1');
      registerCustomerInfoListener();

      // originalAppUserIdはRevenueCatが最初に発行したanonymous IDのまま（logIn後もoriginalAppUserIdは変わらない）。
      vi.mocked(Purchases.getAppUserID).mockResolvedValue('user-1');
      capturedListener?.(customerInfoWith('$RCAnonymousID:abc123', true));

      await vi.waitFor(() => {
        expect(useBillingStore.getState().localEntitlementActive).toBe(true);
      });
    });

    it('getAppUserID()解決前にnamespace世代が変わったら結果を破棄する', async () => {
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-key';
      let capturedListener: ((info: any) => void) | undefined;
      vi.mocked(Purchases.addCustomerInfoUpdateListener).mockImplementation((listener) => {
        capturedListener = listener;
      });

      configurePurchases();
      setAuthUser('user-1');
      registerCustomerInfoListener();

      let resolveAppUserId: (id: string) => void = () => {};
      vi.mocked(Purchases.getAppUserID).mockImplementation(
        () => new Promise((resolve) => (resolveAppUserId = resolve))
      );

      capturedListener?.(customerInfoWith('user-1', true));
      useNamespaceStore.setState((s) => ({ generation: s.generation + 1 })); // 割り込み
      resolveAppUserId('user-1');

      await vi.waitFor(() => {
        expect(Purchases.getAppUserID).toHaveBeenCalled();
      });
      expect(useBillingStore.getState().localEntitlementActive).toBe(false);
    });

    it('2回呼んでも登録は1度だけ', () => {
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'test-key';
      configurePurchases();
      registerCustomerInfoListener();
      registerCustomerInfoListener();
      expect(Purchases.addCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
    });
  });
});
