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
