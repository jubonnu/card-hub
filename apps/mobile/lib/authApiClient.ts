import { ApiConfigError, getApiBaseUrl } from '@/lib/apiClient';
import {
  authApiErrorResponseSchema,
  authLoginResponseSchema,
  authRefreshResponseSchema,
  deleteMeResponseSchema,
  logoutAllResponseSchema,
  logoutResponseSchema,
  meResponseSchema,
  type AuthApiErrorCode,
  type AuthLoginResponse,
  type AuthRefreshResponse,
  type DeleteMeResponse,
  type MeResponse,
} from '@/schemas/authApi';

/**
 * `/auth/*`, `/me` 呼び出しの薄いクライアント。認証必須エンドポイント（logout/logout-all/me）
 * にのみ`auth`引数でBearerを付与し、`/auth/apple`・`/auth/refresh`には誤って付与しない
 * （呼び出し側で明示的に分離、5章要件）。401時のRefresh・リトライは`lib/apiClient.ts`
 * （公開/lotteries系）とは別に`lib/tokenRefresh.ts`が担う。
 */

export type AuthApiErrorKind =
  | 'network'
  | 'invalid_response'
  | 'config'
  | 'unauthorized'
  | 'token_expired'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'version_conflict'
  | 'idempotency_conflict'
  | 'rate_limited'
  | 'auth_not_configured'
  | 'auth_provider_unavailable'
  | 'service_busy'
  | 'internal'
  | 'premium_required';

export class AuthApiError extends Error {
  kind: AuthApiErrorKind;
  retryAfterSeconds: number | null;
  /**
   * エラーレスポンスの生JSON全体（`{error:{...}}`に加え、`VERSION_CONFLICT`が持つ
   * 兄弟フィールド`current`等）。`syncClient.ts`が`current`をZod検証して取り出すために使う。
   */
  details: unknown;

  constructor(kind: AuthApiErrorKind, message: string, retryAfterSeconds: number | null = null, details: unknown = null) {
    super(message);
    this.name = 'AuthApiError';
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
    this.details = details;
  }
}

const CODE_TO_KIND: Record<AuthApiErrorCode, AuthApiErrorKind> = {
  UNAUTHORIZED: 'unauthorized',
  TOKEN_EXPIRED: 'token_expired',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  VALIDATION_ERROR: 'validation',
  CONFLICT: 'conflict',
  VERSION_CONFLICT: 'version_conflict',
  IDEMPOTENCY_CONFLICT: 'idempotency_conflict',
  RATE_LIMITED: 'rate_limited',
  CONFIG_ERROR: 'internal',
  AUTH_NOT_CONFIGURED: 'auth_not_configured',
  AUTH_PROVIDER_UNAVAILABLE: 'auth_provider_unavailable',
  SERVICE_BUSY: 'service_busy',
  INTERNAL_ERROR: 'internal',
  PREMIUM_REQUIRED: 'premium_required',
};

function parseRetryAfterHeader(response: Response): number | null {
  const raw = response.headers.get('Retry-After');
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export async function authErrorAwareFetch(path: string, init: RequestInit, accessToken?: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } catch (err) {
    if (err instanceof ApiConfigError) throw new AuthApiError('config', err.message);
    throw new AuthApiError('network', 'ネットワークに接続できませんでした');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AuthApiError('invalid_response', 'サーバーから不正な応答が返されました');
  }

  if (!response.ok) {
    const parsedError = authApiErrorResponseSchema.safeParse(body);
    const retryAfterSeconds = parseRetryAfterHeader(response);
    if (!parsedError.success) {
      throw new AuthApiError('invalid_response', `HTTP ${response.status}`, retryAfterSeconds, body);
    }
    throw new AuthApiError(CODE_TO_KIND[parsedError.data.error.code], parsedError.data.error.message, retryAfterSeconds, body);
  }

  return body;
}

export interface AppleSignInParams {
  identityToken: string;
  authorizationCode?: string;
  rawNonce?: string;
  deviceId: string;
  deviceName?: string;
  /** Appleが初回認可時にのみ返すfullName（Mobile-G4 Hardening）。サーバーはdisplayName未設定時のみ保存する。 */
  fullName?: string;
}

export async function appleSignIn(params: AppleSignInParams): Promise<AuthLoginResponse> {
  const body = await authErrorAwareFetch('/auth/apple', { method: 'POST', body: JSON.stringify(params) });
  const parsed = authLoginResponseSchema.safeParse(body);
  if (!parsed.success) throw new AuthApiError('invalid_response', 'ログインレスポンスの形式が想定と異なります');
  return parsed.data;
}

export async function refreshTokens(params: { refreshToken: string; deviceId: string }): Promise<AuthRefreshResponse> {
  const body = await authErrorAwareFetch('/auth/refresh', { method: 'POST', body: JSON.stringify(params) });
  const parsed = authRefreshResponseSchema.safeParse(body);
  if (!parsed.success) throw new AuthApiError('invalid_response', 'Refreshレスポンスの形式が想定と異なります');
  return parsed.data;
}

export async function logout(params: { accessToken: string; deviceId: string }): Promise<void> {
  const body = await authErrorAwareFetch(
    '/auth/logout',
    { method: 'POST', body: JSON.stringify({ deviceId: params.deviceId }) },
    params.accessToken
  );
  const parsed = logoutResponseSchema.safeParse(body);
  if (!parsed.success) throw new AuthApiError('invalid_response', 'ログアウトレスポンスの形式が想定と異なります');
}

export async function logoutAllDevices(accessToken: string): Promise<{ revokedCount: number }> {
  const body = await authErrorAwareFetch('/auth/logout-all', { method: 'POST', body: JSON.stringify({}) }, accessToken);
  const parsed = logoutAllResponseSchema.safeParse(body);
  if (!parsed.success) throw new AuthApiError('invalid_response', '全端末ログアウトレスポンスの形式が想定と異なります');
  return { revokedCount: parsed.data.revokedCount };
}

export async function fetchMe(accessToken: string): Promise<MeResponse> {
  const body = await authErrorAwareFetch('/me', { method: 'GET' }, accessToken);
  const parsed = meResponseSchema.safeParse(body);
  if (!parsed.success) throw new AuthApiError('invalid_response', 'ユーザー情報レスポンスの形式が想定と異なります');
  return parsed.data;
}

export async function deleteMe(accessToken: string): Promise<DeleteMeResponse> {
  const body = await authErrorAwareFetch('/me', { method: 'DELETE' }, accessToken);
  const parsed = deleteMeResponseSchema.safeParse(body);
  if (!parsed.success) throw new AuthApiError('invalid_response', 'アカウント削除レスポンスの形式が想定と異なります');
  return parsed.data;
}
