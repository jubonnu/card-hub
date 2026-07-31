import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticatedRequest } from '@/lib/authenticatedApiClient';
import { saveRefreshToken } from '@/lib/secureStore';
import { SessionDiscardedError } from '@/lib/tokenRefresh';
import { useAuthStore } from '@/stores/authStore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('authenticatedRequest', () => {
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

  it('有効なAccess Tokenがあれば先回りRefreshせず1回だけ通信する', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    global.fetch = fetchMock;

    const body = await authenticatedRequest('/me/lotteries', { method: 'GET' });

    expect(body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer at-valid');
  });

  it('401を受けたら1回だけRefreshして同じリクエストを1回だけ再送する', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: '期限切れ', requestId: 'r1' } }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'at-2', refreshToken: 'rt-2', expiresIn: 900 }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    global.fetch = fetchMock;

    const body = await authenticatedRequest('/me/lotteries', {
      method: 'PUT',
      body: JSON.stringify({ clientRequestId: 'req-1' }),
    });

    expect(body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [firstUrl] = fetchMock.mock.calls[0];
    const [refreshUrl] = fetchMock.mock.calls[1];
    const [retryUrl, retryInit] = fetchMock.mock.calls[2];
    expect(firstUrl).toBe('https://api.example.test/me/lotteries');
    expect(refreshUrl).toBe('https://api.example.test/auth/refresh');
    expect(retryUrl).toBe('https://api.example.test/me/lotteries');
    // clientRequestIdは再送前後で変わらない（同じinit.bodyを再利用する）。
    expect(retryInit.body).toBe(JSON.stringify({ clientRequestId: 'req-1' }));
    expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer at-2');
  });

  it('再送後も401ならループせずそのままエラーを返す', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: '期限切れ', requestId: 'r1' } }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'at-2', refreshToken: 'rt-2', expiresIn: 900 }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: '無効', requestId: 'r2' } }));
    global.fetch = fetchMock;

    await expect(authenticatedRequest('/me/lotteries', { method: 'GET' })).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('Access Tokenが無くRefresh Tokenも無い場合は通信せずセッション破棄エラーになる', async () => {
    const { clearRefreshToken } = await import('@/lib/secureStore');
    await clearRefreshToken();
    useAuthStore.setState({ accessToken: null, accessTokenExpiresAt: null });

    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await expect(authenticatedRequest('/me/lotteries', { method: 'GET' })).rejects.toBeInstanceOf(SessionDiscardedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
