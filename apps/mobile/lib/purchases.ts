import Purchases, { PURCHASES_ERROR_CODE } from 'react-native-purchases';
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import type { BillingStatus, PurchaseOutcome, RestoreOutcome } from '@/types/billing';

/**
 * RevenueCat SDKの薄いアダプタ（Mobile-G4-1）。`react-native-purchases`を直接importするのは
 * このファイルのみとし、他のコードは本モジュール経由でのみSDKを触る（テストでのモック境界・
 * APIキー未設定時のno-op安全性をここへ集約するため）。
 *
 * `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`が未設定の間はSDKを初期化しない（クラッシュさせない）。
 * `billingStatus`が`'notConfigured'`の間、他の関数はすべて安全にno-op（`null`/失敗扱い）を返す。
 */

let didAttemptConfigure = false;
let billingStatus: BillingStatus = 'notConfigured';

export function getBillingStatus(): BillingStatus {
  return billingStatus;
}

/** アプリ起動中に1回だけ呼ぶ。2回目以降の呼び出しは無視する。 */
export function configurePurchases(): void {
  if (didAttemptConfigure) return;
  didAttemptConfigure = true;

  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (!apiKey) {
    billingStatus = 'notConfigured';
    return;
  }

  Purchases.configure({ apiKey });
  billingStatus = 'configured';
}

export async function purchasesLogIn(appUserId: string): Promise<CustomerInfo | null> {
  if (billingStatus !== 'configured') return null;
  const { customerInfo } = await Purchases.logIn(appUserId);
  return customerInfo;
}

export async function purchasesLogOut(): Promise<CustomerInfo | null> {
  if (billingStatus !== 'configured') return null;
  return Purchases.logOut();
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (billingStatus !== 'configured') return null;
  return Purchases.getCustomerInfo();
}

/** RevenueCat Dashboardの「現在のOffering」を返す（`monthly`/`lifetime`の便利プロパティ付き）。 */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (billingStatus !== 'configured') return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

function isUserCancelledError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { code?: unknown; userCancelled?: unknown };
  return err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || err.userCancelled === true;
}

function toErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return '処理に失敗しました';
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  if (billingStatus !== 'configured') {
    return { type: 'failed', message: 'RevenueCatが未設定です' };
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { type: 'success', customerInfo };
  } catch (e) {
    if (isUserCancelledError(e)) return { type: 'cancelled' };
    return { type: 'failed', message: toErrorMessage(e) };
  }
}

export async function restorePurchases(): Promise<RestoreOutcome> {
  if (billingStatus !== 'configured') {
    return { type: 'failed', message: 'RevenueCatが未設定です' };
  }
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { type: 'success', customerInfo };
  } catch (e) {
    return { type: 'failed', message: toErrorMessage(e) };
  }
}

export async function getAppUserId(): Promise<string | null> {
  if (billingStatus !== 'configured') return null;
  return Purchases.getAppUserID();
}

/** 月額契約者向けの管理導線（App Store側のサブスクリプション管理画面）。8.6節。 */
export async function showManageSubscriptions(): Promise<void> {
  if (billingStatus !== 'configured') return;
  await Purchases.showManageSubscriptions();
}

/** リスナー登録し、購読解除用のunsubscribe関数を返す。 */
export function addCustomerInfoUpdateListener(listener: (info: CustomerInfo) => void): () => void {
  if (billingStatus !== 'configured') return () => {};
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

/** テスト専用: モジュール内部状態をリセットする。 */
export function __resetPurchasesForTests(): void {
  didAttemptConfigure = false;
  billingStatus = 'notConfigured';
}
