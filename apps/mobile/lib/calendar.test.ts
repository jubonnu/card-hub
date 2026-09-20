import * as Calendar from 'expo-calendar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addEventsToCalendar } from './calendar';
import { useCalendarEventStore } from '@/stores/calendarEventStore';

describe('addEventsToCalendar', () => {
  beforeEach(() => {
    vi.mocked(Calendar.createEventAsync).mockClear();
    vi.mocked(Calendar.deleteEventAsync).mockClear();
    useCalendarEventStore.setState({ eventIdsByKey: {} });
  });

  it('startIso/endIsoがあれば、その実際の期間で予定を登録する', async () => {
    await addEventsToCalendar('lottery-1', [
      { title: '【応募締切】テスト', startIso: '2026-07-26T02:00:00.000Z', endIso: '2026-07-26T03:00:00.000Z', notes: 'ショップ' },
    ]);

    expect(Calendar.createEventAsync).toHaveBeenCalledTimes(1);
    const params = vi.mocked(Calendar.createEventAsync).mock.calls[0]![1]!;
    expect(params.allDay).toBeUndefined();
    expect((params.startDate as Date).toISOString()).toBe('2026-07-26T02:00:00.000Z');
    expect((params.endDate as Date).toISOString()).toBe('2026-07-26T03:00:00.000Z');
  });

  it('リマインダーは実際の締切（endIso）の60分前に鳴るよう、期間の長さから逆算した相対値にする', async () => {
    // 期間が3時間（180分）の場合、開始から120分後（＝終了の60分前）に鳴らす。
    await addEventsToCalendar('lottery-1b', [
      { title: '【応募締切】テスト', startIso: '2026-07-26T00:00:00.000Z', endIso: '2026-07-26T03:00:00.000Z', notes: undefined },
    ]);

    const params = vi.mocked(Calendar.createEventAsync).mock.calls[0]![1]!;
    expect(params.alarms).toEqual([{ relativeOffset: 120 }]);
  });

  it('期間が60分以下の場合、リマインダーは開始時刻ちょうどに鳴らす（負値にはしない）', async () => {
    await addEventsToCalendar('lottery-1c', [
      { title: '【応募締切】テスト', startIso: '2026-07-26T02:00:00.000Z', endIso: '2026-07-26T02:30:00.000Z', notes: undefined },
    ]);

    const params = vi.mocked(Calendar.createEventAsync).mock.calls[0]![1]!;
    expect(params.alarms).toEqual([{ relativeOffset: 0 }]);
  });

  it('dateOnly（日付のみ、単日）は誤った時刻の精度を出さず、その日いっぱいの終日イベントとして登録する', async () => {
    await addEventsToCalendar('lottery-2', [{ title: '【応募締切】テスト', dateOnly: '2026-07-26', notes: 'ショップ' }]);

    expect(Calendar.createEventAsync).toHaveBeenCalledTimes(1);
    const params = vi.mocked(Calendar.createEventAsync).mock.calls[0]![1]!;
    expect(params.allDay).toBe(true);
    // JST 2026-07-26 00:00 = UTC 2026-07-25 15:00
    expect((params.startDate as Date).toISOString()).toBe('2026-07-25T15:00:00.000Z');
    // JST 2026-07-27 00:00（翌日0時、24時間後） = UTC 2026-07-26 15:00
    expect((params.endDate as Date).toISOString()).toBe('2026-07-26T15:00:00.000Z');
  });

  it('dateOnly〜dateOnlyEnd（日付のみ、複数日）は、開始日から終了日の翌日0時までの終日イベントとして登録する', async () => {
    await addEventsToCalendar('lottery-2b', [
      { title: '【購入期限】テスト', dateOnly: '2026-07-26', dateOnlyEnd: '2026-07-28', notes: undefined },
    ]);

    const params = vi.mocked(Calendar.createEventAsync).mock.calls[0]![1]!;
    expect(params.allDay).toBe(true);
    expect((params.startDate as Date).toISOString()).toBe('2026-07-25T15:00:00.000Z');
    // 終了日(7/28)の翌日0時（JST） = UTC 2026-07-28T15:00
    expect((params.endDate as Date).toISOString()).toBe('2026-07-28T15:00:00.000Z');
  });

  it('同じlotteryKeyへ再追加すると、古い予定を削除してから最新の内容で作り直す（内容修正後の再登録で重複・古い内容の予定が残らないように）', async () => {
    const first = await addEventsToCalendar('lottery-3', [{ title: '【応募締切】テスト', dateOnly: '2026-07-26', notes: undefined }]);
    expect(first).toEqual({ added: 1, alreadyExists: false });
    const firstEventId = vi.mocked(Calendar.createEventAsync).mock.results[0]!.value;

    vi.mocked(Calendar.createEventAsync).mockClear();

    const second = await addEventsToCalendar('lottery-3', [{ title: '【応募締切】テスト（更新後）', dateOnly: '2026-07-27', notes: undefined }]);

    expect(second).toEqual({ added: 1, alreadyExists: true });
    expect(Calendar.deleteEventAsync).toHaveBeenCalledWith(await firstEventId);
    expect(Calendar.createEventAsync).toHaveBeenCalledTimes(1);
  });
});
