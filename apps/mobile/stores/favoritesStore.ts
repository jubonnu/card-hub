import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createAccountScopedStorage, isNamespaceSwitching, isSyncEligible, registerAccountScopedStore } from '@/lib/accountNamespace';
import { generateClientRequestId } from '@/lib/clientRequestId';
import { markGuestDataChanged } from '@/lib/guestRevision';
import { enqueueOperation } from '@/lib/offlineQueue';
import type { FavoriteRow, FollowedProductRow } from '@/schemas/syncApi';

interface FavoritesState {
  favoriteLotteryIds: string[];
  /**
   * 旧・移行未解決のフォロー中商品キー（`normalizedProductName`相当のローカル文字列）。
   * 現行UIはこのキーだけで商品を扱う（実バックエンドの`publicProductId`をUI層が
   * 持っていないため）。24-1章の通り、bootstrap時のlegacy解決結果でのみ`followedProductIds`へ
   * 移行され、新規フォローは引き続きここへローカル追加される（サーバー同期は行わない —
   * `publicProductId`を解決する手段が現行UIに無いため。24-7章参照）。
   */
  followedProductKeys: string[];
  /** サーバーの`publicProductId`で管理される、解決済み・同期対象のフォロー中商品。 */
  followedProductIds: string[];
  toggleFavoriteLottery: (lotteryId: string) => void;
  toggleFollowedProduct: (productKey: string) => void;
  isFavoriteLottery: (lotteryId: string) => boolean;
  isFollowingProduct: (productKey: string) => boolean;
  /** bootstrap・差分同期からサーバーの正規状態を反映する（G3-3）。 */
  applyServerFavorites: (rows: FavoriteRow[]) => void;
  applyServerFollowedProducts: (rows: FollowedProductRow[]) => void;
  /** bootstrapのlegacy follow解決結果を適用する（24-1・24-7章）。 */
  applyLegacyFollowResolution: (resolved: { legacyKey: string; publicProductId: string }[]) => void;
  resetToDefaults: () => void;
}

const DEFAULT_STATE: Pick<FavoritesState, 'favoriteLotteryIds' | 'followedProductKeys' | 'followedProductIds'> = {
  favoriteLotteryIds: [],
  followedProductKeys: [],
  followedProductIds: [],
};

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,
      toggleFavoriteLottery: (lotteryId) => {
        if (isNamespaceSwitching()) return;
        const nowFavorite = !get().favoriteLotteryIds.includes(lotteryId);
        set((state) => ({
          favoriteLotteryIds: nowFavorite
            ? [...state.favoriteLotteryIds, lotteryId]
            : state.favoriteLotteryIds.filter((id) => id !== lotteryId),
        }));
        void markGuestDataChanged();

        if (!isSyncEligible()) return;
        const numericId = Number(lotteryId);
        if (!Number.isFinite(numericId)) return; // 実lotteryId（数値）でない場合は同期対象外（現行UIでは未使用の導線）。
        const clientRequestId = generateClientRequestId();
        enqueueOperation({
          id: clientRequestId,
          kind: nowFavorite ? 'favorite.put' : 'favorite.delete',
          resourceKey: lotteryId,
          path: `/me/favorites/${numericId}`,
          method: nowFavorite ? 'PUT' : 'DELETE',
          payload: { clientRequestId },
        });
      },
      toggleFollowedProduct: (productKey) => {
        if (isNamespaceSwitching()) return;
        set((state) => ({
          followedProductKeys: state.followedProductKeys.includes(productKey)
            ? state.followedProductKeys.filter((key) => key !== productKey)
            : [...state.followedProductKeys, productKey],
        }));
        void markGuestDataChanged();
        // publicProductIdを解決する手段が現行UIに無いため、サーバー同期は行わない（24-7章）。
      },
      isFavoriteLottery: (lotteryId) => get().favoriteLotteryIds.includes(lotteryId),
      isFollowingProduct: (productKey) => get().followedProductKeys.includes(productKey),
      applyServerFavorites: (rows) =>
        set((state) => {
          const ids = new Set(state.favoriteLotteryIds);
          for (const row of rows) ids.add(String(row.lotteryId));
          return { favoriteLotteryIds: [...ids] };
        }),
      applyServerFollowedProducts: (rows) =>
        set((state) => {
          const ids = new Set(state.followedProductIds);
          for (const row of rows) ids.add(row.publicProductId);
          return { followedProductIds: [...ids] };
        }),
      applyLegacyFollowResolution: (resolved) =>
        set((state) => {
          const resolvedKeys = new Set(resolved.map((r) => r.legacyKey));
          const ids = new Set(state.followedProductIds);
          for (const r of resolved) ids.add(r.publicProductId);
          return {
            followedProductKeys: state.followedProductKeys.filter((key) => !resolvedKeys.has(key)),
            followedProductIds: [...ids],
          };
        }),
      resetToDefaults: () => set(DEFAULT_STATE),
    }),
    {
      name: 'favorites',
      storage: createJSONStorage(() => createAccountScopedStorage('favorites')),
    }
  )
);

registerAccountScopedStore({
  baseName: 'favorites',
  resetToDefaults: () => useFavoritesStore.getState().resetToDefaults(),
  rehydrate: () => Promise.resolve(useFavoritesStore.persist.rehydrate()),
});
