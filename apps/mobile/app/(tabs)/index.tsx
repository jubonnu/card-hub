import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { CheckCircleIcon } from '@/components/icons';
import { PublicLotteryCard } from '@/components/PublicLotteryCard';
import { ProductThumb } from '@/components/ProductThumb';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useApiRequest } from '@/hooks/useApiRequest';
import { useNowIso } from '@/hooks/useNowIso';
import { fetchLotteries } from '@/lib/apiClient';
import { useMyLotteriesStore } from '@/stores/myLotteriesStore';
import { useTheme } from '@/theme/useTheme';
import { derivePublicTimelineStatus, getDisplayProductName, getDisplayShopName } from '@/utils/publicLotteryDisplay';
import { formatRelativeMinutes, isPast, normalizeDeadline } from '@/utils/time';

const NEW_ARRIVALS_FETCH_LIMIT = 20;
const NEW_ARRIVALS_DISPLAY_COUNT = 3;
const TODAYS_TASKS_DISPLAY_COUNT = 3;

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const nowIso = useNowIso();
  const { saved } = useMyLotteriesStore();

  // 「新着抽選」はAPIのcreatedAt降順で実データから求める（架空データは使わない）。
  const newArrivalsState = useApiRequest(
    (signal) => fetchLotteries({ limit: NEW_ARRIVALS_FETCH_LIMIT }, signal),
    []
  );
  const newArrivals = useMemo(() => {
    if (newArrivalsState.status !== 'success') return [];
    return [...newArrivalsState.data.lotteries]
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, NEW_ARRIVALS_DISPLAY_COUNT);
  }, [newArrivalsState]);

  // 「今日やること」は自分が保存した実抽選のうち、締切・発表・購入期限が近い順に表示する。
  const todaysTasks = useMemo(() => {
    return saved
      .map((s) => s.record)
      .filter((record) => {
        const deadline = normalizeDeadline(record.applicationEndAt, record.applicationEndDate);
        const announce = normalizeDeadline(record.resultAnnouncementAt, record.resultAnnouncementDate);
        const purchase = record.purchaseDeadlineAt;
        const upcoming = [deadline, announce, purchase].filter((d): d is string => Boolean(d) && !isPast(d as string, nowIso));
        return upcoming.length > 0;
      })
      .sort((a, b) => {
        const nextDate = (r: typeof a) => {
          const dates = [
            normalizeDeadline(r.applicationEndAt, r.applicationEndDate),
            normalizeDeadline(r.resultAnnouncementAt, r.resultAnnouncementDate),
            r.purchaseDeadlineAt,
          ]
            .filter((d): d is string => Boolean(d) && !isPast(d as string, nowIso))
            .map((d) => new Date(d).getTime());
          return Math.min(...dates);
        };
        return nextDate(a) - nextDate(b);
      })
      .slice(0, TODAYS_TASKS_DISPLAY_COUNT);
  }, [saved, nowIso]);

  return (
    <ScreenContainer style={{ backgroundColor: theme.colors.surface }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>ホーム</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={newArrivalsState.refreshing}
            onRefresh={() => void newArrivalsState.refresh()}
            tintColor={theme.colors.green}
            colors={[theme.colors.green]}
          />
        }
      >
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>今日やること</Text>
            {todaysTasks.length > 0 ? (
              <Text style={[styles.sectionHint, { color: theme.colors.textTertiary }]}>
                期限が近い{todaysTasks.length}件
              </Text>
            ) : null}
          </View>

          {todaysTasks.length === 0 ? (
            <View style={styles.emptyCard}>
              <EmptyState
                icon={<CheckCircleIcon size={24} color={theme.colors.green} />}
                title="今日やることはありません"
                description="「自分の抽選」に保存すると、締切や発表が近いものをここに表示します"
              />
            </View>
          ) : (
            <View style={styles.cardList}>
              {todaysTasks.map((record) => (
                <PublicLotteryCard
                  key={record.id}
                  record={record}
                  nowIso={nowIso}
                  onPress={() => router.push(`/lotteries/${record.id}`)}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>新着抽選</Text>
            <Pressable onPress={() => router.push('/(tabs)/lotteries')}>
              <Text style={[styles.seeAll, { color: theme.colors.green }]}>すべて見る ›</Text>
            </Pressable>
          </View>

          {newArrivals.length === 0 ? (
            <View style={[styles.dashedEmpty, { borderColor: theme.colors.thumbInner }]}>
              <Text style={[styles.dashedTitle, { color: theme.colors.textLabel }]}>新着抽選はありません</Text>
              <Text style={[styles.dashedDesc, { color: theme.colors.textTertiary }]}>
                新しい抽選が追加されるとここに表示されます
              </Text>
            </View>
          ) : (
            newArrivals.map((record, index) => (
              <Pressable
                key={record.id}
                onPress={() => router.push(`/lotteries/${record.id}`)}
                style={[
                  styles.newRow,
                  index < newArrivals.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.borderLighter,
                  },
                ]}
              >
                <ProductThumb size="sm" />
                <View style={styles.newRowText}>
                  <Text style={[styles.newRowName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                    {getDisplayProductName(record)}
                  </Text>
                  <Text style={[styles.newRowMeta, { color: theme.colors.textTertiary }]}>
                    {getDisplayShopName(record)} ・ {formatRelativeMinutes(record.createdAt, nowIso)}
                  </Text>
                </View>
                {derivePublicTimelineStatus(record, nowIso) === 'accepting' ? (
                  <View style={[styles.newBadge, { backgroundColor: theme.colors.danger }]}>
                    <Text style={styles.newBadgeText}>受付中</Text>
                  </View>
                ) : null}
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 23,
    fontWeight: '900',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 20,
  },
  section: {
    gap: 11,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  sectionHint: {
    fontSize: 12,
  },
  seeAll: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardList: {
    gap: 11,
  },
  emptyCard: {
    minHeight: 160,
  },
  dashedEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 7,
  },
  dashedTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  dashedDesc: {
    fontSize: 12,
    textAlign: 'center',
  },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
  },
  newRowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  newRowName: {
    fontSize: 14,
    fontWeight: '700',
  },
  newRowMeta: {
    fontSize: 11,
  },
  newBadge: {
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#fff',
  },
});
