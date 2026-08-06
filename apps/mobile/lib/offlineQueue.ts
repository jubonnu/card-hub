import { AuthApiError, type AuthApiErrorKind } from '@/lib/authApiClient';
import { authenticatedRequest } from '@/lib/authenticatedApiClient';
import { GUEST_NAMESPACE, getCurrentNamespace } from '@/lib/accountNamespace';
import { generateClientRequestId } from '@/lib/clientRequestId';
import { dispatchQueueSuccess } from '@/lib/offlineQueueResultRouter';
import { useSyncConflictsStore } from '@/lib/syncConflicts';
import { SessionDiscardedError } from '@/lib/tokenRefresh';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineQueueStore, type QueuedOperation, type QueuedOperationKind } from '@/stores/offlineQueueStore';

/** 初期値。将来サーバー側のidempotency_records保持期間が確定したらここを合わせて見直す（21章）。 */
export const OFFLINE_QUEUE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const OFFLINE_QUEUE_MAX_OPERATIONS = 500;
export const OFFLINE_QUEUE_MAX_BYTES = 1024 * 1024;
export const OFFLINE_QUEUE_MAX_ATTEMPTS = 8;
/** 5秒, 15秒, 30秒, 1分, 5分, 15分, 1時間, 6時間 */
export const OFFLINE_QUEUE_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

export class OfflineQueueOverflowError extends Error {
  constructor(message = 'オフラインキューの上限に達しています') {
    super(message);
    this.name = 'OfflineQueueOverflowError';
  }
}

const BLOCKING_CONFLICT_KINDS: ReadonlySet<AuthApiErrorKind> = new Set(['version_conflict', 'idempotency_conflict']);
const PERMANENT_FAILURE_KINDS: ReadonlySet<AuthApiErrorKind> = new Set(['validation', 'forbidden', 'not_found', 'conflict']);

function versionConflictKindFor(kind: QueuedOperationKind): 'lotteryVersionConflict' | 'checklistVersionConflict' | 'notificationPreferencesVersionConflict' {
  if (kind === 'checklist.put') return 'checklistVersionConflict';
  if (kind === 'notificationPreferences.put') return 'notificationPreferencesVersionConflict';
  return 'lotteryVersionConflict';
}

export interface EnqueueParams {
  id: string;
  kind: QueuedOperationKind;
  resourceKey: string;
  path: string;
  method: 'PUT' | 'PATCH' | 'DELETE';
  payload: unknown;
  createdAt?: string;
}

function currentQueueByteSize(): number {
  return JSON.stringify(useOfflineQueueStore.getState().operations).length;
}

/**
 * オフラインキューへ積む（8・14章）。`guest`namespaceでは認証必須APIへの操作は発生しない
 * （guestの操作はbootstrap入力としてのみ移行する、G3-3）ため、guest名前空間からの
 * enqueueは構造的なバグとして拒否する。上限超過時は古い操作を黙って捨てず例外で警告する。
 */
export function enqueueOperation(params: EnqueueParams): void {
  if (getCurrentNamespace() === GUEST_NAMESPACE) {
    throw new Error('guest名前空間ではオフラインキューへ操作を積めません（ログイン後にのみ使用する）');
  }

  const operations = useOfflineQueueStore.getState().operations;
  if (operations.length >= OFFLINE_QUEUE_MAX_OPERATIONS) {
    throw new OfflineQueueOverflowError('オフラインキューの件数上限（500件）に達しています');
  }
  const prospectiveSize = currentQueueByteSize() + JSON.stringify(params.payload).length + 256;
  if (prospectiveSize > OFFLINE_QUEUE_MAX_BYTES) {
    throw new OfflineQueueOverflowError('オフラインキューの容量上限（1MB）に達しています');
  }

  useOfflineQueueStore.getState().enqueue({
    id: params.id,
    kind: params.kind,
    resourceKey: params.resourceKey,
    path: params.path,
    method: params.method,
    payload: params.payload,
    createdAt: params.createdAt ?? new Date().toISOString(),
  });

  void processQueue();
}

export function hasUnsentOperations(): boolean {
  return useOfflineQueueStore.getState().operations.some((o) => o.status === 'pending' || o.status === 'conflict');
}

function isExpired(op: QueuedOperation): boolean {
  return Date.now() - Date.parse(op.createdAt) > OFFLINE_QUEUE_TTL_MS;
}

/** `expectedServerVersion`を含まないPUT系は再適用しても既存データを壊さないため安全とみなす。 */
function isSafeToReapplyAfterExpiry(op: QueuedOperation): boolean {
  if (op.method === 'DELETE') return false;
  const payload = op.payload as Record<string, unknown> | null | undefined;
  return !payload || payload.expectedServerVersion === undefined;
}

function scheduleRetry(op: QueuedOperation, retryAfterSeconds: number | null, lastError: string): void {
  const nextAttemptCount = op.attemptCount + 1;
  if (nextAttemptCount >= OFFLINE_QUEUE_MAX_ATTEMPTS) {
    useOfflineQueueStore.getState().updateStatus(op.id, { status: 'failed', attemptCount: nextAttemptCount, lastError });
    return;
  }
  const backoffMs = retryAfterSeconds != null ? retryAfterSeconds * 1000 : OFFLINE_QUEUE_BACKOFF_MS[op.attemptCount];
  const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
  useOfflineQueueStore.getState().updateStatus(op.id, { attemptCount: nextAttemptCount, nextRetryAt, lastError });
}

let processInFlight: Promise<void> | null = null;

/**
 * キューを先頭から順に1件ずつ処理する（14章: FIFO、同一リソースの操作順序を崩さない）。
 * 成功・失敗を問わず最初に処理を継続できなかった操作でこの実行を止める（スキップして
 * 後続を先に処理しない）。次回のトリガー（アプリ復帰・enqueue時・明示呼び出し）で再開する。
 */
export async function processQueue(): Promise<void> {
  if (processInFlight) return processInFlight;

  processInFlight = (async () => {
    if (useAuthStore.getState().status !== 'signedIn') return;
    if (getCurrentNamespace() === GUEST_NAMESPACE) return;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const next = useOfflineQueueStore.getState().operations.find((o) => o.status === 'pending');
      if (!next) return;
      if (next.nextRetryAt && Date.parse(next.nextRetryAt) > Date.now()) return;

      if (isExpired(next)) {
        if (!isSafeToReapplyAfterExpiry(next)) {
          useOfflineQueueStore.getState().updateStatus(next.id, {
            status: 'conflict',
            lastError: '長期間送信できなかったため、最新状態を確認してください',
          });
          useSyncConflictsStore.getState().addConflict({
            id: `queue:${next.id}`,
            kind: versionConflictKindFor(next.kind),
            message: '長期間送信できなかった操作があります。最新状態を確認してください',
          });
          return;
        }
        useOfflineQueueStore.getState().remove(next.id);
        useOfflineQueueStore.getState().enqueue({
          id: generateClientRequestId(),
          kind: next.kind,
          resourceKey: next.resourceKey,
          path: next.path,
          method: next.method,
          payload: next.payload,
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      try {
        const response = await authenticatedRequest(next.path, { method: next.method, body: JSON.stringify(next.payload) });
        const outcome = dispatchQueueSuccess(next, response);
        if (outcome?.status === 'conflict') {
          useOfflineQueueStore.getState().updateStatus(next.id, { status: 'conflict', lastError: outcome.message });
          useSyncConflictsStore.getState().addConflict({
            id: `queue:${next.id}`,
            kind: versionConflictKindFor(next.kind),
            message: outcome.message,
          });
          return;
        }
        useOfflineQueueStore.getState().remove(next.id);
        continue;
      } catch (e) {
        if (e instanceof SessionDiscardedError) return;

        if (e instanceof AuthApiError) {
          if (BLOCKING_CONFLICT_KINDS.has(e.kind)) {
            useOfflineQueueStore.getState().updateStatus(next.id, { status: 'conflict', lastError: e.message });
            useSyncConflictsStore.getState().addConflict({
              id: `queue:${next.id}`,
              kind: e.kind === 'version_conflict' ? versionConflictKindFor(next.kind) : 'idempotencyConflict',
              message: e.message,
            });
            return;
          }
          if (PERMANENT_FAILURE_KINDS.has(e.kind)) {
            useOfflineQueueStore.getState().updateStatus(next.id, { status: 'failed', lastError: e.message });
            return;
          }
          scheduleRetry(next, e.retryAfterSeconds, e.message);
          return;
        }

        scheduleRetry(next, null, e instanceof Error ? e.message : '不明なエラー');
        return;
      }
    }
  })();

  try {
    await processInFlight;
  } finally {
    processInFlight = null;
  }
}

/** ユーザーによる明示的な再試行導線（9章: 手動の「再試行」導線を用意できる構造にする）。 */
export function retryFailedOperation(id: string): void {
  useOfflineQueueStore.getState().retryOperation(id);
  void processQueue();
}

const SYNC_CONFLICT_ID_PREFIX = 'queue:';

/**
 * 競合バナー（`SyncConflictBanner`）を閉じる際に呼ぶ。`status: 'conflict'`のまま止まった
 * 操作は`processQueue`が二度と拾わず、`runDifferentialSync`も該当resourceKeyを
 * 「未送信の変更あり」として永続的にサーバー値で上書きしない扱いにしてしまうため、
 * このまま放置すると閉じた後もその抽選等の表示がサーバーの実際の値とズレたままになる。
 * バナーを閉じる操作＝「この変更は諦める」という意思表示とみなし、宙に浮いた操作自体を
 * 破棄する。呼び出し側（`SyncConflictBanner`）は戻り値がtrueなら`runDifferentialSync`を
 * 呼び、対象resourceKeyを最新のサーバー状態に揃え直すこと。
 */
export function discardConflictedOperation(conflictId: string): boolean {
  if (!conflictId.startsWith(SYNC_CONFLICT_ID_PREFIX)) return false;
  const opId = conflictId.slice(SYNC_CONFLICT_ID_PREFIX.length);
  const exists = useOfflineQueueStore.getState().operations.some((o) => o.id === opId);
  if (!exists) return false;
  useOfflineQueueStore.getState().remove(opId);
  return true;
}
