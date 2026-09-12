import * as Sentry from '@sentry/react-native';

/**
 * Sentry SDKの薄いアダプタ。`lib/purchases.ts`と同じ方針で、`EXPO_PUBLIC_SENTRY_DSN`が
 * 未設定の間はSDKを初期化しない（クラッシュさせない）。DSNの形式が明らかにおかしい場合も
 * 同様にno-opとする（誤った値のまま`Sentry.init`を呼んで気づかないよりは、未設定として扱う）。
 */

const DSN_PATTERN = /^https:\/\/[0-9a-f]+@[^/]+\/\d+$/i;

let didAttemptInit = false;

/** アプリ起動中に1回だけ呼ぶ。2回目以降の呼び出しは無視する。 */
export function initSentry(): void {
  if (didAttemptInit) return;
  didAttemptInit = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn || !DSN_PATTERN.test(dsn)) return;

  Sentry.init({
    dsn,
    enabled: !__DEV__,
    tracesSampleRate: 0,
  });
}

/** テスト専用: モジュール内部状態をリセットする。 */
export function __resetSentryForTests(): void {
  didAttemptInit = false;
}
