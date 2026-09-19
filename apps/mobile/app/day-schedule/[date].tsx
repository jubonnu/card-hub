import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { useMyLotteriesStore } from '@/stores/myLotteriesStore';
import { useTheme } from '@/theme/useTheme';
import {
  calendarEventDateKey,
  calendarEventJstHourMinute,
  getLotteryCalendarEvents,
  LOTTERY_CALENDAR_EVENT_LABEL,
  type LotteryCalendarEvent,
} from '@/utils/lotteryCalendarEvents';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 56;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

interface TimedItem {
  event: LotteryCalendarEvent;
  hour: number;
  minute: number;
}

interface PositionedItem extends TimedItem {
  column: number;
  columns: number;
}

/** 同じ1時間の予定同士が重なる場合、横に並べて配置できるよう列を割り当てる。 */
function layoutTimedItems(items: TimedItem[]): PositionedItem[] {
  const sorted = [...items].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  const result: PositionedItem[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    let clusterEndMinutes = sorted[i]!.hour * 60 + sorted[i]!.minute + 60;
    while (j + 1 < sorted.length) {
      const next = sorted[j + 1]!;
      const nextStartMinutes = next.hour * 60 + next.minute;
      if (nextStartMinutes >= clusterEndMinutes) break;
      clusterEndMinutes = Math.max(clusterEndMinutes, nextStartMinutes + 60);
      j += 1;
    }
    const cluster = sorted.slice(i, j + 1);
    cluster.forEach((item, idx) => result.push({ ...item, column: idx, columns: cluster.length }));
    i = j + 1;
  }
  return result;
}

/**
 * 「自分の抽選」の応募締切・当選発表・購入期限を、iPhoneのカレンダーアプリのような
 * 24時間の縦タイムラインで見せる画面。終日（日付のみ・時刻不明）の予定は上部に別枠で
 * 表示し、実在しない時刻をタイムライン上に置かない。
 *
 * `components/DayScheduleSheet.tsx`（React Native標準Modal + 自前PanResponderでの
 * スワイプ実装）ではなく、Paywall等と同じexpo-routerの`presentation: 'modal'`画面として
 * 実装している。スワイプで閉じる等のシート挙動はOS標準のものを使う。
 */
export default function DayScheduleScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date: string }>();
  const saved = useMyLotteriesStore((s) => s.saved);
  const scrollRef = useRef<ScrollView>(null);

  const events = useMemo(() => {
    if (!date) return [];
    const result: LotteryCalendarEvent[] = [];
    for (const item of saved) {
      for (const event of getLotteryCalendarEvents(item.record)) {
        if (calendarEventDateKey(event) === date) result.push(event);
      }
    }
    return result;
  }, [saved, date]);

  const allDayEvents = useMemo(() => events.filter((e) => e.dateOnly), [events]);
  const timedItems = useMemo(
    () =>
      events
        .filter((e) => e.dateIso)
        .map((event) => ({ event, ...calendarEventJstHourMinute(event)! }))
        .filter((item): item is TimedItem => item.hour !== undefined),
    [events]
  );
  const positionedItems = useMemo(() => layoutTimedItems(timedItems), [timedItems]);

  const dateLabel = useMemo(() => {
    if (!date) return '';
    const [y, m, d] = date.split('-').map(Number);
    const parsed = new Date(y!, m! - 1, d!);
    return `${m}月${d}日（${WEEKDAYS[parsed.getDay()]}）`;
  }, [date]);

  useEffect(() => {
    const firstHour = positionedItems[0]?.hour ?? 8;
    const y = firstHour * HOUR_HEIGHT;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false }));
    // 初回表示時のみ実行する（positionedItemsは初回計算のみ参照すれば十分なため依存に含めない）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectEvent(event: LotteryCalendarEvent) {
    router.push(`/lotteries/${event.lotteryId}`);
  }

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.iconButton} />
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>{dateLabel}</Text>
        <Pressable hitSlop={10} style={styles.iconButton} onPress={() => router.back()}>
          <Text style={[styles.closeLabel, { color: theme.colors.textSecondary }]}>閉じる</Text>
        </Pressable>
      </View>

      {allDayEvents.length > 0 ? (
        <View style={styles.allDaySection}>
          {allDayEvents.map((event, index) => (
            <Pressable
              key={`${event.lotteryId}-${event.kind}-${index}`}
              style={[styles.allDayRow, { backgroundColor: theme.colors.event[event.kind].color + '22' }]}
              onPress={() => handleSelectEvent(event)}
            >
              <View style={[styles.dot, { backgroundColor: theme.colors.event[event.kind].color }]} />
              <Text style={[styles.allDayLabel, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                終日 ・ {LOTTERY_CALENDAR_EVENT_LABEL[event.kind]} ・ {event.productName}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScrollView ref={scrollRef} style={styles.timeline} showsVerticalScrollIndicator={false}>
        <View style={{ height: HOURS.length * HOUR_HEIGHT }}>
          {HOURS.map((hour) => (
            <View key={hour} style={[styles.hourRow, { borderColor: theme.colors.surfaceSubtle }]}>
              <Text style={[styles.hourLabel, { color: theme.colors.textTertiary }]}>{String(hour).padStart(2, '0')}:00</Text>
            </View>
          ))}

          {positionedItems.map((item, index) => {
            const top = (item.hour + item.minute / 60) * HOUR_HEIGHT;
            const widthPercent = 100 / item.columns;
            return (
              <Pressable
                key={`${item.event.lotteryId}-${item.event.kind}-${index}`}
                style={[
                  styles.timedEvent,
                  {
                    top,
                    left: `${58 + item.column * widthPercent * 0.4}%`,
                    width: `${widthPercent * 0.4}%`,
                    backgroundColor: theme.colors.event[item.event.kind].color,
                  },
                ]}
                onPress={() => handleSelectEvent(item.event)}
              >
                <Text style={styles.timedEventLabel} numberOfLines={2}>
                  {LOTTERY_CALENDAR_EVENT_LABEL[item.event.kind]}
                  {'\n'}
                  {item.event.productName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '900',
  },
  closeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  allDaySection: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 6,
  },
  allDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  allDayLabel: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  timeline: {
    flex: 1,
  },
  hourRow: {
    height: HOUR_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingLeft: 16,
    paddingTop: 4,
  },
  hourLabel: {
    fontSize: 11,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timedEvent: {
    position: 'absolute',
    height: HOUR_HEIGHT - 4,
    borderRadius: 8,
    padding: 6,
  },
  timedEventLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
});
