import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Notifications from 'expo-notifications';

import { defaultNotificationSettings } from '@/data/mockData';
import { scheduleApiLotteryReminders } from '@/lib/notifications';
import type { LotteryRecord } from '@/schemas/lotteryApi';
import type { NotificationToggleSettings } from '@/types/models';

function makeRecord(overrides: Partial<LotteryRecord> & { id: number }): LotteryRecord {
  return {
    sourcePostId: null,
    productNameRaw: `商品${overrides.id}`,
    normalizedProductName: null,
    cardType: null,
    storeNameRaw: null,
    normalizedStoreName: null,
    storeBranchRaw: null,
    normalizedStoreBranch: null,
    region: null,
    normalizerVersion: null,
    applicationStartAt: null,
    confirmedOpenAt: null,
    applicationEndAt: null,
    applicationEndDate: null,
    applicationEndPrecision: null,
    resultAnnouncementAt: null,
    resultAnnouncementDate: null,
    resultAnnouncementPrecision: null,
    purchaseStartAt: null,
    purchaseDeadlineAt: null,
    applicationUrl: null,
    resolvedApplicationUrl: null,
    applicationUrlHttpStatus: null,
    urlResolvedAt: null,
    officialInformationUrl: null,
    appDownloadUrl: null,
    applicationMethod: null,
    eligibilityConditions: null,
    pickupMethod: null,
    paymentMethod: null,
    price: null,
    status: null,
    completenessScore: null,
    verificationStatus: null,
    approvedBy: null,
    approvedAt: null,
    rejectedReason: null,
    rejectedAt: null,
    lifecycleStatus: 'active',
    orphanedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('scheduleApiLotteryReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T01:00:00.000Z'));
  });

  it('マスターOFF（pushEnabled=false）では新規通知を作らないが、既存分はキャンセルする', async () => {
    const record = makeRecord({
      id: 1,
      applicationEndAt: '2026-08-15T00:00:00.000Z',
      resultAnnouncementAt: '2026-08-20T00:00:00.000Z',
      purchaseDeadlineAt: '2026-08-25T00:00:00.000Z',
    });
    const settings: NotificationToggleSettings = { ...defaultNotificationSettings, pushEnabled: false };

    await scheduleApiLotteryReminders(record, settings);

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('cardhub-1-deadline');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('cardhub-1-announcement');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('cardhub-1-purchase');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('マスターONでは通常通り締切リマインドがスケジュールされる', async () => {
    const record = makeRecord({ id: 2, applicationEndAt: '2026-08-15T00:00:00.000Z' });
    const settings: NotificationToggleSettings = {
      ...defaultNotificationSettings,
      pushEnabled: true,
      quietHoursEnabled: false,
      deadlineReminder: true,
      deadlineReminderHoursBefore: 3,
    };

    await scheduleApiLotteryReminders(record, settings);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'cardhub-2-deadline',
        trigger: expect.objectContaining({ date: new Date('2026-08-14T21:00:00.000Z') }),
      })
    );
  });

  it('おやすみ時間内に入る締切リマインドは、おやすみ終了時刻まで繰り下げてスケジュールされる', async () => {
    // JST 2026-08-15 00:00が締切。3時間前=JST 08-14 21:00が本来のトリガー時刻で、
    // おやすみ20:00〜22:00の範囲内 → 22:00まで繰り下げられるはず（境界値の厳密な検証は
    // lib/quietHours.test.tsで実施済みのため、ここではnotifications.ts側の配線のみ確認する）。
    const record = makeRecord({ id: 3, applicationEndAt: '2026-08-15T00:00:00+09:00' });
    const settings: NotificationToggleSettings = {
      ...defaultNotificationSettings,
      pushEnabled: true,
      quietHoursEnabled: true,
      quietHoursStart: '20:00',
      quietHoursEnd: '22:00',
      deadlineReminder: true,
      deadlineReminderHoursBefore: 3,
    };

    await scheduleApiLotteryReminders(record, settings);

    const call = vi.mocked(Notifications.scheduleNotificationAsync).mock.calls.find(
      ([arg]) => arg.identifier === 'cardhub-3-deadline'
    );
    expect(call).toBeDefined();
    const scheduledDate = (call?.[0].trigger as { date: Date }).date;
    expect(scheduledDate.getTime()).toBe(new Date(2026, 7, 14, 22, 0, 0, 0).getTime());
  });

  it('締切・発表日・購入期限が無ければ何もスケジュールしない', async () => {
    const record = makeRecord({ id: 4 });
    const settings: NotificationToggleSettings = { ...defaultNotificationSettings, pushEnabled: true };

    await scheduleApiLotteryReminders(record, settings);

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
