import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRefreshToken, saveRefreshToken } from '@/lib/secureStore';
import { refreshAccessToken, SessionDiscardedError, shouldPreemptivelyRefresh } from '@/lib/tokenRefresh';
import { useAuthStore } from '@/stores/authStore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('tokenRefresh', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    useAuthStore.setState({
      status: 'initializing',
      sessionAvailability: 'expired',
      user: null,
      accessToken: null,
      accessTokenExpiresAt: null,
    });
    await saveRefreshToken('rt-initial', 'device-1');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('成功時はaccessTokenとexpiresAtを設定し、Refresh Tokenをローテーションする', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { accessToken: 'at-new', refreshToken: 'rt-new', expiresIn: 900 }));
    const before = Date.now();

    const accessToken = await refreshAccessToken();

    expect(accessToken).toBe('at-new');
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('at-new');
    expect(state.sessionAvailability).toBe('online');
    expect(state.accessTokenExpiresAt).toBeGreaterThanOrEqual(before + 900_000);
    expect(await getRefreshToken()).toBe('rt-new');
  });

  it('同時に3回呼ばれてもRefreshは1回のみ実行される（一本化）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { accessToken: 'at-new', refreshToken: 'rt-new', expiresIn: 900 }));
    global.fetch = fetchMock;

    const [a, b, c] = await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()]);

    expect(a).toBe('at-new');
    expect(b).toBe('at-new');
    expect(c).toBe('at-new');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('UNAUTHORIZED（invalid token）はセッションを破棄しRefresh TokenをSecureStoreから削除する', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: '無効です', requestId: 'r1' } }));

    await expect(refreshAccessToken()).rejects.toBeInstanceOf(SessionDiscardedError);

    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(await getRefreshToken()).toBeNull();
  });

  it('TOKEN_EXPIREDもセッションを破棄する', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: '期限切れ', requestId: 'r1' } }));

    await expect(refreshAccessToken()).rejects.toBeInstanceOf(SessionDiscardedError);
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  it('ネットワークエラーはofflineCachedへ移行し、Refresh Tokenは保持したまま強制ログアウトしない', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Network request failed'));

    await expect(refreshAccessToken()).rejects.toMatchObject({ kind: 'network' });

    const state = useAuthStore.getState();
    expect(state.status).not.toBe('signedOut');
    expect(state.sessionAvailability).toBe('offlineCached');
    expect(await getRefreshToken()).toBe('rt-initial');
  });

  it('5xx（SERVICE_BUSY相当）もofflineCachedへ移行しRefresh Tokenを保持する', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(503, { error: { code: 'SERVICE_BUSY', message: '混雑', requestId: 'r1' } }));

    await expect(refreshAccessToken()).rejects.toMatchObject({ kind: 'service_busy' });
    expect(useAuthStore.getState().sessionAvailability).toBe('offlineCached');
    expect(await getRefreshToken()).toBe('rt-initial');
  });

  it('AUTH_NOT_CONFIGUREDでも強制ログアウトしない', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(503, { error: { code: 'AUTH_NOT_CONFIGURED', message: '未設定', requestId: 'r1' } }));

    await expect(refreshAccessToken()).rejects.toMatchObject({ kind: 'auth_not_configured' });
    expect(useAuthStore.getState().status).not.toBe('signedOut');
    expect(await getRefreshToken()).toBe('rt-initial');
  });

  it('Refresh Tokenが無い場合はセッションを破棄する', async () => {
    useAuthStore.setState({ status: 'signedIn' });
    const { clearRefreshToken } = await import('@/lib/secureStore');
    await clearRefreshToken();

    await expect(refreshAccessToken()).rejects.toBeInstanceOf(SessionDiscardedError);
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  it('shouldPreemptivelyRefreshはaccessToken未取得時にtrue、期限が1分以上先ならfalse', () => {
    useAuthStore.setState({ accessToken: null, accessTokenExpiresAt: null });
    expect(shouldPreemptivelyRefresh()).toBe(true);

    useAuthStore.setState({ accessToken: 'at', accessTokenExpiresAt: Date.now() + 10 * 60_000 });
    expect(shouldPreemptivelyRefresh()).toBe(false);

    useAuthStore.setState({ accessToken: 'at', accessTokenExpiresAt: Date.now() + 30_000 });
    expect(shouldPreemptivelyRefresh()).toBe(true);
  });
});
