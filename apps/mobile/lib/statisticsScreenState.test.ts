import { describe, expect, it } from 'vitest';

import { deriveStatisticsScreenState, type StatisticsScreenStateInput } from '@/lib/statisticsScreenState';

const base: StatisticsScreenStateInput = {
  authStatus: 'signedIn',
  isPremium: true,
  loading: false,
  error: false,
  savedCount: 3,
};

describe('deriveStatisticsScreenState', () => {
  it('未サインインならsignedOut', () => {
    expect(deriveStatisticsScreenState({ ...base, authStatus: 'signedOut' })).toBe('signedOut');
  });

  it('未サインインが最優先（premium判定より先）', () => {
    expect(deriveStatisticsScreenState({ ...base, authStatus: 'signedOut', isPremium: true })).toBe('signedOut');
  });

  it('サインイン済みでも未premiumはnotPremium', () => {
    expect(deriveStatisticsScreenState({ ...base, isPremium: false })).toBe('notPremium');
  });

  it('premium済みでloading中はloading', () => {
    expect(deriveStatisticsScreenState({ ...base, loading: true })).toBe('loading');
  });

  it('premium済みでエラー時はerror', () => {
    expect(deriveStatisticsScreenState({ ...base, error: true })).toBe('error');
  });

  it('loadingがerrorより優先される', () => {
    expect(deriveStatisticsScreenState({ ...base, loading: true, error: true })).toBe('loading');
  });

  it('premium済み・取得成功・保存0件はempty', () => {
    expect(deriveStatisticsScreenState({ ...base, savedCount: 0 })).toBe('empty');
  });

  it('premium済み・取得成功・保存1件以上はready', () => {
    expect(deriveStatisticsScreenState(base)).toBe('ready');
  });
});
