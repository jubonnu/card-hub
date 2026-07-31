import type { LotteryRecord } from '@/schemas/lotteryApi';

import { derivePublicTimelineStatus } from './publicLotteryDisplay';

/**
 * 商品統合ビュー（実API版）用のクライアント側グルーピング。
 * バックエンドに商品集約用のエンドポイントは無いため、GET /lotteries の結果を
 * normalizedProductName でグルーピングする（既存のlotteryRepositoryが正規化済みの値を
 * 返す前提。この値が無いレコード（正規化に失敗した投稿等）は商品統合ビューの対象外とし、
 * 一覧画面では個別表示のまま扱う）。
 */
export interface PublicProductGroup {
  key: string;
  displayName: string;
  cardType: LotteryRecord['cardType'];
  records: LotteryRecord[];
  acceptingCount: number;
  resultPendingCount: number;
  endedCount: number;
  unknownCount: number;
}

const CARD_TYPE_LABELS: Record<string, string> = {
  pokemon: 'ポケモンカード',
  onepiece: 'ワンピースカード',
  other: 'その他カード',
};

export function getCardTypeLabel(cardType: LotteryRecord['cardType']): string {
  if (!cardType) return 'カード種類不明';
  return CARD_TYPE_LABELS[cardType] ?? 'カード種類不明';
}

export function groupLotteriesByProduct(
  records: LotteryRecord[],
  nowIso: string
): Map<string, PublicProductGroup> {
  const map = new Map<string, PublicProductGroup>();

  for (const record of records) {
    const key = record.normalizedProductName;
    if (!key) continue;

    const status = derivePublicTimelineStatus(record, nowIso);
    const existing = map.get(key);

    if (existing) {
      existing.records.push(record);
      if (status === 'accepting') existing.acceptingCount += 1;
      else if (status === 'resultPending') existing.resultPendingCount += 1;
      else if (status === 'ended') existing.endedCount += 1;
      else existing.unknownCount += 1;
    } else {
      map.set(key, {
        key,
        displayName: record.productNameRaw?.trim() || key,
        cardType: record.cardType,
        records: [record],
        acceptingCount: status === 'accepting' ? 1 : 0,
        resultPendingCount: status === 'resultPending' ? 1 : 0,
        endedCount: status === 'ended' ? 1 : 0,
        unknownCount: status === 'unknown' ? 1 : 0,
      });
    }
  }

  return map;
}
