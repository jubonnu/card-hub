import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { defaultNotificationSettings } from '@/data/mockData';
import { createAccountScopedStorage, isNamespaceSwitching, isSyncEligible, registerAccountScopedStore } from '@/lib/accountNamespace';
import { generateClientRequestId } from '@/lib/clientRequestId';
import { enqueueOperation } from '@/lib/offlineQueue';
import { registerQueueResultHandler } from '@/lib/offlineQueueResultRouter';
import { putNotificationPreferencesResponseSchema } from '@/schemas/syncApi';
import type { NotificationToggleSettings } from '@/types/models';

export type BooleanSettingKey = {
  [K in keyof NotificationToggleSettings]: NotificationToggleSettings[K] extends boolean ? K : never;
}[keyof NotificationToggleSettings];

export type HoursSettingKey = {
  [K in keyof NotificationToggleSettings]: NotificationToggleSettings[K] extends number ? K : never;
}[keyof NotificationToggleSettings];

const NOTIFICATION_QUEUE_RESOURCE_KEY = 'global';

interface NotificationSettingsState extends NotificationToggleSettings {
  /** サーバーの`serverVersion`（未同期・ゲスト時は0）。全項目リプレースPUTのCASに使う。 */
  serverVersion: number;
  setToggle: (key: BooleanSettingKey, value: boolean) => void;
  setHours: (key: HoursSettingKey, value: number) => void;
  /** bootstrap・差分同期からサーバーの正規状態を反映する（G3-3）。 */
  applyServerState: (state: NotificationToggleSettings & { serverVersion: number }) => void;
  applyMutationResult: (serverVersion: number) => void;
  resetToDefaults: () => void;
}

const DEFAULT_STATE = { ...defaultNotificationSettings, serverVersion: 0 };

function enqueuePut(state: NotificationSettingsState): void {
  if (!isSyncEligible()) return;
  const clientRequestId = generateClientRequestId();
  enqueueOperation({
    id: clientRequestId,
    kind: 'notificationPreferences.put',
    resourceKey: NOTIFICATION_QUEUE_RESOURCE_KEY,
    path: '/me/notification-preferences',
    method: 'PUT',
    payload: {
      deadlineReminder: state.deadlineReminder,
      announcementReminder: state.announcementReminder,
      purchaseReminder: state.purchaseReminder,
      newLotteryAlert: state.newLotteryAlert,
      favoriteUpdateAlert: state.favoriteUpdateAlert,
      pushEnabled: state.pushEnabled,
      emailEnabled: state.emailEnabled,
      quietHoursEnabled: state.quietHoursEnabled,
      quietHoursStart: state.quietHoursStart,
      quietHoursEnd: state.quietHoursEnd,
      deadlineReminderHoursBefore: state.deadlineReminderHoursBefore,
      announcementReminderHoursBefore: state.announcementReminderHoursBefore,
      purchaseReminderHoursBefore: state.purchaseReminderHoursBefore,
      expectedServerVersion: state.serverVersion,
      clientRequestId,
    },
  });
}

/**
 * サーバー同期（G3-4）: `PUT /me/notification-preferences`は全13項目のフルリプレースのため、
 * 1項目変更するだけでも常に全フィールドを送る。`expectedServerVersion`は直近の
 * `serverVersion`を使う（差分同期・キュー成功応答で更新される。10章の通り自動マージはしない
 * — 他端末で先に変更されていれば`VERSION_CONFLICT`となり16章の競合UIへ回る）。
 */
export const useNotificationSettingsStore = create<NotificationSettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,
      setToggle: (key, value) => {
        if (isNamespaceSwitching()) return;
        set({ [key]: value } as Partial<NotificationSettingsState>);
        enqueuePut(get());
      },
      setHours: (key, value) => {
        if (isNamespaceSwitching()) return;
        set({ [key]: value } as Partial<NotificationSettingsState>);
        enqueuePut(get());
      },
      applyServerState: (state) => set(state),
      applyMutationResult: (serverVersion) => set({ serverVersion }),
      resetToDefaults: () => set(DEFAULT_STATE),
    }),
    {
      name: 'notification-settings',
      storage: createJSONStorage(() => createAccountScopedStorage('notification-settings')),
    }
  )
);

registerAccountScopedStore({
  baseName: 'notification-settings',
  resetToDefaults: () => useNotificationSettingsStore.getState().resetToDefaults(),
  rehydrate: () => Promise.resolve(useNotificationSettingsStore.persist.rehydrate()),
});

registerQueueResultHandler('notificationPreferences.put', (_op, response) => {
  const parsed = putNotificationPreferencesResponseSchema.safeParse(response);
  if (!parsed.success) return;
  useNotificationSettingsStore.getState().applyMutationResult(parsed.data.serverVersion);
});
