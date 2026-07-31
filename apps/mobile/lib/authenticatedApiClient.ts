import { AuthApiError, authErrorAwareFetch } from '@/lib/authApiClient';
import { refreshAccessToken, SessionDiscardedError, shouldPreemptivelyRefresh } from '@/lib/tokenRefresh';
import { useAuthStore } from '@/stores/authStore';

/**
 * 認証必須の`/me/*`系エンドポイント向け共通クライアント（5章）。`syncClient`（G3-3）・
 * `offlineQueue`（G3-4）から利用される。公開`/lotteries`系（`lib/apiClient.ts`）とは
 * 別経路（未ログインでも動作する必要があるため、こちらはAuthorizationを常に付与しない）。
 *
 * - 呼び出し前にAccess Token期限が1分未満なら先回りRefresh
 * - 401（UNAUTHORIZED/TOKEN_EXPIRED）を受けた場合は`refreshAccessToken`で1回だけRefreshし、
 *   同一の`init`で元リクエストを最大1回だけ再送する。再送後も401ならそのままエラーを返す
 *   （ループしない）。`/auth/refresh`自体はこの関数を経由しない別経路のため対象外
 * - `init.body`は文字列（JSON.stringify済み）のみを想定する。再送時に同じ`init`を再利用する
 *   （文字列bodyはストリームと異なり複数回のfetchで安全に再利用できる）ため、
 *   呼び出し側が発行するclientRequestIdは再送前後で変化しない
 */
export async function authenticatedRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  if (shouldPreemptivelyRefresh()) {
    try {
      await refreshAccessToken();
    } catch (e) {
      if (e instanceof SessionDiscardedError) throw e;
      // 一時的な問題（offlineCached）。実際のリクエストの401/エラーハンドリングに委ねて続行する。
    }
  }

  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) {
    throw new AuthApiError('unauthorized', 'ログインが必要です');
  }

  try {
    return await authErrorAwareFetch(path, init, accessToken);
  } catch (e) {
    if (!(e instanceof AuthApiError) || (e.kind !== 'unauthorized' && e.kind !== 'token_expired')) {
      throw e;
    }

    const refreshedToken = await refreshAccessToken();
    return authErrorAwareFetch(path, init, refreshedToken);
  }
}
