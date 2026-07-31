import { z } from 'zod';

import { AuthApiError } from '@/lib/authApiClient';
import { authenticatedRequest } from '@/lib/authenticatedApiClient';
import {
  listChecklistStepsResponseSchema,
  listFavoritesResponseSchema,
  listFollowedProductsResponseSchema,
  listUserLotteriesResponseSchema,
  notificationPreferencesResponseSchema,
  notificationPreferencesVersionConflictSchema,
  putChecklistResponseSchema,
  putFavoriteResponseSchema,
  putFollowedProductResponseSchema,
  putNotificationPreferencesResponseSchema,
  syncBootstrapResponseSchema,
  syncLotteriesResponseSchema,
  userLotteryMutationResponseSchema,
  userLotteryVersionConflictSchema,
  type ChecklistStepRow,
  type FavoriteRow,
  type ListChecklistStepsResponse,
  type ListFavoritesResponse,
  type ListFollowedProductsResponse,
  type ListUserLotteriesResponse,
  type LotterySnapshotApi,
  type LotteryStatusApi,
  type NotificationPreferencesResponse,
  type PutChecklistResponse,
  type SyncBootstrapRequest,
  type SyncBootstrapResponse,
  type SyncLotteriesResponse,
  type UserLotteryMutationResponse,
} from '@/schemas/syncApi';

/**
 * `/me/*`系エンドポイントの薄いクライアント（G3-3）。認証・401リフレッシュ・リトライは
 * `lib/authenticatedApiClient.ts`の`authenticatedRequest`に委ねる。各関数は成功時の
 * レスポンスをZodで検証して返し、失敗時は`AuthApiError`をそのまま呼び出し元へ伝播する
 * （`stores`側・`offlineQueue`側でkindごとの分岐を行う）。
 */

export class SyncResponseValidationError extends Error {
  constructor(message = 'サーバーからの応答の形式が想定と異なります') {
    super(message);
    this.name = 'SyncResponseValidationError';
  }
}

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new SyncResponseValidationError();
  return parsed.data;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

/**
 * `AuthApiError.kind === 'version_conflict'`のとき、レスポンスに同梱される`current`を
 * Zod検証して取り出す。形式不正・非VERSION_CONFLICTエラーの場合は`null`を返す
 * （呼び出し側は`current`が無くても汎用エラー表示にフォールバックできる想定）。
 */
export function extractVersionConflictCurrent<T>(error: unknown, currentSchema: z.ZodType<{ current: T }>): T | null {
  if (!(error instanceof AuthApiError) || error.kind !== 'version_conflict') return null;
  const parsed = currentSchema.safeParse(error.details);
  return parsed.success ? parsed.data.current : null;
}

export function extractUserLotteryVersionConflict(error: unknown) {
  return extractVersionConflictCurrent(error, userLotteryVersionConflictSchema);
}

export function extractNotificationPreferencesVersionConflict(error: unknown) {
  return extractVersionConflictCurrent(error, notificationPreferencesVersionConflictSchema);
}

// ---- user lotteries ----

export async function fetchUserLotteries(params: { status?: LotteryStatusApi; limit?: number; offset?: number } = {}): Promise<ListUserLotteriesResponse> {
  const body = await authenticatedRequest(`/me/lotteries${buildQuery(params)}`);
  return parseOrThrow(listUserLotteriesResponseSchema, body);
}

export interface PutUserLotteryPayload {
  status?: LotteryStatusApi;
  snapshot?: LotterySnapshotApi;
  savedAt?: string;
  expectedServerVersion?: number;
  clientRequestId: string;
}

export async function putUserLottery(lotteryId: number, payload: PutUserLotteryPayload): Promise<UserLotteryMutationResponse> {
  const body = await authenticatedRequest(`/me/lotteries/${lotteryId}`, { method: 'PUT', body: JSON.stringify(payload) });
  return parseOrThrow(userLotteryMutationResponseSchema, body);
}

export interface PatchUserLotteryStatusPayload {
  status: LotteryStatusApi;
  expectedServerVersion: number;
  clientRequestId: string;
}

export async function patchUserLotteryStatus(lotteryId: number, payload: PatchUserLotteryStatusPayload): Promise<UserLotteryMutationResponse> {
  const body = await authenticatedRequest(`/me/lotteries/${lotteryId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  return parseOrThrow(userLotteryMutationResponseSchema, body);
}

export async function deleteUserLottery(lotteryId: number, payload: { expectedServerVersion?: number; clientRequestId: string }): Promise<void> {
  await authenticatedRequest(`/me/lotteries/${lotteryId}`, { method: 'DELETE', body: JSON.stringify(payload) });
}

export async function syncLotteries(
  items: { lotteryId: number; status: LotteryStatusApi; savedAt?: string; snapshot?: LotterySnapshotApi; clientRequestId: string }[]
): Promise<SyncLotteriesResponse> {
  const body = await authenticatedRequest('/me/lotteries/sync', { method: 'POST', body: JSON.stringify({ items }) });
  return parseOrThrow(syncLotteriesResponseSchema, body);
}

// ---- favorites ----

export async function fetchFavorites(params: { limit?: number; offset?: number } = {}): Promise<ListFavoritesResponse> {
  const body = await authenticatedRequest(`/me/favorites${buildQuery(params)}`);
  return parseOrThrow(listFavoritesResponseSchema, body);
}

export async function putFavorite(lotteryId: number, clientRequestId: string): Promise<FavoriteRow & { outcome: string }> {
  const body = await authenticatedRequest(`/me/favorites/${lotteryId}`, { method: 'PUT', body: JSON.stringify({ clientRequestId }) });
  return parseOrThrow(putFavoriteResponseSchema, body);
}

export async function deleteFavorite(lotteryId: number, clientRequestId: string): Promise<void> {
  await authenticatedRequest(`/me/favorites/${lotteryId}`, { method: 'DELETE', body: JSON.stringify({ clientRequestId }) });
}

// ---- followed products ----

export async function fetchFollowedProducts(params: { limit?: number; offset?: number } = {}): Promise<ListFollowedProductsResponse> {
  const body = await authenticatedRequest(`/me/followed-products${buildQuery(params)}`);
  return parseOrThrow(listFollowedProductsResponseSchema, body);
}

export async function putFollowedProduct(publicProductId: string, clientRequestId: string) {
  const body = await authenticatedRequest(`/me/followed-products/${publicProductId}`, {
    method: 'PUT',
    body: JSON.stringify({ clientRequestId }),
  });
  return parseOrThrow(putFollowedProductResponseSchema, body);
}

export async function deleteFollowedProduct(publicProductId: string, clientRequestId: string): Promise<void> {
  await authenticatedRequest(`/me/followed-products/${publicProductId}`, { method: 'DELETE', body: JSON.stringify({ clientRequestId }) });
}

// ---- checklist ----

export async function fetchChecklistSteps(lotteryId: number): Promise<ChecklistStepRow[]> {
  const body = await authenticatedRequest(`/me/checklists/${lotteryId}`);
  const parsed: ListChecklistStepsResponse = parseOrThrow(listChecklistStepsResponseSchema, body);
  return parsed.items;
}

export interface PutChecklistStepPayload {
  stepId: string;
  label: string;
  done: boolean;
  completedNote?: string | null;
  sortOrder?: number;
  clientActionAt?: string;
  expectedServerVersion: number;
  clientRequestId: string;
}

export async function putChecklistSteps(lotteryId: number, steps: PutChecklistStepPayload[]): Promise<PutChecklistResponse> {
  const body = await authenticatedRequest(`/me/checklists/${lotteryId}`, { method: 'PUT', body: JSON.stringify({ steps }) });
  return parseOrThrow(putChecklistResponseSchema, body);
}

// ---- notification preferences ----

export async function fetchNotificationPreferences(): Promise<NotificationPreferencesResponse> {
  const body = await authenticatedRequest('/me/notification-preferences');
  return parseOrThrow(notificationPreferencesResponseSchema, body);
}

export interface PutNotificationPreferencesPayload {
  deadlineReminder: boolean;
  announcementReminder: boolean;
  purchaseReminder: boolean;
  newLotteryAlert: boolean;
  favoriteUpdateAlert: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  deadlineReminderHoursBefore: number;
  announcementReminderHoursBefore: number;
  purchaseReminderHoursBefore: number;
  expectedServerVersion?: number;
  clientRequestId: string;
}

export async function putNotificationPreferences(payload: PutNotificationPreferencesPayload) {
  const body = await authenticatedRequest('/me/notification-preferences', { method: 'PUT', body: JSON.stringify(payload) });
  return parseOrThrow(putNotificationPreferencesResponseSchema, body);
}

// ---- bootstrap ----

export async function postSyncBootstrap(request: SyncBootstrapRequest): Promise<SyncBootstrapResponse> {
  const body = await authenticatedRequest('/me/sync/bootstrap', { method: 'POST', body: JSON.stringify(request) });
  return parseOrThrow(syncBootstrapResponseSchema, body);
}
