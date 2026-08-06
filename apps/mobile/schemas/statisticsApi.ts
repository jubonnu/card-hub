import { z } from 'zod';

/**
 * x-post-fetcher (apps/worker) の GET /me/statistics/* が返すレスポンス形状（Mobile-G6）。
 * いずれもpremium必須API。分母0（結果が出た件数が無い）のwinRateはnull（「計算不可」）で返る。
 */
export const statisticsSummaryResponseSchema = z.object({
  savedCount: z.number(),
  plannedCount: z.number(),
  appliedCount: z.number(),
  notAppliedCount: z.number(),
  wonCount: z.number(),
  lostCount: z.number(),
  pendingResultCount: z.number(),
  purchasedCount: z.number(),
  skippedCount: z.number(),
  winRate: z.number().nullable(),
});
export type StatisticsSummaryResponse = z.infer<typeof statisticsSummaryResponseSchema>;

export const statisticsMonthlyItemSchema = z.object({
  month: z.string(),
  appliedCount: z.number(),
  wonCount: z.number(),
  lostCount: z.number(),
  winRate: z.number().nullable(),
});
export const statisticsMonthlyResponseSchema = z.object({ items: z.array(statisticsMonthlyItemSchema) });
export type StatisticsMonthlyItem = z.infer<typeof statisticsMonthlyItemSchema>;
export type StatisticsMonthlyResponse = z.infer<typeof statisticsMonthlyResponseSchema>;

export const statisticsStoreItemSchema = z.object({
  storeName: z.string(),
  appliedCount: z.number(),
  wonCount: z.number(),
  lostCount: z.number(),
  pendingResultCount: z.number(),
  winRate: z.number(),
});
export const statisticsStoresResponseSchema = z.object({ items: z.array(statisticsStoreItemSchema) });
export type StatisticsStoreItem = z.infer<typeof statisticsStoreItemSchema>;
export type StatisticsStoresResponse = z.infer<typeof statisticsStoresResponseSchema>;
