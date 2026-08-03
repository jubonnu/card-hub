import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { AuthApiError } from '@/lib/authApiClient';
import { DetailHeader } from '@/components/DetailHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ChartEmptyIcon, HeartIcon } from '@/components/icons';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { deriveStatisticsScreenState } from '@/lib/statisticsScreenState';
import {
  fetchStatisticsMonthly,
  fetchStatisticsStores,
  fetchStatisticsSummary,
  StatisticsResponseValidationError,
} from '@/lib/statisticsClient';
import type { StatisticsMonthlyItem, StatisticsStoreItem, StatisticsSummaryResponse } from '@/schemas/statisticsApi';
import { useAuthStore } from '@/stores/authStore';
import { useBillingStore } from '@/stores/billingStore';
import { useTheme } from '@/theme/useTheme';

const PERIODS = ['月間', '3ヶ月', '年間'] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_MONTHS: Record<Period, number> = { 月間: 1, '3ヶ月': 3, 年間: 12 };
const MONTHLY_FETCH_MONTHS = 12;

const CHART_WIDTH = 326;
const CHART_HEIGHT = 172;

function errorCopy(error: unknown): { title: string; description: string } {
  if (error instanceof AuthApiError && error.kind === 'network') {
    return { title: 'サーバーに接続できませんでした', description: '通信状況を確認して、もう一度読み込んでください' };
  }
  if (error instanceof StatisticsResponseValidationError) {
    return { title: 'データを正しく読み込めませんでした', description: 'しばらくしてからもう一度お試しください' };
  }
  return { title: '統計を取得できませんでした', description: '通信状況を確認して、もう一度読み込んでください' };
}

export default function StatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const authStatus = useAuthStore((s) => s.status);
  const billing = useBillingStore();
  const isPremium = billing.localEntitlementActive || billing.serverPremiumActive;

  const [period, setPeriod] = useState<Period>('月間');
  const [summary, setSummary] = useState<StatisticsSummaryResponse | null>(null);
  const [monthly, setMonthly] = useState<StatisticsMonthlyItem[]>([]);
  const [stores, setStores] = useState<StatisticsStoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const shouldFetch = authStatus === 'signedIn' && isPremium;

  useEffect(() => {
    if (!shouldFetch) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchStatisticsSummary(), fetchStatisticsMonthly(MONTHLY_FETCH_MONTHS), fetchStatisticsStores(5)])
      .then(([summaryRes, monthlyRes, storesRes]) => {
        if (cancelled) return;
        setSummary(summaryRes);
        setMonthly(monthlyRes.items);
        setStores(storesRes.items);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [shouldFetch, reloadToken]);

  const state = deriveStatisticsScreenState({
    authStatus,
    isPremium,
    loading,
    error: error !== null,
    savedCount: summary?.savedCount ?? 0,
  });

  const periodSlice = useMemo(() => monthly.slice(-PERIOD_MONTHS[period]), [monthly, period]);
  const aggregate = useMemo(() => {
    const applied = periodSlice.reduce((sum, m) => sum + m.appliedCount, 0);
    const won = periodSlice.reduce((sum, m) => sum + m.wonCount, 0);
    const lost = periodSlice.reduce((sum, m) => sum + m.lostCount, 0);
    const winRate = won + lost > 0 ? ((won / (won + lost)) * 100).toFixed(1) : null;
    return { applied, won, winRate };
  }, [periodSlice]);

  const chartPoints = useMemo(() => {
    const max = 100;
    const left = 34;
    const right = CHART_WIDTH - 10;
    const top = 20;
    const bottom = 146;
    if (monthly.length < 2) return [];
    const stepX = (right - left) / (monthly.length - 1);
    return monthly.map((m, index) => {
      const value = m.winRate !== null ? m.winRate * 100 : 0;
      const x = left + stepX * index;
      const y = bottom - (value / max) * (bottom - top);
      return { x, y };
    });
  }, [monthly]);

  if (state === 'signedOut') {
    return (
      <ScreenContainer>
        <DetailHeader title="統計・分析" />
        <EmptyState
          icon={<ChartEmptyIcon size={34} color={theme.colors.green} strokeWidth={1.7} />}
          title="サインインが必要です"
          description="統計・分析機能を利用するにはサインインしてください"
          action={<PrimaryButton label="サインイン" size="md" onPress={() => router.push('/sign-in' as Parameters<typeof router.push>[0])} />}
        />
      </ScreenContainer>
    );
  }

  if (state === 'notPremium') {
    return (
      <ScreenContainer>
        <DetailHeader title="統計・分析" />
        <EmptyState
          icon={<ChartEmptyIcon size={34} color={theme.colors.green} strokeWidth={1.7} />}
          title="プレミアムプランで統計が見られます"
          description="応募・当選実績の推移や店舗別の当選率など、詳しい分析はプレミアムプランでご利用いただけます"
          action={<PrimaryButton label="プレミアムプランを見る" size="md" onPress={() => router.push('/paywall')} />}
        />
      </ScreenContainer>
    );
  }

  if (state === 'loading') {
    return (
      <ScreenContainer>
        <DetailHeader title="統計・分析" />
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.green} />
        </View>
      </ScreenContainer>
    );
  }

  if (state === 'error') {
    return (
      <ScreenContainer>
        <DetailHeader title="統計・分析" />
        <ErrorState onRetry={() => setReloadToken((t) => t + 1)} {...errorCopy(error)} />
      </ScreenContainer>
    );
  }

  if (state === 'empty') {
    return (
      <ScreenContainer>
        <DetailHeader title="統計・分析" />
        <EmptyState
          icon={<HeartIcon size={34} color={theme.colors.green} strokeWidth={1.7} />}
          title="まだデータがありません"
          description="抽選を保存してステータスを記録すると、ここに実績が表示されます"
          action={
            <Pressable onPress={() => router.push('/(tabs)/lotteries')}>
              <View style={[styles.ctaPill, { backgroundColor: theme.colors.green }]}>
                <Text style={styles.ctaPillText}>全国の抽選を見る</Text>
              </View>
            </Pressable>
          }
        />
      </ScreenContainer>
    );
  }

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
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>{period}の実績</Text>
          <View style={styles.statsGrid}>
            <StatCard label="保存数" value={String(summary?.savedCount ?? 0)} />
            <StatCard label="応募数" value={String(aggregate.applied)} />
            <StatCard label="当選数" value={String(aggregate.won)} />
            <StatCard label="当選率" value={aggregate.winRate !== null ? `${aggregate.winRate}%` : '計算不可'} highlight />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>当選率の推移</Text>
          {chartPoints.length === 0 ? (
            <Text style={[styles.message, { color: theme.colors.textTertiary }]}>推移を表示するにはもう少しデータが必要です</Text>
          ) : (
            <View style={[styles.chartCard, { borderColor: theme.colors.border }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Svg width={CHART_WIDTH} height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
                  {[0, 25, 50, 75, 100].map((value) => {
                    const y = 146 - (value / 100) * 126;
                    return (
                      <Line key={value} x1={34} y1={y} x2={CHART_WIDTH - 10} y2={y} stroke={theme.colors.borderLight} strokeWidth={1} />
                    );
                  })}
                  {[0, 25, 50, 75, 100].map((value) => {
                    const y = 146 - (value / 100) * 126;
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
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>店舗別当選率 TOP5</Text>
          {stores.length === 0 ? (
            <Text style={[styles.message, { color: theme.colors.textTertiary }]}>結果が確定した応募がまだありません</Text>
          ) : (
            stores.map((shop, index) => (
              <View
                key={shop.storeName}
                style={[
                  styles.rankRow,
                  index < stores.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.borderLighter },
                ]}
              >
                <Text style={[styles.rankNumber, { color: index < 3 ? theme.colors.green : theme.colors.textSecondary }]}>
                  {index + 1}
                </Text>
                <Text style={[styles.rankName, { color: theme.colors.textPrimary }]}>{shop.storeName}</Text>
                <Text style={[styles.rankValue, { color: theme.colors.textPrimary }]}>{(shop.winRate * 100).toFixed(1)}%</Text>
              </View>
            ))
          )}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  message: {
    fontSize: 13,
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
