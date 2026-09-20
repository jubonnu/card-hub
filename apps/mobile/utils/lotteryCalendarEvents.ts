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
  /** 開始・終了とも時刻まで分かる場合の実際の期間。`dateOnly`とは排他。 */
  startIso?: string;
  endIso?: string;
  /**
   * 時刻が全く分からない場合、終日として扱う開始日（"YYYY-MM-DD"、JST）。
   * `dateOnlyEnd`が無ければ単日、あれば`dateOnly`〜`dateOnlyEnd`（両端含む）の複数日。
   */
  dateOnly?: string;
  dateOnlyEnd?: string;
}

interface Boundary {
  iso?: string;
  dateOnly?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * `_at`（時刻付き）と、専用の「日付のみ」カラムの2フィールドから、または`_at`自体が
 * 裸の日付文字列（"YYYY-MM-DD"、`purchaseDeadlineAt`等、専用カラムを持たない項目）である
 * 場合から、統一的に境界値（開始または終了の片方）を求める。
 */
function resolveBoundary(atValue: string | null | undefined, dateOnlyValue: string | null | undefined): Boundary | null {
  if (atValue && isBareDateOnly(atValue)) return { dateOnly: atValue };
  if (atValue) return { iso: atValue };
  if (dateOnlyValue) return { dateOnly: dateOnlyValue };
  return null;
}

/** JST日付("YYYY-MM-DD")の0:00をUTC ISO文字列で返す。 */
function jstMidnightIso(dateOnly: string): string {
  const utcMidnightMs = new Date(`${dateOnly}T00:00:00.000Z`).getTime();
  return new Date(utcMidnightMs - JST_OFFSET_HOURS * 60 * 60 * 1000).toISOString();
}

/** JST日付("YYYY-MM-DD")の23:59をUTC ISO文字列で返す。 */
function jstEndOfDayIso(dateOnly: string): string {
  return new Date(`${dateOnly}T14:59:00.000Z`).toISOString();
}

/** ISO文字列（UTC）から、それが属するJST日付("YYYY-MM-DD")を求める。 */
function jstDateOnlyOfIso(iso: string): string {
  const jst = new Date(new Date(iso).getTime() + JST_OFFSET_HOURS * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
}

/**
 * 開始・終了の2つの境界値から、実際にカレンダーへ反映する範囲を決める。
 *
 * - 両方とも時刻まで分かる（または片方だけ日付のみ）→ 実際の期間そのまま
 * - 両方とも日付のみ（時刻情報が全く無い）→ 開始日〜終了日の終日イベント
 * - 終了だけ分かる → その日の0:00〜終了時刻（時刻不明ならその日1日の終日）
 * - 開始だけ分かる → 開始時刻〜その日23:59（時刻不明ならその日1日の終日）
 */
function combineRange(
  start: Boundary | null,
  end: Boundary | null
): Pick<LotteryCalendarEvent, 'startIso' | 'endIso' | 'dateOnly' | 'dateOnlyEnd'> | null {
  if (!start && !end) return null;

  if (start && end) {
    if (!start.iso && !end.iso) return { dateOnly: start.dateOnly!, dateOnlyEnd: end.dateOnly! };
    return {
      startIso: start.iso ?? jstMidnightIso(start.dateOnly!),
      endIso: end.iso ?? jstEndOfDayIso(end.dateOnly!),
    };
  }

  if (end && !start) {
    if (!end.iso) return { dateOnly: end.dateOnly! };
    return { startIso: jstMidnightIso(jstDateOnlyOfIso(end.iso)), endIso: end.iso };
  }

  // start && !end
  if (!start!.iso) return { dateOnly: start!.dateOnly! };
  return { startIso: start!.iso, endIso: jstEndOfDayIso(jstDateOnlyOfIso(start!.iso)) };
}

/**
 * 「自分の抽選」に保存済みの抽選から、カレンダー表示・登録に使う予定（応募締切・当選発表・
 * 購入期限）を算出する。OSカレンダー連携（`lib/calendar.ts`）とアプリ内カレンダー
 * （`app/day-schedule/[date].tsx`）の両方から共通で使う。
 */
export function getLotteryCalendarEvents(record: LotteryRecord): LotteryCalendarEvent[] {
  const productName = getDisplayProductName(record);
  const shopName = getDisplayShopName(record);
  const events: LotteryCalendarEvent[] = [];

  const deadline = combineRange(
    resolveBoundary(record.applicationStartAt, null),
    resolveBoundary(record.applicationEndAt, record.applicationEndDate)
  );
  if (deadline) events.push({ lotteryId: record.id, kind: 'deadline', productName, shopName, ...deadline });

  const announcement = combineRange(
    resolveBoundary(record.resultAnnouncementStartAt, null),
    resolveBoundary(record.resultAnnouncementAt, record.resultAnnouncementDate)
  );
  if (announcement) events.push({ lotteryId: record.id, kind: 'announcement', productName, shopName, ...announcement });

  const purchase = combineRange(resolveBoundary(record.purchaseStartAt, null), resolveBoundary(record.purchaseDeadlineAt, null));
  if (purchase) events.push({ lotteryId: record.id, kind: 'purchase', productName, shopName, ...purchase });

  return events;
}

/** イベントが該当する「開始日」のJST日付キー（"YYYY-MM-DD"）を返す。カレンダーグリッドのdotの割り振りに使う。 */
export function calendarEventDateKey(event: LotteryCalendarEvent): string {
  if (event.dateOnly) return event.dateOnly;
  return jstDateOnlyOfIso(event.startIso ?? event.endIso!);
}

/**
 * 指定した日（"YYYY-MM-DD"、JST）の24時間タイムライン上での開始・終了位置（時間、小数可）を返す。
 * 複数日にまたがる予定は、指定日の範囲外の部分は[0, 24]にクリップする。
 * 終日（`dateOnly`）の場合はnull（タイムラインには置かず別枠で表示する）。
 */
export function calendarEventTimelineRange(event: LotteryCalendarEvent, dateKey: string): { startHour: number; endHour: number } | null {
  if (event.dateOnly || !event.startIso || !event.endIso) return null;

  const dayStartMs = new Date(jstMidnightIso(dateKey)).getTime();
  const startHour = Math.max(0, (new Date(event.startIso).getTime() - dayStartMs) / (60 * 60 * 1000));
  const endHour = Math.min(24, (new Date(event.endIso).getTime() - dayStartMs) / (60 * 60 * 1000));
  if (endHour <= 0 || startHour >= 24) return null;

  return { startHour, endHour };
}
