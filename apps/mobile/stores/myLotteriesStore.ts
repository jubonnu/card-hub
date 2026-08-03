import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { fetchLotteryById } from '@/lib/apiClient';
import { createAccountScopedStorage, isNamespaceSwitching, isSyncEligible, registerAccountScopedStore } from '@/lib/accountNamespace';
import { generateClientRequestId } from '@/lib/clientRequestId';
import { markGuestDataChanged } from '@/lib/guestRevision';
import { isValidLotteryStatusTransition } from '@/lib/lotteryStatusTransitions';
import { enqueueOperation } from '@/lib/offlineQueue';
import { registerQueueResultHandler } from '@/lib/offlineQueueResultRouter';
import type { LotteryRecord } from '@/schemas/lotteryApi';
import { userLotteryMutationResponseSchema, type LotteryStatusApi, type UserLotteryRow } from '@/schemas/syncApi';

export interface SavedLottery {
  record: LotteryRecord;
  savedAt: string;
  /** 個人ステータス（応募予定/応募済み/当選/落選/購入済み/見送り、Mobile-G6）。サーバーが正。 */
  status: LotteryStatusApi;
  /** サーバーの`serverVersion`（未同期・ゲスト時は未設定）。差分同期・キュー成功応答で更新される。 */
  serverVersion?: number;
}

interface MyLotteriesState {
  saved: SavedLottery[];
  isSaved: (lotteryId: number) => boolean;
  saveLottery: (record: LotteryRecord) => void;
  removeLottery: (lotteryId: number) => void;
  getSaved: (lotteryId: number) => SavedLottery | undefined;
  /** bootstrap・差分同期からサーバーの正規状態を反映する（G3-3）。ローカルにスナップショットが
   * 無いlotteryIdは`GET /lotteries/:id`（公開API）でベストエフォート補完する。取得失敗時はスキップし、
   * 次回の差分同期で再試行される。 */
  applyServerState: (rows: UserLotteryRow[], knownSnapshots?: Map<number, LotteryRecord>) => Promise<void>;
  /** キュー成功応答からserverVersion/statusを更新する（内部用、`offlineQueueResultRouter`から呼ばれる）。 */
  applyMutationResult: (lotteryId: number, row: { serverVersion: number; savedAt: string; status?: LotteryStatusApi }) => void;
  /**
   * 個人ステータスを変更する（Mobile-G6、無料機能）。`serverVersion`未確定（未同期）の項目は
   * CAS対象のPATCHを送れないため変更不可とし、呼び出し側でUIを無効化する判断に使えるよう
   * `false`を返す。許可されない遷移も同様に`false`（呼び出し側でUIの選択肢自体を絞る想定だが、
   * 二重防御として関数内でも`isValidLotteryStatusTransition`を検証する）。
   */
  setStatus: (lotteryId: number, nextStatus: LotteryStatusApi) => boolean;
  resetToDefaults: () => void;
}

const DEFAULT_STATE: Pick<MyLotteriesState, 'saved'> = { saved: [] };

/**
 * 「自分の抽選」は実API（LotteryRecord）のスナップショットをローカル保存する。
 * 保存時点のレコード全体を保持することで、一覧表示や通知生成のために毎回API再取得する
 * 必要をなくし、再取得に失敗した場合でも保存済み情報から表示・通知を継続できるようにする。
 *
 * Mobile-G3: ストレージキーはアカウント別namespace（`cardhub::<guest|publicUserId>::my-lotteries`）
 * で解決される（`lib/accountNamespace.ts`）。namespace切替中の書き込みは`isNamespaceSwitching()`で防ぐ。
 *
 * サーバー同期（G3-4）: 現状のUIは「保存（作成）」「削除」のみを行い、既存の保存済み抽選を
 * 再度PUTするフローが無いため、`expectedServerVersion`によるCAS（更新の競合検出）は発生しない。
 * PUTは常に新規作成として送る（`status: 'unknown'`固定、個人ステータス管理UIは本計画のスコープ外）。
 * DELETEは`expectedServerVersion`を省略する（バックエンド仕様上、省略時は常に成功する）。
 */
export const useMyLotteriesStore = create<MyLotteriesState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,
      isSaved: (lotteryId) => get().saved.some((s) => s.record.id === lotteryId),
      saveLottery: (record) => {
        if (isNamespaceSwitching()) return;
        if (get().saved.some((s) => s.record.id === record.id)) return;
        const savedAt = new Date().toISOString();
        set((state) => ({ saved: [...state.saved, { record, savedAt, status: 'unknown' }] }));
        void markGuestDataChanged();

        if (isSyncEligible()) {
          const clientRequestId = generateClientRequestId();
          enqueueOperation({
            id: clientRequestId,
            kind: 'lottery.put',
            resourceKey: String(record.id),
            path: `/me/lotteries/${record.id}`,
            method: 'PUT',
            payload: { status: 'unknown', snapshot: record, savedAt, clientRequestId },
          });
        }
      },
      removeLottery: (lotteryId) => {
        if (isNamespaceSwitching()) return;
        set((state) => ({ saved: state.saved.filter((s) => s.record.id !== lotteryId) }));
        void markGuestDataChanged();

        if (isSyncEligible()) {
          const clientRequestId = generateClientRequestId();
          enqueueOperation({
            id: clientRequestId,
            kind: 'lottery.delete',
            resourceKey: String(lotteryId),
            path: `/me/lotteries/${lotteryId}`,
            method: 'DELETE',
            payload: { clientRequestId },
          });
        }
      },
      getSaved: (lotteryId) => get().saved.find((s) => s.record.id === lotteryId),
      applyServerState: async (rows, knownSnapshots) => {
        // `knownSnapshots`はbootstrap（G3-3）がnamespace切替前（=このストアがリセットされる前）に
        // guest側のスナップショットを退避して渡すためのもの。namespace切替後の差分同期呼び出し
        // （knownSnapshots省略）では、既にこのnamespaceに存在するローカルスナップショットのみ再利用する。
        const missing = rows.filter((row) => !get().saved.some((s) => s.record.id === row.lotteryId) && !knownSnapshots?.has(row.lotteryId));
        const fetched = await Promise.all(
          missing.map(async (row) => {
            try {
              const detail = await fetchLotteryById(row.lotteryId);
              return { row, record: detail.lottery };
            } catch {
              return null; // ベストエフォート。次回の差分同期で再試行される。
            }
          })
        );

        set((state) => {
          const byId = new Map(state.saved.map((s) => [s.record.id, s]));
          for (const row of rows) {
            const existing = byId.get(row.lotteryId);
            if (existing) {
              byId.set(row.lotteryId, { ...existing, savedAt: row.savedAt, serverVersion: row.serverVersion, status: row.status });
            } else {
              const knownRecord = knownSnapshots?.get(row.lotteryId);
              if (knownRecord) {
                byId.set(row.lotteryId, { record: knownRecord, savedAt: row.savedAt, serverVersion: row.serverVersion, status: row.status });
              }
            }
          }
          for (const result of fetched) {
            if (!result) continue;
            if (byId.has(result.row.lotteryId)) continue;
            byId.set(result.row.lotteryId, {
              record: result.record,
              savedAt: result.row.savedAt,
              serverVersion: result.row.serverVersion,
              status: result.row.status,
            });
          }
          return { saved: [...byId.values()] };
        });
      },
      applyMutationResult: (lotteryId, row) =>
        set((state) => ({
          saved: state.saved.map((s) =>
            s.record.id === lotteryId
              ? { ...s, serverVersion: row.serverVersion, savedAt: row.savedAt, ...(row.status !== undefined ? { status: row.status } : {}) }
              : s
          ),
        })),
      setStatus: (lotteryId, nextStatus) => {
        if (isNamespaceSwitching()) return false;
        const current = get().saved.find((s) => s.record.id === lotteryId);
        if (!current) return false;
        if (current.status === nextStatus) return true; // no-op
        if (!isValidLotteryStatusTransition(current.status, nextStatus)) return false;

        if (isSyncEligible()) {
          // 未同期（serverVersion未確定）の項目はCAS対象のPATCHを送れない。呼び出し側で
          // ステータス変更UIを無効化する判断に使えるよう、ここでは何もせず失敗を返す。
          if (current.serverVersion === undefined) return false;

          const clientRequestId = generateClientRequestId();
          enqueueOperation({
            id: clientRequestId,
            kind: 'lottery.patch',
            resourceKey: String(lotteryId),
            path: `/me/lotteries/${lotteryId}`,
            method: 'PATCH',
            payload: { status: nextStatus, expectedServerVersion: current.serverVersion, clientRequestId },
          });
        }

        set((state) => ({
          saved: state.saved.map((s) => (s.record.id === lotteryId ? { ...s, status: nextStatus } : s)),
        }));
        void markGuestDataChanged();
        return true;
      },
      resetToDefaults: () => set(DEFAULT_STATE),
    }),
    {
      name: 'my-lotteries',
      storage: createJSONStorage(() => createAccountScopedStorage('my-lotteries')),
    }
  )
);

registerAccountScopedStore({
  baseName: 'my-lotteries',
  resetToDefaults: () => useMyLotteriesStore.getState().resetToDefaults(),
  rehydrate: () => Promise.resolve(useMyLotteriesStore.persist.rehydrate()),
});

registerQueueResultHandler('lottery.put', (op, response) => {
  const parsed = userLotteryMutationResponseSchema.safeParse(response);
  if (!parsed.success) return;
  useMyLotteriesStore.getState().applyMutationResult(Number(op.resourceKey), parsed.data);
});

registerQueueResultHandler('lottery.patch', (op, response) => {
  const parsed = userLotteryMutationResponseSchema.safeParse(response);
  if (!parsed.success) return;
  useMyLotteriesStore.getState().applyMutationResult(Number(op.resourceKey), parsed.data);
});
