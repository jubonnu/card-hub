import { describe, expect, it } from 'vitest';

import { isCorrectionTransition, isValidLotteryStatusTransition, nextLotteryStatusOptions } from './lotteryStatusTransitions';

describe('lotteryStatusTransitions', () => {
  it('unknownからは任意の状態へ遷移可能', () => {
    for (const to of ['planned', 'applied', 'won', 'lost', 'purchased', 'skipped'] as const) {
      expect(isValidLotteryStatusTransition('unknown', to)).toBe(true);
    }
  });

  it('同一状態への遷移は常に許可する', () => {
    expect(isValidLotteryStatusTransition('applied', 'applied')).toBe(true);
    expect(isValidLotteryStatusTransition('lost', 'lost')).toBe(true);
  });

  it('lostからappliedへの訂正遷移のみ許可される', () => {
    expect(nextLotteryStatusOptions('lost')).toEqual(['applied']);
    expect(isValidLotteryStatusTransition('lost', 'applied')).toBe(true);
    expect(isCorrectionTransition('lost', 'applied')).toBe(true);
  });

  it('wonからはpurchased/skippedのみ許可される', () => {
    expect(nextLotteryStatusOptions('won')).toEqual(['purchased', 'skipped']);
    expect(isValidLotteryStatusTransition('won', 'lost')).toBe(false);
  });

  it('purchasedからwonへの訂正遷移のみ許可される', () => {
    expect(nextLotteryStatusOptions('purchased')).toEqual(['won']);
    expect(isCorrectionTransition('purchased', 'won')).toBe(true);
  });

  it('skippedからplannedへの取り消しが許可される', () => {
    expect(isValidLotteryStatusTransition('skipped', 'planned')).toBe(true);
    expect(nextLotteryStatusOptions('skipped')).toEqual(['planned']);
  });

  it('isCorrectionTransitionはpurchased→won・lost→applied以外はfalse', () => {
    expect(isCorrectionTransition('unknown', 'planned')).toBe(false);
    expect(isCorrectionTransition('won', 'purchased')).toBe(false);
  });
});
