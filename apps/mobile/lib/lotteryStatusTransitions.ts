import type { LotteryStatusApi } from '@/schemas/syncApi';

/**
 * 個人ステータス（応募予定/応募済み/当選/落選/購入済み/見送り）の遷移ホワイトリスト（Mobile-G6）。
 * サーバー側`x-post-fetcher/apps/worker/src/services/lotteryStatusTransitions.ts`の
 * `TRANSITIONS`と**同一内容を維持すること**（最終的な検証はサーバーが行うが、UIの選択肢を
 * 絞るためにここでも同じ定義を持つ）。どちらか一方だけを変更しないこと。
 */
const TRANSITIONS: Record<LotteryStatusApi, readonly LotteryStatusApi[]> = {
  unknown: ['planned', 'applied', 'won', 'lost', 'purchased', 'skipped'],
  planned: ['applied', 'skipped'],
  applied: ['won', 'lost'],
  won: ['purchased', 'skipped'],
  lost: [],
  purchased: ['won'],
  skipped: ['planned'],
};

/** 同一状態への「遷移」は常に許可する（no-op）。 */
export function isValidLotteryStatusTransition(from: LotteryStatusApi, to: LotteryStatusApi): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

/** UIの選択肢生成用。現在ステータスから遷移可能な次ステータス一覧（現在値自身は含まない）。 */
export function nextLotteryStatusOptions(from: LotteryStatusApi): readonly LotteryStatusApi[] {
  return TRANSITIONS[from];
}

/** 訂正操作として扱い、追加の確認ダイアログを必須にする遷移（10.2節）。 */
export function isCorrectionTransition(from: LotteryStatusApi, to: LotteryStatusApi): boolean {
  return from === 'purchased' && to === 'won';
}
