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

let isTrackingAuthorized = false;
let readyPromise: Promise<void> | null = null;

/**
 * アプリ起動中に1回だけ呼ぶ。2回目以降の呼び出しは、進行中・完了済みの同一Promiseを返す
 * （新規にPromiseを作り直さない。呼び出し側が複数箇所から`initAds`/`waitForAdsReady`を
 * 呼んでも、必ず同じATT許可結果を待てるようにするため）。
 */
export function initAds(): Promise<void> {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
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
  })();

  return readyPromise;
}

/**
 * 広告リクエストを送る前に必ず呼ぶこと。ATT許可リクエスト（iOS）の結果が確定する前に
 * 広告リクエストを送ってしまうと、App Review Guideline 5.1.2(i)違反としてリジェクトされる
 * （ATTダイアログの表示・応答を待たずにトラッキング対象データを収集しているとみなされるため）。
 * `app/_layout.tsx`での初回`initAds()`呼び出しと競合しないよう、同じPromiseを共有する。
 */
export function waitForAdsReady(): Promise<void> {
  return readyPromise ?? initAds();
}

/** ATT等でトラッキングが許可されていない場合、パーソナライズ広告を無効化するためのリクエストオプション。 */
export function getAdRequestOptions(): RequestOptions {
  return { requestNonPersonalizedAdsOnly: !isTrackingAuthorized };
}

/** テスト専用: モジュール内部状態をリセットする。 */
export function __resetAdsForTests(): void {
  readyPromise = null;
  isTrackingAuthorized = false;
}
