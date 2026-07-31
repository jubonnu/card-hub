import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GUEST_NAMESPACE, useNamespaceStore } from '@/lib/accountNamespace';
import { processQueue } from '@/lib/offlineQueue';
import { saveRefreshToken } from '@/lib/secureStore';
import { useAuthStore } from '@/stores/authStore';
import { useChecklistStore } from '@/stores/checklistStore';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function signInAsUserA() {
  useNamespaceStore.setState({ namespace: 'userA', isSwitching: false });
  useAuthStore.setState({ status: 'signedIn', sessionAvailability: 'online', user: null, accessToken: 'at', accessTokenExpiresAt: Date.now() + 10 * 60_000 });
}

describe('checklistStore', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    useChecklistStore.setState({ groups: {} });
    useOfflineQueueStore.getState().clear();
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useAuthStore.setState({ status: 'signedOut', sessionAvailability: 'expired', user: null, accessToken: null, accessTokenExpiresAt: null });
    await saveRefreshToken('rt-1', 'device-1');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('guestではtoggleStepしてもキューへenqueueしない', () => {
    useChecklistStore.getState().ensureInitialized('1');
    global.fetch = vi.fn();

    useChecklistStore.getState().toggleStep('1', 'default-0');

    expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
  });

  it('signedIn状態でtoggleStepすると成功でserverVersionが反映される', async () => {
    signInAsUserA();
    useChecklistStore.getState().ensureInitialized('1');
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        results: [
          { stepId: 'default-0', ok: true, label: '応募条件を確認', done: true, completedAt: '2026-01-01T00:00:00.000Z', completedNote: null, sortOrder: 0, serverVersion: 1, clientActionAt: null, isDefault: true },
        ],
      })
    );

    useChecklistStore.getState().toggleStep('1', 'default-0');
    expect(useOfflineQueueStore.getState().operations).toHaveLength(1);

    await processQueue();

    expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
    const step = useChecklistStore.getState().getSteps('1').find((s) => s.id === 'default-0');
    expect(step?.serverVersion).toBe(1);
    expect(step?.done).toBe(true);
  });

  it('results[].ok===falseはHTTP200でもconflictとしてキューに残る', async () => {
    signInAsUserA();
    useChecklistStore.getState().ensureInitialized('1');
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        results: [{ stepId: 'default-0', ok: false, error: { code: 'VERSION_CONFLICT', message: '競合しています' } }],
      })
    );

    useChecklistStore.getState().toggleStep('1', 'default-0');
    await processQueue();

    const [op] = useOfflineQueueStore.getState().operations;
    expect(op.status).toBe('conflict');
    expect(op.lastError).toBe('競合しています');
  });
});
