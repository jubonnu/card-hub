import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

interface PremiumStatusProps {
  productType: string | null;
  expiresAt: string | null;
  verificationStatus: 'unverified' | 'verifying' | 'verified' | 'failed' | 'stale';
}

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  subscription: '月額プラン',
  lifetime: '買い切りプラン',
  unknown: 'プレミアム',
};

/** 現在のpremium状態を表示するカード（Mobile-G4-3）。実際の許可判定はサーバー側で行われる前提の表示専用。 */
export function PremiumStatus({ productType, expiresAt, verificationStatus }: PremiumStatusProps) {
  const theme = useTheme();
  const planLabel = productType ? (PRODUCT_TYPE_LABEL[productType] ?? 'プレミアム') : 'プレミアム';
  const expiresLabel = expiresAt ? new Date(expiresAt).toLocaleDateString('ja-JP') : null;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.darkCardBg }]}>
      <Text style={[styles.title, { color: theme.colors.darkCardText }]}>{planLabel}をご利用中です</Text>
      {expiresLabel ? (
        <Text style={[styles.sub, { color: theme.colors.darkCardText }]}>次回更新日: {expiresLabel}</Text>
      ) : (
        <Text style={[styles.sub, { color: theme.colors.darkCardText }]}>永久ライセンス</Text>
      )}
      {verificationStatus === 'stale' && (
        <Text style={[styles.note, { color: theme.colors.darkCardAccent }]}>
          最新の状態と異なる場合があります。オンライン時に自動で更新されます
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
  },
  sub: {
    fontSize: 12,
  },
  note: {
    fontSize: 11,
    marginTop: 4,
  },
});
