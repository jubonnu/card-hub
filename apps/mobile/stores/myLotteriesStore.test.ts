import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GUEST_NAMESPACE, useNamespaceStore } from '@/lib/accountNamespace';
import { processQueue } from '@/lib/offlineQueue';
import { saveRefreshToken } from '@/lib/secureStore';
import { useAuthStore } from '@/stores/authStore';
import { useMyLotteriesStore } from '@/stores/myLotteriesStore';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';
import type { LotteryRecord } from '@/schemas/lotteryApi';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const record: LotteryRecord = {
  id: 1,
  sourcePostId: null,
  productNameRaw: 'テストカード',
  normalizedProductName: 'テストカード',
  cardType: 'pokemon',
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

describe('myLotteriesStore', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    useMyLotteriesStore.setState({ saved: [] });
    useOfflineQueueStore.getState().clear();
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useAuthStore.setState({ status: 'signedOut', sessionAvailability: 'expired', user: null, accessToken: null, accessTokenExpiresAt: null });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('guest namespaceでは保存してもキューへenqueueしない', () => {
    global.fetch = vi.fn();
    useMyLotteriesStore.getState().saveLottery(record);

    expect(useMyLotteriesStore.getState().saved).toHaveLength(1);
    expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
  });

  it('signedIn状態で保存するとlottery.putがキューへ積まれ、成功でserverVersionが反映される', async () => {
    useNamespaceStore.setState({ namespace: 'userA', isSwitching: false });
    useAuthStore.setState({
      status: 'signedIn',
      sessionAvailability: 'online',
      user: null,
      accessToken: 'at-valid',
      accessTokenExpiresAt: Date.now() + 10 * 60_000,
    });
    await saveRefreshToken('rt-1', 'device-1');
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        lotteryId: 1,
        status: 'unknown',
        snapshotUpdatedAt: null,
        savedAt: '2026-01-01T00:00:00.000Z',
        serverVersion: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        outcome: 'created',
      })
    );

    useMyLotteriesStore.getState().saveLottery(record);
    expect(useOfflineQueueStore.getState().operations).toHaveLength(1);
    expect(useOfflineQueueStore.getState().operations[0].path).toBe('/me/lotteries/1');

    await processQueue();

    expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
    expect(useMyLotteriesStore.getState().getSaved(1)?.serverVersion).toBe(1);
  });

  it('removeLotteryはexpectedServerVersionを付けずにDELETEをenqueueする', () => {
    useNamespaceStore.setState({ namespace: 'userA', isSwitching: false });
    useAuthStore.setState({ status: 'signedIn', sessionAvailability: 'online', user: null, accessToken: 'at', accessTokenExpiresAt: Date.now() + 10_000 });
    useMyLotteriesStore.setState({ saved: [{ record, savedAt: '2026-01-01T00:00:00.000Z', status: 'unknown' }] });

    useMyLotteriesStore.getState().removeLottery(1);

    expect(useMyLotteriesStore.getState().saved).toHaveLength(0);
    const [op] = useOfflineQueueStore.getState().operations;
    expect(op.method).toBe('DELETE');
    expect(op.payload).not.toHaveProperty('expectedServerVersion');
  });

  it('applyServerStateはローカルに無いlotteryIdをGET /lotteries/:idで補完する', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, lottery: record, sources: [], fieldHistory: [] }));

    await useMyLotteriesStore.getState().applyServerState([
      { lotteryId: 1, status: 'applied', snapshotUpdatedAt: null, savedAt: '2026-01-01T00:00:00.000Z', serverVersion: 3, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const saved = useMyLotteriesStore.getState().getSaved(1);
    expect(saved?.serverVersion).toBe(3);
    expect(saved?.record.id).toBe(1);
  });

  it('applyServerStateは取得に失敗したlotteryIdをスキップする（クラッシュしない）', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));

    await expect(
      useMyLotteriesStore.getState().applyServerState([
        { lotteryId: 999, status: 'applied', snapshotUpdatedAt: null, savedAt: '2026-01-01T00:00:00.000Z', serverVersion: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      ])
    ).resolves.toBeUndefined();

    expect(useMyLotteriesStore.getState().getSaved(999)).toBeUndefined();
  });

  describe('setStatus（Mobile-G6）', () => {
    it('guest namespaceでは楽観的更新のみ行い、キューへenqueueしない', () => {
      useMyLotteriesStore.setState({ saved: [{ record, savedAt: '2026-01-01T00:00:00.000Z', status: 'unknown' }] });

      const ok = useMyLotteriesStore.getState().setStatus(1, 'planned');

      expect(ok).toBe(true);
      expect(useMyLotteriesStore.getState().getSaved(1)?.status).toBe('planned');
      expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
    });

    it('許可されない遷移はfalseを返し、状態を変更しない', () => {
      useMyLotteriesStore.setState({ saved: [{ record, savedAt: '2026-01-01T00:00:00.000Z', status: 'lost' }] });

      const ok = useMyLotteriesStore.getState().setStatus(1, 'won');

      expect(ok).toBe(false);
      expect(useMyLotteriesStore.getState().getSaved(1)?.status).toBe('lost');
    });

    it('serverVersion未確定（未同期）の項目はfalseを返し、キューへ積まない', () => {
      useNamespaceStore.setState({ namespace: 'userA', isSwitching: false });
      useAuthStore.setState({ status: 'signedIn', sessionAvailability: 'online', user: null, accessToken: 'at', accessTokenExpiresAt: Date.now() + 10_000 });
      useMyLotteriesStore.setState({ saved: [{ record, savedAt: '2026-01-01T00:00:00.000Z', status: 'unknown' }] });

      const ok = useMyLotteriesStore.getState().setStatus(1, 'planned');

      expect(ok).toBe(false);
      expect(useMyLotteriesStore.getState().getSaved(1)?.status).toBe('unknown');
      expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
    });

    it('signedIn状態でserverVersion確定済みならlottery.patchがキューへ積まれ、成功でstatus/serverVersionが反映される', async () => {
      useNamespaceStore.setState({ namespace: 'userA', isSwitching: false });
      useAuthStore.setState({
        status: 'signedIn',
        sessionAvailability: 'online',
        user: null,
        accessToken: 'at-valid',
        accessTokenExpiresAt: Date.now() + 10 * 60_000,
      });
      await saveRefreshToken('rt-1', 'device-1');
      useMyLotteriesStore.setState({ saved: [{ record, savedAt: '2026-01-01T00:00:00.000Z', status: 'unknown', serverVersion: 1 }] });
      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          jsonResponse(200, {
            lotteryId: 1,
            status: 'planned',
            snapshotUpdatedAt: null,
            savedAt: '2026-01-01T00:00:00.000Z',
            serverVersion: 2,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            outcome: 'updated',
          })
        )
      );

      const ok = useMyLotteriesStore.getState().setStatus(1, 'planned');
      expect(ok).toBe(true);
      expect(useMyLotteriesStore.getState().getSaved(1)?.status).toBe('planned');

      const [op] = useOfflineQueueStore.getState().operations;
      expect(op.method).toBe('PATCH');
      expect(op.path).toBe('/me/lotteries/1');
      expect(op.payload).toMatchObject({ status: 'planned', expectedServerVersion: 1 });

      await processQueue();

      expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
      const saved = useMyLotteriesStore.getState().getSaved(1);
      expect(saved?.status).toBe('planned');
      expect(saved?.serverVersion).toBe(2);
    });

    it('同一ステータスへの変更はno-opとしてtrueを返す', () => {
      useMyLotteriesStore.setState({ saved: [{ record, savedAt: '2026-01-01T00:00:00.000Z', status: 'planned' }] });

      const ok = useMyLotteriesStore.getState().setStatus(1, 'planned');

      expect(ok).toBe(true);
      expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
    });
  });
});
