import { describe, expect, it } from 'vitest';

import type { LotteryRecord } from '@/schemas/lotteryApi';
import {
  buildLotteryShareText,
  compareLotteriesByTimeline,
  derivePublicTimelineStatus,
  formatAtOrDateOnly,
  formatDateRangeOrSingle,
  getApplicationUrls,
  getBodyMetaLine,
  toLotteryShareInput,
  type LotteryShareInput,
} from './publicLotteryDisplay';

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

describe('formatAtOrDateOnly', () => {
  it('_at（時刻付き）があればJSTの日時をそのまま表示する', () => {
    expect(formatAtOrDateOnly('2026-08-06T00:00:00.000Z', null)).toBe('8/6 (木) 09:00');
  });

  it('_date（日付のみ）しか無い場合は、実在しない時刻を作らず日付のみ表示する', () => {
    // "2026-08-06"をnew Date()へ直接渡すとUTC 0時と解釈され、JST表示では実際のデータに
    // 無い「09:00」という時刻が表示されてしまう不具合があった。日付のみを表示することで防ぐ。
    expect(formatAtOrDateOnly(null, '2026-08-06')).toBe('8/6 (木)');
  });

  it('どちらも無ければnull', () => {
    expect(formatAtOrDateOnly(null, null)).toBeNull();
  });
});

describe('formatDateRangeOrSingle', () => {
  it('開始日時があれば「開始 〜 終了」形式で表示する', () => {
    expect(formatDateRangeOrSingle('2026-08-11T05:00:00.000Z', '2026-08-13T14:59:00.000Z', null)).toBe(
      '8/11 (火) 14:00 〜 8/13 (木) 23:59'
    );
  });

  it('開始日時が無ければ終了側のみ表示する（従来通り）', () => {
    expect(formatDateRangeOrSingle(null, '2026-08-13T14:59:00.000Z', null)).toBe('8/13 (木) 23:59');
  });

  it('終了側が日付のみ（_at無し）でも動作する', () => {
    expect(formatDateRangeOrSingle('2026-08-11T05:00:00.000Z', null, '2026-08-13')).toBe('8/11 (火) 14:00 〜 8/13 (木)');
  });

  it('開始・終了の表示が同じになる場合は終了側のみ表示する（重複表示を避ける）', () => {
    expect(formatDateRangeOrSingle('2026-08-13T14:59:00.000Z', '2026-08-13T14:59:00.000Z', null)).toBe('8/13 (木) 23:59');
  });

  it('終了側が無ければnull（開始日時があっても）', () => {
    expect(formatDateRangeOrSingle('2026-08-11T05:00:00.000Z', null, null)).toBeNull();
  });

  it('開始日時がundefined（フィールド自体が無いレスポンス）でも動作する', () => {
    expect(formatDateRangeOrSingle(undefined, '2026-08-13T14:59:00.000Z', null)).toBe('8/13 (木) 23:59');
  });
});

describe('getBodyMetaLine', () => {
  it('応募締切が日付のみの場合、実在しない時刻（例: 09:00）を表示しない', () => {
    const record = makeRecord({ id: 1, applicationEndAt: null, applicationEndDate: '2026-08-06' });
    expect(getBodyMetaLine(record)).toBe('応募締切　8/6 (木)');
  });

  it('応募締切に時刻がある場合はその時刻を表示する', () => {
    const record = makeRecord({ id: 1, applicationEndAt: '2026-08-06T05:00:00.000Z', applicationEndDate: null });
    expect(getBodyMetaLine(record)).toBe('応募締切　8/6 (木) 14:00');
  });

  it('応募締切が無く当選発表のみ日付ありの場合、当選発表を日付のみで表示する', () => {
    const record = makeRecord({ id: 1, resultAnnouncementAt: null, resultAnnouncementDate: '2026-08-10' });
    expect(getBodyMetaLine(record)).toBe('当選発表　8/10 (月)');
  });

  it('どちらも無ければ未公開メッセージ', () => {
    const record = makeRecord({ id: 1 });
    expect(getBodyMetaLine(record)).toBe('締切・発表日は未公開です');
  });
});

describe('getApplicationUrls', () => {
  it('applicationUrlsが複数あればその配列をそのまま返す', () => {
    const record = makeRecord({
      id: 1,
      applicationUrls: ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'],
    });
    expect(getApplicationUrls(record)).toEqual(['https://example.com/a', 'https://example.com/b', 'https://example.com/c']);
  });

  it('applicationUrlsが空配列/nullで、単一URLのみあれば1件配列で返す（resolvedApplicationUrl優先）', () => {
    const record = makeRecord({
      id: 1,
      applicationUrls: null,
      resolvedApplicationUrl: 'https://example.com/resolved',
      applicationUrl: 'https://example.com/original',
    });
    expect(getApplicationUrls(record)).toEqual(['https://example.com/resolved']);
  });

  it('applicationUrlsが未設定（フィールド自体が無い）でも単一URLへフォールバックする', () => {
    const record = makeRecord({ id: 1, applicationUrl: 'https://example.com/apply' });
    delete (record as { applicationUrls?: string[] | null }).applicationUrls;
    expect(getApplicationUrls(record)).toEqual(['https://example.com/apply']);
  });

  it('どのURLも無ければ空配列', () => {
    const record = makeRecord({ id: 1 });
    expect(getApplicationUrls(record)).toEqual([]);
  });

  it('空文字のURLは除外される', () => {
    const record = makeRecord({ id: 1, applicationUrls: ['https://example.com/a', '', '  '] });
    expect(getApplicationUrls(record)).toEqual(['https://example.com/a']);
  });
});

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

describe('buildLotteryShareText', () => {
  const full: LotteryShareInput = {
    title: 'ONE PIECE カードゲーム 世界最強の戦士',
    shopName: 'イオンスタイルオンライン',
    storeBranch: null,
    applicationEnd: { at: '2026-08-10T14:59:00.000Z', dateOnly: null }, // JST 2026-08-10 23:59
    resultAnnouncement: { at: null, dateOnly: '2026-08-15' },
    purchaseDeadlineAt: '2026-08-17T15:00:00.000Z', // JST 2026-08-18 00:00
    applicationMethod: 'イオンスタイルオンラインアプリから応募',
    applicationUrl: 'https://example.com/lottery',
  };

  it('全項目がある場合、この順で全行が結合される', () => {
    const text = buildLotteryShareText(full);
    expect(text).toBe(
      [
        'ONE PIECE カードゲーム 世界最強の戦士',
        '',
        '店舗: イオンスタイルオンライン',
        '応募締切: 8/10 (月) 23:59',
        '当選発表: 8/15 (土)',
        '購入期限: 8/18 (火) 00:00',
        '応募方法: イオンスタイルオンラインアプリから応募',
        '',
        '応募ページ:',
        'https://example.com/lottery',
      ].join('\n')
    );
  });

  it('タイトルと店舗名だけの場合、その2行のみでURL区画は無い', () => {
    const input: LotteryShareInput = {
      title: '商品A',
      shopName: '店舗A',
      storeBranch: null,
      applicationEnd: { at: null, dateOnly: null },
      resultAnnouncement: { at: null, dateOnly: null },
      purchaseDeadlineAt: null,
      applicationMethod: null,
      applicationUrl: null,
    };
    expect(buildLotteryShareText(input)).toBe('商品A\n\n店舗: 店舗A');
  });

  it('締切が日付のみの場合、時刻を含めずフォーマットする', () => {
    const input: LotteryShareInput = { ...full, applicationEnd: { at: null, dateOnly: '2026-08-10' } };
    const text = buildLotteryShareText(input);
    expect(text).toContain('応募締切: 8/10 (月)');
    expect(text).not.toContain('応募締切: 8/10 (月) ');
  });

  it('締切が時刻付きの場合、時刻を含めてフォーマットする', () => {
    const text = buildLotteryShareText(full);
    expect(text).toContain('応募締切: 8/10 (月) 23:59');
  });

  it('infoLinesが0件でURLだけある場合、タイトルとURL区画のみになる', () => {
    const input: LotteryShareInput = {
      title: '商品A',
      shopName: null,
      storeBranch: null,
      applicationEnd: { at: null, dateOnly: null },
      resultAnnouncement: { at: null, dateOnly: null },
      purchaseDeadlineAt: null,
      applicationMethod: null,
      applicationUrl: 'https://example.com',
    };
    expect(buildLotteryShareText(input)).toBe('商品A\n\n応募ページ:\nhttps://example.com');
  });

  it('タイトルしかない場合、末尾に余分な改行が入らない', () => {
    const input: LotteryShareInput = {
      title: '商品A',
      shopName: null,
      storeBranch: null,
      applicationEnd: { at: null, dateOnly: null },
      resultAnnouncement: { at: null, dateOnly: null },
      purchaseDeadlineAt: null,
      applicationMethod: null,
      applicationUrl: null,
    };
    expect(buildLotteryShareText(input)).toBe('商品A');
  });

  it('支店名がある場合、店舗名の後にスペース区切りで連結される', () => {
    const input: LotteryShareInput = { ...full, storeBranch: '渋谷店' };
    expect(buildLotteryShareText(input)).toContain('店舗: イオンスタイルオンライン 渋谷店');
  });
});

describe('toLotteryShareInput（LotteryRecord → 共有ViewModel）', () => {
  it('storeNameRaw・storeBranchRawの前後空白はtrimされ、結合後も余分な空白が入らない', () => {
    const record = makeRecord({
      id: 1,
      productNameRaw: '商品A',
      storeNameRaw: '  ドラゴンスター  ',
      storeBranchRaw: '  渋谷店  ',
    });
    const input = toLotteryShareInput(record);
    expect(input.shopName).toBe('ドラゴンスター');
    expect(input.storeBranch).toBe('渋谷店');
    expect(buildLotteryShareText(input)).toContain('店舗: ドラゴンスター 渋谷店');
  });

  it('resolvedApplicationUrlが空文字でapplicationUrlが有効な場合、applicationUrlが使われる', () => {
    const record = makeRecord({
      id: 1,
      productNameRaw: '商品A',
      resolvedApplicationUrl: '',
      applicationUrl: 'https://example.com/apply',
    });
    expect(toLotteryShareInput(record).applicationUrl).toBe('https://example.com/apply');
  });

  it('resolvedApplicationUrlが有効な場合、applicationUrlより優先される', () => {
    const record = makeRecord({
      id: 1,
      productNameRaw: '商品A',
      resolvedApplicationUrl: 'https://example.com/resolved',
      applicationUrl: 'https://example.com/original',
    });
    expect(toLotteryShareInput(record).applicationUrl).toBe('https://example.com/resolved');
  });

  it('両方のURLが空（空文字・null）の場合、applicationUrlはnullになりURL区画は出ない', () => {
    const record = makeRecord({
      id: 1,
      productNameRaw: '商品A',
      resolvedApplicationUrl: '',
      applicationUrl: null,
    });
    const input = toLotteryShareInput(record);
    expect(input.applicationUrl).toBeNull();
    expect(buildLotteryShareText(input)).not.toContain('応募ページ');
  });

  it('タイトルが商品名未確認（productNameRaw・normalizedProductNameともに無し）でも共有テキストが組み立てられる', () => {
    const record = makeRecord({ id: 1, productNameRaw: null, normalizedProductName: null });
    const input = toLotteryShareInput(record);
    expect(input.title).toBe('商品名未確認');
    expect(buildLotteryShareText(input)).toContain('商品名未確認');
  });
});
