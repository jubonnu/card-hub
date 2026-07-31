import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GUEST_NAMESPACE, useNamespaceStore } from '@/lib/accountNamespace';
import { defaultNotificationSettings } from '@/data/mockData';
import { processQueue } from '@/lib/offlineQueue';
import { saveRefreshToken } from '@/lib/secureStore';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationSettingsStore } from '@/stores/notificationSettingsStore';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('notificationSettingsStore', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    useNotificationSettingsStore.setState({ ...defaultNotificationSettings, serverVersion: 0 });
    useOfflineQueueStore.getState().clear();
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useAuthStore.setState({ status: 'signedOut', sessionAvailability: 'expired', user: null, accessToken: null, accessTokenExpiresAt: null });
    await saveRefreshToken('rt-1', 'device-1');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('guestではsetToggleしてもキューへenqueueしない', () => {
    global.fetch = vi.fn();
    useNotificationSettingsStore.getState().setToggle('pushEnabled', false);
    expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
  });

  it('signedInでsetToggleすると全13項目を送り、成功でserverVersionが更新される', async () => {
    useNamespaceStore.setState({ namespace: 'userA', isSwitching: false });
    useAuthStore.setState({ status: 'signedIn', sessionAvailability: 'online', user: null, accessToken: 'at', accessTokenExpiresAt: Date.now() + 10 * 60_000 });
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ...defaultNotificationSettings, pushEnabled: false, serverVersion: 1, outcome: 'created' }));

    useNotificationSettingsStore.getState().setToggle('pushEnabled', false);
    const [op] = useOfflineQueueStore.getState().operations;
    expect(JSON.parse(JSON.stringify(op.payload))).toMatchObject({ pushEnabled: false, deadlineReminder: true, expectedServerVersion: 0 });

    await processQueue();

    expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
    expect(useNotificationSettingsStore.getState().serverVersion).toBe(1);
  });

  it('VERSION_CONFLICTはconflictとしてキューに残る（自動マージしない）', async () => {
    useNamespaceStore.setState({ namespace: 'userA', isSwitching: false });
    useAuthStore.setState({ status: 'signedIn', sessionAvailability: 'online', user: null, accessToken: 'at', accessTokenExpiresAt: Date.now() + 10 * 60_000 });
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(409, { error: { code: 'VERSION_CONFLICT', message: '他端末で変更されています', requestId: 'r1' }, current: { ...defaultNotificationSettings, serverVersion: 5 } })
    );

    useNotificationSettingsStore.getState().setToggle('pushEnabled', false);
    await processQueue();

    expect(useOfflineQueueStore.getState().operations[0].status).toBe('conflict');
    // 自動マージしない: ローカルのpushEnabledはユーザー操作通りfalseのまま維持される。
    expect(useNotificationSettingsStore.getState().pushEnabled).toBe(false);
  });
});
