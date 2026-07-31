import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createAccountScopedStorage, registerAccountScopedStore } from '@/lib/accountNamespace';
import { hashPayload } from '@/lib/payloadHash';

/**
 * オフライン操作キュー（14章、8章要件）。namespace（`guest`/`publicUserId`）別に
 * `cardhub::<namespace>::offline-queue`へ永続化される（`lib/accountNamespace.ts`）。
 * `queued operationにuserIdを保存しない` — namespace自体が所有者境界のため、
 * `QueuedOperation`はuserId/publicUserIdを一切持たない。
 */
export type QueuedOperationKind =
  | 'lottery.put'
  | 'lottery.patch'
  | 'lottery.delete'
  | 'favorite.put'
  | 'favorite.delete'
  | 'followedProduct.put'
  | 'followedProduct.delete'
  | 'checklist.put'
  | 'notificationPreferences.put';

export type QueuedOperationStatus = 'pending' | 'conflict' | 'failed';

export interface QueuedOperation {
  /** = clientRequestId。作成時に採番し、再送のたびに変えない（冪等性台帳と整合させるため）。 */
  id: string;
  kind: QueuedOperationKind;
  resourceKey: string;
  path: string;
  method: 'PUT' | 'PATCH' | 'DELETE';
  payload: unknown;
  payloadHash: string;
  createdAt: string;
  attemptCount: number;
  nextRetryAt: string | null;
  status: QueuedOperationStatus;
  /** 最後に失敗した理由（UI表示・デバッグ用、開発者向け内部情報はここに留め、ユーザーへは要約のみ出す）。 */
  lastError: string | null;
}

interface OfflineQueueState {
  operations: QueuedOperation[];
  enqueue: (op: Omit<QueuedOperation, 'payloadHash' | 'attemptCount' | 'nextRetryAt' | 'status' | 'lastError'>) => void;
  remove: (id: string) => void;
  updateStatus: (id: string, patch: Partial<Pick<QueuedOperation, 'status' | 'attemptCount' | 'nextRetryAt' | 'lastError'>>) => void;
  retryOperation: (id: string) => void;
  clear: () => void;
  resetToDefaults: () => void;
}

const DEFAULT_STATE: Pick<OfflineQueueState, 'operations'> = { operations: [] };

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      enqueue: (op) =>
        set((state) => ({
          operations: [
            ...state.operations,
            { ...op, payloadHash: hashPayload(op.payload), attemptCount: 0, nextRetryAt: null, status: 'pending', lastError: null },
          ],
        })),
      remove: (id) => set((state) => ({ operations: state.operations.filter((o) => o.id !== id) })),
      updateStatus: (id, patch) =>
        set((state) => ({ operations: state.operations.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      retryOperation: (id) =>
        set((state) => ({
          operations: state.operations.map((o) =>
            o.id === id ? { ...o, status: 'pending', attemptCount: 0, nextRetryAt: null, lastError: null } : o
          ),
        })),
      clear: () => set(DEFAULT_STATE),
      resetToDefaults: () => set(DEFAULT_STATE),
    }),
    {
      name: 'offline-queue',
      storage: createJSONStorage(() => createAccountScopedStorage('offline-queue')),
    }
  )
);

registerAccountScopedStore({
  baseName: 'offline-queue',
  resetToDefaults: () => useOfflineQueueStore.getState().resetToDefaults(),
  rehydrate: () => Promise.resolve(useOfflineQueueStore.persist.rehydrate()),
});
