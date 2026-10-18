import { describe, expect, it } from 'vitest';

import { interleaveAds } from './interleaveAds';

describe('interleaveAds', () => {
  it('件数がadInterval未満なら広告を挟まない', () => {
    const result = interleaveAds([1, 2, 3], 8);
    expect(result).toEqual([
      { kind: 'item', data: 1 },
      { kind: 'item', data: 2 },
      { kind: 'item', data: 3 },
    ]);
  });

  it('adInterval件ごとに1件広告を挟む', () => {
    const result = interleaveAds([1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
    expect(result.map((e) => (e.kind === 'ad' ? 'ad' : e.data))).toEqual([1, 2, 3, 4, 'ad', 5, 6, 7, 8, 'ad', 9]);
  });

  it('adInterval件ちょうどの末尾でも広告を挟む', () => {
    const result = interleaveAds([1, 2, 3, 4], 4);
    expect(result.map((e) => (e.kind === 'ad' ? 'ad' : e.data))).toEqual([1, 2, 3, 4, 'ad']);
  });

  it('広告のkeyは一意になる', () => {
    const result = interleaveAds(Array.from({ length: 16 }, (_, i) => i), 4);
    const adKeys = result.filter((e) => e.kind === 'ad').map((e) => (e as { key: string }).key);
    expect(adKeys).toEqual(['ad-1', 'ad-2', 'ad-3', 'ad-4']);
  });

  it('adInterval<=0なら広告を挟まない', () => {
    const result = interleaveAds([1, 2, 3], 0);
    expect(result.every((e) => e.kind === 'item')).toBe(true);
  });

  it('空配列を渡すと空配列を返す', () => {
    expect(interleaveAds([], 4)).toEqual([]);
  });
});
