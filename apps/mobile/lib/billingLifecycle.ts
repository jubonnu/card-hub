import type { CustomerInfo } from 'react-native-purchases';

import { getCurrentGeneration, isGenerationCurrent } from '@/lib/accountNamespace';
import { isLocalEntitlementActive, localProductType } from '@/lib/entitlements';
import {
  addCustomerInfoUpdateListener,
  configurePurchases,
  getAppUserId,
  getBillingStatus,
  purchasesLogIn,
  purchasesLogOut,
} from '@/lib/purchases';
import { fetchEntitlements } from '@/lib/syncClient';
import { useAuthStore } from '@/stores/authStore';
import { useBillingStore } from '@/stores/billingStore';

/**
 * RevenueCatユーザーライフサイクルの配線（Mobile-G4-1・G4-4）。`lib/authActions.ts`の
 * signIn/signOut/restoreSessionから呼ばれる唯一のエントリポイント群。
 *
 * user切替中の取り違え防止（10章「user Aの処理完了前にuser Bの購入UIを表示しない」）:
 * `lib/accountNamespace.ts`の世代カウンタを流用する。`Purchases.logIn`呼び出し前に世代を
 * 記録し、非同期処理完了後に世代が変わっていれば（＝別のnamespace切替が割り込んだ）結果を
 * 破棄する。差分同期（`lib/differentialSync.ts`）と同じ仕組みを再利用する。
 */

function applyCustomerInfoToStore(customerInfo: CustomerInfo | null): void {
  useBillingStore.getState().setBillingStatus(getBillingStatus());
  useBillingStore.getState().applyLocalCustomerInfo(isLocalEntitlementActive(customerInfo), localProductType(customerInfo));
}

/**
 * ログイン成功後・アプリ起動時のセッション復元後に呼ぶ。失敗してもCardHub側の認証フロー
 * 自体は継続させるため、例外は投げない（内部で握りつぶす、ベストエフォート）。
 */
export async function ensureRevenueCatLogin(publicUserId: string): Promise<void> {
  configurePurchases();
  useBillingStore.getState().setBillingStatus(getBillingStatus());
  if (getBillingStatus() !== 'configured') return;

  const generation = getCurrentGeneration();

  let customerInfo: CustomerInfo | null;
  try {
    customerInfo = await purchasesLogIn(publicUserId);
  } catch {
    return;
  }

  if (!isGenerationCurrent(generation)) return; // 別のnamespace切替が割り込んだ、破棄

  const appUserId = await getAppUserId();
  if (appUserId !== publicUserId) return; // App User ID不一致、反映しない

  applyCustomerInfoToStore(customerInfo);

  try {
    const entitlements = await fetchEntitlements();
    if (isGenerationCurrent(generation) && useAuthStore.getState().user?.publicUserId === publicUserId) {
      useBillingStore.getState().applyServerEntitlements(entitlements);
    }
  } catch {
    // ベストエフォート。次回のアプリ復帰・手動refreshで再試行される。
  }
}

/** ログアウト・全端末ログアウト・アカウント削除のローカルクリーンアップから呼ぶ。 */
export async function revenueCatLogout(): Promise<void> {
  if (getBillingStatus() === 'configured') {
    try {
      await purchasesLogOut();
    } catch {
      // ベストエフォート。次回ログイン時のlogInで整合する。
    }
  }
  useBillingStore.getState().reset();
}

/**
 * 購入・復元の直前に呼ぶ。RevenueCat App User IDが現在のCardHubログインユーザーと
 * 一致するか確認する（10章「App User ID不一致時は購入を拒否」）。
 */
export async function isRevenueCatUserMatchingCurrentAuthUser(): Promise<boolean> {
  const publicUserId = useAuthStore.getState().user?.publicUserId;
  if (!publicUserId) return false;
  if (getBillingStatus() !== 'configured') return false;
  const appUserId = await getAppUserId();
  return appUserId === publicUserId;
}

let listenerRegistered = false;

/**
 * アプリ起動時に1回だけ呼ぶ。CustomerInfoの変化を購読する。
 *
 * `CustomerInfo.originalAppUserId`はRevenueCatが最初にそのユーザーを識別した時点のApp
 * User ID（anonymous IDのままのことがある）であり、必ずしも「現在の」App User IDとは
 * 一致しないため、現在ユーザー照合には使わない（表示・監査目的でのみ扱う）。代わりに
 * `Purchases.getAppUserID()`で現在SDKのApp User IDを取得し、authStore.user.publicUserId
 * と一致する場合のみ反映する。取得は非同期のため、開始時のnamespace世代を記録し、完了時に
 * 世代・ログインユーザーの両方が変わっていないことも確認する（別のnamespace切替やログイン
 * ユーザー変更が割り込んだ場合は破棄）。
 */
export function registerCustomerInfoListener(): void {
  if (listenerRegistered) return;
  listenerRegistered = true;
  addCustomerInfoUpdateListener((customerInfo) => {
    const publicUserId = useAuthStore.getState().user?.publicUserId;
    if (!publicUserId) return;
    const generation = getCurrentGeneration();
    void getAppUserId().then((appUserId) => {
      if (!isGenerationCurrent(generation)) return; // namespace切替が割り込んだ、破棄
      if (useAuthStore.getState().user?.publicUserId !== publicUserId) return; // その間にユーザーが変わった
      if (appUserId !== publicUserId) return; // 現在のSDK App User IDと不一致、反映しない
      applyCustomerInfoToStore(customerInfo);
    });
  });
}

/** テスト専用: リスナー登録済みフラグをリセットする。 */
export function __resetBillingLifecycleForTests(): void {
  listenerRegistered = false;
}
