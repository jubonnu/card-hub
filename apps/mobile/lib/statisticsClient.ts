import { z } from 'zod';

import { authenticatedRequest } from '@/lib/authenticatedApiClient';
import {
  statisticsMonthlyResponseSchema,
  statisticsStoresResponseSchema,
  statisticsSummaryResponseSchema,
  type StatisticsMonthlyResponse,
  type StatisticsStoresResponse,
  type StatisticsSummaryResponse,
} from '@/schemas/statisticsApi';

/** `/me/statistics/*`の薄いクライアント（Mobile-G6、premium必須）。`lib/syncClient.ts`と同型。 */

export class StatisticsResponseValidationError extends Error {
  constructor(message = 'サーバーからの応答の形式が想定と異なります') {
    super(message);
    this.name = 'StatisticsResponseValidationError';
  }
}

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new StatisticsResponseValidationError();
  return parsed.data;
}

export async function fetchStatisticsSummary(): Promise<StatisticsSummaryResponse> {
  const body = await authenticatedRequest('/me/statistics/summary');
  return parseOrThrow(statisticsSummaryResponseSchema, body);
}

export async function fetchStatisticsMonthly(months: number): Promise<StatisticsMonthlyResponse> {
  const body = await authenticatedRequest(`/me/statistics/monthly?months=${months}`);
  return parseOrThrow(statisticsMonthlyResponseSchema, body);
}

export async function fetchStatisticsStores(limit: number): Promise<StatisticsStoresResponse> {
  const body = await authenticatedRequest(`/me/statistics/stores?limit=${limit}`);
  return parseOrThrow(statisticsStoresResponseSchema, body);
}
