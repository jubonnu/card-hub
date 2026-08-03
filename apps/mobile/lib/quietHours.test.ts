import { describe, expect, it } from 'vitest';

import { adjustTriggerForQuietHours, normalizeHHMM } from './quietHours';

// 2026-08-10は月曜（JST）。テストは実行環境のローカルタイムゾーンに依存するため、
// 時刻はすべて同一ローカル日付内で組み立てる（vitest.config.tsにTZ固定は無いが、
// 開発機はAsia/Tokyo運用のため、他のutils/time.test.tsと同じ前提を踏襲する）。
function localDate(y: number, m: number, d: number, h: number, min: number): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

describe('adjustTriggerForQuietHours', () => {
  const deadline = localDate(2026, 8, 12, 12, 0); // 2日後の正午
  const now = localDate(2026, 8, 9, 12, 0); // 全triggerケースより前の時刻

  it('おやすみモード無効なら調整しない', () => {
    const trigger = localDate(2026, 8, 10, 23, 30);
    const result = adjustTriggerForQuietHours(trigger, deadline, now, { enabled: false, start: '22:00', end: '07:00' });
    expect(result).toEqual({ skip: false, triggerMs: trigger });
  });

  it('start/endが無い場合は調整しない', () => {
    const trigger = localDate(2026, 8, 10, 23, 30);
    expect(adjustTriggerForQuietHours(trigger, deadline, now, { enabled: true, start: null, end: '07:00' })).toEqual({
      skip: false,
      triggerMs: trigger,
    });
  });

  it('開始・終了が同じ場合は範囲なし扱いで調整しない', () => {
    const trigger = localDate(2026, 8, 10, 23, 0);
    const result = adjustTriggerForQuietHours(trigger, deadline, now, { enabled: true, start: '23:00', end: '23:00' });
    expect(result).toEqual({ skip: false, triggerMs: trigger });
  });

  it('同日内の範囲（01:00〜05:00）で、範囲内なら終了時刻へ繰り下げる', () => {
    const trigger = localDate(2026, 8, 10, 3, 0);
    const result = adjustTriggerForQuietHours(trigger, deadline, now, { enabled: true, start: '01:00', end: '05:00' });
    expect(result).toEqual({ skip: false, triggerMs: localDate(2026, 8, 10, 5, 0) });
  });

  it('同日内の範囲で、範囲外なら調整しない', () => {
    const trigger = localDate(2026, 8, 10, 10, 30);
    const result = adjustTriggerForQuietHours(trigger, deadline, now, { enabled: true, start: '01:00', end: '05:00' });
    expect(result).toEqual({ skip: false, triggerMs: trigger });
  });

  describe('日またぎ（22:00〜07:00）の境界', () => {
    const settings = { enabled: true, start: '22:00', end: '07:00' };

    it('22:00ちょうど（開始）は範囲内 → 07:00まで繰り下げ', () => {
      const trigger = localDate(2026, 8, 10, 22, 0);
      const result = adjustTriggerForQuietHours(trigger, deadline, now, settings);
      expect(result).toEqual({ skip: false, triggerMs: localDate(2026, 8, 11, 7, 0) });
    });

    it('06:59は範囲内 → 07:00まで繰り下げ', () => {
      const trigger = localDate(2026, 8, 11, 6, 59);
      const result = adjustTriggerForQuietHours(trigger, deadline, now, settings);
      expect(result).toEqual({ skip: false, triggerMs: localDate(2026, 8, 11, 7, 0) });
    });

    it('07:00ちょうど（終了）は範囲外 → 調整しない', () => {
      const trigger = localDate(2026, 8, 11, 7, 0);
      const result = adjustTriggerForQuietHours(trigger, deadline, now, settings);
      expect(result).toEqual({ skip: false, triggerMs: trigger });
    });

    it('23:30（前日開始・翌日終了区間）も繰り下げられる', () => {
      const trigger = localDate(2026, 8, 10, 23, 30);
      const result = adjustTriggerForQuietHours(trigger, deadline, now, settings);
      expect(result).toEqual({ skip: false, triggerMs: localDate(2026, 8, 11, 7, 0) });
    });
  });

  it('繰り下げ先が締切以降になる場合、おやすみ開始1分前へ繰り上げる', () => {
    const tightDeadline = localDate(2026, 8, 10, 23, 30); // 07:00繰り下げでは間に合わない
    const trigger = localDate(2026, 8, 10, 22, 30);
    const result = adjustTriggerForQuietHours(trigger, tightDeadline, now, { enabled: true, start: '22:00', end: '07:00' });
    expect(result).toEqual({ skip: false, triggerMs: localDate(2026, 8, 10, 21, 59) });
  });

  it('繰り下げ先がすでに過去なら採用しない（繰り上げ側で判定される）', () => {
    // 終了時刻(07:00)がnow(10:00)より前 → 繰り下げ候補は不採用、繰り上げ候補で判定
    const trigger = localDate(2026, 8, 10, 6, 0);
    const lateNow = localDate(2026, 8, 10, 10, 0);
    const farDeadline = localDate(2026, 8, 15, 0, 0);
    const result = adjustTriggerForQuietHours(trigger, farDeadline, lateNow, { enabled: true, start: '01:00', end: '07:00' });
    // 繰り上げ先(00:59)もlateNowより前のため、どちらも採用できずスキップになる
    expect(result).toEqual({ skip: true, reason: 'quiet_hours_no_available_slot' });
  });

  it('調整先が締切と同時刻ならスキップ（繰り下げ候補=deadlineで不採用、繰り上げ候補もnowを過ぎていて不採用）', () => {
    const trigger = localDate(2026, 8, 10, 23, 0);
    const closeToWindowNow = localDate(2026, 8, 10, 22, 30); // 繰り上げ先(21:59)より後 → 繰り上げは不採用
    const exactDeadline = localDate(2026, 8, 11, 7, 0); // ちょうど繰り下げ候補（おやすみ終了時刻）と同時刻
    const result = adjustTriggerForQuietHours(trigger, exactDeadline, closeToWindowNow, {
      enabled: true,
      start: '22:00',
      end: '07:00',
    });
    expect(result).toEqual({ skip: true, reason: 'quiet_hours_no_available_slot' });
  });
});

describe('normalizeHHMM', () => {
  it('ゼロ埋めされていない入力を正規化する', () => {
    expect(normalizeHHMM('9:5')).toBe('09:05');
  });

  it('既に正規化済みの値はそのまま', () => {
    expect(normalizeHHMM('23:00')).toBe('23:00');
  });

  it('時が範囲外なら不正値としてnull', () => {
    expect(normalizeHHMM('24:00')).toBeNull();
  });

  it('分が範囲外なら不正値としてnull', () => {
    expect(normalizeHHMM('10:60')).toBeNull();
  });

  it('形式自体が不正ならnull', () => {
    expect(normalizeHHMM('not-a-time')).toBeNull();
  });
});
