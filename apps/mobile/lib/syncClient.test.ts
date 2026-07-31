import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractUserLotteryVersionConflict,
  fetchEntitlements,
  fetchUserLotteries,
  postEntitlementsRefresh,
  postSyncBootstrap,
  putUserLottery,
  SyncResponseValidationError,
} from '@/lib/syncClient';
import { saveRefreshToken } from '@/lib/secureStore';
import { useAuthStore } from '@/stores/authStore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const userLotteryRow = {
  lotteryId: 1,
  status: 'applied' as const,
  snapshotUpdatedAt: null,
  savedAt: '2026-01-01T00:00:00.000Z',
  serverVersion: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('syncClient', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
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

  it('fetchUserLotteriesは一覧レスポンスをZod検証して返す', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { items: [userLotteryRow], total: 1, limit: 20, offset: 0 }));

    const result = await fetchUserLotteries();

    expect(result.items).toHaveLength(1);
    expect(result.items[0].lotteryId).toBe(1);
  });

  it('形式が想定と異なるレスポンスはSyncResponseValidationErrorになる', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { totally: 'wrong' }));

    await expect(fetchUserLotteries()).rejects.toBeInstanceOf(SyncResponseValidationError);
  });

  it('putUserLotteryは成功時にoutcome付きレスポンスを返す', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ...userLotteryRow, outcome: 'updated' }));

    const result = await putUserLottery(1, { status: 'applied', expectedServerVersion: 1, clientRequestId: 'req-1' });

    expect(result.outcome).toBe('updated');
    expect(result.serverVersion).toBe(1);
  });

  it('VERSION_CONFLICTのcurrentをextractUserLotteryVersionConflictで取り出せる', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(409, {
        error: { code: 'VERSION_CONFLICT', message: '競合しています', requestId: 'r1' },
        current: { ...userLotteryRow, serverVersion: 2 },
      })
    );

    let caught: unknown;
    try {
      await putUserLottery(1, { status: 'applied', expectedServerVersion: 1, clientRequestId: 'req-1' });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    const current = extractUserLotteryVersionConflict(caught);
    expect(current?.serverVersion).toBe(2);
  });

  it('非VERSION_CONFLICTエラーからはcurrentを取り出さずnullを返す', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(404, { error: { code: 'NOT_FOUND', message: '無し', requestId: 'r1' } }));

    let caught: unknown;
    try {
      await putUserLottery(999, { status: 'applied', expectedServerVersion: 1, clientRequestId: 'req-1' });
    } catch (e) {
      caught = e;
    }

    expect(extractUserLotteryVersionConflict(caught)).toBeNull();
  });

  it('postSyncBootstrapはserverStateとresultsを検証して返す', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        syncId: 'sync-1',
        results: {
          userLotteries: { accepted: 1, skipped: 0, conflicts: [] },
          favorites: { accepted: 0, skipped: 0, conflicts: [] },
          followedProducts: { accepted: 0, skipped: 0, conflicts: [] },
          legacyFollowedProducts: { resolved: [], unresolved: ['旧キー'] },
          checklistSteps: { accepted: 0, skipped: 0, conflicts: [] },
          notificationPreferences: { accepted: false, skipped: true },
        },
        serverState: {
          userLotteries: [
            {
              id: 1,
              userId: 1,
              lotteryId: 1,
              status: 'applied',
              snapshotJson: null,
              snapshotUpdatedAt: null,
              savedAt: '2026-01-01T00:00:00.000Z',
              serverVersion: 1,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              deletedAt: null,
            },
          ],
          favorites: [],
          followedProducts: [],
          checklistSteps: [],
          notificationPreferences: null,
        },
      })
    );

    const result = await postSyncBootstrap({
      batchClientRequestId: 'batch-1',
      userLotteries: [],
      favorites: [],
      followedProducts: [],
      legacyFollowedProductKeys: ['旧キー'],
      checklistSteps: [],
    });

    expect(result.syncId).toBe('sync-1');
    expect(result.results.legacyFollowedProducts.unresolved).toEqual(['旧キー']);
    expect(result.serverState.userLotteries).toHaveLength(1);
  });

  it('fetchEntitlementsはサーバー確定状態を検証して返す', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, { premiumActive: true, productType: 'monthly', expiresAt: '2026-12-31T00:00:00.000Z', lastVerifiedAt: '2026-08-01T00:00:00.000Z', stale: false })
    );

    const result = await fetchEntitlements();
    expect(result.premiumActive).toBe(true);
    expect(result.productType).toBe('monthly');
  });

  it('postEntitlementsRefreshは購入直後の即時照合成功時に反映済み状態を返す', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, { premiumActive: true, productType: 'lifetime', expiresAt: null, lastVerifiedAt: '2026-08-01T00:00:00.000Z', stale: false })
    );

    const result = await postEntitlementsRefresh();
    expect(result.premiumActive).toBe(true);
    expect(result.expiresAt).toBeNull();
  });

  it('postEntitlementsRefreshが一時的に失敗した場合はAuthApiErrorとして伝播する（購入失敗とは区別される）', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(503, { error: { code: 'SERVICE_BUSY', message: '混雑', requestId: 'r1' } }));

    await expect(postEntitlementsRefresh()).rejects.toMatchObject({ kind: 'service_busy' });
  });
});
