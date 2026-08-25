import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { restoreSession } from '@/lib/authActions';
import { registerCustomerInfoListener } from '@/lib/billingLifecycle';
import { runDifferentialSync } from '@/lib/differentialSync';
import { configureNotificationHandler, extractLotteryIdFromNotification } from '@/lib/notifications';
import { processQueue } from '@/lib/offlineQueue';
import { configurePurchases, getBillingStatus } from '@/lib/purchases';
import { refreshAccessToken, shouldPreemptivelyRefresh } from '@/lib/tokenRefresh';
import { useAuthStore } from '@/stores/authStore';
import { useBillingStore } from '@/stores/billingStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useTheme } from '@/theme/useTheme';

// TEMP: オンボーディングスクショ撮影用（撮影後に削除すること）。
import { seedOnboardingDemo, setOnboardingDemoTheme } from '../dev-onboarding-seed';
if (__DEV__ && typeof window !== 'undefined') {
  (
    window as unknown as { seedOnboardingDemo: typeof seedOnboardingDemo; setOnboardingDemoTheme: typeof setOnboardingDemoTheme }
  ).seedOnboardingDemo = seedOnboardingDemo;
  (
    window as unknown as { setOnboardingDemoTheme: typeof setOnboardingDemoTheme }
  ).setOnboardingDemoTheme = setOnboardingDemoTheme;
}

// JSバンドルの評価～最初のレンダーの間に一瞬白画面が挟まらないよう、ネイティブスプラッシュを
// 明示的に維持し、RootLayoutの初回マウント後に手動で閉じる（expo-splash-screenの標準パターン）。
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 300 });

// ブランド表示として知覚できる最低限の表示時間（0.5〜0.8秒程度）を確保するための遅延。
// JSバンドル評価が速い端末でも一瞬で消えてしまわないようにする。
const MIN_SPLASH_VISIBLE_MS = 650;

export default function RootLayout() {
  const theme = useTheme();
  const router = useRouter();
  const onboardingHasHydrated = useOnboardingStore((s) => s.hasHydrated);
  const onboardingCompleted = useOnboardingStore((s) => s.completed);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);

  // スプラッシュは「最低表示時間の経過」と「初回起動オンボーディング要否の判定
  // （AsyncStorageからの読み込み）完了」の両方が揃うまで閉じない。そうしないと、
  // 判定が終わる前に一瞬タブ画面が見えてしまってからオンボーディングへ遷移する、
  // という好ましくないちらつきが起こりうる。
  useEffect(() => {
    if (!minSplashElapsed || !onboardingHasHydrated) return;
    void SplashScreen.hideAsync();
    if (!onboardingCompleted) router.replace('/onboarding');
  }, [minSplashElapsed, onboardingHasHydrated, onboardingCompleted, router]);

  useEffect(() => {
    const timer = setTimeout(() => setMinSplashElapsed(true), MIN_SPLASH_VISIBLE_MS);

    // TEMP: expo-notificationsはWeb未対応のため、オンボーディングスクショ撮影セッション
    // （Expo web）ではこのブロックを丸ごとスキップする（撮影後に元へ戻すこと）。
    let notificationResponseSubscription: { remove: () => void } | undefined;
    if (Platform.OS !== 'web') {
      configureNotificationHandler();

      // 通知タップで遷移する（`lib/notifications.ts`のスケジュール時に`data.lotteryId`を
      // 必ず設定している）。アプリが完全終了状態からの起動（コールドスタート）はこの
      // useEffect実行時点で既にタップ済みのため、addNotificationResponseReceivedListener
      // だけでは拾えず、getLastNotificationResponseAsync()で別途確認する必要がある。
      const navigateToLottery = (response: Notifications.NotificationResponse) => {
        const lotteryId = extractLotteryIdFromNotification(response);
        if (lotteryId) router.push(`/lotteries/${lotteryId}`);
      };
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) navigateToLottery(response);
      });
      notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener(navigateToLottery);
    }

    // RevenueCat SDKの初期化（Mobile-G4-1）。アプリ起動中に1回だけ呼ぶ。APIキー未設定でも
    // クラッシュしない（`lib/purchases.ts`が安全にnotConfigured状態を返す）。
    // billingStoreへの反映はサインイン時（ensureRevenueCatLogin）以外にここでも行う。
    // 未サインインのままだとCustomerInfoリスナーもensureRevenueCatLoginも発火せず、
    // billingStoreがnotConfigured初期値のまま固まってしまうため。
    configurePurchases();
    useBillingStore.getState().setBillingStatus(getBillingStatus());
    registerCustomerInfoListener();

    // 未ログインでも抽選一覧・詳細等の公開範囲は引き続き利用できるため、
    // サインイン画面へ強制リダイレクトはしない（restoreSessionはauthStoreの状態のみ更新する）。
    // TEMP: expo-secure-storeはWeb未対応のため、オンボーディングスクショ撮影セッション
    // （Expo web）ではスキップする（撮影後に元へ戻すこと）。
    if (Platform.OS !== 'web') void restoreSession();

    // アプリ復帰時、Access Token期限が1分未満なら先回りRefreshする（refreshAccessTokenは
    // 内部でinFlightRefreshを共有するため、複数箇所から呼ばれても実際のRefreshは1回のみ）。
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      if (useAuthStore.getState().status !== 'signedIn') return;

      // 差分同期（13・24章）はオフラインキューの処理完了後に行う（未送信の変更を上書きしないため）。
      const runQueueThenSync = () => void processQueue().then(runDifferentialSync);
      if (shouldPreemptivelyRefresh()) {
        void refreshAccessToken()
          .then(runQueueThenSync)
          .catch(() => {
            // 失敗時の分類・状態遷移はrefreshAccessToken内で完結している。
          });
      } else {
        runQueueThenSync();
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
      notificationResponseSubscription?.remove();
    };
    // routerはexpo-routerが安定した参照を返すため、依存配列には含めない（マウント時に1回だけ実行する）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.surface },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(auth)/sign-in" options={{ presentation: 'modal' }} />
        <Stack.Screen name="checklist/[lotteryId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notification-settings/[lotteryId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
