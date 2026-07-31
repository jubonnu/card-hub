import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { HeartIcon, SearchIcon } from '@/components/icons';
import { PublicLotteryCard } from '@/components/PublicLotteryCard';
import { ScreenContainer } from '@/components/ScreenContainer';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SkeletonCard } from '@/components/SkeletonCard';
import { LOTTERIES_PAGE_SIZE, usePaginatedLotteries } from '@/hooks/usePaginatedLotteries';
import { getApiErrorCopy } from '@/lib/apiClient';
import type { LotteryRecord } from '@/schemas/lotteryApi';
import { useFilterStore, type LotteryStatusTab } from '@/stores/filterStore';
import { useMyLotteriesStore } from '@/stores/myLotteriesStore';
import { useTheme } from '@/theme/useTheme';
import { derivePublicTimelineStatus, getDisplayProductName, getDisplayShopName } from '@/utils/publicLotteryDisplay';

const TABS: { key: LotteryStatusTab; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'accepting', label: '受付中' },
  { key: 'resultPending', label: '結果待ち' },
  { key: 'ended', label: '受付終了' },
];

function deadlineSortKey(record: LotteryRecord): number {
  const deadline = record.applicationEndAt ?? record.applicationEndDate;
  return deadline ? new Date(deadline).getTime() : Number.POSITIVE_INFINITY;
}

export default function LotteriesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { mode, setMode, statusTab, setStatusTab, searchQuery, setSearchQuery } = useFilterStore();
  const { saved } = useMyLotteriesStore();

  const nowIso = useMemo(() => new Date().toISOString(), []);

  // 全国の抽選: GET /lotteries に接続（Phase Mobile-B）。「もっと見る」方式のページネーション（Phase Mobile-E）。
  const { state: pageState, retry: retryInitial, loadMore } = usePaginatedLotteries(mode);

  const filteredMine = useMemo(() => {
    let list = saved.map((s) => s.record);

    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      list = list.filter((r) => getDisplayProductName(r).includes(q) || getDisplayShopName(r).includes(q));
    }
    if (statusTab !== 'all') {
      list = list.filter((r) => derivePublicTimelineStatus(r, nowIso) === statusTab);
    }
    return [...list].sort((a, b) => deadlineSortKey(a) - deadlineSortKey(b));
  }, [saved, searchQuery, statusTab, nowIso]);

  const filteredAll = useMemo(() => {
    if (pageState.status !== 'ready') return [];
    let list = pageState.items;

    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      list = list.filter((r) => getDisplayProductName(r).includes(q) || getDisplayShopName(r).includes(q));
    }
    if (statusTab !== 'all') {
      list = list.filter((r) => derivePublicTimelineStatus(r, nowIso) === statusTab);
    }
    return [...list].sort((a, b) => deadlineSortKey(a) - deadlineSortKey(b));
  }, [pageState, searchQuery, statusTab, nowIso]);

  const hasMore =
    pageState.status === 'ready' && pageState.items.length < pageState.total && pageState.lastPageSize >= LOTTERIES_PAGE_SIZE;

  const count = mode === 'all' ? filteredAll.length : filteredMine.length;

  return (
    <ScreenContainer style={{ backgroundColor: theme.colors.surface }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>抽選一覧</Text>
      </View>

      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: theme.colors.surfaceSubtle }]}>
          <SearchIcon size={16} color={theme.colors.textFaint} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="商品名・店舗名で検索"
            placeholderTextColor={theme.colors.textFaint}
            style={[styles.searchInput, { color: theme.colors.textPrimary }]}
          />
        </View>
      </View>

      <View style={styles.modeSwitchWrap}>
        <View style={[styles.modeSwitch, { backgroundColor: theme.colors.chipTrack }]}>
          <Pressable
            style={[styles.modeButton, mode === 'all' && { backgroundColor: theme.colors.green }]}
            onPress={() => setMode('all')}
          >
            <Text style={[styles.modeLabel, { color: mode === 'all' ? '#fff' : theme.colors.textSecondary }]}>
              全国の抽選
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === 'mine' && { backgroundColor: theme.colors.green }]}
            onPress={() => setMode('mine')}
          >
            <Text style={[styles.modeLabel, { color: mode === 'mine' ? '#fff' : theme.colors.textSecondary }]}>
              自分の抽選
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.modeHint, { color: theme.colors.textTertiary }]}>
          {mode === 'all' ? '受付中の抽選を探して比較できます' : '保存した抽選をまとめて管理'}
        </Text>
      </View>

      <View style={styles.tabsRow}>
        {TABS.map((tab) => {
          const active = statusTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setStatusTab(tab.key)}
              style={[styles.tabChip, { backgroundColor: active ? theme.colors.textPrimary : theme.colors.chipTrack }]}
            >
              <Text style={[styles.tabLabel, { color: active ? '#fff' : theme.colors.textSecondary }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'mine' || pageState.status === 'ready' ? (
        <Text style={[styles.countLabel, { color: theme.colors.textTertiary }]}>
          {count.toLocaleString()}件 ・ 締切が近い順
        </Text>
      ) : null}

      {mode === 'all' && pageState.status === 'loading' ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : mode === 'all' && pageState.status === 'error' ? (
        <ErrorState onRetry={retryInitial} {...getApiErrorCopy(pageState.error)} />
      ) : mode === 'mine' && filteredMine.length === 0 ? (
        <EmptyState
          icon={<HeartIcon size={34} color={theme.colors.green} strokeWidth={1.7} />}
          title="まだ保存した抽選はありません"
          description="全国の抽選から気になる抽選を保存しましょう"
          action={
            <Pressable onPress={() => setMode('all')}>
              <View style={[styles.ctaPill, { backgroundColor: theme.colors.green }]}>
                <Text style={styles.ctaPillText}>全国の抽選を見る</Text>
              </View>
            </Pressable>
          }
        />
      ) : mode === 'all' && filteredAll.length === 0 ? (
        <EmptyState
          icon={<SearchIcon size={30} color={theme.colors.textFaint} />}
          title="該当する抽選が見つかりません"
          description="検索条件やタブを変更してお試しください"
        />
      ) : mode === 'mine' ? (
        <FlatList
          data={filteredMine}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <PublicLotteryCard
              record={item}
              nowIso={nowIso}
              onPress={() => router.push(`/lotteries/${item.id}`)}
              secondaryActionLabel="チェックリスト"
              onSecondaryActionPress={() => router.push(`/checklist/${item.id}`)}
            />
          )}
        />
      ) : (
        <FlatList
          data={filteredAll}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <PublicLotteryCard record={item} nowIso={nowIso} onPress={() => router.push(`/lotteries/${item.id}`)} />
          )}
          ListFooterComponent={
            pageState.status === 'ready' ? (
              <LoadMoreFooter
                loadingMore={pageState.loadingMore}
                loadMoreError={pageState.loadMoreError}
                hasMore={hasMore}
                onLoadMore={loadMore}
              />
            ) : null
          }
        />
      )}
    </ScreenContainer>
  );
}

function LoadMoreFooter({
  loadingMore,
  loadMoreError,
  hasMore,
  onLoadMore,
}: {
  loadingMore: boolean;
  loadMoreError: unknown | null;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const theme = useTheme();

  if (loadingMore) {
    return (
      <View style={styles.loadMoreWrap}>
        <ActivityIndicator color={theme.colors.green} />
      </View>
    );
  }

  if (loadMoreError) {
    const copy = getApiErrorCopy(loadMoreError);
    return (
      <View style={styles.loadMoreWrap}>
        <Text style={[styles.loadMoreErrorText, { color: theme.colors.danger }]}>{copy.title}</Text>
        <Pressable onPress={onLoadMore}>
          <View style={[styles.ctaPill, { backgroundColor: theme.colors.green }]}>
            <Text style={styles.ctaPillText}>再試行</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  if (!hasMore) return null;

  return (
    <View style={styles.loadMoreWrap}>
      <SecondaryButton label="もっと見る" size="md" onPress={onLoadMore} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 23,
    fontWeight: '900',
  },
  searchWrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  searchBox: {
    height: 44,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  modeSwitchWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    gap: 7,
  },
  modeSwitch: {
    flexDirection: 'row',
    borderRadius: 11,
    padding: 3,
  },
  modeButton: {
    flex: 1,
    height: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  modeHint: {
    fontSize: 11,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  tabChip: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  countLabel: {
    fontSize: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 11,
  },
  loadMoreWrap: {
    paddingTop: 6,
    paddingBottom: 4,
    alignItems: 'center',
    gap: 10,
  },
  loadMoreErrorText: {
    fontSize: 12,
    fontWeight: '700',
  },
  ctaPill: {
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  ctaPillText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
