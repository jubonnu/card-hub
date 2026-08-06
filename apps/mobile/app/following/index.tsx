import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { DetailHeader } from '@/components/DetailHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PersonIcon, StarIcon } from '@/components/icons';
import { ProductThumb } from '@/components/ProductThumb';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useApiRequest } from '@/hooks/useApiRequest';
import { useNowIso } from '@/hooks/useNowIso';
import { fetchLotteries, getApiErrorCopy } from '@/lib/apiClient';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useTheme } from '@/theme/useTheme';
import { groupLotteriesByProduct, type PublicProductGroup } from '@/utils/publicProductDisplay';

const FETCH_LIMIT = 100;

/**
 * フォロー中の商品は実API（GET /lotteries）の集約結果から表示する。
 * fetchLotteriesはlimit/offsetのみのため一度に最大FETCH_LIMIT件までしか取得できず、
 * それを超える件数が存在する場合は一部の商品がここに反映されない可能性がある
 * （下部に注記を表示して明示する）。
 */
export default function FollowingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { followedProductKeys, toggleFollowedProduct } = useFavoritesStore();
  const nowIso = useNowIso();

  const apiState = useApiRequest((signal) => fetchLotteries({ limit: FETCH_LIMIT }, signal), []);

  const followedGroups = useMemo(() => {
    if (apiState.status !== 'success') return [];
    const grouped = groupLotteriesByProduct(apiState.data.lotteries, nowIso);
    return followedProductKeys
      .map((key) => grouped.get(key))
      .filter((g): g is PublicProductGroup => Boolean(g));
  }, [apiState, followedProductKeys, nowIso]);

  const mayBeIncomplete = apiState.status === 'success' && apiState.data.total > FETCH_LIMIT;

  if (apiState.status === 'loading') {
    return (
      <ScreenContainer>
        <DetailHeader title="フォロー中" />
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.green} />
        </View>
      </ScreenContainer>
    );
  }

  if (apiState.status === 'error') {
    return (
      <ScreenContainer>
        <DetailHeader title="フォロー中" />
        <ErrorState onRetry={apiState.retry} {...getApiErrorCopy(apiState.error)} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <DetailHeader title="フォロー中" />

      {followedGroups.length === 0 ? (
        <EmptyState
          icon={<PersonIcon size={34} color={theme.colors.green} strokeWidth={1.7} />}
          title="フォロー中の商品はまだありません"
          description="商品まとめ画面の星アイコンからフォローできます"
        />
      ) : (
        <FlatList
          data={followedGroups}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={apiState.refreshing}
              onRefresh={() => void apiState.refresh()}
              tintColor={theme.colors.green}
              colors={[theme.colors.green]}
            />
          }
          ListFooterComponent={
            mayBeIncomplete ? (
              <Text style={[styles.footNote, { color: theme.colors.textFaint }]}>
                取得件数の上限（{FETCH_LIMIT}件）により、一部の商品が表示されていない可能性があります
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.row, { borderColor: theme.colors.border }]}
              onPress={() => router.push(`/products/${encodeURIComponent(item.key)}`)}
            >
              <ProductThumb size="md" />
              <View style={styles.text}>
                <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  {item.displayName}
                </Text>
                <Text style={[styles.meta, { color: theme.colors.textTertiary }]}>
                  受付中 {item.acceptingCount} ・ 結果待ち {item.resultPendingCount}
                </Text>
              </View>
              <Pressable hitSlop={8} onPress={() => toggleFollowedProduct(item.key)}>
                <StarIcon filled />
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 11,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
  },
  meta: {
    fontSize: 12,
  },
  footNote: {
    fontSize: 11,
    textAlign: 'center',
    paddingTop: 8,
  },
});
