import { Platform } from 'react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import mobileAds from 'react-native-google-mobile-ads';
import type { RequestOptions } from 'react-native-google-mobile-ads';

/**
 * AdMob SDKの薄いアダプタ。`lib/sentry.ts`・`lib/analytics.ts`と同じ方針で、初期化失敗が
 * アプリの他機能に波及しないようにする。iOSではATT許可リクエストが広告SDK初期化より先に
 * 必要（`app.json`の`delayAppMeasurementInit: true`と対で、許可が確定するまで広告SDK側の
 * 計測も遅延させる）。
 */

let didAttemptInit = false;
let isTrackingAuthorized = false;

/** アプリ起動中に1回だけ呼ぶ。2回目以降の呼び出しは無視する。 */
export async function initAds(): Promise<void> {
  if (didAttemptInit) return;
  didAttemptInit = true;

  try {
    if (Platform.OS === 'ios') {
      const { granted } = await requestTrackingPermissionsAsync();
      isTrackingAuthorized = granted;
    } else {
      isTrackingAuthorized = true;
    }
    await mobileAds().initialize();
  } catch {
    // 広告SDKの初期化失敗でアプリを落とさない。
  }
}

/** ATT等でトラッキングが許可されていない場合、パーソナライズ広告を無効化するためのリクエストオプション。 */
export function getAdRequestOptions(): RequestOptions {
  return { requestNonPersonalizedAdsOnly: !isTrackingAuthorized };
}

/** テスト専用: モジュール内部状態をリセットする。 */
export function __resetAdsForTests(): void {
  didAttemptInit = false;
  isTrackingAuthorized = false;
}
