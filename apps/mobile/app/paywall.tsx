import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { PremiumStatus } from '@/components/billing/PremiumStatus';
import { PurchaseButton } from '@/components/billing/PurchaseButton';
import { RestorePurchasesButton } from '@/components/billing/RestorePurchasesButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { isRevenueCatUserMatchingCurrentAuthUser } from '@/lib/billingLifecycle';
import { isLocalEntitlementActive, localProductType } from '@/lib/entitlements';
import { derivePaywallState, type PaywallTransient } from '@/lib/paywallState';
import { getCurrentOffering, purchasePackage, restorePurchases, showManageSubscriptions } from '@/lib/purchases';
import { postEntitlementsRefresh } from '@/lib/syncClient';
import { useAuthStore } from '@/stores/authStore';
import { useBillingStore } from '@/stores/billingStore';
import { useTheme } from '@/theme/useTheme';

/**
 * 課金画面（Mobile-G4-3）。表示状態は`lib/paywallState.ts`の`derivePaywallState`が一元的に
 * 決定する。実際のpremium API許可はサーバー側で行われるため、購入・復元直後は必ず
 * `POST /me/entitlements/refresh`で照合してから「premium」状態へ遷移する
 * （5章「購入直後の即時照合」要件）。
 */
export default function PaywallScreen() {
  const theme = useTheme();
  const router = useRouter();
  const authStatus = useAuthStore((s) => s.status);
  const billing = useBillingStore();

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [offeringsLoaded, setOfferingsLoaded] = useState(false);
  const [offeringsLoadFailed, setOfferingsLoadFailed] = useState(false);
  const [transient, setTransient] = useState<PaywallTransient>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isPremium = billing.localEntitlementActive || billing.serverPremiumActive;
  const state = derivePaywallState({
    billingStatus: billing.billingStatus,
    authStatus,
    isPremium,
    offeringsLoaded,
    offeringsLoadFailed,
    transient,
  });

  useEffect(() => {
    if (billing.billingStatus !== 'configured' || authStatus !== 'signedIn') return;
    let cancelled = false;

    (async () => {
      try {
        const current = await getCurrentOffering();
        if (cancelled) return;
        setOffering(current);
        setOfferingsLoaded(true);
      } catch {
        if (cancelled) return;
        setOfferingsLoadFailed(true);
        setOfferingsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [billing.billingStatus, authStatus]);

  async function verifyAfterPurchaseOrRestore(): Promise<void> {
    setTransient('purchasePendingVerification');
    try {
      const result = await postEntitlementsRefresh();
      useBillingStore.getState().applyServerEntitlements(result);
      setTransient('idle');
    } catch {
      // 一時的な照合失敗。「購入失敗」とは表示せず、再試行可能な状態にする（5章要件）。
      setTransient('serverVerificationFailed');
    }
  }

  async function handlePurchase(pkg: PurchasesPackage): Promise<void> {
    if (transient === 'purchasing' || transient === 'restoring') return; // 多重タップ防止

    const matches = await isRevenueCatUserMatchingCurrentAuthUser();
    if (!matches) {
      setErrorMessage('アカウントの確認に失敗しました。もう一度お試しください');
      setTransient('failed');
      return;
    }

    setErrorMessage(null);
    setTransient('purchasing');
    const result = await purchasePackage(pkg);

    if (result.type === 'cancelled') {
      setTransient('cancelled');
      return;
    }
    if (result.type === 'failed') {
      setErrorMessage(result.message);
      setTransient('failed');
      return;
    }

    useBillingStore.getState().applyLocalCustomerInfo(isLocalEntitlementActive(result.customerInfo), localProductType(result.customerInfo));
    await verifyAfterPurchaseOrRestore();
  }

  async function handleRestore(): Promise<void> {
    if (transient === 'purchasing' || transient === 'restoring') return;

    setErrorMessage(null);
    setTransient('restoring');
    const result = await restorePurchases();

    if (result.type === 'failed') {
      setErrorMessage(result.message);
      setTransient('failed');
      return;
    }

    useBillingStore.getState().applyLocalCustomerInfo(isLocalEntitlementActive(result.customerInfo), localProductType(result.customerInfo));
    await verifyAfterPurchaseOrRestore();
  }

  const busy = transient === 'purchasing' || transient === 'restoring';

  return (
    <ScreenContainer padded style={{ backgroundColor: theme.colors.surface }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>プレミアムプラン</Text>
        </View>

        {state === 'notConfigured' && (
          <Text style={[styles.message, { color: theme.colors.textTertiary }]}>プレミアムプランは準備中です</Text>
        )}

        {state === 'signedOut' && (
          <View style={styles.section}>
            <Text style={[styles.message, { color: theme.colors.textTertiary }]}>
              プレミアムプランのご利用にはサインインが必要です
            </Text>
            <PrimaryButton label="サインイン" size="md" onPress={() => router.push('/sign-in' as Parameters<typeof router.push>[0])} />
          </View>
        )}

        {state === 'loadingOfferings' && (
          <View style={styles.section}>
            <ActivityIndicator color={theme.colors.textPrimary} />
          </View>
        )}

        {state === 'offlineCached' && (
          <Text style={[styles.message, { color: theme.colors.textTertiary }]}>
            オフラインのため最新の価格情報を取得できませんでした。通信状態を確認してもう一度お試しください
          </Text>
        )}

        {state === 'premium' && (
          <View style={styles.section}>
            <PremiumStatus productType={billing.productType} expiresAt={billing.expiresAt} verificationStatus={billing.verificationStatus} />
            {billing.productType === 'subscription' && (
              <PrimaryButton label="サブスクリプションを管理" size="md" onPress={() => void showManageSubscriptions()} />
            )}
          </View>
        )}

        {state === 'purchasePendingVerification' && (
          <Text style={[styles.message, { color: theme.colors.textTertiary }]}>購入済み・確認中です…</Text>
        )}

        {state === 'serverVerificationFailed' && (
          <View style={styles.section}>
            <Text style={[styles.message, { color: theme.colors.warnText }]}>
              購入済み・確認中に問題が発生しました。もう一度確認してください
            </Text>
            <PrimaryButton label="もう一度確認する" size="md" onPress={() => void verifyAfterPurchaseOrRestore()} />
          </View>
        )}

        {state === 'cancelled' && (
          <View style={styles.section}>
            <Text style={[styles.message, { color: theme.colors.textTertiary }]}>購入をキャンセルしました</Text>
            <PrimaryButton label="もう一度見る" size="md" onPress={() => setTransient('idle')} />
          </View>
        )}

        {state === 'failed' && (
          <View style={styles.section}>
            <Text style={[styles.message, { color: theme.colors.danger }]}>{errorMessage ?? '処理に失敗しました'}</Text>
            <PrimaryButton label="もう一度試す" size="md" onPress={() => setTransient('idle')} />
          </View>
        )}

        {state === 'ready' && (
          <View style={styles.section}>
            <Text style={[styles.message, { color: theme.colors.textTertiary }]}>
              月額プラン・買い切りプランのどちらでも同じプレミアム機能をご利用いただけます
            </Text>
            <PurchaseButton label="月額プラン" pkg={offering?.monthly} loading={transient === 'purchasing'} disabled={busy} onPress={handlePurchase} />
            <PurchaseButton
              label="買い切りプラン"
              pkg={offering?.lifetime}
              loading={transient === 'purchasing'}
              disabled={busy}
              onPress={handlePurchase}
            />
            <Text style={[styles.legalNote, { color: theme.colors.textFaint }]}>
              月額プランは自動更新です。いつでもApple IDの設定から解約できます
            </Text>
            <RestorePurchasesButton loading={transient === 'restoring'} disabled={busy} onPress={handleRestore} />
            <Text style={[styles.legalNote, { color: theme.colors.textFaint }]}>
              利用規約・プライバシーポリシーへのリンクは今後追加予定です
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  titleRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  section: {
    gap: 14,
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
  },
  legalNote: {
    fontSize: 11,
    lineHeight: 16,
  },
});
