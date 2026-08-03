import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { DetailHeader } from '@/components/DetailHeader';
import { EmptyState } from '@/components/EmptyState';
import { HeartIcon } from '@/components/icons';
import { PublicLotteryCard } from '@/components/PublicLotteryCard';
import { ScreenContainer } from '@/components/ScreenContainer';
import { isCorrectionTransition, nextLotteryStatusOptions } from '@/lib/lotteryStatusTransitions';
import { useMyLotteriesStore, type SavedLottery } from '@/stores/myLotteriesStore';
import type { PersonalLotteryStatus } from '@/theme/colors';
import { useTheme } from '@/theme/useTheme';
import { compareLotteriesByTimeline, derivePublicTimelineStatus } from '@/utils/publicLotteryDisplay';

const PERSONAL_STATUS_LABEL: Record<PersonalLotteryStatus, string> = {
  unknown: '未設定',
  planned: '応募予定',
  applied: '応募済み',
  won: '当選',
  lost: '落選',
  purchased: '購入済み',
  skipped: '見送り',
};

const TABS = [
  { key: 'all', label: 'すべて' },
  { key: 'accepting', label: '受付中' },
  { key: 'resultPending', label: '結果待ち' },
  { key: 'ended', label: '受付終了' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function MyLotteriesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { saved, setStatus } = useMyLotteriesStore();
  const [tab, setTab] = useState<TabKey>('all');
  const nowIso = useMemo(() => new Date().toISOString(), []);

  const filtered = useMemo(() => {
    const byTab = tab === 'all' ? saved : saved.filter((s) => derivePublicTimelineStatus(s.record, nowIso) === tab);
    return [...byTab].sort((a, b) => compareLotteriesByTimeline(a.record, b.record, nowIso));
  }, [saved, tab, nowIso]);

  const openStatusSheet = (item: SavedLottery) => {
    if (item.serverVersion === undefined) {
      Alert.alert('同期中です', 'この抽選の保存が完了してから、ステータスを変更できます');
      return;
    }

    const options = nextLotteryStatusOptions(item.status);
    if (options.length === 0) return;

    const buttons = options.map((next) => ({
      text: PERSONAL_STATUS_LABEL[next],
      onPress: () => {
        if (isCorrectionTransition(item.status, next)) {
          Alert.alert('訂正しますか？', `「${PERSONAL_STATUS_LABEL[item.status]}」から「${PERSONAL_STATUS_LABEL[next]}」に戻します`, [
            { text: 'キャンセル', style: 'cancel' },
            { text: '訂正する', style: 'destructive', onPress: () => setStatus(item.record.id, next) },
          ]);
          return;
        }
        setStatus(item.record.id, next);
      },
    }));

    Alert.alert('ステータスを変更', `現在: ${PERSONAL_STATUS_LABEL[item.status]}`, [...buttons, { text: 'キャンセル', style: 'cancel' as const }]);
  };

  return (
    <ScreenContainer>
      <DetailHeader title="自分の抽選" />

      <View style={styles.tabsRow}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tabChip, { backgroundColor: active ? theme.colors.textPrimary : theme.colors.chipTrack }]}
            >
              <Text style={[styles.tabLabel, { color: active ? '#fff' : theme.colors.textSecondary }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<HeartIcon size={34} color={theme.colors.green} strokeWidth={1.7} />}
          title="まだ保存した抽選はありません"
          description="全国の抽選から気になる抽選を保存しましょう"
          action={
            <Pressable onPress={() => router.push('/(tabs)/lotteries')}>
              <View style={[styles.ctaPill, { backgroundColor: theme.colors.green }]}>
                <Text style={styles.ctaPillText}>全国の抽選を見る</Text>
              </View>
            </Pressable>
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.record.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <PublicLotteryCard
              record={item.record}
              nowIso={nowIso}
              onPress={() => router.push(`/lotteries/${item.record.id}`)}
              secondaryActionLabel="チェックリスト"
              onSecondaryActionPress={() => router.push(`/checklist/${item.record.id}`)}
              personalStatus={item.status}
              onPersonalStatusPress={() => openStatusSheet(item)}
            />
          )}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tabsRow: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 20,
    paddingBottom: 12,
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
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 11,
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
