import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GUEST_NAMESPACE, useNamespaceStore } from '@/lib/accountNamespace';
import { runDifferentialSync } from '@/lib/differentialSync';
import { saveRefreshToken } from '@/lib/secureStore';
import { defaultNotificationSettings } from '@/data/mockData';
import { useAuthStore } from '@/stores/authStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useMyLotteriesStore } from '@/stores/myLotteriesStore';
import { useNotificationSettingsStore } from '@/stores/notificationSettingsStore';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';
import type { LotteryRecord } from '@/schemas/lotteryApi';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const record: LotteryRecord = {
  id: 1,
  sourcePostId: null,
  productNameRaw: null,
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
};

function byPath(map: Record<string, unknown>) {
  return vi.fn().mockImplementation(async (url: string) => {
    const path = new URL(url).pathname;
    const body = map[path];
    return jsonResponse(200, body ?? { items: [], total: 0, limit: 100, offset: 0 });
  });
}

describe('differentialSync', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    useMyLotteriesStore.setState({ saved: [{ record, savedAt: '2026-01-01T00:00:00.000Z', status: 'unknown' }] });
    useFavoritesStore.setState({ favoriteLotteryIds: [], followedProductKeys: [], followedProductIds: [] });
    useNotificationSettingsStore.setState({ ...defaultNotificationSettings, serverVersion: 0 });
    useOfflineQueueStore.getState().clear();
    useNamespaceStore.setState({ namespace: 'userA', isSwitching: false, generation: 0 });
    useAuthStore.setState({
      status: 'signedIn',
      sessionAvailability: 'online',
      user: null,
      accessToken: 'at-valid',
      accessTokenExpiresAt: Date.now() + 10 * 60_000,
    });
    await saveRefreshToken('rt-1', 'device-1');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('guest namespaceでは何もしない', async () => {
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await runDifferentialSync();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('サーバーのserverVersionをローカルへ反映する', async () => {
    global.fetch = byPath({
      '/me/lotteries': { items: [{ lotteryId: 1, status: 'applied', snapshotUpdatedAt: null, savedAt: '2026-01-02T00:00:00.000Z', serverVersion: 5, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }], total: 1, limit: 100, offset: 0 },
      '/me/notification-preferences': { ...defaultNotificationSettings, serverVersion: 2 },
    });

    await runDifferentialSync();

    expect(useMyLotteriesStore.getState().getSaved(1)?.serverVersion).toBe(5);
    expect(useNotificationSettingsStore.getState().serverVersion).toBe(2);
  });

  it('未送信のオフラインキュー操作がある行はサーバー結果で上書きしない', async () => {
    useOfflineQueueStore.getState().enqueue({
      id: 'op-1',
      kind: 'lottery.delete',
      resourceKey: '1',
      path: '/me/lotteries/1',
      method: 'DELETE',
      payload: { clientRequestId: 'op-1' },
      createdAt: new Date().toISOString(),
    });
    // ローカルでは既に削除済み（optimistic）。
    useMyLotteriesStore.setState({ saved: [] });
    global.fetch = byPath({
      '/me/lotteries': { items: [{ lotteryId: 1, status: 'applied', snapshotUpdatedAt: null, savedAt: '2026-01-01T00:00:00.000Z', serverVersion: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }], total: 1, limit: 100, offset: 0 },
    });

    await runDifferentialSync();

    // サーバーはまだ削除を認識していない（未送信）が、ローカルの削除意図を復活させない。
    expect(useMyLotteriesStore.getState().getSaved(1)).toBeUndefined();
  });

  it('namespace切替をまたいで解決した結果は破棄する', async () => {
    let resolveFetch!: (value: Response) => void;
    global.fetch = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })
    );

    const promise = runDifferentialSync();
    useNamespaceStore.setState((s) => ({ generation: s.generation + 1 }));
    resolveFetch(jsonResponse(200, { items: [{ lotteryId: 1, status: 'applied', snapshotUpdatedAt: null, savedAt: '2026-01-01T00:00:00.000Z', serverVersion: 99, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }], total: 1, limit: 100, offset: 0 }));
    await promise;

    expect(useMyLotteriesStore.getState().getSaved(1)?.serverVersion).not.toBe(99);
  });

  it('多重呼び出しは1本化され、同時に2回フェッチしない', async () => {
    let resolveLotteries!: (value: Response) => void;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const path = new URL(url).pathname;
      if (path === '/me/lotteries') {
        return new Promise<Response>((resolve) => {
          resolveLotteries = resolve;
        });
      }
      return Promise.resolve(jsonResponse(200, { items: [], total: 0, limit: 100, offset: 0 }));
    });
    global.fetch = fetchMock;

    const first = runDifferentialSync();
    const second = runDifferentialSync();
    const lotteriesCallCount = fetchMock.mock.calls.filter(([url]) => new URL(url as string).pathname === '/me/lotteries').length;
    expect(lotteriesCallCount).toBe(1);

    resolveLotteries(jsonResponse(200, { items: [], total: 0, limit: 100, offset: 0 }));
    await Promise.all([first, second]);

    const finalCallCount = fetchMock.mock.calls.filter(([url]) => new URL(url as string).pathname === '/me/lotteries').length;
    expect(finalCallCount).toBe(1);
  });
});
