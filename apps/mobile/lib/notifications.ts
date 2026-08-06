import * as Notifications from 'expo-notifications';

import { adjustTriggerForQuietHours } from '@/lib/quietHours';
import type { LotteryRecord } from '@/schemas/lotteryApi';
import type { Lottery, NotificationToggleSettings } from '@/types/models';
import { getDisplayProductName, getDisplayShopName } from '@/utils/publicLotteryDisplay';
import { normalizeDeadline } from '@/utils/time';

/**
 * ローカル通知のみを扱う（Expo Go対応範囲）。リモートPush送信は対象外
 * （Development Build移行が必要なため、Mobile-Dのスコープ外）。
 * 「自分の抽選」（モックデータの個人追跡）に紐づくリマインダーのみを対象とする。
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * 通知タップ時のレスポンスから、遷移先の抽選ID（`/lotteries/[id]`にそのまま渡せる文字列）を
 * 取り出す。スケジュール時に`content.data.lotteryId`を必ず設定しているため、
 * 通知データが無い・想定外の形式の場合はnullを返す（不正なIDへの遷移は行わない）。
 */
export function extractLotteryIdFromNotification(response: Notifications.NotificationResponse): string | null {
  const data = response.notification.request.content.data;
  const lotteryId = data?.lotteryId;
  return typeof lotteryId === 'string' && lotteryId.length > 0 ? lotteryId : null;
}

type ReminderKind = 'deadline' | 'announcement' | 'purchase';

function identifierFor(lotteryId: string, kind: ReminderKind): string {
  return `cardhub-${lotteryId}-${kind}`;
}

export async function cancelLotteryReminders(lotteryId: string): Promise<void> {
  const kinds: ReminderKind[] = ['deadline', 'announcement', 'purchase'];
  await Promise.all(
    kinds.map((kind) => Notifications.cancelScheduledNotificationAsync(identifierFor(lotteryId, kind)).catch(() => undefined))
  );
}

interface ReminderJob {
  kind: ReminderKind;
  enabled: boolean;
  targetIso: string;
  hoursBefore: number;
  title: string;
  body: string;
}

/** 現在の通知設定に基づき、1件の抽選のリマインダーを再スケジュールする（既存分は一旦キャンセルしてから登録し直す）。 */
export async function scheduleLotteryReminders(
  lottery: Lottery,
  settings: NotificationToggleSettings
): Promise<void> {
  await cancelLotteryReminders(lottery.id);

  const now = Date.now();
  const jobs: ReminderJob[] = [
    {
      kind: 'deadline',
      enabled: settings.deadlineReminder,
      targetIso: lottery.applicationDeadline,
      hoursBefore: settings.deadlineReminderHoursBefore,
      title: '応募締切が近づいています',
      body: `${lottery.productName}（${lottery.shopName}）の応募締切が近づいています`,
    },
    {
      kind: 'announcement',
      enabled: settings.announcementReminder,
      targetIso: lottery.announcementDate,
      hoursBefore: settings.announcementReminderHoursBefore,
      title: '当選発表が近づいています',
      body: `${lottery.productName}（${lottery.shopName}）の当選発表が近づいています`,
    },
    {
      kind: 'purchase',
      enabled: settings.purchaseReminder,
      targetIso: lottery.purchaseDeadline,
      hoursBefore: settings.purchaseReminderHoursBefore,
      title: '購入期限が近づいています',
      body: `${lottery.productName}（${lottery.shopName}）の購入期限が近づいています`,
    },
  ];

  for (const job of jobs) {
    if (!job.enabled) continue;
    const triggerTime = new Date(job.targetIso).getTime() - job.hoursBefore * 60 * 60 * 1000;
    if (triggerTime <= now) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: identifierFor(lottery.id, job.kind),
      content: { title: job.title, body: job.body, data: { lotteryId: lottery.id } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(triggerTime) },
    });
  }
}

/** 保存済みの「自分の抽選」全件について、現在の通知設定でリマインダーを再スケジュールする。 */
export async function rescheduleAllReminders(
  lotteries: Lottery[],
  savedIds: string[],
  settings: NotificationToggleSettings
): Promise<void> {
  const saved = lotteries.filter((l) => savedIds.includes(l.id));
  for (const lottery of saved) {
    await scheduleLotteryReminders(lottery, settings);
  }
}

interface ApiReminderJob {
  kind: ReminderKind;
  targetIso: string;
  hoursBefore: number;
  title: string;
  body: string;
}

/**
 * 実API（GET /lotteries）の抽選レコード向けのリマインダー登録。
 * 締切・発表・購入期限のいずれも欠損（null）である可能性があるため、
 * 値が存在する項目のみ対象にする（欠損項目はスキップし、エラーにはしない）。
 */
export async function scheduleApiLotteryReminders(
  record: LotteryRecord,
  settings: NotificationToggleSettings
): Promise<void> {
  const lotteryId = String(record.id);
  await cancelLotteryReminders(lotteryId);
  // 通知のマスターOFF: 既存分のキャンセルのみ行い、新規スケジュールは作らない。
  if (!settings.pushEnabled) return;

  const productName = getDisplayProductName(record);
  const shopName = getDisplayShopName(record);
  const deadline = normalizeDeadline(record.applicationEndAt, record.applicationEndDate);
  const announce = normalizeDeadline(record.resultAnnouncementAt, record.resultAnnouncementDate);
  const purchase = record.purchaseDeadlineAt;

  const jobs: ApiReminderJob[] = [];
  if (deadline && settings.deadlineReminder) {
    jobs.push({
      kind: 'deadline',
      targetIso: deadline,
      hoursBefore: settings.deadlineReminderHoursBefore,
      title: '応募締切が近づいています',
      body: `${productName}（${shopName}）の応募締切が近づいています`,
    });
  }
  if (announce && settings.announcementReminder) {
    jobs.push({
      kind: 'announcement',
      targetIso: announce,
      hoursBefore: settings.announcementReminderHoursBefore,
      title: '当選発表が近づいています',
      body: `${productName}（${shopName}）の当選発表が近づいています`,
    });
  }
  if (purchase && settings.purchaseReminder) {
    jobs.push({
      kind: 'purchase',
      targetIso: purchase,
      hoursBefore: settings.purchaseReminderHoursBefore,
      title: '購入期限が近づいています',
      body: `${productName}（${shopName}）の購入期限が近づいています`,
    });
  }

  const now = Date.now();
  const quietHours = {
    enabled: settings.quietHoursEnabled,
    start: settings.quietHoursStart,
    end: settings.quietHoursEnd,
  };
  for (const job of jobs) {
    const deadlineMs = new Date(job.targetIso).getTime();
    const baseTrigger = deadlineMs - job.hoursBefore * 60 * 60 * 1000;
    const adjusted = adjustTriggerForQuietHours(baseTrigger, deadlineMs, now, quietHours);
    if (adjusted.skip) {
      console.warn(`[notifications] おやすみモードのため通知をスキップしました: lottery=${lotteryId} kind=${job.kind} reason=${adjusted.reason}`);
      continue;
    }
    if (adjusted.triggerMs <= now) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: identifierFor(lotteryId, job.kind),
      content: { title: job.title, body: job.body, data: { lotteryId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(adjusted.triggerMs) },
    });
  }
}

/**
 * 保存済みの実API抽選（LotteryRecord）全件について、現在の通知設定でリマインダーを再スケジュールする。
 *
 * 現状これが呼ばれるのは`app/notification-settings/[lotteryId].tsx`のuseEffect
 * （通知設定画面を開いている間、関連する設定/保存済み抽選が変わった時）のみ。
 * アプリ起動時やbootstrap後（他端末で設定が変わっていた場合など）には自動で
 * 呼ばれないため、通知設定画面を一度も開かないと、古い設定のまま予約された
 * ローカル通知が残り続ける可能性がある（将来課題: アプリ起動時・bootstrap完了後に
 * 一度だけ全件再評価する仕組みを追加する）。
 */
export async function rescheduleAllApiReminders(
  records: LotteryRecord[],
  settings: NotificationToggleSettings
): Promise<void> {
  for (const record of records) {
    await scheduleApiLotteryReminders(record, settings);
  }
}
