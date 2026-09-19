import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface CalendarEventState {
  /** lotteryKey単位で、その抽選のためにOSカレンダーへ作成した予定のIDを記録する。 */
  eventIdsByKey: Record<string, string[]>;
  getRegisteredEventIds: (key: string) => string[];
  setRegisteredEventIds: (key: string, eventIds: string[]) => void;
}

/**
 * どの抽選についてCardHubカレンダーへ登録済みかを、実際に作成したOSカレンダーの
 * イベントIDで記録する（単なるフラグではなくIDを持つのは、内容修正のため再登録する際に
 * 古い予定を確実に削除してから作り直せるようにするため）。
 */
export const useCalendarEventStore = create<CalendarEventState>()(
  persist(
    (set, get) => ({
      eventIdsByKey: {},
      getRegisteredEventIds: (key) => get().eventIdsByKey[key] ?? [],
      setRegisteredEventIds: (key, eventIds) =>
        set((state) => ({ eventIdsByKey: { ...state.eventIdsByKey, [key]: eventIds } })),
    }),
    {
      name: 'cardhub-calendar-events',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
