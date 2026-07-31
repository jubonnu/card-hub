import { GUEST_NAMESPACE, getCurrentGeneration, getCurrentNamespace, isGenerationCurrent } from '@/lib/accountNamespace';
import { fetchFavorites, fetchFollowedProducts, fetchNotificationPreferences, fetchUserLotteries } from '@/lib/syncClient';
import { useAuthStore } from '@/stores/authStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useMyLotteriesStore } from '@/stores/myLotteriesStore';
import { useNotificationSettingsStore } from '@/stores/notificationSettingsStore';
import { useOfflineQueueStore, type QueuedOperationKind } from '@/stores/offlineQueueStore';

/**
 * 通常時の差分同期（13・24章）。フォアグラウンド復帰時・Pull-to-Refresh時に呼ぶ想定。
 * G2Bバックエンドにdelta/cursor APIが無いため、フル再取得＋`serverVersion`比較方式を採る。
 *
 * ローカルにまだ送信できていない変更（オフラインキューに`pending`/`conflict`で残っている
 * 操作）がある行は、フェッチ結果で単純に上書きしない（14章）。例えば「ローカルで削除
 * したがまだサーバーへ届いていない抽選」をこの同期で復活させてしまわないようにするため、
 * 該当`resourceKey`の行はフェッチ結果から除外してから各ストアへ渡す。
 */

function pendingResourceKeys(kinds: QueuedOperationKind[]): Set<string> {
  const ops = useOfflineQueueStore.getState().operations;
  return new Set(ops.filter((o) => kinds.includes(o.kind) && (o.status === 'pending' || o.status === 'conflict')).map((o) => o.resourceKey));
}

let inFlight: Promise<void> | null = null;

export async function runDifferentialSync(): Promise<void> {
  if (useAuthStore.getState().status !== 'signedIn') return;
  if (getCurrentNamespace() === GUEST_NAMESPACE) return;
  if (inFlight) return inFlight;

  const generation = getCurrentGeneration();

  inFlight = (async () => {
    const [lotteries, favorites, followedProducts, notifications] = await Promise.allSettled([
      fetchUserLotteries({ limit: 100 }),
      fetchFavorites({ limit: 100 }),
      fetchFollowedProducts({ limit: 100 }),
      fetchNotificationPreferences(),
    ]);

    // namespace切替をまたいで解決した結果は破棄する（24-2章）。
    if (!isGenerationCurrent(generation)) return;

    if (lotteries.status === 'fulfilled') {
      const pending = pendingResourceKeys(['lottery.put', 'lottery.patch', 'lottery.delete']);
      const rows = lotteries.value.items.filter((row) => !pending.has(String(row.lotteryId)));
      await useMyLotteriesStore.getState().applyServerState(rows);
    }

    if (favorites.status === 'fulfilled') {
      const pending = pendingResourceKeys(['favorite.put', 'favorite.delete']);
      const rows = favorites.value.items.filter((row) => !pending.has(String(row.lotteryId)));
      useFavoritesStore.getState().applyServerFavorites(rows);
    }

    if (followedProducts.status === 'fulfilled') {
      useFavoritesStore.getState().applyServerFollowedProducts(followedProducts.value.items);
    }

    if (notifications.status === 'fulfilled') {
      const pending = pendingResourceKeys(['notificationPreferences.put']);
      if (!pending.has('global')) {
        useNotificationSettingsStore.getState().applyServerState(notifications.value);
      }
    }
  })();

  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}
