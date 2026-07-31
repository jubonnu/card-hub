import type { QueuedOperation, QueuedOperationKind } from '@/stores/offlineQueueStore';

/**
 * オフラインキュー（`lib/offlineQueue.ts`）は特定ストアを知らない汎用ループのため、
 * 成功レスポンスを元のリソースへ反映する処理は各account-scopedストアが自分で登録する
 * （`lib/accountNamespace.ts`の`registerAccountScopedStore`と同じ「登録」パターン）。
 * これにより`offlineQueue.ts`⇄各ストア間の循環import を避ける。
 */
/**
 * HTTP的には200でも、レスポンス本体にアイテム単位の失敗（例: `PUT /me/checklists/:id`の
 * `results[].ok===false`によるVERSION_CONFLICT/IDEMPOTENCY_CONFLICT）が埋め込まれている
 * エンドポイントがあるため、ハンドラは`{status:'conflict', message}`を返して
 * `offlineQueue.ts`に「成功として除去せず、conflictへ回す」よう指示できる。
 */
export type QueueSuccessOutcome = { status: 'conflict'; message: string } | void;
type QueueSuccessHandler = (op: QueuedOperation, response: unknown) => QueueSuccessOutcome;

const handlers = new Map<QueuedOperationKind, QueueSuccessHandler>();

export function registerQueueResultHandler(kind: QueuedOperationKind, handler: QueueSuccessHandler): void {
  handlers.set(kind, handler);
}

export function dispatchQueueSuccess(op: QueuedOperation, response: unknown): QueueSuccessOutcome {
  return handlers.get(op.kind)?.(op, response);
}
