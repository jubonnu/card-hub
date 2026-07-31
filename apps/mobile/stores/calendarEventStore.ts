import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface CalendarEventState {
  registeredKeys: string[];
  isRegistered: (key: string) => boolean;
  markRegistered: (key: string) => void;
}

/** どの抽選についてCardHubカレンダーへ登録済みかを記録する（重複登録の防止用）。 */
export const useCalendarEventStore = create<CalendarEventState>()(
  persist(
    (set, get) => ({
      registeredKeys: [],
      isRegistered: (key) => get().registeredKeys.includes(key),
      markRegistered: (key) =>
        set((state) =>
          state.registeredKeys.includes(key) ? state : { registeredKeys: [...state.registeredKeys, key] }
        ),
    }),
    {
      name: 'cardhub-calendar-events',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
