import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

import { useCalendarEventStore } from '@/stores/calendarEventStore';

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
  dateIso: string;
  notes?: string;
}

/**
 * 指定した日時のイベントをCardHub専用カレンダーへ追加する。
 * 権限が無い場合は何もせず false を返す（呼び出し側でUI表示する）。
 * `lotteryKey` 単位で登録済みかを記録し、同じ抽選への再追加では重複登録しない。
 */
export async function addEventsToCalendar(
  lotteryKey: string,
  events: CalendarEventInput[]
): Promise<{ added: number; alreadyExists: boolean }> {
  if (useCalendarEventStore.getState().isRegistered(lotteryKey)) {
    return { added: 0, alreadyExists: true };
  }

  const calendarId = await getOrCreateCardHubCalendarId();
  let added = 0;

  for (const event of events) {
    const startDate = new Date(event.dateIso);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    await Calendar.createEventAsync(calendarId, {
      title: event.title,
      startDate,
      endDate,
      notes: event.notes,
      alarms: [{ relativeOffset: -60 }],
    });
    added += 1;
  }

  if (added > 0) useCalendarEventStore.getState().markRegistered(lotteryKey);

  return { added, alreadyExists: false };
}
