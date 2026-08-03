import { z } from 'zod';

/**
 * x-post-fetcher (apps/worker) の /auth/*, /me/* が返す実レスポンス形状に対応するZodスキーマ。
 * `apps/mobile/schemas/lotteryApi.ts` と同じ方針で、バックエンドの型を直接importせず
 * ここで再定義する（詳細は docs/api-integration.md）。
 *
 * エラーレスポンスは `/lotteries` 系（`{ok:false,error}`）とは別系統で
 * `{error:{code,message,requestId}}` 形式（`x-post-fetcher/apps/worker/src/auth/errors.ts`）。
 */

export const accountStatusSchema = z.enum(['active', 'pending_deletion', 'deleted']);

/** POST /auth/apple, POST /auth/refresh のuser（createdAtのみ、scheduledDeletionAtは含まない）。 */
export const authLoginUserSchema = z.object({
  publicUserId: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  accountStatus: accountStatusSchema,
  createdAt: z.string(),
});

export const authLoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  user: authLoginUserSchema,
});
export type AuthLoginResponse = z.infer<typeof authLoginResponseSchema>;

export const authRefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});
export type AuthRefreshResponse = z.infer<typeof authRefreshResponseSchema>;

/** GET /me（scheduledDeletionAtを含む完全なユーザー情報）。 */
export const meResponseSchema = z.object({
  publicUserId: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  accountStatus: accountStatusSchema,
  scheduledDeletionAt: z.string().nullable(),
  createdAt: z.string(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const deleteMeResponseSchema = z.object({
  ok: z.literal(true),
  scheduledDeletionAt: z.string(),
});
export type DeleteMeResponse = z.infer<typeof deleteMeResponseSchema>;

export const logoutResponseSchema = z.object({ ok: z.literal(true) });

export const logoutAllResponseSchema = z.object({ ok: z.literal(true), revokedCount: z.number() });

export const authApiErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'TOKEN_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'CONFIG_ERROR',
  'AUTH_NOT_CONFIGURED',
  'AUTH_PROVIDER_UNAVAILABLE',
  'SERVICE_BUSY',
  'INTERNAL_ERROR',
  /** premium加入が必要（Mobile-G6、/me/statistics/*等）。 */
  'PREMIUM_REQUIRED',
]);
export type AuthApiErrorCode = z.infer<typeof authApiErrorCodeSchema>;

export const authApiErrorResponseSchema = z.object({
  error: z.object({
    code: authApiErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
  }),
});
