import { describe, expect, it } from 'vitest';

import type { LotteryRecord } from '@/schemas/lotteryApi';
import { compareLotteriesByTimeline, derivePublicTimelineStatus } from './publicLotteryDisplay';

const NOW_ISO = '2026-08-03T00:00:00.000Z';

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

describe('derivePublicTimelineStatus', () => {
  it('締切未設定はunknown', () => {
    const r = makeRecord({ id: 1 });
    expect(derivePublicTimelineStatus(r, NOW_ISO)).toBe('unknown');
  });

  it('締切が未来ならaccepting', () => {
    const r = makeRecord({ id: 1, applicationEndAt: '2026-08-10T00:00:00.000Z' });
    expect(derivePublicTimelineStatus(r, NOW_ISO)).toBe('accepting');
  });

  it('締切が過去・発表日が未来ならresultPending', () => {
    const r = makeRecord({
      id: 1,
      applicationEndAt: '2026-08-01T00:00:00.000Z',
      resultAnnouncementAt: '2026-08-10T00:00:00.000Z',
    });
    expect(derivePublicTimelineStatus(r, NOW_ISO)).toBe('resultPending');
  });

  it('締切・発表日ともに過去ならended', () => {
    const r = makeRecord({
      id: 1,
      applicationEndAt: '2026-07-01T00:00:00.000Z',
      resultAnnouncementAt: '2026-07-20T00:00:00.000Z',
    });
    expect(derivePublicTimelineStatus(r, NOW_ISO)).toBe('ended');
  });

  it('締切のみ過去（発表日未設定）ならended', () => {
    const r = makeRecord({ id: 1, applicationEndAt: '2026-07-01T00:00:00.000Z' });
    expect(derivePublicTimelineStatus(r, NOW_ISO)).toBe('ended');
  });

  it('日付のみの締切は、日本時間の午前9時（UTC0時）ではまだacceptingのまま', () => {
    // application_end_dateのみ="2026-08-03"（NOW_ISOと同じ日）の場合、
    // new Date('2026-08-03')を直接使うとUTC0時=JST9時で終了扱いになってしまうバグを防ぐ確認。
    const r = makeRecord({ id: 1, applicationEndDate: '2026-08-03' });
    expect(derivePublicTimelineStatus(r, NOW_ISO)).toBe('accepting'); // NOW_ISO = 2026-08-03T00:00:00Z = JST9:00
  });

  it('日付のみの締切は、日本時間の翌日0時（UTC15時）でendedになる', () => {
    const r = makeRecord({ id: 1, applicationEndDate: '2026-08-03' });
    expect(derivePublicTimelineStatus(r, '2026-08-03T15:00:00.000Z')).toBe('ended');
  });
});

describe('compareLotteriesByTimeline', () => {
  it('受付終了が締切近い順のトップに来ない（本来の不具合の再現・修正確認）', () => {
    const ended = makeRecord({ id: 1, applicationEndAt: '2026-07-24T00:00:00.000Z' }); // 過去＝終了済み
    const accepting = makeRecord({ id: 2, applicationEndAt: '2026-08-20T00:00:00.000Z' }); // 未来＝受付中

    const sorted = [ended, accepting].sort((a, b) => compareLotteriesByTimeline(a, b, NOW_ISO));

    expect(sorted.map((r) => r.id)).toEqual([2, 1]); // 受付中(2)が先、終了済み(1)は後ろ
  });

  it('優先度: accepting > resultPending > ended > unknown', () => {
    const accepting = makeRecord({ id: 1, applicationEndAt: '2026-08-20T00:00:00.000Z' });
    const resultPending = makeRecord({
      id: 2,
      applicationEndAt: '2026-08-01T00:00:00.000Z',
      resultAnnouncementAt: '2026-08-10T00:00:00.000Z',
    });
    const ended = makeRecord({ id: 3, applicationEndAt: '2026-07-01T00:00:00.000Z' });
    const unknown = makeRecord({ id: 4 });

    const sorted = [unknown, ended, resultPending, accepting].sort((a, b) => compareLotteriesByTimeline(a, b, NOW_ISO));

    expect(sorted.map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });

  it('受付中どうしは締切が近い順', () => {
    const far = makeRecord({ id: 1, applicationEndAt: '2026-09-01T00:00:00.000Z' });
    const near = makeRecord({ id: 2, applicationEndAt: '2026-08-05T00:00:00.000Z' });

    const sorted = [far, near].sort((a, b) => compareLotteriesByTimeline(a, b, NOW_ISO));

    expect(sorted.map((r) => r.id)).toEqual([2, 1]);
  });

  it('結果待ちどうしは発表日が近い順', () => {
    const farAnnouncement = makeRecord({
      id: 1,
      applicationEndAt: '2026-08-01T00:00:00.000Z',
      resultAnnouncementAt: '2026-08-20T00:00:00.000Z',
    });
    const nearAnnouncement = makeRecord({
      id: 2,
      applicationEndAt: '2026-08-01T00:00:00.000Z',
      resultAnnouncementAt: '2026-08-05T00:00:00.000Z',
    });

    const sorted = [farAnnouncement, nearAnnouncement].sort((a, b) => compareLotteriesByTimeline(a, b, NOW_ISO));

    expect(sorted.map((r) => r.id)).toEqual([2, 1]);
  });

  it('終了済みどうしは終了日時が新しい順（発表日があればそれを終了日時とみなす）', () => {
    const olderEnd = makeRecord({
      id: 1,
      applicationEndAt: '2026-07-01T00:00:00.000Z',
      resultAnnouncementAt: '2026-07-05T00:00:00.000Z',
    });
    const newerEnd = makeRecord({
      id: 2,
      applicationEndAt: '2026-07-10T00:00:00.000Z',
      resultAnnouncementAt: '2026-07-20T00:00:00.000Z',
    });
    const noAnnouncementEnd = makeRecord({ id: 3, applicationEndAt: '2026-07-25T00:00:00.000Z' }); // 発表日無し→締切を終了日時とみなす

    const sorted = [olderEnd, newerEnd, noAnnouncementEnd].sort((a, b) => compareLotteriesByTimeline(a, b, NOW_ISO));

    expect(sorted.map((r) => r.id)).toEqual([3, 2, 1]); // 7/25 > 7/20 > 7/5
  });

  it('unknown同士は取得順を維持する（安定ソート、日時で並び替えない）', () => {
    const a = makeRecord({ id: 1 });
    const b = makeRecord({ id: 2 });
    const c = makeRecord({ id: 3 });

    const sorted = [a, b, c].sort((a2, b2) => compareLotteriesByTimeline(a2, b2, NOW_ISO));

    expect(sorted.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('タイムゾーン表記が違っても同一時刻は同一時刻として扱う（文字列比較ではなくエポック比較）', () => {
    // 2026-08-10T00:00:00Z と 2026-08-10T09:00:00+09:00 は同一瞬間
    const utc = makeRecord({ id: 1, applicationEndAt: '2026-08-10T00:00:00.000Z' });
    const jstSameInstant = makeRecord({ id: 2, applicationEndAt: '2026-08-10T09:00:00.000+09:00' });
    const later = makeRecord({ id: 3, applicationEndAt: '2026-08-11T00:00:00.000Z' });

    const sorted = [later, jstSameInstant, utc].sort((a, b) => compareLotteriesByTimeline(a, b, NOW_ISO));

    // utcとjstSameInstantは同一瞬間なので順序はどちらが先でもよいが、laterは必ず最後
    expect(sorted[2].id).toBe(3);
    expect(new Set(sorted.slice(0, 2).map((r) => r.id))).toEqual(new Set([1, 2]));
  });

  it('nowIsoを固定して2回ソートしても結果が変わらない（不安定にならない）', () => {
    const records = [
      makeRecord({ id: 1, applicationEndAt: '2026-07-24T00:00:00.000Z' }),
      makeRecord({ id: 2, applicationEndAt: '2026-08-20T00:00:00.000Z' }),
      makeRecord({ id: 3 }),
      makeRecord({
        id: 4,
        applicationEndAt: '2026-08-01T00:00:00.000Z',
        resultAnnouncementAt: '2026-08-10T00:00:00.000Z',
      }),
    ];

    const firstRun = [...records].sort((a, b) => compareLotteriesByTimeline(a, b, NOW_ISO)).map((r) => r.id);
    const secondRun = [...records].sort((a, b) => compareLotteriesByTimeline(a, b, NOW_ISO)).map((r) => r.id);

    expect(firstRun).toEqual(secondRun);
  });
});
