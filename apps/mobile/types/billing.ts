import type { CustomerInfo } from 'react-native-purchases';

/**
 * RevenueCat SDK未設定（`EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`未設定）の間はSDKを初期化しない。
 * アプリはクラッシュせず、購入ボタンを無効化した状態で動作する（Mobile-G4）。
 */
export type BillingStatus = 'notConfigured' | 'configured';

export type PurchaseOutcome = { type: 'success'; customerInfo: CustomerInfo } | { type: 'cancelled' } | { type: 'failed'; message: string };

export type RestoreOutcome = { type: 'success'; customerInfo: CustomerInfo } | { type: 'failed'; message: string };

/**
 * サーバー確定状態（`subscription_entitlements`）に対する検証状況。表示専用の
 * ローカルキャッシュ（CustomerInfo由来）とサーバー確定状態を区別するために使う。
 */
export type VerificationStatus = 'unverified' | 'verifying' | 'verified' | 'failed' | 'stale';

/** 課金画面の表示状態（G4-3、7章の状態一覧に対応）。 */
export type PaywallState =
  | 'notConfigured'
  | 'signedOut'
  | 'loadingOfferings'
  | 'ready'
  | 'purchasing'
  | 'purchasePendingVerification'
  | 'premium'
  | 'restoring'
  | 'cancelled'
  | 'failed'
  | 'offlineCached'
  | 'serverVerificationFailed';
