import { z } from 'zod';

/**
 * x-post-fetcher (apps/worker) の GET /me/entitlements・POST /me/entitlements/refresh が
 * 返す実レスポンス形状に対応するZodスキーマ（Mobile-G4）。RevenueCatの生レスポンスは
 * サーバーがモバイルへ返さない設計のため、ここではサーバーの整形済みレスポンスのみを扱う。
 */
export const entitlementsResponseSchema = z.object({
  premiumActive: z.boolean(),
  productType: z.string().nullable(),
  expiresAt: z.string().nullable(),
  lastVerifiedAt: z.string().nullable(),
  stale: z.boolean(),
});
export type EntitlementsResponse = z.infer<typeof entitlementsResponseSchema>;
