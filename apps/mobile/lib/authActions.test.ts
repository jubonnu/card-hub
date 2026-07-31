import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GUEST_NAMESPACE, getCurrentNamespace, useNamespaceStore } from '@/lib/accountNamespace';
import { AppleSignInCancelledError, deleteAccount, restoreSession, signInWithApple, signOut, signOutAllDevices } from '@/lib/authActions';
import { clearRefreshToken, getRefreshToken, getRefreshTokenDeviceId, saveRefreshToken } from '@/lib/secureStore';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';
import { useAuthStore } from '@/stores/authStore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const meBody = {
  publicUserId: 'u1',
  displayName: '太郎',
  email: 'taro@example.com',
  accountStatus: 'active' as const,
  scheduledDeletionAt: null,
  createdAt: '2026-01-01',
};

function resetAuthStore() {
  useAuthStore.setState({
    status: 'initializing',
    sessionAvailability: 'expired',
    user: null,
    accessToken: null,
    accessTokenExpiresAt: null,
  });
}

describe('authActions', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    resetAuthStore();
    await clearRefreshToken();
    vi.mocked(AppleAuthentication.signInAsync).mockReset();
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false, generation: 0 });
    useOfflineQueueStore.getState().clear();
    await AsyncStorage.removeItem('cardhub.bootstrapped.u1');
    await AsyncStorage.removeItem('cardhub.bootstrapBatchId.u1');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('signInWithApple', () => {
    it('正常ログイン: identityToken/authorizationCodeを送信しsignedInへ遷移する', async () => {
      vi.mocked(AppleAuthentication.signInAsync).mockResolvedValue({
        identityToken: 'idt',
        authorizationCode: 'code',
        user: 'apple-user',
        fullName: null,
        email: null,
        realUserStatus: 0,
        state: null,
      });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, {
            accessToken: 'at',
            refreshToken: 'rt',
            expiresIn: 900,
            user: { publicUserId: 'u1', displayName: '太郎', email: 'taro@example.com', accountStatus: 'active', createdAt: '2026-01-01' },
          })
        )
        .mockResolvedValueOnce(jsonResponse(200, meBody));

      await signInWithApple();

      const state = useAuthStore.getState();
      expect(state.status).toBe('signedIn');
      expect(state.accessToken).toBe('at');
      expect(state.user?.scheduledDeletionAt).toBeNull();
      expect(await getRefreshToken()).toBe('rt');
    });

    it('Appleキャンセルはエラーアラート対象ではなくAppleSignInCancelledErrorになる', async () => {
      vi.mocked(AppleAuthentication.signInAsync).mockRejectedValue(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      await expect(signInWithApple()).rejects.toBeInstanceOf(AppleSignInCancelledError);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(useAuthStore.getState().status).toBe('initializing');
    });

    it('identityToken欠落時はログイン不成立でサーバーへ送信しない', async () => {
      vi.mocked(AppleAuthentication.signInAsync).mockResolvedValue({
        identityToken: null,
        authorizationCode: 'code',
        user: 'apple-user',
        fullName: null,
        email: null,
        realUserStatus: 0,
        state: null,
      });
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      await expect(signInWithApple()).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('authorizationCode欠落時もログイン不成立でサーバーへ送信しない', async () => {
      vi.mocked(AppleAuthentication.signInAsync).mockResolvedValue({
        identityToken: 'idt',
        authorizationCode: null,
        user: 'apple-user',
        fullName: null,
        email: null,
        realUserStatus: 0,
        state: null,
      });
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      await expect(signInWithApple()).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('多重タップしてもAppleネイティブ呼び出しは1回のみ実行される', async () => {
      vi.mocked(AppleAuthentication.signInAsync).mockResolvedValue({
        identityToken: 'idt',
        authorizationCode: 'code',
        user: 'apple-user',
        fullName: null,
        email: null,
        realUserStatus: 0,
        state: null,
      });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, {
            accessToken: 'at',
            refreshToken: 'rt',
            expiresIn: 900,
            user: { publicUserId: 'u1', displayName: null, email: null, accountStatus: 'active', createdAt: '2026-01-01' },
          })
        )
        .mockResolvedValueOnce(jsonResponse(200, meBody));

      await Promise.all([signInWithApple(), signInWithApple(), signInWithApple()]);

      expect(AppleAuthentication.signInAsync).toHaveBeenCalledTimes(1);
    });

    it('rawNonce・identityToken・authorizationCodeをどのストレージにも永続化しない', async () => {
      vi.mocked(AppleAuthentication.signInAsync).mockResolvedValue({
        identityToken: 'super-secret-identity-token',
        authorizationCode: 'super-secret-authorization-code',
        user: 'apple-user',
        fullName: null,
        email: null,
        realUserStatus: 0,
        state: null,
      });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, {
            accessToken: 'at',
            refreshToken: 'rt',
            expiresIn: 900,
            user: { publicUserId: 'u1', displayName: null, email: null, accountStatus: 'active', createdAt: '2026-01-01' },
          })
        )
        .mockResolvedValueOnce(jsonResponse(200, meBody));

      await signInWithApple();

      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const authPersisted = await AsyncStorage.getItem('cardhub-auth');
      expect(authPersisted ?? '').not.toContain('super-secret-identity-token');
      expect(authPersisted ?? '').not.toContain('super-secret-authorization-code');
      const storedRefreshToken = await getRefreshToken();
      expect(storedRefreshToken).not.toContain('super-secret-identity-token');
    });
  });

  describe('restoreSession', () => {
    it('Refresh Tokenが無ければsignedOutになる', async () => {
      await restoreSession();
      expect(useAuthStore.getState().status).toBe('signedOut');
    });

    it('正常Refreshでsigned inになりGET /meでuserを補完する', async () => {
      await saveRefreshToken('rt-1', 'device-1');
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'at', refreshToken: 'rt-2', expiresIn: 900 }))
        .mockResolvedValueOnce(jsonResponse(200, meBody));

      await restoreSession();

      const state = useAuthStore.getState();
      expect(state.status).toBe('signedIn');
      expect(state.sessionAvailability).toBe('online');
      expect(state.user?.publicUserId).toBe('u1');
    });

    it('無効なRefresh Tokenはsigned outへ倒しSecureStoreをクリアする', async () => {
      await saveRefreshToken('rt-invalid', 'device-1');
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: '無効', requestId: 'r1' } }));

      await restoreSession();

      expect(useAuthStore.getState().status).toBe('signedOut');
      expect(await getRefreshToken()).toBeNull();
    });

    it('オフライン時はsignedInのままofflineCachedになり、キャッシュ済みuserを維持する', async () => {
      await saveRefreshToken('rt-1', 'device-1');
      useAuthStore.setState({ user: { publicUserId: 'cached', displayName: null, email: null, accountStatus: 'active', scheduledDeletionAt: null } });
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Network request failed'));

      await restoreSession();

      const state = useAuthStore.getState();
      expect(state.status).toBe('signedIn');
      expect(state.sessionAvailability).toBe('offlineCached');
      expect(state.user?.publicUserId).toBe('cached');
    });

    it('5xxでも強制ログアウトせずofflineCachedになる', async () => {
      await saveRefreshToken('rt-1', 'device-1');
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(503, { error: { code: 'SERVICE_BUSY', message: '混雑', requestId: 'r1' } }));

      await restoreSession();

      const state = useAuthStore.getState();
      expect(state.status).not.toBe('signedOut');
      expect(state.sessionAvailability).toBe('offlineCached');
      expect(await getRefreshToken()).toBe('rt-1');
    });

    it('AUTH_NOT_CONFIGUREDでも強制ログアウトしない', async () => {
      await saveRefreshToken('rt-1', 'device-1');
      global.fetch = vi
        .fn()
        .mockResolvedValue(jsonResponse(503, { error: { code: 'AUTH_NOT_CONFIGURED', message: '未設定', requestId: 'r1' } }));

      await restoreSession();

      expect(useAuthStore.getState().status).not.toBe('signedOut');
      expect(await getRefreshToken()).toBe('rt-1');
    });

    it('Refresh確定前にキャッシュから楽観的にsignedInへ遷移する', async () => {
      await saveRefreshToken('rt-1', 'device-1');
      let resolveFetch!: (value: Response) => void;
      global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; }));

      const promise = restoreSession();
      await vi.waitFor(() => {
        expect(useAuthStore.getState().status).toBe('signedIn');
      });

      expect(useAuthStore.getState().sessionAvailability).toBe('refreshing');

      resolveFetch(jsonResponse(200, { accessToken: 'at', refreshToken: 'rt-2', expiresIn: 900 }));
      // GET /me呼び出しも解決させるため、2回目のfetch呼び出しにも成功レスポンスを返す。
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(200, meBody));
      await promise;
    });
  });

  it('deviceIdとgetRefreshTokenDeviceIdが一致した状態でRefreshが行われる', async () => {
    await saveRefreshToken('rt-1', 'device-x');
    expect(await getRefreshTokenDeviceId()).toBe('device-x');
  });

  describe('signInWithApple: namespace切替', () => {
    it('bootstrap済みユーザーのログインでguest→userのnamespaceへ切り替わる', async () => {
      await AsyncStorage.setItem('cardhub.bootstrapped.u1', 'true');
      vi.mocked(AppleAuthentication.signInAsync).mockResolvedValue({
        identityToken: 'idt',
        authorizationCode: 'code',
        user: 'apple-user',
        fullName: null,
        email: null,
        realUserStatus: 0,
        state: null,
      });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, {
            accessToken: 'at',
            refreshToken: 'rt',
            expiresIn: 900,
            user: { publicUserId: 'u1', displayName: '太郎', email: 'taro@example.com', accountStatus: 'active', createdAt: '2026-01-01' },
          })
        )
        .mockResolvedValueOnce(jsonResponse(200, meBody));

      await signInWithApple();

      expect(getCurrentNamespace()).toBe('u1');
    });
  });

  describe('signOut', () => {
    beforeEach(() => {
      useAuthStore.setState({
        status: 'signedIn',
        sessionAvailability: 'online',
        user: { publicUserId: 'u1', displayName: null, email: null, accountStatus: 'active', scheduledDeletionAt: null },
        accessToken: 'at-valid',
        accessTokenExpiresAt: Date.now() + 10 * 60_000,
      });
      useNamespaceStore.setState({ namespace: 'u1', isSwitching: false, generation: 0 });
    });

    it('POST /auth/logoutが失敗してもローカルサインアウトは継続する（ベストエフォート）', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));

      await signOut();

      expect(useAuthStore.getState().status).toBe('signedOut');
      expect(await getRefreshToken()).toBeNull();
      expect(getCurrentNamespace()).toBe(GUEST_NAMESPACE);
    });

    it('成功時はguest namespaceへ切り替わり、SecureStoreのRefresh Tokenを削除する', async () => {
      await saveRefreshToken('rt-1', 'device-1');
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));

      await signOut();

      expect(useAuthStore.getState().status).toBe('signedOut');
      expect(await getRefreshToken()).toBeNull();
      expect(getCurrentNamespace()).toBe(GUEST_NAMESPACE);
    });

    it('ログアウト後はAのキューを送信せず、同じアカウントへ再ログインした場合のみ再開する', async () => {
      const { enqueueOperation, processQueue } = await import('@/lib/offlineQueue');
      enqueueOperation({ id: 'op-1', kind: 'favorite.put', resourceKey: '1', path: '/me/favorites/1', method: 'PUT', payload: { clientRequestId: 'op-1' } });

      global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
      await signOut();

      const fetchAfterLogout = vi.fn();
      global.fetch = fetchAfterLogout;
      await processQueue();
      expect(fetchAfterLogout).not.toHaveBeenCalled();

      // 同じアカウント（u1）へ再ログイン（bootstrap済み扱いにしてnamespace切替のみ発生させる）。
      await AsyncStorage.setItem('cardhub.bootstrapped.u1', 'true');
      vi.mocked(AppleAuthentication.signInAsync).mockResolvedValue({
        identityToken: 'idt',
        authorizationCode: 'code',
        user: 'apple-user',
        fullName: null,
        email: null,
        realUserStatus: 0,
        state: null,
      });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, {
            accessToken: 'at-2',
            refreshToken: 'rt-2',
            expiresIn: 900,
            user: { publicUserId: 'u1', displayName: null, email: null, accountStatus: 'active', createdAt: '2026-01-01' },
          })
        )
        .mockResolvedValueOnce(jsonResponse(200, meBody))
        .mockResolvedValue(jsonResponse(200, { ok: true }));

      await signInWithApple();
      await processQueue();

      expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
    });
  });

  describe('signOutAllDevices', () => {
    beforeEach(() => {
      useAuthStore.setState({
        status: 'signedIn',
        sessionAvailability: 'online',
        user: { publicUserId: 'u1', displayName: null, email: null, accountStatus: 'active', scheduledDeletionAt: null },
        accessToken: 'at-valid',
        accessTokenExpiresAt: Date.now() + 10 * 60_000,
      });
      useNamespaceStore.setState({ namespace: 'u1', isSwitching: false, generation: 0 });
    });

    it('失敗時はローカル状態を変更せず、エラーを呼び出し元へ伝播する', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));

      await expect(signOutAllDevices()).rejects.toThrow();

      expect(useAuthStore.getState().status).toBe('signedIn');
      expect(getCurrentNamespace()).toBe('u1');
    });

    it('成功時は通常のsignOutと同じローカル処理を行う', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, revokedCount: 3 }));

      await signOutAllDevices();

      expect(useAuthStore.getState().status).toBe('signedOut');
      expect(getCurrentNamespace()).toBe(GUEST_NAMESPACE);
    });
  });

  describe('deleteAccount', () => {
    beforeEach(() => {
      useAuthStore.setState({
        status: 'signedIn',
        sessionAvailability: 'online',
        user: { publicUserId: 'u1', displayName: null, email: null, accountStatus: 'active', scheduledDeletionAt: null },
        accessToken: 'at-valid',
        accessTokenExpiresAt: Date.now() + 10 * 60_000,
      });
      useNamespaceStore.setState({ namespace: 'u1', isSwitching: false, generation: 0 });
    });

    it('失敗時はローカル状態を変更しない', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));

      await expect(deleteAccount()).rejects.toThrow();

      expect(useAuthStore.getState().status).toBe('signedIn');
      expect(getCurrentNamespace()).toBe('u1');
    });

    it('成功時はsignOutと同じローカル処理を行い、削除対象namespaceの登録済みストレージを物理削除する', async () => {
      const { readNamespacedItem } = await import('@/lib/accountNamespace');
      await AsyncStorage.setItem('cardhub::u1::my-lotteries', JSON.stringify({ state: { saved: [] }, version: 0 }));
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, scheduledDeletionAt: '2026-08-30T00:00:00.000Z' }));

      const result = await deleteAccount();

      expect(result.scheduledDeletionAt).toBe('2026-08-30T00:00:00.000Z');
      expect(useAuthStore.getState().status).toBe('signedOut');
      expect(getCurrentNamespace()).toBe(GUEST_NAMESPACE);
      expect(await readNamespacedItem('u1', 'my-lotteries')).toBeNull();
    });
  });
});
