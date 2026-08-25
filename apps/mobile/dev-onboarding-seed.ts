/**
 * 一時ファイル（オンボーディングスライド用スクリーンショット撮影の作業用）。
 * 本番コードには一切組み込まない。スクショ撮影が終わったら本ファイルと
 * app/_layout.tsx への3行の呼び出し追加を削除すること。
 *
 * ブラウザ（Expo web）のJSコンソールから `window.seedOnboardingDemo()` を呼ぶと、
 * - 「全国の抽選」「自分の抽選」画面用のダミー抽選データ
 * - 「統計・分析」画面用のダミー集計データ（サインイン＋プレミアム状態を偽装）
 * を、実バックエンドに一切繋がずローカルのstateだけで用意する。
 */
import type { LotteryRecord } from '@/schemas/lotteryApi';
import type { LotteryStatusApi } from '@/schemas/syncApi';
import type { StatisticsMonthlyItem, StatisticsStoreItem, StatisticsSummaryResponse } from '@/schemas/statisticsApi';
import { useAuthStore } from '@/stores/authStore';
import { useBillingStore } from '@/stores/billingStore';
import { useMyLotteriesStore } from '@/stores/myLotteriesStore';
import { useThemeStore } from '@/stores/themeStore';

function isoAt(daysFromNow: number, hour = 23, minute = 59): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

let nextId = 900001;

function makeLottery(overrides: Partial<LotteryRecord>): LotteryRecord {
  const now = new Date().toISOString();
  const base: LotteryRecord = {
    id: nextId++,
    sourcePostId: null,
    productNameRaw: null,
    normalizedProductName: null,
    cardType: 'pokemon',
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
    applicationEndPrecision: 'datetime',
    resultAnnouncementStartAt: null,
    resultAnnouncementAt: null,
    resultAnnouncementDate: null,
    resultAnnouncementPrecision: 'unknown',
    purchaseStartAt: null,
    purchaseDeadlineAt: null,
    applicationUrl: 'https://example.com/lottery',
    applicationUrls: null,
    resolvedApplicationUrl: 'https://example.com/lottery',
    applicationUrlHttpStatus: 200,
    urlResolvedAt: now,
    officialInformationUrl: null,
    appDownloadUrl: null,
    applicationMethod: 'オンライン抽選',
    imageUrl: null,
    eligibilityConditions: null,
    pickupMethod: null,
    paymentMethod: null,
    price: null,
    status: 'open',
    completenessScore: '1',
    verificationStatus: 'approved',
    approvedBy: 'demo',
    approvedAt: now,
    rejectedReason: null,
    rejectedAt: null,
    lifecycleStatus: 'active',
    orphanedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  return { ...base, ...overrides };
}

// 本番の管理画面で実際にアップロード済みの商品画像URL（承認済み抽選）をそのまま流用する。
// スクショの見た目をより本物らしくするため（プレースホルダーのグレー枠のままにしないため）。
const IMG_BASE = "https://x-post-ingest.bakushi-log.workers.dev/images";

/** 「全国の抽選」一覧用。受付中／結果待ち／受付終了が混在する、それらしいラインナップ。 */
export const DEMO_ALL_LOTTERIES: LotteryRecord[] = [
  makeLottery({
    productNameRaw: 'メガブレイブ／メガシンフォニア',
    normalizedProductName: 'メガブレイブ／メガシンフォニア',
    storeNameRaw: 'ポケモンセンターオンライン',
    applicationEndAt: isoAt(2, 23, 59),
    imageUrl: `${IMG_BASE}/1668-1787648801272.png`,
  }),
  makeLottery({
    productNameRaw: 'ストームエメラルダ',
    normalizedProductName: 'ストームエメラルダ',
    storeNameRaw: 'ドラゴンスター',
    applicationEndAt: isoAt(1, 20, 0),
    imageUrl: `${IMG_BASE}/1661-1787646437768.jpg`,
  }),
  makeLottery({
    productNameRaw: '30th CELEBRATION プレミアムデッキセット',
    normalizedProductName: '30th CELEBRATION プレミアムデッキセット',
    storeNameRaw: 'イエローサブマリン',
    applicationEndAt: isoAt(4, 23, 59),
    imageUrl: `${IMG_BASE}/2118-1787648706770.png`,
  }),
  makeLottery({
    productNameRaw: 'ONEPIECEカードゲーム 4th Anniversary Set',
    normalizedProductName: 'ONEPIECEカードゲーム 4th Anniversary Set',
    cardType: 'onepiece',
    storeNameRaw: 'カードラッシュ',
    applicationEndAt: isoAt(6, 18, 0),
    imageUrl: `${IMG_BASE}/1886-1787646887139.png`,
  }),
  makeLottery({
    productNameRaw: '世界最強の戦士',
    normalizedProductName: '世界最強の戦士',
    cardType: 'onepiece',
    storeNameRaw: 'トレカパーク',
    applicationEndAt: isoAt(-1),
    resultAnnouncementAt: isoAt(3, 15, 0),
    imageUrl: `${IMG_BASE}/1865-1787644751311.jpg`,
  }),
  makeLottery({
    productNameRaw: 'スタートデッキ100 バトルコレクション',
    normalizedProductName: 'スタートデッキ100 バトルコレクション',
    storeNameRaw: 'Joshin',
    applicationEndAt: isoAt(-2),
    resultAnnouncementAt: isoAt(1, 15, 0),
    imageUrl: `${IMG_BASE}/167-1787647234829.jpg`,
  }),
  makeLottery({
    productNameRaw: 'MEGAドリームex',
    normalizedProductName: 'MEGAドリームex',
    storeNameRaw: 'ヨドバシドットコム',
    applicationEndAt: isoAt(-5),
    resultAnnouncementAt: isoAt(-3),
    imageUrl: `${IMG_BASE}/1686-1787647923641.png`,
  }),
  makeLottery({
    productNameRaw: 'プレミアムデッキセット エーフィ・ブラッキー',
    normalizedProductName: 'プレミアムデッキセット エーフィ・ブラッキー',
    storeNameRaw: 'カードボックス',
    applicationEndAt: isoAt(-8),
    resultAnnouncementAt: isoAt(-6),
    imageUrl: `${IMG_BASE}/2044-1787648737774.png`,
  }),
  makeLottery({
    productNameRaw: 'アビスアイ',
    normalizedProductName: 'アビスアイ',
    storeNameRaw: 'エディオン',
    applicationEndAt: isoAt(3, 23, 59),
    imageUrl: `${IMG_BASE}/2104-1787646536583.png`,
  }),
];

/** 「自分の抽選」用。個人ステータスにバリエーションを持たせる。 */
export const DEMO_SAVED_LOTTERIES: { record: LotteryRecord; status: LotteryStatusApi }[] = [
  { record: DEMO_ALL_LOTTERIES[0], status: 'applied' },
  { record: DEMO_ALL_LOTTERIES[1], status: 'planned' },
  { record: DEMO_ALL_LOTTERIES[4], status: 'won' },
  { record: DEMO_ALL_LOTTERIES[5], status: 'lost' },
  { record: DEMO_ALL_LOTTERIES[6], status: 'purchased' },
];

const DEMO_STATS_SUMMARY: StatisticsSummaryResponse = {
  savedCount: 24,
  plannedCount: 3,
  appliedCount: 16,
  notAppliedCount: 2,
  wonCount: 7,
  lostCount: 9,
  pendingResultCount: 2,
  purchasedCount: 6,
  skippedCount: 1,
  applicationSkippedCount: 2,
  winRate: 0.4375,
};

const MONTH_LABELS = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
const MONTH_APPLIED = [2, 3, 4, 3, 5, 4, 6, 5, 7, 6, 8, 7];
const MONTH_WON = [1, 1, 2, 1, 2, 2, 3, 2, 3, 3, 4, 3];
const MONTH_LOST = [1, 1, 1, 1, 2, 1, 2, 2, 3, 2, 3, 3];

const DEMO_STATS_MONTHLY: StatisticsMonthlyItem[] = MONTH_LABELS.map((month, i) => {
  const won = MONTH_WON[i];
  const lost = MONTH_LOST[i];
  return {
    month,
    appliedCount: MONTH_APPLIED[i],
    wonCount: won,
    lostCount: lost,
    winRate: won + lost > 0 ? won / (won + lost) : null,
  };
});

const DEMO_STATS_STORES: StatisticsStoreItem[] = [
  { storeName: 'ポケモンセンターオンライン', appliedCount: 9, wonCount: 4, lostCount: 5, pendingResultCount: 0, winRate: 0.444 },
  { storeName: 'ドラゴンスター', appliedCount: 6, wonCount: 3, lostCount: 3, pendingResultCount: 0, winRate: 0.5 },
  { storeName: 'イエローサブマリン', appliedCount: 5, wonCount: 2, lostCount: 3, pendingResultCount: 0, winRate: 0.4 },
  { storeName: 'カードラッシュ', appliedCount: 4, wonCount: 1, lostCount: 3, pendingResultCount: 0, winRate: 0.25 },
  { storeName: 'Joshin', appliedCount: 3, wonCount: 1, lostCount: 1, pendingResultCount: 1, winRate: 0.5 },
];

let fetchPatched = false;

function installFetchPatch() {
  if (fetchPatched) return;
  fetchPatched = true;
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

    if (url.includes('/lotteries') && !/\/lotteries\/\d+/.test(url)) {
      return json({
        ok: true,
        lotteries: DEMO_ALL_LOTTERIES,
        total: DEMO_ALL_LOTTERIES.length,
        limit: 20,
        asOf: new Date().toISOString(),
        nextCursor: null,
      });
    }
    if (url.includes('/me/statistics/summary')) return json(DEMO_STATS_SUMMARY);
    if (url.includes('/me/statistics/monthly')) return json({ items: DEMO_STATS_MONTHLY });
    if (url.includes('/me/statistics/stores')) return json({ items: DEMO_STATS_STORES });

    return originalFetch(input, init);
  }) as typeof fetch;
}

/** オンボーディングスクショ用: 「全国の抽選」「自分の抽選」「統計・分析」が
 * それらしいダミーデータで表示されるようにする（カレンダー画面はそもそも
 * データを持たない静的画面のため、対応不要）。 */
export function seedOnboardingDemo(): void {
  installFetchPatch();

  useAuthStore.setState({
    status: 'signedIn',
    sessionAvailability: 'online',
    accessToken: 'dev-onboarding-seed-token',
    accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
  });
  useBillingStore.setState({ localEntitlementActive: true, serverPremiumActive: true, billingStatus: 'configured' });

  for (const { record, status } of DEMO_SAVED_LOTTERIES) {
    if (!useMyLotteriesStore.getState().isSaved(record.id)) {
      useMyLotteriesStore.getState().saveLottery(record);
    }
    useMyLotteriesStore.getState().setStatus(record.id, status);
  }

  // eslint-disable-next-line no-console
  console.log('[dev-onboarding-seed] applied. lotteries=%d saved=%d', DEMO_ALL_LOTTERIES.length, DEMO_SAVED_LOTTERIES.length);
}

/** スクショ撮影用: ライト/ダークテーマを強制切り替える。 */
export function setOnboardingDemoTheme(preference: 'light' | 'dark'): void {
  useThemeStore.getState().setPreference(preference);
}
