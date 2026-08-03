import { create } from 'zustand';

/**
 * 409競合・bootstrap要約の一時的な通知状態（16・24-10章）。`SyncConflictBanner`が表示する。
 * 永続化はしない（アプリ再起動で消えてよい一時的な通知のため）。ログアウト・アカウント削除・
 * 新しいbootstrap開始時に`clear()`する。
 */
export type SyncConflictKind =
  | 'bootstrapSummary'
  | 'lotteryVersionConflict'
  | 'checklistVersionConflict'
  | 'notificationPreferencesVersionConflict'
  | 'idempotencyConflict'
  | 'guestMigrationFailed';

export interface SyncConflictEntry {
  id: string;
  kind: SyncConflictKind;
  message: string;
  createdAt: string;
}

interface SyncConflictsState {
  conflicts: SyncConflictEntry[];
  addConflict: (entry: Omit<SyncConflictEntry, 'createdAt'>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useSyncConflictsStore = create<SyncConflictsState>()((set) => ({
  conflicts: [],
  addConflict: (entry) =>
    set((state) => ({
      // 同一idの通知は連打で積み上げず、最新の1件に差し替える。
      conflicts: [...state.conflicts.filter((c) => c.id !== entry.id), { ...entry, createdAt: new Date().toISOString() }],
    })),
  dismiss: (id) => set((state) => ({ conflicts: state.conflicts.filter((c) => c.id !== id) })),
  clear: () => set({ conflicts: [] }),
}));
