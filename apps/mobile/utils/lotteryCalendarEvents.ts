import type { LotteryRecord } from '@/schemas/lotteryApi';
import { getDisplayProductName, getDisplayShopName } from '@/utils/publicLotteryDisplay';
import { isBareDateOnly, JST_OFFSET_HOURS } from '@/utils/time';

export type LotteryCalendarEventKind = 'deadline' | 'announcement' | 'purchase';

export const LOTTERY_CALENDAR_EVENT_LABEL: Record<LotteryCalendarEventKind, string> = {
  deadline: '応募締切',
  announcement: '当選発表',
  purchase: '購入期限',
};

export interface LotteryCalendarEvent {
  lotteryId: number;
  kind: LotteryCalendarEventKind;
  productName: string;
  shopName: string;
  /** 時刻まで分かっている場合。1時間の予定として扱う。`dateOnly`と排他。 */
  dateIso?: string;
  /** 日付のみしか分からない場合（"YYYY-MM-DD"、JST）。終日として扱う。 */
  dateOnly?: string;
}

function resolveDate(
  atValue: string | null | undefined,
  dateValue: string | null | undefined
): Pick<LotteryCalendarEvent, 'dateIso' | 'dateOnly'> | null {
  // purchaseDeadlineAt等、専用の「日付のみ」カラムを持たない項目は、atValue自体が
  // 時刻無しの日付文字列になっていることがある（isBareDateOnly参照）。
  if (atValue && isBareDateOnly(atValue)) return { dateOnly: atValue };
  if (atValue) return { dateIso: atValue };
  if (dateValue) return { dateOnly: dateValue };
  return null;
}

/**
 * 「自分の抽選」に保存済みの抽選から、カレンダー表示・登録に使う予定（応募締切・当選発表・
 * 購入期限）を算出する。OSカレンダー連携（`lib/calendar.ts`）とアプリ内カレンダー
 * （`app/(tabs)/calendar.tsx`）の両方から共通で使う。
 */
export function getLotteryCalendarEvents(record: LotteryRecord): LotteryCalendarEvent[] {
  const productName = getDisplayProductName(record);
  const shopName = getDisplayShopName(record);
  const events: LotteryCalendarEvent[] = [];

  const deadline = resolveDate(record.applicationEndAt, record.applicationEndDate);
  if (deadline) events.push({ lotteryId: record.id, kind: 'deadline', productName, shopName, ...deadline });

  const announcement = resolveDate(record.resultAnnouncementAt, record.resultAnnouncementDate);
  if (announcement) events.push({ lotteryId: record.id, kind: 'announcement', productName, shopName, ...announcement });

  const purchase = resolveDate(record.purchaseDeadlineAt, null);
  if (purchase) events.push({ lotteryId: record.id, kind: 'purchase', productName, shopName, ...purchase });

  return events;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** イベントが該当する「その日」のJST日付キー（"YYYY-MM-DD"）を返す。カレンダーグリッドのdotの割り振りに使う。 */
export function calendarEventDateKey(event: LotteryCalendarEvent): string {
  if (event.dateOnly) return event.dateOnly;
  const jstMs = new Date(event.dateIso!).getTime() + JST_OFFSET_HOURS * 60 * 60 * 1000;
  const jst = new Date(jstMs);
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
}

/** イベントの時刻あり値をJSTの「時・分」に変換する（タイムライン配置に使う）。dateOnlyの場合はnull。 */
export function calendarEventJstHourMinute(event: LotteryCalendarEvent): { hour: number; minute: number } | null {
  if (!event.dateIso) return null;
  const jstMs = new Date(event.dateIso).getTime() + JST_OFFSET_HOURS * 60 * 60 * 1000;
  const jst = new Date(jstMs);
  return { hour: jst.getUTCHours(), minute: jst.getUTCMinutes() };
}
