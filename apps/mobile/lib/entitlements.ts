import type { CustomerInfo } from 'react-native-purchases';

/**
 * CustomerInfoから表示専用のpremium状態を取り出す純粋関数（Mobile-G4）。
 * ここで得られる値は**表示専用のキャッシュ**であり、実際のpremium API許可判定には使わない
 * （判定は必ずサーバーの`GET /me/entitlements`・premium APIのレスポンスで行う）。
 */
export const PREMIUM_ENTITLEMENT_ID = 'premium';

export function isLocalEntitlementActive(customerInfo: CustomerInfo | null): boolean {
  if (!customerInfo) return false;
  return !!customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID];
}

/**
 * 設定済みProduct IDからproductTypeへの明示マップ。`EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID`・
 * `EXPO_PUBLIC_REVENUECAT_LIFETIME_PRODUCT_ID`が未設定の間（Product ID最終値が未確定の間）は
 * マップが空になり、有効なentitlementがあっても'unknown'を返す（文字列部分一致による誤推測はしない）。
 * premiumActiveの判定自体はこの値を使わず、常にentitlement premiumの有無で行う。
 */
function productTypeMap(): Record<string, 'subscription' | 'lifetime'> {
  const map: Record<string, 'subscription' | 'lifetime'> = {};
  const monthlyProductId = process.env.EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID;
  const lifetimeProductId = process.env.EXPO_PUBLIC_REVENUECAT_LIFETIME_PRODUCT_ID;
  if (monthlyProductId) map[monthlyProductId] = 'subscription';
  if (lifetimeProductId) map[lifetimeProductId] = 'lifetime';
  return map;
}

export function localProductType(customerInfo: CustomerInfo | null): string | null {
  const entitlement = customerInfo?.entitlements.active[PREMIUM_ENTITLEMENT_ID];
  if (!entitlement) return null;
  return productTypeMap()[entitlement.productIdentifier] ?? 'unknown';
}

export function localExpirationDate(customerInfo: CustomerInfo | null): string | null {
  return customerInfo?.entitlements.active[PREMIUM_ENTITLEMENT_ID]?.expirationDate ?? null;
}
