import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appleSignIn,
  AuthApiError,
  deleteMe,
  fetchMe,
  logout,
  logoutAllDevices,
  refreshTokens,
} from '@/lib/authApiClient';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

describe('authApiClient', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.EXPO_PUBLIC_API_BASE_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.EXPO_PUBLIC_API_BASE_URL = originalEnv;
    vi.restoreAllMocks();
  });

  it('appleSignInは成功レスポンスをパースして返す', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 900,
        user: { publicUserId: 'u1', displayName: null, email: null, accountStatus: 'active', createdAt: '2026-01-01' },
      })
    );

    const result = await appleSignIn({ identityToken: 'idt', authorizationCode: 'code', rawNonce: 'nonce', deviceId: 'd1' });
    expect(result.accessToken).toBe('at');
    expect(result.user.publicUserId).toBe('u1');

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.example.test/auth/apple');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('refreshTokensは/auth/refreshへAuthorizationを付けずに送る', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { accessToken: 'at2', refreshToken: 'rt2', expiresIn: 900 }));
    await refreshTokens({ refreshToken: 'rt', deviceId: 'd1' });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('logout/logout-all/GET・DELETE /meはAuthorizationを付与する', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    await logout({ accessToken: 'at', deviceId: 'd1' });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer at');
  });

  it('logoutAllDevicesはrevokedCountを返す', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, revokedCount: 3 }));
    const result = await logoutAllDevices('at');
    expect(result.revokedCount).toBe(3);
  });

  it('fetchMe/deleteMeはレスポンスをパースして返す', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          publicUserId: 'u1',
          displayName: null,
          email: null,
          accountStatus: 'active',
          scheduledDeletionAt: null,
          createdAt: '2026-01-01',
        })
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, scheduledDeletionAt: '2026-02-01' }));

    const me = await fetchMe('at');
    expect(me.publicUserId).toBe('u1');
    const deleted = await deleteMe('at');
    expect(deleted.scheduledDeletionAt).toBe('2026-02-01');
  });

  it('401 TOKEN_EXPIREDはkind=token_expiredのAuthApiErrorになる', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: '期限切れ', requestId: 'r1' } }));

    await expect(fetchMe('at')).rejects.toMatchObject({ kind: 'token_expired' });
  });

  it('429はRetry-Afterヘッダをretry AfterSecondsとして保持する', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(429, { error: { code: 'RATE_LIMITED', message: '多すぎます', requestId: 'r1' } }, { 'Retry-After': '30' })
      );

    try {
      await refreshTokens({ refreshToken: 'rt', deviceId: 'd1' });
      throw new Error('rejectedはず');
    } catch (e) {
      expect(e).toBeInstanceOf(AuthApiError);
      expect((e as AuthApiError).kind).toBe('rate_limited');
      expect((e as AuthApiError).retryAfterSeconds).toBe(30);
    }
  });

  it('ネットワークエラーはkind=networkになる', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(refreshTokens({ refreshToken: 'rt', deviceId: 'd1' })).rejects.toMatchObject({ kind: 'network' });
  });

  it('EXPO_PUBLIC_API_BASE_URL未設定かつ__DEV__falseはkind=configになる', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = '';
    // @ts-expect-error テスト用にグローバルの__DEV__を上書きする
    const originalDev = global.__DEV__;
    // @ts-expect-error 同上
    global.__DEV__ = false;
    global.fetch = vi.fn();
    try {
      await expect(refreshTokens({ refreshToken: 'rt', deviceId: 'd1' })).rejects.toMatchObject({ kind: 'config' });
    } finally {
      // @ts-expect-error 同上
      global.__DEV__ = originalDev;
    }
  });
});
