import type { LotteryRecord } from '@/schemas/lotteryApi';
import { formatDateTimeShort, formatRemaining, isPast } from '@/utils/time';

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
  const deadline = record.applicationEndAt ?? record.applicationEndDate;
  if (!deadline) return 'unknown';

  if (!isPast(deadline, nowIso)) return 'accepting';

  const announcement = record.resultAnnouncementAt ?? record.resultAnnouncementDate;
  if (announcement && !isPast(announcement, nowIso)) return 'resultPending';

  return 'ended';
}

/**
 * 「全国の抽選」一覧（すべてタブ）の並び順（`app/(tabs)/lotteries.tsx`）。
 * 締切日時だけの単純昇順だと、過去の日付（＝受付終了済み）が数値的に小さいため
 * 一覧の先頭に来てしまう不具合があった。ステータスの優先度を最初に比較し、
 * 同一ステータス内でのみ日時で比較する。
 *
 * 優先度: 受付中 → 結果待ち → 詳細未定（日時不明） → 受付終了
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
    case 'unknown':
      return 2;
    case 'ended':
      return 3;
  }
}

function timelineSortTimestamp(record: LotteryRecord, status: PublicTimelineStatus): number {
  const deadline = record.applicationEndAt ?? record.applicationEndDate;
  const announcement = record.resultAnnouncementAt ?? record.resultAnnouncementDate;

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

/** verificationStatus が未承認（人手確認前）の場合に注意バッジを出すための判定。 */
export function needsVerificationCaution(record: LotteryRecord): boolean {
  return record.verificationStatus !== 'approved';
}

export function getDisplayProductName(record: LotteryRecord): string {
  return record.productNameRaw?.trim() || record.normalizedProductName?.trim() || '商品名未確認';
}

export function getDisplayShopName(record: LotteryRecord): string {
  return record.storeNameRaw?.trim() || record.normalizedStoreName?.trim() || '店舗情報なし';
}

export function getHeaderMetaLine(record: LotteryRecord, nowIso: string): string {
  const status = derivePublicTimelineStatus(record, nowIso);
  const deadline = record.applicationEndAt ?? record.applicationEndDate;

  if (status === 'accepting' && deadline) return formatRemaining(deadline, nowIso);
  if (status === 'ended') return '受付終了';
  if (status === 'resultPending') return '結果発表待ち';
  return '詳細未定';
}

export function getBodyMetaLine(record: LotteryRecord): string {
  const deadline = record.applicationEndAt ?? record.applicationEndDate;
  if (deadline) return `応募締切　${formatDateTimeShort(deadline)}`;

  const announcement = record.resultAnnouncementAt ?? record.resultAnnouncementDate;
  if (announcement) return `当選発表　${formatDateTimeShort(announcement)}`;

  return '締切・発表日は未公開です';
}
