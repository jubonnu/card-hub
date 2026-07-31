import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { DetailHeader } from '@/components/DetailHeader';
import { ScreenContainer } from '@/components/ScreenContainer';
import { monthlyStats, shopWinRates, winRateTrend } from '@/data/mockData';
import { useTheme } from '@/theme/useTheme';

const PERIODS = ['月間', '3ヶ月', '年間'] as const;
type Period = (typeof PERIODS)[number];

const CHART_WIDTH = 326;
const CHART_HEIGHT = 172;

export default function StatsScreen() {
  const theme = useTheme();
  const [period, setPeriod] = useState<Period>('月間');

  const aggregate = useMemo(() => {
    const count = period === '月間' ? 1 : period === '3ヶ月' ? 3 : monthlyStats.length;
    const slice = monthlyStats.slice(-count);
    const applied = slice.reduce((sum, m) => sum + m.applied, 0);
    const won = slice.reduce((sum, m) => sum + m.won, 0);
    const purchased = slice.reduce((sum, m) => sum + m.purchased, 0);
    const winRate = applied > 0 ? ((won / applied) * 100).toFixed(1) : '0.0';
    return { applied, won, purchased, winRate };
  }, [period]);

  const chartPoints = useMemo(() => {
    const max = 30;
    const left = 34;
    const right = CHART_WIDTH - 10;
    const top = 20;
    const bottom = 146;
    const stepX = (right - left) / (winRateTrend.length - 1);
    return winRateTrend.map((value, index) => {
      const x = left + stepX * index;
      const y = bottom - (value / max) * (bottom - top);
      return { x, y };
    });
  }, []);

  const latestMonth = monthlyStats[monthlyStats.length - 1];
  const [latestYear, latestMonthNum] = latestMonth.month.split('-');

  return (
    <ScreenContainer>
      <DetailHeader title="統計・分析" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.periodSwitch, { backgroundColor: theme.colors.chipTrack }]}>
          {PERIODS.map((p) => (
            <Pressable
              key={p}
              style={[styles.periodButton, period === p && { backgroundColor: theme.colors.green }]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodLabel, { color: period === p ? '#fff' : theme.colors.textSecondary }]}>
                {p}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
            {latestYear}年{Number(latestMonthNum)}月の成績
          </Text>
          <View style={styles.statsGrid}>
            <StatCard label="応募数" value={String(aggregate.applied)} />
            <StatCard label="当選数" value={String(aggregate.won)} />
            <StatCard label="当選率" value={`${aggregate.winRate}%`} highlight />
            <StatCard label="購入数" value={String(aggregate.purchased)} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>当選率の推移</Text>
          <View style={[styles.chartCard, { borderColor: theme.colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Svg width={CHART_WIDTH} height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
              {[0, 10, 20, 30].map((value) => {
                const y = 146 - (value / 30) * 126;
                return (
                  <Line
                    key={value}
                    x1={34}
                    y1={y}
                    x2={CHART_WIDTH - 10}
                    y2={y}
                    stroke={theme.colors.borderLight}
                    strokeWidth={1}
                  />
                );
              })}
              {[0, 10, 20, 30].map((value) => {
                const y = 146 - (value / 30) * 126;
                return (
                  <SvgText key={value} x={4} y={y + 4} fontSize={10} fill={theme.colors.textMuted}>
                    {value}%
                  </SvgText>
                );
              })}
              <Polyline
                points={chartPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={theme.colors.green}
                strokeWidth={2.4}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {chartPoints.map((p, index) => (
                <Circle
                  key={index}
                  cx={p.x}
                  cy={p.y}
                  r={index === chartPoints.length - 1 ? 4.8 : 3.4}
                  fill={index === chartPoints.length - 1 ? theme.colors.green : theme.colors.surface}
                  stroke={theme.colors.green}
                  strokeWidth={2.2}
                />
              ))}
            </Svg>
            </ScrollView>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>店舗別当選率 TOP5</Text>
          {shopWinRates.map((shop, index) => (
            <View
              key={shop.shopName}
              style={[
                styles.rankRow,
                index < shopWinRates.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.borderLighter,
                },
              ]}
            >
              <Text
                style={[
                  styles.rankNumber,
                  { color: index < 3 ? theme.colors.green : theme.colors.textSecondary },
                ]}
              >
                {index + 1}
              </Text>
              <Text style={[styles.rankName, { color: theme.colors.textPrimary }]}>{shop.shopName}</Text>
              <Text style={[styles.rankValue, { color: theme.colors.textPrimary }]}>
                {shop.winRate.toFixed(1)}%
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.statCard,
        {
          borderColor: highlight ? theme.colors.greenBorder : theme.colors.border,
          backgroundColor: highlight ? theme.colors.greenSoftBg : 'transparent',
        },
      ]}
    >
      <Text style={[styles.statCardLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statCardValue, { color: highlight ? theme.colors.green : theme.colors.textPrimary }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    gap: 18,
  },
  periodSwitch: {
    flexDirection: 'row',
    borderRadius: 11,
    padding: 3,
  },
  periodButton: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    gap: 9,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 3,
  },
  statCardLabel: {
    fontSize: 11,
  },
  statCardValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  chartCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 44,
  },
  rankNumber: {
    width: 20,
    fontSize: 12,
    fontWeight: '900',
  },
  rankName: {
    flex: 1,
    fontSize: 13,
  },
  rankValue: {
    fontSize: 13,
    fontWeight: '700',
  },
});
