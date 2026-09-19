import * as Calendar from 'expo-calendar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addEventsToCalendar } from './calendar';
import { useCalendarEventStore } from '@/stores/calendarEventStore';

describe('addEventsToCalendar', () => {
  beforeEach(() => {
    vi.mocked(Calendar.createEventAsync).mockClear();
    useCalendarEventStore.setState({ registeredKeys: [] });
  });

  it('dateIso（時刻あり）は1時間の予定として登録する', async () => {
    await addEventsToCalendar('lottery-1', [{ title: '【応募締切】テスト', dateIso: '2026-07-26T03:00:00.000Z', notes: 'ショップ' }]);

    expect(Calendar.createEventAsync).toHaveBeenCalledTimes(1);
    const params = vi.mocked(Calendar.createEventAsync).mock.calls[0]![1]!;
    expect(params.allDay).toBeUndefined();
    expect((params.startDate as Date).toISOString()).toBe('2026-07-26T03:00:00.000Z');
    expect((params.endDate as Date).toISOString()).toBe('2026-07-26T04:00:00.000Z');
  });

  it('dateOnly（日付のみ）は誤った時刻の精度を出さず、その日いっぱいの終日イベントとして登録する', async () => {
    await addEventsToCalendar('lottery-2', [{ title: '【応募締切】テスト', dateOnly: '2026-07-26', notes: 'ショップ' }]);

    expect(Calendar.createEventAsync).toHaveBeenCalledTimes(1);
    const params = vi.mocked(Calendar.createEventAsync).mock.calls[0]![1]!;
    expect(params.allDay).toBe(true);
    // JST 2026-07-26 00:00 = UTC 2026-07-25 15:00
    expect((params.startDate as Date).toISOString()).toBe('2026-07-25T15:00:00.000Z');
    // JST 2026-07-27 00:00（翌日0時、24時間後） = UTC 2026-07-26 15:00
    expect((params.endDate as Date).toISOString()).toBe('2026-07-26T15:00:00.000Z');
  });

  it('同じlotteryKeyへの再追加は重複登録しない', async () => {
    await addEventsToCalendar('lottery-3', [{ title: '【応募締切】テスト', dateOnly: '2026-07-26', notes: undefined }]);
    vi.mocked(Calendar.createEventAsync).mockClear();

    const result = await addEventsToCalendar('lottery-3', [{ title: '【応募締切】テスト', dateOnly: '2026-07-26', notes: undefined }]);

    expect(result).toEqual({ added: 0, alreadyExists: true });
    expect(Calendar.createEventAsync).not.toHaveBeenCalled();
  });
});
