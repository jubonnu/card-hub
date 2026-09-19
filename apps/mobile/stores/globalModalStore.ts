import { create } from 'zustand';

interface GlobalModalState {
  paywallOpen: boolean;
  openPaywall: () => void;
  closePaywall: () => void;

  checklistLotteryId: string | null;
  openChecklist: (lotteryId: string | number) => void;
  closeChecklist: () => void;

  notificationSettingsOpen: boolean;
  openNotificationSettings: () => void;
  closeNotificationSettings: () => void;
}

/**
 * PaywallModal・ChecklistModal・NotificationSettingsModal（画面全体を覆う「下から出てくる」UI）の
 * 表示状態を一元管理する。これらはexpo-routerの`presentation: 'modal'`画面ではなく
 * React Native標準の`Modal`コンポーネントとして実装しており、アプリ内どこからでも
 * 開閉できるようにこのストア経由で制御する（`app/_layout.tsx`でマウントし、呼び出し側は
 * `router.push`ではなくここの`openXxx`を呼ぶ）。
 */
export const useGlobalModalStore = create<GlobalModalState>((set) => ({
  paywallOpen: false,
  openPaywall: () => set({ paywallOpen: true }),
  closePaywall: () => set({ paywallOpen: false }),

  checklistLotteryId: null,
  openChecklist: (lotteryId) => set({ checklistLotteryId: String(lotteryId) }),
  closeChecklist: () => set({ checklistLotteryId: null }),

  notificationSettingsOpen: false,
  openNotificationSettings: () => set({ notificationSettingsOpen: true }),
  closeNotificationSettings: () => set({ notificationSettingsOpen: false }),
}));
