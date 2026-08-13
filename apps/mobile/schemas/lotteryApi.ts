import { z } from 'zod';

/**
 * x-post-fetcher (apps/worker) の GET /lotteries, GET /lotteries/:id が返す
 * 実レスポンス形状に対応するZodスキーマ。
 *
 * 方針: バックエンドの型を直接importせず、実際のAPIレスポンス（フィクスチャで検証）を
 * 正としてここで再定義する。詳細は docs/api-integration.md を参照。
 *
 * cardType は x-post-fetcher/packages/shared の CardTypeSchema
 * (pokemon/onepiece/other/unknown) と値を合わせているが、型は独立して定義する。
 * verificationStatus/status はバックエンド側に列挙型としての正式な契約がないため
 * z.string() として受け、将来の値追加でパースが壊れないようにする。
 */

export const cardTypeSchema = z.enum(['pokemon', 'onepiece', 'other', 'unknown']);
export type CardTypeApi = z.infer<typeof cardTypeSchema>;

export const lotteryRecordSchema = z.object({
  id: z.number(),
  sourcePostId: z.number().nullable(),
  productNameRaw: z.string().nullable(),
  normalizedProductName: z.string().nullable(),
  cardType: cardTypeSchema.nullable(),
  storeNameRaw: z.string().nullable(),
  normalizedStoreName: z.string().nullable(),
  storeBranchRaw: z.string().nullable(),
  normalizedStoreBranch: z.string().nullable(),
  region: z.string().nullable(),
  normalizerVersion: z.string().nullable(),
  applicationStartAt: z.string().nullable(),
  confirmedOpenAt: z.string().nullable(),
  applicationEndAt: z.string().nullable(),
  applicationEndDate: z.string().nullable(),
  applicationEndPrecision: z.string().nullable(),
  resultAnnouncementAt: z.string().nullable(),
  resultAnnouncementDate: z.string().nullable(),
  resultAnnouncementPrecision: z.string().nullable(),
  purchaseStartAt: z.string().nullable(),
  purchaseDeadlineAt: z.string().nullable(),
  applicationUrl: z.string().nullable(),
  /** 応募ページURLの複数指定。1件目はapplicationUrlと同じ値（x-post-fetcher Phase 9）。
   * バックエンドの段階的ロールアウトに耐えられるよう、フィールド自体が無いレスポンスも許容する。 */
  applicationUrls: z.array(z.string()).nullable().optional(),
  resolvedApplicationUrl: z.string().nullable(),
  applicationUrlHttpStatus: z.number().nullable(),
  urlResolvedAt: z.string().nullable(),
  officialInformationUrl: z.string().nullable(),
  appDownloadUrl: z.string().nullable(),
  applicationMethod: z.string().nullable(),
  /** 管理画面（Phase 7）からアップロードされた商品画像URL。バックエンドの段階的ロールアウトに
   * 耐えられるよう、フィールド自体が無いレスポンスも許容する（`.optional()`）。 */
  imageUrl: z.string().nullable().optional(),
  eligibilityConditions: z.string().nullable(),
  pickupMethod: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  price: z.string().nullable(),
  status: z.string().nullable(),
  completenessScore: z.string().nullable(),
  verificationStatus: z.string().nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  rejectedReason: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  lifecycleStatus: z.string(),
  orphanedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LotteryRecord = z.infer<typeof lotteryRecordSchema>;

export const lotterySourceRecordSchema = z.object({
  id: z.number(),
  lotteryId: z.number(),
  sourcePostId: z.number(),
  matchAction: z.string().nullable(),
  matchScore: z.string().nullable(),
  matchReason: z.string().nullable(),
  contributedFields: z.string().nullable(),
  createdAt: z.string(),
});

export const lotteryFieldHistoryRecordSchema = z.object({
  id: z.number(),
  lotteryId: z.number(),
  sourcePostId: z.number().nullable(),
  fieldName: z.string(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  changeType: z.string(),
  createdAt: z.string(),
});

export const listLotteriesResponseSchema = z.object({
  ok: z.literal(true),
  lotteries: z.array(lotteryRecordSchema),
  total: z.number(),
  limit: z.number(),
  // ステータス分類（受付中/結果待ち/終了済み）を固定した基準時刻。次ページ取得時はcursorと共に
  // 必ずこの値をそのまま送り返す（異なるasOfと組み合わせるとサーバー側で400になる）。
  asOf: z.string(),
  // 次ページが無い場合はnull。
  nextCursor: z.string().nullable(),
});

export type ListLotteriesResponse = z.infer<typeof listLotteriesResponseSchema>;

export const lotteryDetailResponseSchema = z.object({
  ok: z.literal(true),
  lottery: lotteryRecordSchema,
  sources: z.array(lotterySourceRecordSchema),
  fieldHistory: z.array(lotteryFieldHistoryRecordSchema),
});

export type LotteryDetailResponse = z.infer<typeof lotteryDetailResponseSchema>;

export const apiErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
