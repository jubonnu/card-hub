import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackIcon } from '@/components/icons';
import { DayScheduleSheet } from '@/components/DayScheduleSheet';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useMyLotteriesStore } from '@/stores/myLotteriesStore';
import { useTheme } from '@/theme/useTheme';
import {
  calendarEventDateKey,
  getLotteryCalendarEvents,
  type LotteryCalendarEvent,
  type LotteryCalendarEventKind,
} from '@/utils/lotteryCalendarEvents';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const DOT_ORDER: LotteryCalendarEventKind[] = ['deadline', 'announcement', 'purchase'];

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * 「自分の抽選」に保存済みの応募締切・当選発表・購入期限を、月表示の丸印とボトムシートの
 * 24時間タイムラインで見せるカレンダー画面。実際の予定データはこのアプリ自身が持つ
 * （`myLotteriesStore`由来）ため、iPhoneのカレンダーアプリへの連携（抽選詳細画面の
 * 「カレンダーに追加」）をしていなくても表示される。
 */
export default function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const saved = useMyLotteriesStore((s) => s.saved);
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [sheetDateKey, setSheetDateKey] = useState<string | null>(null);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, LotteryCalendarEvent[]>();
    for (const item of saved) {
      for (const event of getLotteryCalendarEvents(item.record)) {
        const key = calendarEventDateKey(event);
        const list = map.get(key);
        if (list) list.push(event);
        else map.set(key, [event]);
      }
    }
    return map;
  }, [saved]);

  const gridDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));
    return cells;
  }, [viewDate]);

  function changeMonth(delta: number) {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function goToToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  function handleSelectEvent(event: LotteryCalendarEvent) {
    setSheetDateKey(null);
    router.push(`/lotteries/${event.lotteryId}`);
  }

  const sheetEvents = sheetDateKey ? (eventsByDate.get(sheetDateKey) ?? []) : [];

  return (
    <ScreenContainer style={{ backgroundColor: theme.colors.surface }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>カレンダー</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.monthRow}>
          <View style={styles.monthRowSide} />
          <View style={styles.monthCenterGroup}>
            <Pressable style={styles.monthNav} onPress={() => changeMonth(-1)}>
              <BackIcon size={18} color={theme.colors.textSecondary} strokeWidth={2.3} />
            </Pressable>
            <Text style={[styles.monthLabel, { color: theme.colors.textPrimary }]}>
              {viewDate.getFullYear()}年{viewDate.getMonth() + 1}月
            </Text>
            <Pressable style={styles.monthNav} onPress={() => changeMonth(1)}>
              <View style={{ transform: [{ scaleX: -1 }] }}>
                <BackIcon size={18} color={theme.colors.textSecondary} strokeWidth={2.3} />
              </View>
            </Pressable>
          </View>
          <View style={[styles.monthRowSide, styles.monthRowSideRight]}>
            <Pressable onPress={goToToday} style={[styles.todayButton, { borderColor: theme.colors.green }]}>
              <Text style={[styles.todayButtonText, { color: theme.colors.green }]}>今日へ戻る</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((w, i) => (
            <Text
              key={w}
              style={[
                styles.weekdayLabel,
                { color: i === 0 ? theme.colors.danger : i === 6 ? theme.colors.event.purchase.color : theme.colors.textSecondary },
              ]}
            >
              {w}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {gridDays.map((date, index) => {
            if (!date) return <View key={`empty-${index}`} style={styles.cell} />;
            const key = toDateKey(date);
            const isToday = key === todayKey;
            const weekday = date.getDay();
            const dayEvents = eventsByDate.get(key) ?? [];
            const kindsPresent = DOT_ORDER.filter((kind) => dayEvents.some((e) => e.kind === kind));

            return (
              <Pressable key={key} style={styles.cell} onPress={() => setSheetDateKey(key)}>
                <View style={[styles.dayCircle, isToday && { backgroundColor: theme.colors.green }]}>
                  <Text
                    style={[
                      styles.dayNumber,
                      {
                        color: isToday
                          ? '#fff'
                          : weekday === 0
                            ? theme.colors.danger
                            : weekday === 6
                              ? theme.colors.event.purchase.color
                              : theme.colors.textPrimary,
                        fontWeight: isToday ? '900' : '400',
                      },
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </View>
                <View style={styles.dotRow}>
                  {kindsPresent.map((kind) => (
                    <View key={kind} style={[styles.dot, { backgroundColor: theme.colors.event[kind].color }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.divider, { backgroundColor: theme.colors.surfaceSubtle }]} />

        <View style={styles.legend}>
          {DOT_ORDER.map((kind) => (
            <View key={kind} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: theme.colors.event[kind].color }]} />
              <Text style={[styles.legendLabel, { color: theme.colors.textSecondary }]}>{theme.colors.event[kind].label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <DayScheduleSheet
        visible={sheetDateKey !== null}
        dateKey={sheetDateKey}
        events={sheetEvents}
        onClose={() => setSheetDateKey(null)}
        onSelectEvent={handleSelectEvent}
      />
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
  todayButton: {
    height: 26,
    borderWidth: 1.1,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    flexShrink: 0,
  },
  todayButtonText: {
    fontSize: 10,
    fontWeight: '700',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  monthRowSide: {
    flex: 1,
  },
  monthRowSideRight: {
    alignItems: 'flex-end',
  },
  monthCenterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  monthNav: {
    width: 44,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '900',
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
  },
  weekdayLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
  },
  cell: {
    width: '14.2857%',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
  },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    fontSize: 13,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  divider: {
    height: 9,
    marginTop: 10,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
