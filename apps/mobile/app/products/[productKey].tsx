import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DetailHeader } from '@/components/DetailHeader';
import { ErrorState } from '@/components/ErrorState';
import { ChevronRightIcon, ShareIcon, StarIcon } from '@/components/icons';
import { ProductThumb } from '@/components/ProductThumb';
import { PublicStatusBadge } from '@/components/PublicStatusBadge';
import { ScreenContainer } from '@/components/ScreenContainer';
import { StatusBadge } from '@/components/StatusBadge';
import { lotteries, products } from '@/data/mockData';
import { useApiRequest } from '@/hooks/useApiRequest';
import { useNowIso } from '@/hooks/useNowIso';
import { fetchLotteries, getApiErrorCopy } from '@/lib/apiClient';
import type { LotteryRecord } from '@/schemas/lotteryApi';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useTheme } from '@/theme/useTheme';
import { derivePublicTimelineStatus, formatAtOrDateOnly, getDisplayShopName } from '@/utils/publicLotteryDisplay';
import { getCardTypeLabel, groupLotteriesByProduct, type PublicProductGroup } from '@/utils/publicProductDisplay';
import { formatDateTimeShort, normalizeDeadline } from '@/utils/time';

// 「概要」「更新履歴」は未実装のため、公開版では「店舗一覧」のみ表示する
// （未完成タブをユーザーに見せないため、タブ切り替えUI自体を出さない）。

/**
 * このルートは2種類のproductKeyを扱う:
 * - モックの `products` に一致するキー（例: 'blackbolt'）→ 従来通りモックデータ
 * - それ以外 → 実API (normalizedProductName) による商品統合ビュー（Phase Mobile-C）
 * 実データのnormalizedProductNameは「/」等を含み得るため、リンク生成時に
 * encodeURIComponentで必ずエンコードすること（Expo Router側で自動デコードされる）。
 */
export default function ProductDetailScreen() {
  const { productKey } = useLocalSearchParams<{ productKey: string }>();
  const isMockProduct = products.some((p) => p.key === productKey);

  if (isMockProduct) return <MockProductScreen productKey={productKey ?? ''} />;
  return <ApiProductScreen productKey={productKey ?? ''} />;
}

function ApiProductScreen({ productKey }: { productKey: string }) {
  const theme = useTheme();
  const nowIso = useNowIso();
  const apiState = useApiRequest(() => fetchLotteries({ limit: 100 }), []);

  const group = useMemo(() => {
    if (apiState.status !== 'success') return null;
    return groupLotteriesByProduct(apiState.data.lotteries, nowIso).get(productKey) ?? null;
  }, [apiState, productKey, nowIso]);

  if (apiState.status === 'loading') {
    return (
      <ScreenContainer>
        <DetailHeader title="商品まとめ" />
        <View style={styles.notFound}>
          <ActivityIndicator color={theme.colors.green} />
        </View>
      </ScreenContainer>
    );
  }

  if (apiState.status === 'error') {
    return (
      <ScreenContainer>
        <DetailHeader title="商品まとめ" />
        <ErrorState onRetry={apiState.retry} {...getApiErrorCopy(apiState.error)} />
      </ScreenContainer>
    );
  }

  if (!group) {
    return (
      <ScreenContainer padded>
        <DetailHeader title="商品まとめ" />
        <View style={styles.notFound}>
          <Text style={{ color: theme.colors.textSecondary }}>商品情報が見つかりませんでした</Text>
        </View>
      </ScreenContainer>
    );
  }

  return <ApiProductBody group={group} nowIso={nowIso} refreshing={apiState.refreshing} onRefresh={apiState.refresh} />;
}

function ApiProductBody({
  group,
  nowIso,
  refreshing,
  onRefresh,
}: {
  group: PublicProductGroup;
  nowIso: string;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { isFollowingProduct, toggleFollowedProduct } = useFavoritesStore();

  const following = isFollowingProduct(group.key);
  const sortedRecords = useMemo(() => {
    const deadlineKey = (r: LotteryRecord) => {
      const d = normalizeDeadline(r.applicationEndAt, r.applicationEndDate);
      return d ? new Date(d).getTime() : Number.POSITIVE_INFINITY;
    };
    return [...group.records].sort((a, b) => deadlineKey(a) - deadlineKey(b));
  }, [group]);

  return (
    <ScreenContainer>
      <DetailHeader title="商品まとめ" right={<ShareIcon color={theme.colors.textPrimary} />} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={theme.colors.green}
            colors={[theme.colors.green]}
          />
        }
      >
        <View style={styles.summaryRow}>
          <ProductThumb size="lg" imageUrl={sortedRecords.find((r) => r.imageUrl)?.imageUrl} />
          <View style={styles.summaryText}>
            <View style={[styles.categoryChip, { backgroundColor: theme.colors.surfaceSubtle }]}>
              <Text style={[styles.categoryChipText, { color: theme.colors.textSecondary }]}>
                {getCardTypeLabel(group.cardType)}
              </Text>
            </View>
            <Text style={[styles.productName, { color: theme.colors.textPrimary }]}>{group.displayName}</Text>
            <Text style={[styles.shopCount, { color: theme.colors.textTertiary }]}>
              全国{group.records.length}店舗で抽選実施中
            </Text>
          </View>
          <Pressable hitSlop={8} onPress={() => toggleFollowedProduct(group.key)}>
            <StarIcon size={23} filled={following} />
          </Pressable>
        </View>

        <View style={styles.statsGrid}>
          <StatBox label="受付中" value={group.acceptingCount} tone="accepting" />
          <StatBox label="結果待ち" value={group.resultPendingCount} tone="resultPending" />
          <StatBox label="受付終了" value={group.endedCount} tone="ended" />
          {group.unknownCount > 0 ? <StatBox label="詳細未定" value={group.unknownCount} tone="unknown" /> : null}
        </View>

        <Text style={[styles.shopListTitle, { color: theme.colors.textPrimary }]}>店舗一覧</Text>
        <View style={styles.shopList}>
          {sortedRecords.map((record, index) => {
            const status = derivePublicTimelineStatus(record, nowIso);
            const deadline = formatAtOrDateOnly(record.applicationEndAt, record.applicationEndDate);
            const announce = formatAtOrDateOnly(record.resultAnnouncementAt, record.resultAnnouncementDate);
            return (
              <Pressable
                key={record.id}
                onPress={() => router.push(`/lotteries/${record.id}`)}
                style={[
                  styles.shopRow,
                  index < sortedRecords.length - 1 && {
                    borderBottomColor: theme.colors.borderLighter,
                    borderBottomWidth: 1,
                  },
                ]}
              >
                <View style={styles.shopText}>
                  <Text style={[styles.shopName, { color: theme.colors.textPrimary }]}>
                    {getDisplayShopName(record)}
                  </Text>
                  <Text style={[styles.shopMeta, { color: theme.colors.textMuted }]}>
                    {deadline
                      ? `応募締切　${deadline}`
                      : announce
                        ? `当選発表　${announce}`
                        : '締切・発表日は未公開です'}
                  </Text>
                </View>
                <PublicStatusBadge status={status} />
                <ChevronRightIcon />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function MockProductScreen({ productKey }: { productKey: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { isFollowingProduct, toggleFollowedProduct } = useFavoritesStore();

  const product = products.find((p) => p.key === productKey);
  const shopLotteries = useMemo(
    () => lotteries.filter((l) => l.productKey === productKey),
    [productKey]
  );

  if (!product) {
    return (
      <ScreenContainer padded>
        <DetailHeader title="商品まとめ" />
        <View style={styles.notFound}>
          <Text style={{ color: theme.colors.textSecondary }}>商品情報が見つかりませんでした</Text>
        </View>
      </ScreenContainer>
    );
  }

  const totalShops = product.acceptingCount + product.resultPendingCount + product.endedCount;
  const following = isFollowingProduct(product.key);

  return (
    <ScreenContainer>
      <DetailHeader title="商品まとめ" right={<ShareIcon color={theme.colors.textPrimary} />} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.summaryRow}>
          <ProductThumb size="lg" />
          <View style={styles.summaryText}>
            <View style={[styles.categoryChip, { backgroundColor: theme.colors.surfaceSubtle }]}>
              <Text style={[styles.categoryChipText, { color: theme.colors.textSecondary }]}>{product.category}</Text>
            </View>
            <Text style={[styles.productName, { color: theme.colors.textPrimary }]}>{product.name}</Text>
            <Text style={[styles.shopCount, { color: theme.colors.textTertiary }]}>
              全国{totalShops}店舗で抽選実施中
            </Text>
          </View>
          <Pressable hitSlop={8} onPress={() => toggleFollowedProduct(product.key)}>
            <StarIcon size={23} filled={following} />
          </Pressable>
        </View>

        <View style={styles.statsGrid}>
          <StatBox label="受付中" value={product.acceptingCount} tone="accepting" />
          <StatBox label="結果待ち" value={product.resultPendingCount} tone="resultPending" />
          <StatBox label="終了" value={product.endedCount} tone="ended" />
        </View>

        <Text style={[styles.shopListTitle, { color: theme.colors.textPrimary }]}>店舗一覧</Text>
        <View style={styles.shopList}>
          {shopLotteries.map((lottery, index) => (
            <Pressable
              key={lottery.id}
              onPress={() => router.push(`/lotteries/${lottery.id}`)}
              style={[
                styles.shopRow,
                index < shopLotteries.length - 1 && {
                  borderBottomColor: theme.colors.borderLighter,
                  borderBottomWidth: 1,
                },
              ]}
            >
              <View style={styles.shopText}>
                <Text style={[styles.shopName, { color: theme.colors.textPrimary }]}>{lottery.shopName}</Text>
                <Text style={[styles.shopMeta, { color: theme.colors.textMuted }]}>
                  {lottery.status === 'resultPending'
                    ? `当選発表　${formatDateTimeShort(lottery.announcementDate)}`
                    : `応募締切　${formatDateTimeShort(lottery.applicationDeadline)}`}
                </Text>
              </View>
              <StatusBadge status={lottery.status} />
              <ChevronRightIcon />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'accepting' | 'resultPending' | 'ended' | 'unknown';
}) {
  const theme = useTheme();
  const highlight = tone === 'accepting' && value > 0;
  const labelColor =
    tone === 'unknown' ? theme.colors.textSecondary : theme.colors.status[tone].fg;
  return (
    <View
      style={[
        styles.statBox,
        {
          borderColor: highlight ? theme.colors.greenBorder : theme.colors.border,
          backgroundColor: highlight ? theme.colors.greenSoftBg : 'transparent',
        },
      ]}
    >
      <Text style={[styles.statBoxLabel, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.statBoxValue, { color: theme.colors.textPrimary }]}>
        {value}
        <Text style={[styles.statBoxUnit, { color: theme.colors.textSecondary }]}>店舗</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  summaryText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  productName: {
    fontSize: 21,
    fontWeight: '900',
  },
  shopCount: {
    fontSize: 12,
  },
  shopName: {
    fontSize: 14,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 9,
  },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 3,
  },
  statBoxLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  statBoxValue: {
    fontSize: 22,
    fontWeight: '900',
  },
  statBoxUnit: {
    fontSize: 11,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabLabel: {
    fontSize: 13,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    height: 3,
    width: '70%',
    borderRadius: 3,
  },
  shopListTitle: {
    fontSize: 14,
    fontWeight: '900',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  shopList: {
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 17,
  },
  shopText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  shopMeta: {
    fontSize: 11,
  },
  seeAllWrap: {
    paddingTop: 14,
    paddingBottom: 24,
  },
  placeholder: {
    padding: 40,
    alignItems: 'center',
  },
});
