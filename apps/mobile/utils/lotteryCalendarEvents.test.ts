import { describe, expect, it } from 'vitest';

import type { LotteryRecord } from '@/schemas/lotteryApi';
import { calendarEventDateKey, calendarEventTimelineRange, getLotteryCalendarEvents } from './lotteryCalendarEvents';

function makeRecord(overrides: Partial<LotteryRecord> & { id: number }): LotteryRecord {
  return {
    sourcePostId: null,
    productNameRaw: `商品${overrides.id}`,
    normalizedProductName: null,
    cardType: null,
    storeNameRaw: null,
    normalizedStoreName: null,
    storeBranchRaw: null,
    normalizedStoreBranch: null,
    region: null,
    normalizerVersion: null,
    applicationStartAt: null,
    confirmedOpenAt: null,
    applicationEndAt: null,
    applicationEndDate: null,
    applicationEndPrecision: null,
    resultAnnouncementAt: null,
    resultAnnouncementDate: null,
    resultAnnouncementPrecision: null,
    purchaseStartAt: null,
    purchaseDeadlineAt: null,
    applicationUrl: null,
    resolvedApplicationUrl: null,
    applicationUrlHttpStatus: null,
    urlResolvedAt: null,
    officialInformationUrl: null,
    appDownloadUrl: null,
    applicationMethod: null,
    eligibilityConditions: null,
    pickupMethod: null,
    paymentMethod: null,
    price: null,
    status: null,
    completenessScore: null,
    verificationStatus: null,
    approvedBy: null,
    approvedAt: null,
    rejectedReason: null,
    rejectedAt: null,
    lifecycleStatus: 'active',
    orphanedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('getLotteryCalendarEvents', () => {
  it('開始・終了とも時刻まで分かる場合は、実際の期間そのままstartIso/endIsoで返す', () => {
    const record = makeRecord({
      id: 1,
      applicationStartAt: '2026-09-15T00:00:00.000Z',
      applicationEndAt: '2026-09-20T13:00:00.000Z',
      resultAnnouncementStartAt: '2026-09-22T00:00:00.000Z',
      resultAnnouncementAt: '2026-09-22T05:00:00.000Z',
      purchaseStartAt: '2026-09-23T00:00:00.000Z',
      purchaseDeadlineAt: '2026-09-25T05:00:00.000Z',
    });

    const events = getLotteryCalendarEvents(record);

    expect(events).toHaveLength(3);
    expect(events.find((e) => e.kind === 'deadline')).toMatchObject({
      startIso: '2026-09-15T00:00:00.000Z',
      endIso: '2026-09-20T13:00:00.000Z',
    });
    expect(events.find((e) => e.kind === 'announcement')).toMatchObject({
      startIso: '2026-09-22T00:00:00.000Z',
      endIso: '2026-09-22T05:00:00.000Z',
    });
    expect(events.find((e) => e.kind === 'purchase')).toMatchObject({
      startIso: '2026-09-23T00:00:00.000Z',
      endIso: '2026-09-25T05:00:00.000Z',
    });
  });

  it('終了（時刻あり）だけ分かる場合、その日の0:00（JST）〜終了時刻にする', () => {
    // applicationEndAt = UTC 2026-09-20T13:00 = JST 2026-09-20T22:00 → JST日付は9/20
    const record = makeRecord({ id: 2, applicationEndAt: '2026-09-20T13:00:00.000Z' });

    const events = getLotteryCalendarEvents(record);

    // JST 2026-09-20T00:00 = UTC 2026-09-19T15:00
    expect(events).toEqual([
      expect.objectContaining({ kind: 'deadline', startIso: '2026-09-19T15:00:00.000Z', endIso: '2026-09-20T13:00:00.000Z' }),
    ]);
  });

  it('開始（時刻あり）だけ分かる場合、開始時刻〜その日の23:59（JST）にする', () => {
    // applicationStartAt = UTC 2026-09-18T01:00 = JST 2026-09-18T10:00 → JST日付は9/18
    const record = makeRecord({ id: 3, applicationStartAt: '2026-09-18T01:00:00.000Z' });

    const events = getLotteryCalendarEvents(record);

    // JST 2026-09-18T23:59 = UTC 2026-09-18T14:59
    expect(events).toEqual([
      expect.objectContaining({ kind: 'deadline', startIso: '2026-09-18T01:00:00.000Z', endIso: '2026-09-18T14:59:00.000Z' }),
    ]);
  });

  it('応募締切が日付のみ（applicationEndDate）で開始も無い場合、その日1日の終日イベントにする', () => {
    const record = makeRecord({ id: 4, applicationEndDate: '2026-09-20' });

    const events = getLotteryCalendarEvents(record);

    expect(events).toEqual([expect.objectContaining({ kind: 'deadline', dateOnly: '2026-09-20' })]);
    expect(events[0]!.dateOnlyEnd).toBeUndefined();
  });

  it('開始・終了とも日付のみ（時刻情報が全く無い）場合、開始日〜終了日の複数日終日イベントにする', () => {
    // purchaseStartAt/purchaseDeadlineAtは専用の日付のみカラムを持たないため、値自体が裸の日付文字列になる。
    const record = makeRecord({ id: 5, purchaseStartAt: '2026-09-18', purchaseDeadlineAt: '2026-09-20' });

    const events = getLotteryCalendarEvents(record);

    expect(events).toEqual([expect.objectContaining({ kind: 'purchase', dateOnly: '2026-09-18', dateOnlyEnd: '2026-09-20' })]);
  });

  it('購入期限は専用の日付のみカラムを持たないため、purchaseDeadlineAt自体が裸の日付文字列の場合もその日1日の終日イベントにする', () => {
    const record = makeRecord({ id: 6, purchaseDeadlineAt: '2026-09-25' });

    const events = getLotteryCalendarEvents(record);

    expect(events).toEqual([expect.objectContaining({ kind: 'purchase', dateOnly: '2026-09-25' })]);
    expect(events[0]!.dateOnlyEnd).toBeUndefined();
  });

  it('値が無い項目はイベントを作らない', () => {
    const record = makeRecord({ id: 7 });
    expect(getLotteryCalendarEvents(record)).toEqual([]);
  });
});

describe('calendarEventDateKey', () => {
  it('dateOnlyの場合はそのまま返す', () => {
    expect(calendarEventDateKey({ lotteryId: 1, kind: 'deadline', productName: '', shopName: '', dateOnly: '2026-09-20' })).toBe(
      '2026-09-20'
    );
  });

  it('startIsoがある場合はその開始日（JST）を返す（UTC日をまたぐケース）', () => {
    // UTC 2026-09-19T15:30 = JST 2026-09-20T00:30
    expect(
      calendarEventDateKey({
        lotteryId: 1,
        kind: 'deadline',
        productName: '',
        shopName: '',
        startIso: '2026-09-19T15:30:00.000Z',
        endIso: '2026-09-19T16:30:00.000Z',
      })
    ).toBe('2026-09-20');
  });

  it('startIsoが無くendIsoのみの場合はendIsoの日付（JST）を返す', () => {
    expect(
      calendarEventDateKey({ lotteryId: 1, kind: 'deadline', productName: '', shopName: '', endIso: '2026-09-19T15:30:00.000Z' })
    ).toBe('2026-09-20');
  });
});

describe('calendarEventTimelineRange', () => {
  it('指定日の範囲内に収まる予定は、そのままJSTの時・分（小数）で返す', () => {
    expect(
      calendarEventTimelineRange(
        {
          lotteryId: 1,
          kind: 'deadline',
          productName: '',
          shopName: '',
          startIso: '2026-09-20T01:00:00.000Z', // JST 10:00
          endIso: '2026-09-20T03:30:00.000Z', // JST 12:30
        },
        '2026-09-20'
      )
    ).toEqual({ startHour: 10, endHour: 12.5 });
  });

  it('指定日をまたぐ予定は、その日の範囲[0, 24]にクリップする', () => {
    // JST 2026-09-19 23:00 〜 2026-09-20 01:00
    const event = {
      lotteryId: 1,
      kind: 'deadline' as const,
      productName: '',
      shopName: '',
      startIso: '2026-09-19T14:00:00.000Z',
      endIso: '2026-09-19T16:00:00.000Z',
    };

    expect(calendarEventTimelineRange(event, '2026-09-19')).toEqual({ startHour: 23, endHour: 24 });
    expect(calendarEventTimelineRange(event, '2026-09-20')).toEqual({ startHour: 0, endHour: 1 });
  });

  it('dateOnly（終日）の場合はnull', () => {
    expect(
      calendarEventTimelineRange(
        { lotteryId: 1, kind: 'deadline', productName: '', shopName: '', dateOnly: '2026-09-20' },
        '2026-09-20'
      )
    ).toBeNull();
  });
});
