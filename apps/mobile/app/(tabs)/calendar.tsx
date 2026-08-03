import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackIcon } from '@/components/icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useTheme } from '@/theme/useTheme';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * このアプリ独自の「予定」データは持たない（登録済みの予定はiPhoneのカレンダーアプリが正）。
 * ここでは月表示のナビゲーションのみを提供し、実際の予定はOSカレンダー連携
 * （抽選詳細画面の「カレンダーに追加」／lib/calendar.ts）に一本化する。
 */
export default function CalendarScreen() {
  const theme = useTheme();
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(todayKey);

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

  const selectedDate = new Date(selectedKey);

  function changeMonth(delta: number) {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function goToToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedKey(todayKey);
  }

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
            const isSelected = key === selectedKey;
            const weekday = date.getDay();

            return (
              <Pressable key={key} style={styles.cell} onPress={() => setSelectedKey(key)}>
                <View
                  style={[
                    styles.dayCircle,
                    isToday && { backgroundColor: theme.colors.green },
                    !isToday && isSelected && { borderWidth: 1.5, borderColor: theme.colors.green },
                  ]}
                >
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
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.divider, { backgroundColor: theme.colors.surfaceSubtle }]} />

        <View style={styles.agenda}>
          <Text style={[styles.agendaTitle, { color: theme.colors.textPrimary }]}>
            {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 ({WEEKDAYS[selectedDate.getDay()]})
          </Text>
          <View style={[styles.guidanceCard, { borderColor: theme.colors.border }]}>
            <Text style={[styles.guidanceText, { color: theme.colors.textSecondary }]}>
              抽選詳細画面の「カレンダーに追加」から、応募締切・当選発表・購入期限をiPhoneのカレンダーへ登録できます。登録済みの予定はカレンダーアプリでご確認ください。
            </Text>
          </View>
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
  divider: {
    height: 9,
    marginTop: 10,
  },
  agenda: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 30,
    gap: 10,
  },
  agendaTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  guidanceCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  guidanceText: {
    fontSize: 13,
    lineHeight: 20,
  },
});
