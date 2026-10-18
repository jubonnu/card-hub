import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

/**
 * 広告ユニットID。本番IDが未設定の間はGoogle公式のテストIDにフォールバックする
 * （`lib/purchases.ts`等と同じ、未設定=安全なno-op寄りの方針。テストIDは常に広告が
 * 返るため、実機確認中に自分の広告をクリックしてAdMobアカウントがBANされる事故を防げる）。
 *
 * 本番IDはAdMobダッシュボードでiOS/Android別に発行し、EASの環境変数
 * （`EXPO_PUBLIC_ADMOB_NATIVE_UNIT_ID_IOS`等）として設定すること。App ID自体（ネイティブ
 * ビルドに焼き込まれる値）は`app.json`のconfig plugin側で管理するため対象外。
 */
function resolveUnitId(iosEnvValue: string | undefined, androidEnvValue: string | undefined, testId: string): string {
  const envValue = Platform.OS === 'ios' ? iosEnvValue : androidEnvValue;
  return envValue && envValue.trim().length > 0 ? envValue : testId;
}

export function getNativeAdUnitId(): string {
  return resolveUnitId(
    process.env.EXPO_PUBLIC_ADMOB_NATIVE_UNIT_ID_IOS,
    process.env.EXPO_PUBLIC_ADMOB_NATIVE_UNIT_ID_ANDROID,
    TestIds.NATIVE
  );
}
