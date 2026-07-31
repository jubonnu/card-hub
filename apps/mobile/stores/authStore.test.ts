import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore, type AuthUser } from '@/stores/authStore';

const user: AuthUser = {
  publicUserId: 'user-1',
  displayName: '太郎',
  email: 'taro@example.com',
  accountStatus: 'active',
  scheduledDeletionAt: null,
};

function resetStore() {
  useAuthStore.setState({
    status: 'initializing',
    sessionAvailability: 'expired',
    user: null,
    accessToken: null,
    accessTokenExpiresAt: null,
  });
}

describe('authStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('初期状態はinitializing/expiredでuser・accessTokenは無い', () => {
    const state = useAuthStore.getState();
    expect(state.status).toBe('initializing');
    expect(state.sessionAvailability).toBe('expired');
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
  });

  it('setSignedInFromCacheはstatusのみsignedInへ倒し、accessTokenは設定しない', () => {
    useAuthStore.getState().setSignedInFromCache();
    const state = useAuthStore.getState();
    expect(state.status).toBe('signedIn');
    expect(state.accessToken).toBeNull();
  });

  it('setSignedInでstatus/sessionAvailability/user/accessTokenがすべて更新される', () => {
    useAuthStore.getState().setSignedIn({ user, accessToken: 'token-1', accessTokenExpiresAt: 1000 });
    const state = useAuthStore.getState();
    expect(state.status).toBe('signedIn');
    expect(state.sessionAvailability).toBe('online');
    expect(state.user).toEqual(user);
    expect(state.accessToken).toBe('token-1');
    expect(state.accessTokenExpiresAt).toBe(1000);
  });

  it('setSignedOutですべてクリアされる', () => {
    useAuthStore.getState().setSignedIn({ user, accessToken: 'token-1', accessTokenExpiresAt: 1000 });
    useAuthStore.getState().setSignedOut();
    const state = useAuthStore.getState();
    expect(state.status).toBe('signedOut');
    expect(state.sessionAvailability).toBe('expired');
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.accessTokenExpiresAt).toBeNull();
  });

  it('setAccessTokenはaccessTokenのみ更新しsessionAvailabilityをonlineへ倒す', () => {
    useAuthStore.getState().setSessionAvailability('offlineCached');
    useAuthStore.getState().setAccessToken({ accessToken: 'token-2', accessTokenExpiresAt: 2000 });
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('token-2');
    expect(state.sessionAvailability).toBe('online');
  });

  it('persistにはuserのみを保存し、accessTokenは永続化しない', async () => {
    useAuthStore.getState().setSignedIn({ user, accessToken: 'secret-access-token', accessTokenExpiresAt: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const raw = await AsyncStorage.getItem('cardhub-auth');
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw!);
    expect(persisted.state.user).toEqual(user);
    expect(persisted.state.accessToken).toBeUndefined();
    expect(JSON.stringify(persisted)).not.toContain('secret-access-token');
  });
});
