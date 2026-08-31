import type { LotteryRecord } from '@/schemas/lotteryApi';
import { formatDateTimeShort, formatMonthDayWeekday, formatRemaining, isPast, normalizeDeadline } from '@/utils/time';

/**
 * 実API（GET /lotteries）が返す抽選レコードは、Phase-Aのモック `LotteryStatus`
 * （応募予定/結果待ち/当選など、ユーザー個人の応募結果を前提にした状態）とは異なり、
 * 「いつ締切/発表なのか」という公開情報のみを持つ。バックエンドに個人の応募結果を
 * 記録する仕組みは無い（認証未実装のため）ので、ここでは日付から推測できる
 * 「公開リスト上の状態」のみを別の型として扱う。ユーザー個人の状態
 * （自分の抽選/お気に入り/チェックリスト等）は引き続きモックデータ側の仕組みを使う。
 */
export type PublicTimelineStatus = 'accepting' | 'resultPending' | 'ended' | 'unknown';

export function derivePublicTimelineStatus(record: LotteryRecord, nowIso: string): PublicTimelineStatus {
  const deadline = normalizeDeadline(record.applicationEndAt, record.applicationEndDate);
  if (!deadline) return 'unknown';

  if (!isPast(deadline, nowIso)) return 'accepting';

  const announcement = normalizeDeadline(record.resultAnnouncementAt, record.resultAnnouncementDate);
  if (announcement && !isPast(announcement, nowIso)) return 'resultPending';

  return 'ended';
}

/**
 * 「全国の抽選」一覧（すべてタブ）の並び順（`app/(tabs)/lotteries.tsx`）。
 * 締切日時だけの単純昇順だと、過去の日付（＝受付終了済み）が数値的に小さいため
 * 一覧の先頭に来てしまう不具合があった。ステータスの優先度を最初に比較し、
 * 同一ステータス内でのみ日時で比較する。
 *
 * 優先度: 受付中 → 結果待ち → 受付終了 → 詳細未定（日時不明）
 * （サーバー側`repositories/lotteryRepository.ts`のORDER BYと統一する順序）
 * - 受付中: 締切が近い順（昇順）
 * - 結果待ち: 結果発表日が近い順（昇順）
 * - 受付終了: 終了日時が新しい順（降順。結果発表日があればそれを、無ければ締切日を終了日時とみなす）
 * - 詳細未定（締切日時が無い）: 日時で判定できないため並び替えず、取得順を維持する（安定ソート）
 *
 * `nowIso`は呼び出し側が固定した1つの時刻を渡す前提（`Date.now()`を比較のたびに呼ばない）。
 * こうすることで、端末の時刻・タイムゾーンに関わらず、同一の一覧描画内で並び順が
 * 途中で変わる（不安定になる）ことを防ぐ。日時の大小比較は常に`Date#getTime()`
 * （エポックミリ秒、タイムゾーン非依存）で行い、日時文字列同士の文字列比較はしない。
 */
function timelineStatusPriority(status: PublicTimelineStatus): number {
  switch (status) {
    case 'accepting':
      return 0;
    case 'resultPending':
      return 1;
    case 'ended':
      return 2;
    case 'unknown':
      return 3;
  }
}

function timelineSortTimestamp(record: LotteryRecord, status: PublicTimelineStatus): number {
  const deadline = normalizeDeadline(record.applicationEndAt, record.applicationEndDate);
  const announcement = normalizeDeadline(record.resultAnnouncementAt, record.resultAnnouncementDate);

  if (status === 'accepting') {
    return deadline ? new Date(deadline).getTime() : Number.POSITIVE_INFINITY;
  }
  if (status === 'resultPending') {
    return announcement ? new Date(announcement).getTime() : Number.POSITIVE_INFINITY;
  }
  if (status === 'ended') {
    const endedAt = announcement ?? deadline;
    // 降順（新しい順）にしたいので符号を反転する（数値の昇順ソートで新しい方が先に来る）。
    return endedAt ? -new Date(endedAt).getTime() : Number.POSITIVE_INFINITY;
  }
  return 0; // unknown: 取得順を維持（Array#sortの安定性に委ねる）
}

export function compareLotteriesByTimeline(a: LotteryRecord, b: LotteryRecord, nowIso: string): number {
  const statusA = derivePublicTimelineStatus(a, nowIso);
  const statusB = derivePublicTimelineStatus(b, nowIso);

  const priorityDiff = timelineStatusPriority(statusA) - timelineStatusPriority(statusB);
  if (priorityDiff !== 0) return priorityDiff;

  return timelineSortTimestamp(a, statusA) - timelineSortTimestamp(b, statusB);
}

export function getDisplayProductName(record: LotteryRecord): string {
  return record.productNameRaw?.trim() || record.normalizedProductName?.trim() || '商品名未確認';
}

export function getDisplayShopName(record: LotteryRecord): string {
  return record.storeNameRaw?.trim() || record.normalizedStoreName?.trim() || '店舗情報なし';
}

export function getHeaderMetaLine(record: LotteryRecord, nowIso: string): string {
  const status = derivePublicTimelineStatus(record, nowIso);
  const deadline = normalizeDeadline(record.applicationEndAt, record.applicationEndDate);
  const isDateOnly = !record.applicationEndAt && Boolean(record.applicationEndDate);

  if (status === 'accepting' && deadline) return formatRemaining(deadline, nowIso, isDateOnly);
  if (status === 'ended') return '受付終了';
  if (status === 'resultPending') return '結果発表待ち';
  return '詳細未定';
}

/**
 * 応募ページURLの一覧を返す（複数指定（`applicationUrls`）があればそれを、無ければ
 * 単一URL（`resolvedApplicationUrl`優先）を1件だけの配列で、どちらも無ければ空配列）。
 * 空文字のURLは除外する。
 */
export function getApplicationUrls(record: LotteryRecord): string[] {
  if (record.applicationUrls && record.applicationUrls.length > 0) {
    return record.applicationUrls.map((u) => u.trim()).filter((u) => u.length > 0);
  }
  const single = firstNonEmpty(record.resolvedApplicationUrl, record.applicationUrl);
  return single ? [single] : [];
}

export function getBodyMetaLine(record: LotteryRecord): string {
  const deadlineText = formatAtOrDateOnly(record.applicationEndAt, record.applicationEndDate);
  if (deadlineText) return `応募締切　${deadlineText}`;

  const announcementText = formatAtOrDateOnly(record.resultAnnouncementAt, record.resultAnnouncementDate);
  if (announcementText) return `当選発表　${announcementText}`;

  return '締切・発表日は未公開です';
}

/**
 * 抽選詳細画面の共有機能（`components/ShareLotteryButton.tsx`）が入力とする、
 * 共有テキスト生成専用の小さなViewModel。
 *
 * 実データ（`LotteryRecord`）専用の型にせず、あえてこの中間形にすることで、
 * モックデータ画面（`app/lotteries/[id].tsx`の`MockLotteryDetailScreen`、別の`Lottery`型を
 * 使う）からも、無理に`LotteryRecord`へ変換せずに同じ`buildLotteryShareText`を呼べるようにする。
 */
export interface LotteryShareInput {
  title: string;
  shopName: string | null;
  storeBranch: string | null;
  applicationEnd: { at: string | null; dateOnly: string | null };
  resultAnnouncement: { at: string | null; dateOnly: string | null };
  purchaseDeadlineAt: string | null;
  applicationMethod: string | null;
  applicationUrl: string | null;
}

/** trim後に空文字でない最初の値を返す。無ければnull（「情報なし」等のプレースホルダは使わない）。 */
function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    const trimmed = v?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * `_at`（時刻付き）があれば時刻ありで、`_date`（日付のみ）しか無ければ時刻なしでフォーマットする。
 * `_date`のみの値を`new Date()`へ直接渡すと**UTC 0時**として解釈され、JST表示では実際には
 * 存在しない時刻（例: 09:00）が表示されてしまう（`normalizeDeadline`のコメント参照）ため、
 * 締切等の日時を画面表示する箇所は必ずこの関数を経由すること。
 */
export function formatAtOrDateOnly(at: string | null, dateOnly: string | null): string | null {
  if (at) return formatDateTimeShort(at);
  if (dateOnly) return formatMonthDayWeekday(dateOnly);
  return null;
}

/**
 * 開始日時があれば「開始 〜 終了」、無ければ従来通り終了側のみを表示する
 * （「A〜B」のような期間表記の投稿に対応、x-post-fetcher Phase 10）。
 * 開始・終了が同一表示になる場合（同日同時刻等）は終了側のみを表示する。
 */
export function formatDateRangeOrSingle(
  startAt: string | null | undefined,
  endAt: string | null,
  endDateOnly: string | null
): string | null {
  const endText = formatAtOrDateOnly(endAt, endDateOnly);
  if (!endText) return null;
  if (!startAt) return endText;
  const startText = formatDateTimeShort(startAt);
  if (!startText || startText === endText) return endText;
  return `${startText} 〜 ${endText}`;
}

/** 実データ（`LotteryRecord`）を共有用ViewModelへ変換する。resolvedApplicationUrlを優先し、空文字は無視する。 */
export function toLotteryShareInput(record: LotteryRecord): LotteryShareInput {
  return {
    title: getDisplayProductName(record),
    shopName: firstNonEmpty(record.storeNameRaw, record.normalizedStoreName),
    storeBranch: firstNonEmpty(record.storeBranchRaw),
    applicationEnd: { at: record.applicationEndAt, dateOnly: record.applicationEndDate },
    resultAnnouncement: { at: record.resultAnnouncementAt, dateOnly: record.resultAnnouncementDate },
    purchaseDeadlineAt: firstNonEmpty(record.purchaseDeadlineAt),
    applicationMethod: firstNonEmpty(record.applicationMethod),
    applicationUrl: firstNonEmpty(record.resolvedApplicationUrl, record.applicationUrl),
  };
}

/**
 * 抽選情報の共有テキストを組み立てる。存在する情報だけを含め、値が無い項目は行ごと省略する。
 * タイトルは必須（「商品名未確認」等のフォールバック込みで常に1行目に入る）。
 */
export function buildLotteryShareText(input: LotteryShareInput): string {
  const shopLine = input.shopName
    ? `店舗: ${input.shopName}${input.storeBranch ? ` ${input.storeBranch}` : ''}`
    : null;

  const deadlineText = formatAtOrDateOnly(input.applicationEnd.at, input.applicationEnd.dateOnly);
  const deadlineLine = deadlineText ? `応募締切: ${deadlineText}` : null;

  const announceText = formatAtOrDateOnly(input.resultAnnouncement.at, input.resultAnnouncement.dateOnly);
  const announceLine = announceText ? `当選発表: ${announceText}` : null;

  const purchaseLine = input.purchaseDeadlineAt ? `購入期限: ${formatDateTimeShort(input.purchaseDeadlineAt)}` : null;

  const methodLine = input.applicationMethod ? `応募方法: ${input.applicationMethod}` : null;

  const infoLines = [shopLine, deadlineLine, announceLine, purchaseLine, methodLine].filter(
    (line): line is string => line !== null
  );

  const sections = [[input.title], infoLines, input.applicationUrl ? ['応募ページ:', input.applicationUrl] : []].filter(
    (section) => section.length > 0
  );

  return sections.map((section) => section.join('\n')).join('\n\n');
}
