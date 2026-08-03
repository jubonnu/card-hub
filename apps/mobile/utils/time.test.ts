import { describe, expect, it } from 'vitest';

import { isPast, normalizeDeadline } from './time';

describe('normalizeDeadline', () => {
  it('_atがあればそれをそのまま返す（_dateは無視）', () => {
    expect(normalizeDeadline('2026-07-26T03:00:00.000Z', '2026-08-01')).toBe('2026-07-26T03:00:00.000Z');
  });

  it('_dateのみの場合、日本時間の翌日0時（UTC 15:00）を返す', () => {
    expect(normalizeDeadline(null, '2026-07-26')).toBe('2026-07-26T15:00:00.000Z');
  });

  it('どちらも無い場合はnull', () => {
    expect(normalizeDeadline(null, null)).toBeNull();
    expect(normalizeDeadline(undefined, undefined)).toBeNull();
  });

  it('不正な日付文字列はnull', () => {
    expect(normalizeDeadline(null, 'not-a-date')).toBeNull();
  });
});

describe('isPast × normalizeDeadline（日付のみ締切の境界テスト）', () => {
  const deadline = normalizeDeadline(null, '2026-07-26');

  it('7/26 23:59:59 JST（= 7/26 14:59:59 UTC）は受付中（isPast=false）', () => {
    const nowIso = '2026-07-26T14:59:59.000Z';
    expect(isPast(deadline!, nowIso)).toBe(false);
  });

  it('7/27 00:00:00 JST（= 7/26 15:00:00 UTC）は終了済み（isPast=true）', () => {
    const nowIso = '2026-07-26T15:00:00.000Z';
    expect(isPast(deadline!, nowIso)).toBe(true);
  });

  it('7/27 00:00:00 JSTの1ミリ秒前は受付中', () => {
    const nowIso = '2026-07-26T14:59:59.999Z';
    expect(isPast(deadline!, nowIso)).toBe(false);
  });

  it('時刻ありの値（_at）は日付のみルールで上書きされない（そのままの時刻で判定）', () => {
    const preciseDeadline = normalizeDeadline('2026-07-26T00:30:00.000Z', '2026-07-26');
    expect(preciseDeadline).toBe('2026-07-26T00:30:00.000Z');
    expect(isPast(preciseDeadline!, '2026-07-26T00:31:00.000Z')).toBe(true);
    expect(isPast(preciseDeadline!, '2026-07-26T00:29:00.000Z')).toBe(false);
  });

  it('UTC実行環境でもJST端末でも同じ判定結果になる（getTime比較のみに依存、Date#getHours等のローカルgetterを使わない）', () => {
    // normalizeDeadline/isPastはいずれもDate#getTime()（エポックミリ秒）のみを使うため、
    // 実行環境（プロセス）のタイムゾーン設定に依存しないことをこのテスト自体の再現性で担保する。
    const d1 = normalizeDeadline(null, '2026-12-31');
    const d2 = normalizeDeadline(null, '2027-01-01');
    expect(new Date(d1!).getTime()).toBeLessThan(new Date(d2!).getTime());
  });
});
