import { describe, expect, it } from 'vitest';

import type { LotteryRecord } from '@/schemas/lotteryApi';
import { calendarEventDateKey, calendarEventJstHourMinute, getLotteryCalendarEvents } from './lotteryCalendarEvents';

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
  it('時刻ありの応募締切・当選発表・購入期限（時刻あり）は3件ともdateIsoで返す', () => {
    const record = makeRecord({
      id: 1,
      applicationEndAt: '2026-09-20T13:00:00.000Z',
      resultAnnouncementAt: '2026-09-22T05:00:00.000Z',
      purchaseDeadlineAt: '2026-09-25T05:00:00.000Z',
    });

    const events = getLotteryCalendarEvents(record);

    expect(events).toHaveLength(3);
    expect(events.find((e) => e.kind === 'deadline')).toMatchObject({ dateIso: '2026-09-20T13:00:00.000Z' });
    expect(events.find((e) => e.kind === 'announcement')).toMatchObject({ dateIso: '2026-09-22T05:00:00.000Z' });
    expect(events.find((e) => e.kind === 'purchase')).toMatchObject({ dateIso: '2026-09-25T05:00:00.000Z' });
  });

  it('応募締切が日付のみ（applicationEndDate）の場合、dateOnlyで返す', () => {
    const record = makeRecord({ id: 2, applicationEndDate: '2026-09-20' });

    const events = getLotteryCalendarEvents(record);

    expect(events).toEqual([expect.objectContaining({ kind: 'deadline', dateOnly: '2026-09-20' })]);
  });

  it('購入期限は専用の日付のみカラムを持たないため、purchaseDeadlineAt自体が裸の日付文字列の場合はdateOnlyとして扱う', () => {
    const record = makeRecord({ id: 3, purchaseDeadlineAt: '2026-09-25' });

    const events = getLotteryCalendarEvents(record);

    expect(events).toEqual([expect.objectContaining({ kind: 'purchase', dateOnly: '2026-09-25' })]);
  });

  it('値が無い項目はイベントを作らない', () => {
    const record = makeRecord({ id: 4 });
    expect(getLotteryCalendarEvents(record)).toEqual([]);
  });
});

describe('calendarEventDateKey', () => {
  it('dateOnlyの場合はそのまま返す', () => {
    expect(calendarEventDateKey({ lotteryId: 1, kind: 'deadline', productName: '', shopName: '', dateOnly: '2026-09-20' })).toBe(
      '2026-09-20'
    );
  });

  it('dateIsoの場合はJSTの日付キーへ変換する（UTC日をまたぐケース）', () => {
    // UTC 2026-09-19T15:30 = JST 2026-09-20T00:30
    expect(
      calendarEventDateKey({ lotteryId: 1, kind: 'deadline', productName: '', shopName: '', dateIso: '2026-09-19T15:30:00.000Z' })
    ).toBe('2026-09-20');
  });
});

describe('calendarEventJstHourMinute', () => {
  it('dateIsoからJSTの時・分を返す', () => {
    expect(
      calendarEventJstHourMinute({ lotteryId: 1, kind: 'deadline', productName: '', shopName: '', dateIso: '2026-09-19T15:30:00.000Z' })
    ).toEqual({ hour: 0, minute: 30 });
  });

  it('dateOnlyの場合はnull（時刻不明のため）', () => {
    expect(
      calendarEventJstHourMinute({ lotteryId: 1, kind: 'deadline', productName: '', shopName: '', dateOnly: '2026-09-20' })
    ).toBeNull();
  });
});
