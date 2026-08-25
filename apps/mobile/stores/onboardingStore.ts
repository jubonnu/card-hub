import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * 初回起動時オンボーディングの表示要否（デバイス単位。ゲスト/サインイン済みを問わず
 * 一度見せたら二度と出さない）。アカウント別namespaceの対象外（`lib/accountNamespace.ts`の
 * account-scopedストア群とは別枠）にするため、他ストアとは異なりnamespace切り替えの影響を受けない。
 */
interface OnboardingState {
  completed: boolean;
  /** AsyncStorageからの読み込み完了フラグ。読み込み前にtabsを一瞬表示してしまわないよう、
   * ルート側はこれがtrueになるまでオンボーディング要否の判定を保留する。 */
  hasHydrated: boolean;
  markCompleted: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      hasHydrated: false,
      markCompleted: () => set({ completed: true }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'cardhub-onboarding',
      storage: createJSONStorage(() => AsyncStorage),
      // hasHydrated自体は永続化しない（起動のたびに読み込み未完了の状態から始まる必要があるため）。
      partialize: (state) => ({ completed: state.completed }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
