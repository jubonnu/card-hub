import PostHog from 'posthog-react-native';
import type { PostHogEventProperties } from '@posthog/core';

/**
 * PostHog SDKの薄いアダプタ。`lib/purchases.ts`と同じ方針で、`EXPO_PUBLIC_POSTHOG_API_KEY`が
 * 未設定の間はSDKを初期化しない（クラッシュさせない）。`track`/`identify`は内部でtry/catchし、
 * 分析SDKの失敗でアプリの他機能に影響が出ないようにする（セッションリプレイ等の重い機能は
 * 導入しない最小構成）。
 */

let client: PostHog | null = null;

/** アプリ起動中に1回だけ呼ぶ。2回目以降の呼び出しは無視する。 */
export function initPostHog(): void {
  if (client) return;

  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
  const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;
  if (!apiKey || !host) return;

  try {
    client = new PostHog(apiKey, { host, enableSessionReplay: false });
  } catch {
    client = null;
  }
}

/** イベント計測。ファネル分析に使う主要イベントのみ絞って呼ぶこと（全操作を計測しない）。 */
export function track(event: string, properties?: PostHogEventProperties): void {
  if (!client) return;
  try {
    client.capture(event, properties);
  } catch {
    // 分析の失敗でアプリを落とさない。
  }
}

/** サインイン成功時、匿名IDとログインユーザーを紐付ける。 */
export function identify(userId: string, traits?: PostHogEventProperties): void {
  if (!client) return;
  try {
    client.identify(userId, traits);
  } catch {
    // 分析の失敗でアプリを落とさない。
  }
}

/** サインアウト・アカウント削除時、次のユーザーに前のユーザーの識別情報を引き継がせない。 */
export function resetAnalyticsIdentity(): void {
  if (!client) return;
  try {
    client.reset();
  } catch {
    // 分析の失敗でアプリを落とさない。
  }
}

/** テスト専用: モジュール内部状態をリセットする。 */
export function __resetAnalyticsForTests(): void {
  client = null;
}
