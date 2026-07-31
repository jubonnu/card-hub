import { AuthApiError, refreshTokens } from '@/lib/authApiClient';
import { syncNamespaceWithAuthUser } from '@/lib/accountNamespace';
import { clearRefreshToken, getRefreshToken, getRefreshTokenDeviceId, saveRefreshToken } from '@/lib/secureStore';
import { useAuthStore } from '@/stores/authStore';

/** Refresh Tokenが無い/明確に無効化されており、セッションを破棄したことを示す。 */
export class SessionDiscardedError extends Error {
  constructor(message = 'セッションが無効になりました。再度ログインしてください') {
    super(message);
    this.name = 'SessionDiscardedError';
  }
}

let inFlightRefresh: Promise<string> | null = null;

const DISCARD_SESSION_KINDS = new Set<AuthApiError['kind']>(['unauthorized', 'token_expired']);

/**
 * 401駆動・アプリ復帰時の先回りリフレッシュ双方から呼ばれる、Refresh Token交換の
 * 一本化ロジック（5・6章）。複数箇所からほぼ同時に呼ばれても、実際にサーバーへ送る
 * Refreshリクエストは1回のみ（`inFlightRefresh`を共有）。
 *
 * 失敗の分類:
 * - Refresh Tokenが無い、またはサーバーがinvalid/revoked/expired/reuse detectedと判定
 *   （UNAUTHORIZED/TOKEN_EXPIRED） → セッションを破棄し`signedOut`へ（SecureStoreもクリア）
 * - それ以外（network/invalid_response/config/RATE_LIMITED/AUTH_NOT_CONFIGURED/
 *   AUTH_PROVIDER_UNAVAILABLE/SERVICE_BUSY/internal） → 一時的な問題としてRefresh Tokenを
 *   保持したまま`offlineCached`へ移行する（単なるオフライン・5xx等でログアウトさせない）
 */
export async function refreshAccessToken(): Promise<string> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    const store = useAuthStore.getState();
    store.setSessionAvailability('refreshing');

    try {
      const [refreshToken, deviceId] = await Promise.all([getRefreshToken(), getRefreshTokenDeviceId()]);
      if (!refreshToken || !deviceId) {
        useAuthStore.getState().setSignedOut();
        await syncNamespaceWithAuthUser(); // 24-2章: 強制セッション破棄でもguest namespaceへ戻す
        throw new SessionDiscardedError('保存済みのセッションがありません');
      }

      let result;
      try {
        result = await refreshTokens({ refreshToken, deviceId });
      } catch (e) {
        if (e instanceof AuthApiError && DISCARD_SESSION_KINDS.has(e.kind)) {
          await clearRefreshToken();
          useAuthStore.getState().setSignedOut();
          await syncNamespaceWithAuthUser(); // 24-2章: 強制セッション破棄でもguest namespaceへ戻す
          throw new SessionDiscardedError(e.message);
        }
        // 一時的な問題: Refresh Tokenは保持し、キャッシュ表示を継続する。
        useAuthStore.getState().setSessionAvailability('offlineCached');
        throw e;
      }

      await saveRefreshToken(result.refreshToken, deviceId);
      useAuthStore.getState().setAccessToken({
        accessToken: result.accessToken,
        accessTokenExpiresAt: Date.now() + result.expiresIn * 1000,
      });
      return result.accessToken;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

/** Access Tokenの期限が1分未満（未取得含む）かどうか。アプリ復帰時の先回りRefresh判定に使う。 */
export function shouldPreemptivelyRefresh(): boolean {
  const { accessToken, accessTokenExpiresAt } = useAuthStore.getState();
  if (!accessToken || accessTokenExpiresAt === null) return true;
  return accessTokenExpiresAt - Date.now() < 60_000;
}
