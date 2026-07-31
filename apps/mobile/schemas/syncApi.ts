import { z } from 'zod';

import { lotteryRecordSchema } from '@/schemas/lotteryApi';

/**
 * x-post-fetcher (apps/worker) の /me/lotteries, /me/favorites, /me/followed-products,
 * /me/checklists, /me/notification-preferences, /me/sync/bootstrap が返す実レスポンス形状に
 * 対応するZodスキーマ。`schemas/authApi.ts`と同じ方針で、実際のAPIレスポンスを正として
 * ここで再定義する（バックエンドの型を直接importしない）。
 *
 * `lotteryRecordSchema`（`schemas/lotteryApi.ts`）はPUT /me/lotteries/:idの`snapshot`と
 * 同一のフィールド集合のため、`LotterySnapshot`としてそのまま再利用する。
 */

export const lotteryStatusSchema = z.enum(['unknown', 'planned', 'applied', 'won', 'lost', 'purchased', 'skipped']);
export type LotteryStatusApi = z.infer<typeof lotteryStatusSchema>;

export const lotterySnapshotSchema = lotteryRecordSchema;
export type LotterySnapshotApi = z.infer<typeof lotterySnapshotSchema>;

// ---- user_lotteries ----

export const userLotteryRowSchema = z.object({
  lotteryId: z.number(),
  status: lotteryStatusSchema,
  snapshotUpdatedAt: z.string().nullable(),
  savedAt: z.string(),
  serverVersion: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserLotteryRow = z.infer<typeof userLotteryRowSchema>;

export const userLotteryMutationResponseSchema = userLotteryRowSchema.extend({
  outcome: z.enum(['created', 'restored', 'updated']),
});
export type UserLotteryMutationResponse = z.infer<typeof userLotteryMutationResponseSchema>;

export const listUserLotteriesResponseSchema = z.object({
  items: z.array(userLotteryRowSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type ListUserLotteriesResponse = z.infer<typeof listUserLotteriesResponseSchema>;

export const syncLotteriesResponseSchema = z.object({
  merged: z.array(
    z.object({ lotteryId: z.number(), status: z.string(), serverVersion: z.number(), savedAt: z.string(), updatedAt: z.string() })
  ),
  conflicts: z.array(
    z.object({
      lotteryId: z.number(),
      resolvedStatus: z.string(),
      reason: z.enum(['server_already_had_data', 'server_already_deleted', 'idempotency_conflict']),
    })
  ),
});
export type SyncLotteriesResponse = z.infer<typeof syncLotteriesResponseSchema>;

// ---- favorites ----

export const favoriteRowSchema = z.object({
  lotteryId: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FavoriteRow = z.infer<typeof favoriteRowSchema>;

export const putFavoriteResponseSchema = favoriteRowSchema.extend({
  outcome: z.enum(['created', 'restored', 'noop']),
});

export const listFavoritesResponseSchema = z.object({
  items: z.array(favoriteRowSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type ListFavoritesResponse = z.infer<typeof listFavoritesResponseSchema>;

// ---- followed products ----

export const followedProductRowSchema = z.object({
  publicProductId: z.string(),
  canonicalName: z.string(),
  lifecycleStatus: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FollowedProductRow = z.infer<typeof followedProductRowSchema>;

export const putFollowedProductResponseSchema = z.object({
  publicProductId: z.string(),
  canonicalName: z.string(),
  lifecycleStatus: z.string(),
  outcome: z.enum(['created', 'restored', 'noop']),
});

export const listFollowedProductsResponseSchema = z.object({
  items: z.array(followedProductRowSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type ListFollowedProductsResponse = z.infer<typeof listFollowedProductsResponseSchema>;

// ---- checklist ----

export const checklistStepRowSchema = z.object({
  stepId: z.string(),
  label: z.string(),
  done: z.boolean(),
  completedAt: z.string().nullable(),
  completedNote: z.string().nullable(),
  sortOrder: z.number(),
  serverVersion: z.number(),
  clientActionAt: z.string().nullable(),
  isDefault: z.boolean(),
});
export type ChecklistStepRow = z.infer<typeof checklistStepRowSchema>;

export const listChecklistStepsResponseSchema = z.object({ items: z.array(checklistStepRowSchema) });
export type ListChecklistStepsResponse = z.infer<typeof listChecklistStepsResponseSchema>;

export const putChecklistResultItemSchema = z.union([
  checklistStepRowSchema.extend({ stepId: z.string(), ok: z.literal(true) }),
  z.object({
    stepId: z.string(),
    ok: z.literal(false),
    error: z.object({ code: z.enum(['VALIDATION_ERROR', 'IDEMPOTENCY_CONFLICT', 'VERSION_CONFLICT']), message: z.string() }),
  }),
]);
export type PutChecklistResultItem = z.infer<typeof putChecklistResultItemSchema>;

export const putChecklistResponseSchema = z.object({ results: z.array(putChecklistResultItemSchema) });
export type PutChecklistResponse = z.infer<typeof putChecklistResponseSchema>;

// ---- notification preferences ----

const notificationPreferencesFieldsSchema = {
  deadlineReminder: z.boolean(),
  announcementReminder: z.boolean(),
  purchaseReminder: z.boolean(),
  newLotteryAlert: z.boolean(),
  favoriteUpdateAlert: z.boolean(),
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string().nullable(),
  quietHoursEnd: z.string().nullable(),
  deadlineReminderHoursBefore: z.number(),
  announcementReminderHoursBefore: z.number(),
  purchaseReminderHoursBefore: z.number(),
} as const;

export const notificationPreferencesResponseSchema = z.object({
  ...notificationPreferencesFieldsSchema,
  serverVersion: z.number(),
});
export type NotificationPreferencesResponse = z.infer<typeof notificationPreferencesResponseSchema>;

export const putNotificationPreferencesResponseSchema = notificationPreferencesResponseSchema.extend({
  outcome: z.enum(['created', 'updated']),
});

// ---- version conflict `current` payloads (embedded in 409 VERSION_CONFLICT error bodies) ----

export const userLotteryVersionConflictSchema = z.object({ current: userLotteryRowSchema });
export const notificationPreferencesVersionConflictSchema = z.object({ current: notificationPreferencesResponseSchema });

// ---- bootstrap sync ----

export const syncBootstrapCategoryResultSchema = <T extends z.ZodTypeAny>(conflictSchema: T) =>
  z.object({ accepted: z.number(), skipped: z.number(), conflicts: z.array(conflictSchema) });

export const syncBootstrapResultsSchema = z.object({
  userLotteries: syncBootstrapCategoryResultSchema(
    z.object({ lotteryId: z.number(), resolvedStatus: z.string(), reason: z.string() })
  ),
  favorites: syncBootstrapCategoryResultSchema(z.object({ lotteryId: z.number(), reason: z.string() })),
  followedProducts: syncBootstrapCategoryResultSchema(z.object({ publicProductId: z.string(), reason: z.string() })),
  legacyFollowedProducts: z.object({
    resolved: z.array(z.object({ legacyKey: z.string(), publicProductId: z.string() })),
    unresolved: z.array(z.string()),
  }),
  checklistSteps: syncBootstrapCategoryResultSchema(z.object({ lotteryId: z.number(), stepId: z.string(), reason: z.string() })),
  notificationPreferences: z.object({ accepted: z.boolean(), skipped: z.boolean(), reason: z.string().optional() }),
});
export type SyncBootstrapResults = z.infer<typeof syncBootstrapResultsSchema>;

/**
 * `POST /me/sync/bootstrap`の`serverState`は、GET系エンドポイントが返す整形済みレスポンス
 * （`userLotteryRowSchema`等）とは異なり、`readSyncBootstrapServerState`（apps/worker）が
 * リポジトリ関数の戻り値をそのまま返す＝DBの生行（Drizzleの`$inferSelect`）である。
 * 内部専用の列（`id`・`userId`・`deletedAt`等）を含み、`followedProducts`は
 * `{follow, product}`のネスト、`checklistSteps`は`isDefault`を持たない代わりに`lotteryId`を持つ。
 * ここでは実際に返る生行の形状に合わせて別スキーマとして定義する（`schemas/syncApi.ts`冒頭の
 * 整形済みレスポンススキーマとは意図的に非対称）。
 */
const rawUserLotteryRowSchema = z.object({
  id: z.number(),
  userId: z.number(),
  lotteryId: z.number(),
  status: lotteryStatusSchema,
  snapshotJson: z.string().nullable(),
  snapshotUpdatedAt: z.string().nullable(),
  savedAt: z.string(),
  serverVersion: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

const rawUserFavoriteRowSchema = z.object({
  id: z.number(),
  userId: z.number(),
  lotteryId: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

const rawProductRowSchema = z.object({
  id: z.number(),
  publicProductId: z.string(),
  canonicalName: z.string(),
  normalizedName: z.string(),
  normalizerVersion: z.string().nullable(),
  lifecycleStatus: z.string(),
  mergedIntoProductId: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const rawFollowedProductWithProductSchema = z.object({
  follow: z.object({
    id: z.number(),
    userId: z.number(),
    productId: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable(),
  }),
  product: rawProductRowSchema,
});

const rawChecklistProgressRowSchema = z.object({
  id: z.number(),
  userId: z.number(),
  lotteryId: z.number(),
  stepId: z.string(),
  label: z.string(),
  done: z.boolean(),
  completedAt: z.string().nullable(),
  completedNote: z.string().nullable(),
  sortOrder: z.number(),
  serverVersion: z.number(),
  clientActionAt: z.string().nullable(),
  serverReceivedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

const rawNotificationPreferencesRowSchema = z.object({
  id: z.number(),
  userId: z.number(),
  ...notificationPreferencesFieldsSchema,
  serverVersion: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const syncBootstrapServerStateSchema = z.object({
  userLotteries: z.array(rawUserLotteryRowSchema),
  favorites: z.array(rawUserFavoriteRowSchema),
  followedProducts: z.array(rawFollowedProductWithProductSchema),
  checklistSteps: z.array(rawChecklistProgressRowSchema),
  notificationPreferences: rawNotificationPreferencesRowSchema.nullable(),
});
export type SyncBootstrapServerState = z.infer<typeof syncBootstrapServerStateSchema>;

/** 生行（`SyncBootstrapServerState`）を各ストアの`applyServerState`が期待する整形済み形状へ変換する。 */
export function toUserLotteryRow(raw: z.infer<typeof rawUserLotteryRowSchema>): UserLotteryRow {
  return {
    lotteryId: raw.lotteryId,
    status: raw.status,
    snapshotUpdatedAt: raw.snapshotUpdatedAt,
    savedAt: raw.savedAt,
    serverVersion: raw.serverVersion,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function toFavoriteRow(raw: z.infer<typeof rawUserFavoriteRowSchema>): FavoriteRow {
  return { lotteryId: raw.lotteryId, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
}

export function toFollowedProductRow(raw: z.infer<typeof rawFollowedProductWithProductSchema>): FollowedProductRow {
  return {
    publicProductId: raw.product.publicProductId,
    canonicalName: raw.product.canonicalName,
    lifecycleStatus: raw.product.lifecycleStatus,
    createdAt: raw.follow.createdAt,
    updatedAt: raw.follow.updatedAt,
  };
}

export interface ChecklistStepServerStateRow {
  stepId: string;
  label: string;
  done: boolean;
  sortOrder: number;
  serverVersion: number;
  completedNote: string | null;
}

/** lotteryIdごとにグルーピングして返す（`checklistStore.applyServerState`が抽選単位のため）。 */
export function groupChecklistStepsByLottery(rows: z.infer<typeof rawChecklistProgressRowSchema>[]): Map<number, ChecklistStepServerStateRow[]> {
  const grouped = new Map<number, ChecklistStepServerStateRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.lotteryId) ?? [];
    list.push({ stepId: row.stepId, label: row.label, done: row.done, sortOrder: row.sortOrder, serverVersion: row.serverVersion, completedNote: row.completedNote });
    grouped.set(row.lotteryId, list);
  }
  return grouped;
}

export function toNotificationPreferencesState(raw: z.infer<typeof rawNotificationPreferencesRowSchema>): NotificationPreferencesResponse {
  const { id: _id, userId: _userId, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = raw;
  return rest;
}

export const syncBootstrapResponseSchema = z.object({
  syncId: z.string(),
  results: syncBootstrapResultsSchema,
  serverState: syncBootstrapServerStateSchema,
});
export type SyncBootstrapResponse = z.infer<typeof syncBootstrapResponseSchema>;

export interface SyncBootstrapRequest {
  batchClientRequestId: string;
  userLotteries: { lotteryId: number; status: LotteryStatusApi; savedAt?: string; snapshot?: LotterySnapshotApi; clientRequestId: string }[];
  favorites: { lotteryId: number; clientRequestId: string }[];
  followedProducts: { publicProductId: string; clientRequestId: string }[];
  legacyFollowedProductKeys: string[];
  checklistSteps: {
    lotteryId: number;
    stepId: string;
    label: string;
    done: boolean;
    completedNote?: string | null;
    sortOrder?: number;
    clientRequestId: string;
  }[];
  notificationPreferences?: {
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
    clientRequestId: string;
  };
}
