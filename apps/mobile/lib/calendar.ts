import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

import { useCalendarEventStore } from '@/stores/calendarEventStore';
import { JST_OFFSET_HOURS } from '@/utils/time';

const CARDHUB_CALENDAR_NAME = 'CardHub';

/**
 * Expo Go上でも動作する範囲（Development Build不要）:
 * カレンダー権限の確認・専用カレンダーの取得または作成・イベント追加のみ。
 */
export async function ensureCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

async function getDefaultCalendarSource(): Promise<Calendar.Source | undefined> {
  const defaultCalendar = await Calendar.getDefaultCalendarAsync();
  return defaultCalendar.source;
}

/** 「CardHub」という名前の専用カレンダーを探し、無ければ作成してIDを返す。 */
export async function getOrCreateCardHubCalendarId(): Promise<string> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find((c) => c.title === CARDHUB_CALENDAR_NAME);
  if (existing) return existing.id;

  if (Platform.OS === 'ios') {
    const source = await getDefaultCalendarSource();
    return Calendar.createCalendarAsync({
      title: CARDHUB_CALENDAR_NAME,
      color: '#0A8F4D',
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: source?.id,
      source,
      name: CARDHUB_CALENDAR_NAME,
      ownerAccount: 'personal',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  }

  return Calendar.createCalendarAsync({
    title: CARDHUB_CALENDAR_NAME,
    color: '#0A8F4D',
    entityType: Calendar.EntityTypes.EVENT,
    source: { isLocalAccount: true, name: CARDHUB_CALENDAR_NAME, type: 'LOCAL' },
    name: CARDHUB_CALENDAR_NAME,
    ownerAccount: 'personal',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

export interface CalendarEventInput {
  title: string;
  notes?: string;
  /** 時刻まで分かっている場合。1時間の予定として登録する。`dateOnly`と排他。 */
  dateIso?: string;
  /**
   * 日付のみしか分からない場合（"YYYY-MM-DD"、JSTの日付）。何時か分からないのに
   * 特定の時刻の予定にすると誤った精度を与えてしまうため、その日いっぱいの終日イベントとして登録する。
   */
  dateOnly?: string;
}

/**
 * 指定した日時のイベントをCardHub専用カレンダーへ追加する。
 * 権限が無い場合は何もせず false を返す（呼び出し側でUI表示する）。
 * `lotteryKey`単位で以前作成した予定のIDを記録しており、再追加時はそれらを
 * 先に削除してから作り直す（内容修正後の再登録で重複・古い内容の予定が残らないようにするため）。
 */
export async function addEventsToCalendar(
  lotteryKey: string,
  events: CalendarEventInput[]
): Promise<{ added: number; alreadyExists: boolean }> {
  const previousEventIds = useCalendarEventStore.getState().getRegisteredEventIds(lotteryKey);
  const alreadyExists = previousEventIds.length > 0;
  for (const eventId of previousEventIds) {
    try {
      await Calendar.deleteEventAsync(eventId);
    } catch {
      // 既にユーザーが手動で削除している等のケースは無視して続行する。
    }
  }

  const calendarId = await getOrCreateCardHubCalendarId();
  const newEventIds: string[] = [];

  for (const event of events) {
    if (event.dateOnly) {
      const jstMidnightUtcMs = new Date(`${event.dateOnly}T00:00:00.000Z`).getTime() - JST_OFFSET_HOURS * 60 * 60 * 1000;
      const eventId = await Calendar.createEventAsync(calendarId, {
        title: event.title,
        startDate: new Date(jstMidnightUtcMs),
        endDate: new Date(jstMidnightUtcMs + 24 * 60 * 60 * 1000),
        allDay: true,
        notes: event.notes,
      });
      newEventIds.push(eventId);
      continue;
    }
    if (event.dateIso) {
      // 応募締切・当選発表・購入期限はいずれも「終わりの瞬間」を表す値であり、開始時刻では
      // ない。そのままstartDateとして1時間後をendDateにすると、実際の締切を過ぎてからも
      // 予定が続いているように見えてしまう（例: 締切23:59なら23:59〜翌0:59と表示される）。
      // そのため1時間の枠はこの時刻を「終了」として、その1時間前を開始にする。
      const endDate = new Date(event.dateIso);
      const startDate = new Date(endDate.getTime() - 60 * 60 * 1000);
      const eventId = await Calendar.createEventAsync(calendarId, {
        title: event.title,
        startDate,
        endDate,
        notes: event.notes,
        // 予定の開始時刻（＝締切等の1時間前）にリマインダーを鳴らす。以前の
        // 「開始の60分前」（＝締切の2時間前）から実質的な通知タイミングを変えないため、
        // オフセットは0にする。
        alarms: [{ relativeOffset: 0 }],
      });
      newEventIds.push(eventId);
    }
  }

  useCalendarEventStore.getState().setRegisteredEventIds(lotteryKey, newEventIds);

  return { added: newEventIds.length, alreadyExists };
}
