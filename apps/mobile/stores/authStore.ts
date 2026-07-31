import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type AuthStatus = 'initializing' | 'signedOut' | 'signedIn';

/**
 * 認証状態（AuthStatus）とは独立した「今どのくらい鮮度のあるセッションで動いているか」の軸。
 * オフライン・タイムアウト・5xx等の一時的な通信不可では`signedOut`へ落とさず、
 * `offlineCached`としてローカルキャッシュ表示を継続するために分離する（Mobile-G3要件）。
 *
 * - `online`: 直近のRefresh/API呼び出しが成功し、Access Tokenが有効
 * - `expired`: Access Tokenが無いか期限切れだが、まだRefreshを試みていない
 * - `refreshing`: Refresh呼び出しが進行中
 * - `offlineCached`: 直近のRefreshがnetwork/timeout/5xx/429/AUTH_NOT_CONFIGURED等の一時的理由で
 *   失敗し、Refresh Tokenは保持したままローカルキャッシュのみで表示している
 */
export type SessionAvailability = 'online' | 'expired' | 'refreshing' | 'offlineCached';

export interface AuthUser {
  publicUserId: string;
  displayName: string | null;
  email: string | null;
  accountStatus: 'active' | 'pending_deletion' | 'deleted';
  scheduledDeletionAt: string | null;
  /**
   * Apple Sign-Inは初回認可時のみfullNameを返す仕様のため、初回に取得できた表示名を
   * ローカルにキャッシュしておく（`lib/displayName.ts`の表示名解決で使う）。
   * サーバーが同名を保存していないため、サインアウト・再インストールで失われる制約が残る。
   */
  cachedAppleDisplayName: string | null;
}

interface AuthState {
  status: AuthStatus;
  sessionAvailability: SessionAvailability;
  /** 表示用キャッシュ。`persist`で永続化する唯一のフィールド（非機微情報のみ）。 */
  user: AuthUser | null;
  /** メモリ保持のみ。15分の短寿命のためどのストレージにも永続化しない。 */
  accessToken: string | null;
  accessTokenExpiresAt: number | null;

  setSignedIn: (params: { user: AuthUser; accessToken: string; accessTokenExpiresAt: number }) => void;
  /** SecureStoreにRefresh Tokenが存在すると判明した時点で、Refresh確定前に楽観的に呼ぶ。 */
  setSignedInFromCache: () => void;
  setAccessToken: (params: { accessToken: string; accessTokenExpiresAt: number }) => void;
  setUser: (user: AuthUser | null) => void;
  setSessionAvailability: (availability: SessionAvailability) => void;
  setSignedOut: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status: 'initializing',
      sessionAvailability: 'expired',
      user: null,
      accessToken: null,
      accessTokenExpiresAt: null,

      setSignedIn: ({ user, accessToken, accessTokenExpiresAt }) =>
        set({ status: 'signedIn', sessionAvailability: 'online', user, accessToken, accessTokenExpiresAt }),
      setSignedInFromCache: () => set({ status: 'signedIn' }),
      setAccessToken: ({ accessToken, accessTokenExpiresAt }) =>
        set({ accessToken, accessTokenExpiresAt, sessionAvailability: 'online' }),
      setUser: (user) => set({ user }),
      setSessionAvailability: (availability) => set({ sessionAvailability: availability }),
      setSignedOut: () =>
        set({ status: 'signedOut', sessionAvailability: 'expired', user: null, accessToken: null, accessTokenExpiresAt: null }),
    }),
    {
      name: 'cardhub-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ user: state.user }),
    }
  )
);
