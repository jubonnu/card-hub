import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DetailHeader } from '@/components/DetailHeader';
import { ErrorState } from '@/components/ErrorState';
import { CalendarIcon, ClockIcon, ExternalLinkIcon, StarIcon } from '@/components/icons';
import { ProductThumb } from '@/components/ProductThumb';
import { PrimaryButton } from '@/components/PrimaryButton';
import { PublicStatusBadge } from '@/components/PublicStatusBadge';
import { ScreenContainer } from '@/components/ScreenContainer';
import { SecondaryButton } from '@/components/SecondaryButton';
import { ShareLotteryButton } from '@/components/ShareLotteryButton';
import { StatusBadge } from '@/components/StatusBadge';
import { lotteries } from '@/data/mockData';
import { useApiRequest } from '@/hooks/useApiRequest';
import { useNowIso } from '@/hooks/useNowIso';
import { fetchLotteryById, getApiErrorCopy } from '@/lib/apiClient';
import { addEventsToCalendar, ensureCalendarPermission, type CalendarEventInput } from '@/lib/calendar';
import { cancelLotteryReminders, ensureNotificationPermission, scheduleApiLotteryReminders } from '@/lib/notifications';
import { openExternalUrl } from '@/lib/url';
import type { LotteryRecord } from '@/schemas/lotteryApi';
import { getLotteryCalendarEvents, LOTTERY_CALENDAR_EVENT_LABEL } from '@/utils/lotteryCalendarEvents';
import { useMyLotteriesStore } from '@/stores/myLotteriesStore';
import { useNotificationSettingsStore } from '@/stores/notificationSettingsStore';
import { useTheme } from '@/theme/useTheme';
import type { Lottery } from '@/types/models';
import { formatDateTimeShort, formatRemaining, isPast, normalizeDeadline } from '@/utils/time';
import {
  buildLotteryShareText,
  derivePublicTimelineStatus,
  formatDateRangeOrSingle,
  getApplicationUrls,
  getDisplayProductName,
  getDisplayShopName,
  toLotteryShareInput,
  type LotteryShareInput,
} from '@/utils/publicLotteryDisplay';

/**
 * このルートは2種類のIDを扱う:
 * - 数値ID: 実API (GET /lotteries/:id) の抽選（Phase Mobile-Bで接続）
 * - モックID（'l-'から始まる文字列）: 従来通りモックデータ（自分の抽選・ホーム等から遷移）
 * 表示・データ取得ロジックが大きく異なるため、別コンポーネントに分けて双方を独立に保つ。
 */
export default function LotteryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isApiId = /^\d+$/.test(id ?? '');

  if (isApiId) return <ApiLotteryDetailScreen id={Number(id)} />;
  return <MockLotteryDetailScreen id={id ?? ''} />;
}

function ApiLotteryDetailScreen({ id }: { id: number }) {
  const theme = useTheme();
  const nowIso = useNowIso();
  const apiState = useApiRequest((signal) => fetchLotteryById(id, signal), [id]);
  const shareText =
    apiState.status === 'success' ? buildLotteryShareText(toLotteryShareInput(apiState.data.lottery)) : '';

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <DetailHeader
        title="抽選詳細"
        right={<ShareLotteryButton shareText={shareText} disabled={apiState.status !== 'success'} />}
      />

      {apiState.status === 'loading' ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={theme.colors.green} />
        </View>
      ) : apiState.status === 'error' ? (
        <ErrorState onRetry={apiState.retry} {...getApiErrorCopy(apiState.error)} />
      ) : (
        <ApiLotteryDetailBody
          record={apiState.data.lottery}
          nowIso={nowIso}
          refreshing={apiState.refreshing}
          onRefresh={apiState.refresh}
        />
      )}
    </ScreenContainer>
  );
}

function ApiLotteryDetailBody({
  record,
  nowIso,
  refreshing,
  onRefresh,
}: {
  record: LotteryRecord;
  nowIso: string;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { isSaved, saveLottery, removeLottery } = useMyLotteriesStore();
  const notificationSettings = useNotificationSettingsStore();
  const status = derivePublicTimelineStatus(record, nowIso);
  // isPast判定・カウントダウン・カレンダー登録に使う正規化済みの値（日付のみの場合はJST終端に補正）。
  const deadline = normalizeDeadline(record.applicationEndAt, record.applicationEndDate);
  const announce = normalizeDeadline(record.resultAnnouncementAt, record.resultAnnouncementDate);
  const urls = getApplicationUrls(record);
  const url = urls[0] ?? null;
  const hasAnyDate = Boolean(deadline || announce || record.purchaseDeadlineAt);
  const saved = isSaved(record.id);

  /**
   * 「自分の抽選」とiPhoneカレンダーの表示対象を常に一致させるため、カレンダー登録も
   * 保存側から呼び出す（`showResultAlert`は明示的に「カレンダーに追加」を押した時だけtrueにし、
   * 保存のついでに行う暗黙の登録では件数ポップアップを出さない。権限が無い場合の案内は共通で出す）。
   */
  async function registerCalendarEvents(showResultAlert: boolean) {
    const granted = await ensureCalendarPermission();
    if (!granted) {
      Alert.alert('カレンダーへのアクセスが許可されていません', '端末の設定からカレンダーへのアクセスを許可してください');
      return;
    }
    const events: CalendarEventInput[] = getLotteryCalendarEvents(record).map((e) => ({
      title: `【${LOTTERY_CALENDAR_EVENT_LABEL[e.kind]}】${e.productName}`,
      startIso: e.startIso,
      endIso: e.endIso,
      dateOnly: e.dateOnly,
      dateOnlyEnd: e.dateOnlyEnd,
      notes: e.shopName,
    }));

    try {
      const { added, failed, alreadyExists } = await addEventsToCalendar(`api-${record.id}`, events);
      if (!showResultAlert) return;
      const failedNote = failed > 0 ? `（${failed}件は失敗しました。もう一度お試しください）` : '';
      if (alreadyExists) {
        Alert.alert('カレンダーを更新しました', `最新の内容で${added}件の予定を「CardHub」カレンダーに登録し直しました${failedNote}`);
      } else {
        Alert.alert('カレンダーに追加しました', `${added}件の予定を「CardHub」カレンダーに登録しました${failedNote}`);
      }
    } catch {
      if (showResultAlert) Alert.alert('カレンダーへの追加に失敗しました', 'もう一度お試しください');
    }
  }

  async function saveAndScheduleReminders() {
    saveLottery(record);
    const granted = await ensureNotificationPermission();
    if (granted) {
      await scheduleApiLotteryReminders(record, notificationSettings);
    } else {
      Alert.alert('通知が許可されていません', '端末の設定から通知を許可すると、締切や当選発表のリマインドが届くようになります');
    }
  }

  async function handleToggleSaved() {
    if (saved) {
      removeLottery(record.id);
      await cancelLotteryReminders(String(record.id));
      return;
    }
    await saveAndScheduleReminders();
    // ☆での保存だけだとiPhoneカレンダーには登録されず表示がズレるため、ここでも自動登録する
    // （件数ポップアップは出さず、権限が無い場合の案内のみ出す）。
    if (hasAnyDate) await registerCalendarEvents(false);
  }

  async function handleAddToCalendar() {
    // アプリ内カレンダータブは「自分の抽選」を情報源にしているため、カレンダー登録と
    // 表示の対象を一致させるべく、未追加であればここで自動的に自分の抽選にも追加する。
    if (!saved) await saveAndScheduleReminders();
    await registerCalendarEvents(true);
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
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
        <View style={styles.topRow}>
          <View style={styles.topRowLeft}>
            <PublicStatusBadge status={status} />
          </View>
          {status === 'accepting' && deadline ? (
            <View style={styles.countdownRow}>
              <ClockIcon />
              <Text style={[styles.countdownText, { color: theme.colors.danger }]}>
                締切まで{formatRemaining(deadline, nowIso, !record.applicationEndAt && Boolean(record.applicationEndDate))}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.productRow}>
          <ProductThumb size="lg" imageUrl={record.imageUrl} />
          <View style={styles.productText}>
            <Text style={[styles.productName, { color: theme.colors.textPrimary }]}>
              {getDisplayProductName(record)}
            </Text>
            <Text style={[styles.shopName, { color: theme.colors.textSecondary }]}>
              {getDisplayShopName(record)}
              {record.storeBranchRaw ? ` ${record.storeBranchRaw}` : ''}
            </Text>
          </View>
        </View>

        {record.normalizedProductName ? (
          <SecondaryButton
            label="この商品の他の抽選を見る"
            size="md"
            onPress={() => router.push(`/products/${encodeURIComponent(record.normalizedProductName as string)}`)}
          />
        ) : null}

        <View style={[styles.infoList, { borderTopColor: theme.colors.borderLighter }]}>
          <InfoRow
            dotColor={theme.colors.event.deadline.color}
            label="応募締切"
            value={formatDateRangeOrSingle(record.applicationStartAt, record.applicationEndAt, record.applicationEndDate) ?? '未公開'}
          />
          <InfoRow
            dotColor={theme.colors.event.announcement.color}
            label="当選発表"
            value={
              formatDateRangeOrSingle(record.resultAnnouncementStartAt, record.resultAnnouncementAt, record.resultAnnouncementDate) ??
              '未公開'
            }
          />
          <InfoRow
            dotColor={theme.colors.event.purchase.color}
            label="購入期限"
            value={formatDateRangeOrSingle(record.purchaseStartAt, record.purchaseDeadlineAt, null) ?? '未公開'}
          />
          <InfoRow label="応募方法" value={record.applicationMethod ?? '情報なし'} />
        </View>

        {record.eligibilityConditions ? (
          <View style={styles.conditionsSection}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>応募条件</Text>
            <Text style={[styles.conditionText, { color: theme.colors.textLabel }]}>
              {record.eligibilityConditions}
            </Text>
          </View>
        ) : null}

        <View style={styles.urlSection}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>応募ページ</Text>
          {urls.length > 0 ? (
            urls.map((u, index) => (
              <Pressable key={`${u}-${index}`} style={styles.urlRow} onPress={() => openExternalUrl(u)}>
                <Text style={[styles.urlText, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  {u}
                </Text>
                <ExternalLinkIcon />
              </Pressable>
            ))
          ) : (
            <View style={styles.urlRow}>
              <Text style={[styles.urlText, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                応募ページ情報はまだありません
              </Text>
            </View>
          )}
        </View>

      </ScrollView>

      <View
        style={[styles.footer, { borderTopColor: theme.colors.borderLighter, backgroundColor: theme.colors.surface }]}
      >
        {url ? <PrimaryButton label="応募ページへ" onPress={() => openExternalUrl(url)} /> : null}
        <SecondaryButton
          label={saved ? '自分の抽選に追加済み' : '自分の抽選に追加'}
          icon={<StarIcon size={17} color={theme.colors.green} filled={saved} />}
          onPress={handleToggleSaved}
        />
        {hasAnyDate ? (
          <SecondaryButton
            label="カレンダーに追加"
            icon={<CalendarIcon size={17} color={theme.colors.green} strokeWidth={2} />}
            onPress={handleAddToCalendar}
          />
        ) : null}
      </View>
    </>
  );
}

function MockLotteryDetailScreen({ id }: { id: string }) {
  const theme = useTheme();
  const nowIso = useNowIso();
  const lottery = lotteries.find((l) => l.id === id);

  if (!lottery) {
    return (
      <ScreenContainer padded>
        <DetailHeader title="抽選詳細" />
        <View style={styles.notFound}>
          <Text style={{ color: theme.colors.textSecondary }}>抽選情報が見つかりませんでした</Text>
        </View>
      </ScreenContainer>
    );
  }

  const deadlinePast = isPast(lottery.applicationDeadline, nowIso);
  const shareText = buildLotteryShareText(toLotteryShareInputFromMock(lottery));

  async function handleAddToCalendar() {
    const granted = await ensureCalendarPermission();
    if (!granted) {
      Alert.alert('カレンダーへのアクセスが許可されていません', '端末の設定からカレンダーへのアクセスを許可してください');
      return;
    }
    try {
      const target = lottery as Lottery;
      // モックデータは開始時刻を持たないため、実APIのデータで「終了だけ分かる」場合と同じ扱いにする
      // （その日の0:00〜実際の時刻）。
      const dayStartOf = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00.000+09:00`).toISOString();
      const { added, failed, alreadyExists } = await addEventsToCalendar(`mock-${target.id}`, [
        {
          title: `【応募締切】${target.productName}`,
          startIso: dayStartOf(target.applicationDeadline),
          endIso: target.applicationDeadline,
          notes: target.shopName,
        },
        {
          title: `【当選発表】${target.productName}`,
          startIso: dayStartOf(target.announcementDate),
          endIso: target.announcementDate,
          notes: target.shopName,
        },
        {
          title: `【購入期限】${target.productName}`,
          startIso: dayStartOf(target.purchaseDeadline),
          endIso: target.purchaseDeadline,
          notes: target.shopName,
        },
      ]);
      const failedNote = failed > 0 ? `（${failed}件は失敗しました。もう一度お試しください）` : '';
      if (alreadyExists) {
        Alert.alert('カレンダーを更新しました', `最新の内容で${added}件の予定を「CardHub」カレンダーに登録し直しました${failedNote}`);
      } else {
        Alert.alert('カレンダーに追加しました', `${added}件の予定を「CardHub」カレンダーに登録しました${failedNote}`);
      }
    } catch {
      Alert.alert('カレンダーへの追加に失敗しました', 'もう一度お試しください');
    }
  }

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <DetailHeader title="抽選詳細" right={<ShareLotteryButton shareText={shareText} />} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <StatusBadge status={lottery.status} size="md" />
          {!deadlinePast ? (
            <View style={styles.countdownRow}>
              <ClockIcon />
              <Text style={[styles.countdownText, { color: theme.colors.danger }]}>
                締切まで{formatRemaining(lottery.applicationDeadline, nowIso)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.productRow}>
          <ProductThumb size="lg" />
          <View style={styles.productText}>
            <Text style={[styles.productName, { color: theme.colors.textPrimary }]}>{lottery.productName}</Text>
            <Text style={[styles.shopName, { color: theme.colors.textSecondary }]}>{lottery.shopName}</Text>
          </View>
        </View>

        <View style={[styles.infoList, { borderTopColor: theme.colors.borderLighter }]}>
          <InfoRow dotColor={theme.colors.event.deadline.color} label="応募締切" value={formatDateTimeShort(lottery.applicationDeadline)} />
          <InfoRow dotColor={theme.colors.event.announcement.color} label="当選発表" value={formatDateTimeShort(lottery.announcementDate)} />
          <InfoRow dotColor={theme.colors.event.purchase.color} label="購入期限" value={formatDateTimeShort(lottery.purchaseDeadline)} />
          <InfoRow label="応募方法" value={lottery.method} />
        </View>

        <View style={styles.conditionsSection}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>応募条件</Text>
          {lottery.conditions.map((condition) => (
            <View key={condition} style={styles.conditionRow}>
              <View style={[styles.conditionDot, { backgroundColor: theme.colors.green }]} />
              <Text style={[styles.conditionText, { color: theme.colors.textLabel }]}>{condition}</Text>
            </View>
          ))}
        </View>

        <View style={styles.urlSection}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>応募ページ</Text>
          <View style={styles.urlRow}>
            <Text style={[styles.urlText, { color: theme.colors.textPrimary }]} numberOfLines={1}>
              {lottery.applyUrl}
            </Text>
            <ExternalLinkIcon />
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { borderTopColor: theme.colors.borderLighter, backgroundColor: theme.colors.surface },
        ]}
      >
        <PrimaryButton label="応募ページへ" onPress={() => openExternalUrl(lottery.applyUrl)} />
        <SecondaryButton
          label="カレンダーに追加"
          icon={<CalendarIcon size={17} color={theme.colors.green} strokeWidth={2} />}
          onPress={handleAddToCalendar}
        />
      </View>
    </ScreenContainer>
  );
}

/**
 * モックデータ（`Lottery`型、`data/mockData.ts`）を共有用ViewModelへ変換する。
 * モックの日時フィールドは常に時刻付きの文字列で欠損も無いため、日付のみ（dateOnly）は
 * 使わない。支店の概念も無いためstoreBranchは常にnull。
 */
function toLotteryShareInputFromMock(lottery: Lottery): LotteryShareInput {
  return {
    title: lottery.productName?.trim() || '商品名未確認',
    shopName: lottery.shopName?.trim() || null,
    storeBranch: null,
    applicationEnd: { at: lottery.applicationDeadline || null, dateOnly: null },
    resultAnnouncement: { at: lottery.announcementDate || null, dateOnly: null },
    purchaseDeadlineAt: lottery.purchaseDeadline?.trim() || null,
    applicationMethod: lottery.method?.trim() || null,
    applicationUrl: lottery.applyUrl?.trim() || null,
  };
}

function InfoRow({ label, value, dotColor }: { label: string; value: string; dotColor?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.infoRow, { borderBottomColor: theme.colors.borderLighter }]}>
      <View style={styles.infoLabelRow}>
        {dotColor ? <View style={[styles.infoDot, { backgroundColor: dotColor }]} /> : null}
        <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, { color: theme.colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 24,
    gap: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  countdownText: {
    fontSize: 12,
    fontWeight: '700',
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  productText: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  productName: {
    fontSize: 20,
    fontWeight: '900',
  },
  shopName: {
    fontSize: 13,
  },
  infoList: {
    borderTopWidth: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  infoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  infoLabel: {
    fontSize: 13,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  conditionsSection: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  conditionRow: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
  },
  conditionDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    marginTop: 7,
  },
  conditionText: {
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  urlSection: {
    gap: 6,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  urlText: {
    fontSize: 12,
    flexShrink: 1,
  },
  footer: {
    padding: 20,
    paddingTop: 14,
    gap: 10,
    borderTopWidth: 1,
  },
});
