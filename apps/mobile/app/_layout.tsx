import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { restoreSession } from '@/lib/authActions';
import { registerCustomerInfoListener } from '@/lib/billingLifecycle';
import { runDifferentialSync } from '@/lib/differentialSync';
import { configureNotificationHandler } from '@/lib/notifications';
import { processQueue } from '@/lib/offlineQueue';
import { configurePurchases } from '@/lib/purchases';
import { refreshAccessToken, shouldPreemptivelyRefresh } from '@/lib/tokenRefresh';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme/useTheme';

export default function RootLayout() {
  const theme = useTheme();

  useEffect(() => {
    configureNotificationHandler();

    // RevenueCat SDKの初期化（Mobile-G4-1）。アプリ起動中に1回だけ呼ぶ。APIキー未設定でも
    // クラッシュしない（`lib/purchases.ts`が安全にnotConfigured状態を返す）。
    configurePurchases();
    registerCustomerInfoListener();

    // 未ログインでも抽選一覧・詳細等の公開範囲は引き続き利用できるため、
    // サインイン画面へ強制リダイレクトはしない（restoreSessionはauthStoreの状態のみ更新する）。
    void restoreSession();

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

    return () => subscription.remove();
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
        <Stack.Screen name="(auth)/sign-in" options={{ presentation: 'modal' }} />
        <Stack.Screen name="checklist/[lotteryId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notification-settings/[lotteryId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
