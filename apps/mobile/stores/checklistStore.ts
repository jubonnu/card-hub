import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createAccountScopedStorage, isNamespaceSwitching, isSyncEligible, registerAccountScopedStore } from '@/lib/accountNamespace';
import { generateClientRequestId } from '@/lib/clientRequestId';
import { enqueueOperation } from '@/lib/offlineQueue';
import { registerQueueResultHandler, type QueueSuccessOutcome } from '@/lib/offlineQueueResultRouter';
import { putChecklistResponseSchema } from '@/schemas/syncApi';
import type { ChecklistStep } from '@/types/models';

const DEFAULT_STEP_LABELS = ['応募条件を確認', '応募を完了する', '当選結果を確認', '購入手続きをする', '受け取り・開封記録'];

function createDefaultSteps(): ChecklistStep[] {
  return DEFAULT_STEP_LABELS.map((label, index) => ({ id: `default-${index}`, label, done: false, sortOrder: index, serverVersion: 0 }));
}

function resourceKeyFor(lotteryId: string, stepId: string): string {
  return `${lotteryId}::${stepId}`;
}

interface ChecklistState {
  groups: Record<string, ChecklistStep[]>;
  toggleStep: (lotteryId: string, stepId: string) => void;
  addStep: (lotteryId: string, label: string) => void;
  getSteps: (lotteryId: string) => ChecklistStep[];
  ensureInitialized: (lotteryId: string) => void;
  /** bootstrap・差分同期からサーバーの正規状態を反映する（G3-3）。 */
  applyServerState: (lotteryId: string, rows: { stepId: string; label: string; done: boolean; sortOrder: number; serverVersion: number; completedNote: string | null }[]) => void;
  /** キュー成功応答からserverVersion等を更新する（内部用、`offlineQueueResultRouter`から呼ばれる）。 */
  applyMutationResult: (
    lotteryId: string,
    stepId: string,
    result: { done: boolean; label: string; sortOrder: number; serverVersion: number; completedNote: string | null }
  ) => void;
  resetToDefaults: () => void;
}

const DEFAULT_STATE: Pick<ChecklistState, 'groups'> = { groups: {} };

function enqueueStepPut(lotteryId: string, step: ChecklistStep): void {
  if (!isSyncEligible()) return;
  const numericLotteryId = Number(lotteryId);
  if (!Number.isFinite(numericLotteryId)) return;
  const clientRequestId = generateClientRequestId();
  enqueueOperation({
    id: clientRequestId,
    kind: 'checklist.put',
    resourceKey: resourceKeyFor(lotteryId, step.id),
    path: `/me/checklists/${numericLotteryId}`,
    method: 'PUT',
    payload: {
      steps: [
        {
          stepId: step.id,
          label: step.label,
          done: step.done,
          completedNote: step.completedNote ?? null,
          sortOrder: step.sortOrder,
          expectedServerVersion: step.serverVersion ?? 0,
          clientRequestId,
        },
      ],
    },
  });
}

/**
 * 「自分の抽選」に保存した抽選ごとのチェックリスト進捗。
 * 初回アクセス時に未着手のデフォルトテンプレート（完了履歴なし）を生成する。
 *
 * サーバー同期（G3-4）: `PUT /me/checklists/:lotteryId`は常にHTTP 200を返し、アイテム単位の
 * 成否（`VERSION_CONFLICT`含む）は`results[].ok`に埋め込まれる。そのため成功/失敗判定は
 * `offlineQueueResultRouter`のハンドラ内で行い、`ok:false`の場合は`{status:'conflict',...}`を
 * 返して`offlineQueue.ts`にconflict扱いさせる（HTTPレベルの200だけでは判断できないため）。
 */
export const useChecklistStore = create<ChecklistState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,
      toggleStep: (lotteryId, stepId) => {
        if (isNamespaceSwitching()) return;
        let updatedStep: ChecklistStep | undefined;
        set((state) => {
          const steps = state.groups[lotteryId] ?? [];
          const updated = steps.map((step) => {
            if (step.id !== stepId) return step;
            const next: ChecklistStep = { ...step, done: !step.done, completedAt: !step.done ? new Date().toISOString() : undefined };
            updatedStep = next;
            return next;
          });
          return { groups: { ...state.groups, [lotteryId]: updated } };
        });
        if (updatedStep) enqueueStepPut(lotteryId, updatedStep);
      },
      addStep: (lotteryId, label) => {
        if (isNamespaceSwitching()) return;
        const newStep: ChecklistStep = { id: `custom-${Date.now()}`, label, done: false, sortOrder: get().groups[lotteryId]?.length ?? 0, serverVersion: 0 };
        set((state) => {
          const steps = state.groups[lotteryId] ?? [];
          return { groups: { ...state.groups, [lotteryId]: [...steps, newStep] } };
        });
        enqueueStepPut(lotteryId, newStep);
      },
      getSteps: (lotteryId) => get().groups[lotteryId] ?? [],
      ensureInitialized: (lotteryId) => {
        if (isNamespaceSwitching()) return;
        set((state) =>
          state.groups[lotteryId] ? state : { groups: { ...state.groups, [lotteryId]: createDefaultSteps() } }
        );
      },
      applyServerState: (lotteryId, rows) =>
        set((state) => {
          const existing = state.groups[lotteryId] ?? [];
          const byId = new Map(existing.map((s) => [s.id, s]));
          for (const row of rows) {
            byId.set(row.stepId, {
              id: row.stepId,
              label: row.label,
              done: row.done,
              sortOrder: row.sortOrder,
              serverVersion: row.serverVersion,
              completedNote: row.completedNote ?? undefined,
            });
          }
          return { groups: { ...state.groups, [lotteryId]: [...byId.values()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) } };
        }),
      applyMutationResult: (lotteryId, stepId, result) =>
        set((state) => {
          const steps = state.groups[lotteryId] ?? [];
          return {
            groups: {
              ...state.groups,
              [lotteryId]: steps.map((step) =>
                step.id === stepId
                  ? { ...step, done: result.done, label: result.label, sortOrder: result.sortOrder, serverVersion: result.serverVersion }
                  : step
              ),
            },
          };
        }),
      resetToDefaults: () => set(DEFAULT_STATE),
    }),
    {
      name: 'checklist',
      storage: createJSONStorage(() => createAccountScopedStorage('checklist')),
    }
  )
);

registerAccountScopedStore({
  baseName: 'checklist',
  resetToDefaults: () => useChecklistStore.getState().resetToDefaults(),
  rehydrate: () => Promise.resolve(useChecklistStore.persist.rehydrate()),
});

registerQueueResultHandler('checklist.put', (op, response): QueueSuccessOutcome => {
  const parsed = putChecklistResponseSchema.safeParse(response);
  if (!parsed.success) return;
  const [lotteryId, stepId] = op.resourceKey.split('::');
  const result = parsed.data.results.find((r) => r.stepId === stepId);
  if (!result) return;
  if (!result.ok) {
    return { status: 'conflict', message: result.error.message };
  }
  useChecklistStore.getState().applyMutationResult(lotteryId, stepId, {
    done: result.done,
    label: result.label,
    sortOrder: result.sortOrder,
    serverVersion: result.serverVersion,
    completedNote: result.completedNote,
  });
});
