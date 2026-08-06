import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GUEST_NAMESPACE, useNamespaceStore } from '@/lib/accountNamespace';
import {
  discardConflictedOperation,
  enqueueOperation,
  hasUnsentOperations,
  OFFLINE_QUEUE_BACKOFF_MS,
  OFFLINE_QUEUE_MAX_ATTEMPTS,
  OFFLINE_QUEUE_MAX_BYTES,
  OFFLINE_QUEUE_MAX_OPERATIONS,
  OFFLINE_QUEUE_TTL_MS,
  OfflineQueueOverflowError,
  processQueue,
  retryFailedOperation,
} from '@/lib/offlineQueue';
import { saveRefreshToken } from '@/lib/secureStore';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function signInAs(namespace: string) {
  useNamespaceStore.setState({ namespace, isSwitching: false });
  useAuthStore.setState({
    status: 'signedIn',
    sessionAvailability: 'online',
    user: null,
    accessToken: 'at-valid',
    accessTokenExpiresAt: Date.now() + 10 * 60_000,
  });
}

describe('offlineQueue', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    useOfflineQueueStore.getState().clear();
    signInAs('userA');
    await saveRefreshToken('rt-1', 'device-1');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('guest namespaceではenqueueできない', () => {
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    expect(() =>
      enqueueOperation({ id: 'op-1', kind: 'favorite.put', resourceKey: '1', path: '/me/favorites/1', method: 'PUT', payload: {} })
    ).toThrow();
  });

  it('件数上限（500件）を超えるとOfflineQueueOverflowError', () => {
    for (let i = 0; i < OFFLINE_QUEUE_MAX_OPERATIONS; i++) {
      useOfflineQueueStore.getState().enqueue({
        id: `existing-${i}`,
        kind: 'favorite.put',
        resourceKey: String(i),
        path: `/me/favorites/${i}`,
        method: 'PUT',
        payload: {},
        createdAt: new Date().toISOString(),
      });
    }
    expect(() =>
      enqueueOperation({ id: 'over', kind: 'favorite.put', resourceKey: 'x', path: '/me/favorites/x', method: 'PUT', payload: {} })
    ).toThrow(OfflineQueueOverflowError);
  });

  it('容量上限（1MB）を超えるとOfflineQueueOverflowError', () => {
    const bigPayload = { data: 'x'.repeat(OFFLINE_QUEUE_MAX_BYTES) };
    expect(() =>
      enqueueOperation({ id: 'big', kind: 'favorite.put', resourceKey: '1', path: '/me/favorites/1', method: 'PUT', payload: bigPayload })
    ).toThrow(OfflineQueueOverflowError);
  });

  it('FIFOの順序で1件ずつ処理し、成功のたびにキューから除去する', async () => {
    const calledPaths: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledPaths.push(new URL(url).pathname);
      return jsonResponse(200, { ok: true });
    });

    enqueueOperation({ id: 'op-1', kind: 'favorite.put', resourceKey: '1', path: '/me/favorites/1', method: 'PUT', payload: { clientRequestId: 'op-1' } });
    enqueueOperation({ id: 'op-2', kind: 'favorite.put', resourceKey: '2', path: '/me/favorites/2', method: 'PUT', payload: { clientRequestId: 'op-2' } });

    await processQueue();

    expect(calledPaths).toEqual(['/me/favorites/1', '/me/favorites/2']);
    expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
    expect(hasUnsentOperations()).toBe(false);
  });

  it('ネットワークエラー時はキューに残り、attemptCountを増やしてバックオフする', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Network request failed'));

    enqueueOperation({ id: 'op-1', kind: 'favorite.put', resourceKey: '1', path: '/me/favorites/1', method: 'PUT', payload: {} });
    await processQueue();

    const [op] = useOfflineQueueStore.getState().operations;
    expect(op.status).toBe('pending');
    expect(op.attemptCount).toBe(1);
    expect(op.nextRetryAt).not.toBeNull();
    const delay = Date.parse(op.nextRetryAt!) - Date.now();
    expect(delay).toBeGreaterThan(OFFLINE_QUEUE_BACKOFF_MS[0] - 1000);
    expect(delay).toBeLessThanOrEqual(OFFLINE_QUEUE_BACKOFF_MS[0]);
  });

  it('nextRetryAtが未来の間は再送しない', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network'));
    global.fetch = fetchMock;
    enqueueOperation({ id: 'op-1', kind: 'favorite.put', resourceKey: '1', path: '/me/favorites/1', method: 'PUT', payload: {} });

    await processQueue();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await processQueue();
    expect(fetchMock).toHaveBeenCalledTimes(1); // nextRetryAtがまだ未来のため再送しない
  });

  it('attemptCountが上限に達するとfailedになる', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));
    enqueueOperation({ id: 'op-1', kind: 'favorite.put', resourceKey: '1', path: '/me/favorites/1', method: 'PUT', payload: {} });

    for (let i = 0; i < OFFLINE_QUEUE_MAX_ATTEMPTS; i++) {
      useOfflineQueueStore.getState().updateStatus('op-1', { nextRetryAt: null });
      await processQueue();
    }

    const [op] = useOfflineQueueStore.getState().operations;
    expect(op.status).toBe('failed');
  });

  it('VERSION_CONFLICTはconflictステータスへ移動しキューには残る', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(409, { error: { code: 'VERSION_CONFLICT', message: '競合', requestId: 'r1' } }));
    enqueueOperation({ id: 'op-1', kind: 'lottery.put', resourceKey: '1', path: '/me/lotteries/1', method: 'PUT', payload: {} });

    await processQueue();

    const [op] = useOfflineQueueStore.getState().operations;
    expect(op.status).toBe('conflict');
    expect(hasUnsentOperations()).toBe(true);
  });

  it('IDEMPOTENCY_CONFLICTもconflictステータスへ移動する', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(409, { error: { code: 'IDEMPOTENCY_CONFLICT', message: '重複', requestId: 'r1' } }));
    enqueueOperation({ id: 'op-1', kind: 'lottery.put', resourceKey: '1', path: '/me/lotteries/1', method: 'PUT', payload: {} });

    await processQueue();

    expect(useOfflineQueueStore.getState().operations[0].status).toBe('conflict');
  });

  it('恒久失敗（VALIDATION_ERROR等）はfailedになりバックオフしない', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(422, { error: { code: 'VALIDATION_ERROR', message: '不正', requestId: 'r1' } }));
    enqueueOperation({ id: 'op-1', kind: 'lottery.put', resourceKey: '1', path: '/me/lotteries/1', method: 'PUT', payload: {} });

    await processQueue();

    const [op] = useOfflineQueueStore.getState().operations;
    expect(op.status).toBe('failed');
    expect(op.attemptCount).toBe(0);
  });

  it('Retry-Afterヘッダがあれば固定バックオフより優先する', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: '混雑', requestId: 'r1' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '2' },
      }));
    enqueueOperation({ id: 'op-1', kind: 'lottery.put', resourceKey: '1', path: '/me/lotteries/1', method: 'PUT', payload: {} });

    await processQueue();

    const [op] = useOfflineQueueStore.getState().operations;
    const delay = Date.parse(op.nextRetryAt!) - Date.now();
    expect(delay).toBeGreaterThan(1000);
    expect(delay).toBeLessThanOrEqual(2000);
  });

  it('TTL超過かつexpectedServerVersionを含まない操作は新しいclientRequestIdで再送する', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const oldCreatedAt = new Date(Date.now() - OFFLINE_QUEUE_TTL_MS - 1000).toISOString();
    enqueueOperation({
      id: 'op-old',
      kind: 'favorite.put',
      resourceKey: '1',
      path: '/me/favorites/1',
      method: 'PUT',
      payload: { clientRequestId: 'op-old' },
      createdAt: oldCreatedAt,
    });

    await processQueue();

    expect(useOfflineQueueStore.getState().operations.every((o) => o.id !== 'op-old')).toBe(true);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('TTL超過かつexpectedServerVersionを含む操作は再送せずconflictへ回す', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const oldCreatedAt = new Date(Date.now() - OFFLINE_QUEUE_TTL_MS - 1000).toISOString();
    enqueueOperation({
      id: 'op-old',
      kind: 'lottery.patch',
      resourceKey: '1',
      path: '/me/lotteries/1',
      method: 'PATCH',
      payload: { expectedServerVersion: 3, clientRequestId: 'op-old' },
      createdAt: oldCreatedAt,
    });

    await processQueue();

    expect(fetchMock).not.toHaveBeenCalled();
    const [op] = useOfflineQueueStore.getState().operations;
    expect(op.id).toBe('op-old');
    expect(op.status).toBe('conflict');
  });

  it('TTL超過かつDELETE操作は再送せずconflictへ回す', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const oldCreatedAt = new Date(Date.now() - OFFLINE_QUEUE_TTL_MS - 1000).toISOString();
    enqueueOperation({
      id: 'op-old',
      kind: 'lottery.delete',
      resourceKey: '1',
      path: '/me/lotteries/1',
      method: 'DELETE',
      payload: { clientRequestId: 'op-old' },
      createdAt: oldCreatedAt,
    });

    await processQueue();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useOfflineQueueStore.getState().operations[0].status).toBe('conflict');
  });

  it('processQueueの多重呼び出しは1本化され、同時に2回走査しない', async () => {
    let resolveFirst!: (value: Response) => void;
    const fetchMock = vi.fn().mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFirst = resolve;
      })
    );
    global.fetch = fetchMock;
    enqueueOperation({ id: 'op-1', kind: 'favorite.put', resourceKey: '1', path: '/me/favorites/1', method: 'PUT', payload: {} });

    const first = processQueue();
    const second = processQueue();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst(jsonResponse(200, { ok: true }));
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('signedIn以外の状態では処理を開始しない', async () => {
    useAuthStore.setState({ status: 'signedOut' });
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    useOfflineQueueStore.getState().enqueue({
      id: 'op-1',
      kind: 'favorite.put',
      resourceKey: '1',
      path: '/me/favorites/1',
      method: 'PUT',
      payload: {},
      createdAt: new Date().toISOString(),
    });

    await processQueue();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('guest namespaceでは処理を開始しない（ログアウト後にキューが送信されない）', async () => {
    useOfflineQueueStore.getState().enqueue({
      id: 'op-1',
      kind: 'favorite.put',
      resourceKey: '1',
      path: '/me/favorites/1',
      method: 'PUT',
      payload: {},
      createdAt: new Date().toISOString(),
    });
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await processQueue();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useOfflineQueueStore.getState().operations).toHaveLength(1);
  });

  it('retryFailedOperationはfailedをpendingへ戻し再試行を再開する', async () => {
    useOfflineQueueStore.getState().enqueue({
      id: 'op-1',
      kind: 'favorite.put',
      resourceKey: '1',
      path: '/me/favorites/1',
      method: 'PUT',
      payload: {},
      createdAt: new Date().toISOString(),
    });
    useOfflineQueueStore.getState().updateStatus('op-1', { status: 'failed', attemptCount: 5, lastError: 'boom' });
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));

    retryFailedOperation('op-1');
    await vi.waitFor(() => {
      expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
    });
  });

  describe('discardConflictedOperation', () => {
    it('conflict:idプレフィックスの通知idから該当操作をキューから除去し、trueを返す', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(409, { error: { code: 'VERSION_CONFLICT', message: '競合', requestId: 'r1' } }));
      enqueueOperation({ id: 'op-1', kind: 'lottery.put', resourceKey: '1', path: '/me/lotteries/1', method: 'PUT', payload: {} });
      await processQueue();
      expect(useOfflineQueueStore.getState().operations[0].status).toBe('conflict');

      const removed = discardConflictedOperation('queue:op-1');

      expect(removed).toBe(true);
      expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
    });

    it('queue:プレフィックスでないid（bootstrapSummary等）は何もせずfalseを返す', () => {
      enqueueOperation({ id: 'op-1', kind: 'favorite.put', resourceKey: '1', path: '/me/favorites/1', method: 'PUT', payload: {} });

      const removed = discardConflictedOperation('bootstrap-summary-1');

      expect(removed).toBe(false);
      expect(useOfflineQueueStore.getState().operations).toHaveLength(1);
    });

    it('既に存在しない操作idの場合は何もせずfalseを返す', () => {
      const removed = discardConflictedOperation('queue:does-not-exist');
      expect(removed).toBe(false);
    });
  });
});
