import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { deleteNamespaceData, syncNamespaceWithAuthUser } from '@/lib/accountNamespace';
import { appleSignIn, deleteMe, fetchMe, logout, logoutAllDevices } from '@/lib/authApiClient';
import { ensureNamespaceAndBootstrap } from '@/lib/bootstrapSync';
import { getOrCreateDeviceId } from '@/lib/deviceId';
import { clearRefreshToken, getRefreshToken, getRefreshTokenDeviceId, saveRefreshToken } from '@/lib/secureStore';
import { useSyncConflictsStore } from '@/lib/syncConflicts';
import { refreshAccessToken, SessionDiscardedError } from '@/lib/tokenRefresh';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import type { MeResponse } from '@/schemas/authApi';

/** ユーザーによる意図的なキャンセル。エラーアラート対象ではなく通常のキャンセルとして扱う（4章要件）。 */
export class AppleSignInCancelledError extends Error {
  constructor() {
    super('サインインがキャンセルされました');
    this.name = 'AppleSignInCancelledError';
  }
}

function isAppleSignInCancelled(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const code = (e as { code?: unknown }).code;
  return code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED';
}

function toAuthUser(
  user: { publicUserId: string; displayName: string | null; email: string | null; accountStatus: MeResponse['accountStatus'] },
  scheduledDeletionAt: string | null = null
): AuthUser {
  return {
    publicUserId: user.publicUserId,
    displayName: user.displayName,
    email: user.email,
    accountStatus: user.accountStatus,
    scheduledDeletionAt,
  };
}

/**
 * ログイン成功直後にscheduledDeletionAt等の完全なユーザー情報を補完する（17章:
 * 猶予期間中の再ログインでpending_deletion状態を正しく反映するため）。失敗してもログイン
 * 自体は成立させる（表示用情報の補完に過ぎず、次回のセッション復元・同期時に再取得される）。
 */
async function hydrateFullUser(accessToken: string): Promise<void> {
  try {
    const me = await fetchMe(accessToken);
    useAuthStore.getState().setUser(toAuthUser(me, me.scheduledDeletionAt));
  } catch {
    // ベストエフォート
  }
}

let signInInFlight: Promise<void> | null = null;

/**
 * Sign in with Appleフロー（8・9章）。多重タップされても実行は1回のみ（`signInInFlight`）。
 * rawNonce/identityToken/authorizationCodeはその場で送信し、変数スコープを抜けた時点で
 * 破棄する（ログ・クラッシュレポートへは一切出力しない）。
 */
export async function signInWithApple(): Promise<void> {
  if (signInInFlight) return signInInFlight;

  const run = async (): Promise<void> => {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashedNonce,
      });
    } catch (e) {
      if (isAppleSignInCancelled(e)) throw new AppleSignInCancelledError();
      throw e;
    }

    if (!credential.identityToken || !credential.authorizationCode) {
      // identityToken/authorizationCodeいずれかの欠落時はログイン不成立（4章要件）。
      // Apple側での交換に失敗した場合は、この値を使い回さずsignInAsyncからやり直す
      // （identityToken/authorizationCodeは単発利用のため）。
      throw new Error('Appleからのサインイン情報を取得できませんでした。もう一度お試しください');
    }

    const deviceId = await getOrCreateDeviceId();

    const loginResult = await appleSignIn({
      identityToken: credential.identityToken,
      authorizationCode: credential.authorizationCode,
      rawNonce,
      deviceId,
    });

    await saveRefreshToken(loginResult.refreshToken, deviceId);
    useAuthStore.getState().setSignedIn({
      user: toAuthUser(loginResult.user),
      accessToken: loginResult.accessToken,
      accessTokenExpiresAt: Date.now() + loginResult.expiresIn * 1000,
    });

    // namespace切替・bootstrap同期（24-6章）。失敗してもログイン自体は成立させる
    // （bootstrap未実施のまま`signedIn`となり、次回の`restoreSession`等で再試行される）。
    try {
      await ensureNamespaceAndBootstrap();
    } catch {
      // ベストエフォート。詳細はensureNamespaceAndBootstrap内部のリトライ設計（batchClientRequestId保持）に委ねる。
    }

    await hydrateFullUser(loginResult.accessToken);
  };

  signInInFlight = run().finally(() => {
    signInInFlight = null;
  });

  return signInInFlight;
}

/**
 * アプリ起動時のセッション復元（7章）。SecureStoreにRefresh Tokenがあれば、Refresh確定前に
 * 楽観的に`signedIn`（キャッシュ表示）へ遷移し、単なるオフライン・5xx等では`signedOut`へ
 * 落とさない。Refresh Token自体が無効と判明した場合のみ`refreshAccessToken`が`signedOut`へ倒す。
 */
export async function restoreSession(): Promise<void> {
  const [refreshToken, deviceId] = await Promise.all([getRefreshToken(), getRefreshTokenDeviceId()]);
  if (!refreshToken || !deviceId) {
    useAuthStore.getState().setSignedOut();
    return;
  }

  useAuthStore.getState().setSignedInFromCache();

  try {
    const accessToken = await refreshAccessToken();
    await hydrateFullUser(accessToken);
    // namespace切替・未完了bootstrapの再試行（24-6章）。失敗してもセッション復元自体は成立させる。
    try {
      await ensureNamespaceAndBootstrap();
    } catch {
      // ベストエフォート。
    }
  } catch (e) {
    if (e instanceof SessionDiscardedError) return;
    // それ以外（network/5xx等）はtokenRefresh側でsessionAvailability='offlineCached'へ
    // 遷移済み。status='signedIn'のままキャッシュ済みuserで表示を継続する。
  }
}

/**
 * ローカルサインアウト処理の共通部分（10・24-3章）。`signOut`・`signOutAllDevices`成功時・
 * `deleteAccount`成功時のすべてがこれを再利用する（ロジックを複製しない）。
 */
async function localSignOutCleanup(): Promise<void> {
  await clearRefreshToken();
  useAuthStore.getState().setSignedOut();
  await syncNamespaceWithAuthUser(); // userのnamespaceは削除しない。guestへ切り替えるのみ（24-3章）。
  useSyncConflictsStore.getState().clear();
}

/**
 * ログアウト（10・24-3章）。`/auth/logout`はベストエフォート（失敗しても後続を継続する）。
 * ログイン中ユーザーのnamespace自体・未送信オフラインキューは削除しない。
 */
export async function signOut(): Promise<void> {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    try {
      const deviceId = await getOrCreateDeviceId();
      await logout({ accessToken, deviceId });
    } catch {
      // ベストエフォート（10章）。
    }
  }
  await localSignOutCleanup();
}

/**
 * 全端末ログアウト（24-4章）。通常のログアウトと異なりベストエフォートではない:
 * `/auth/logout-all`が失敗した場合はローカル状態を一切変更せず、呼び出し元へエラーを
 * そのまま伝播する（「全端末ログアウト済み」という誤った成功表示を避けるため）。
 */
export async function signOutAllDevices(): Promise<void> {
  const { accessToken } = useAuthStore.getState();
  if (!accessToken) throw new Error('ログインしていません');

  await logoutAllDevices(accessToken);
  await localSignOutCleanup();
}

/**
 * アカウント削除（17・24-5章）。`DELETE /me`成功時は`signOut`と同じローカル処理を再利用した上で、
 * 削除対象namespace（削除前の`publicUserId`）のローカルストレージを物理削除する。
 * API呼び出しが失敗した場合はローカル状態を一切変更しない。
 */
export async function deleteAccount(): Promise<{ scheduledDeletionAt: string }> {
  const { accessToken, user } = useAuthStore.getState();
  if (!accessToken) throw new Error('ログインしていません');

  const previousNamespace = user?.publicUserId ?? null;
  const result = await deleteMe(accessToken);

  await localSignOutCleanup();
  if (previousNamespace) {
    await deleteNamespaceData(previousNamespace);
  }

  return { scheduledDeletionAt: result.scheduledDeletionAt };
}
