import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GUEST_NAMESPACE, useNamespaceStore } from '@/lib/accountNamespace';
import { saveRefreshToken } from '@/lib/secureStore';
import { useAuthStore } from '@/stores/authStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';

describe('favoritesStore', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    useFavoritesStore.setState({ favoriteLotteryIds: [], followedProductKeys: [], followedProductIds: [] });
    useOfflineQueueStore.getState().clear();
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useAuthStore.setState({ status: 'signedOut', sessionAvailability: 'expired', user: null, accessToken: null, accessTokenExpiresAt: null });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('toggleFollowedProductはpublicProductIdが無いためサーバー同期しない', () => {
    useNamespaceStore.setState({ namespace: 'userA', isSwitching: false });
    useAuthStore.setState({ status: 'signedIn', sessionAvailability: 'online', user: null, accessToken: 'at', accessTokenExpiresAt: Date.now() + 10_000 });

    useFavoritesStore.getState().toggleFollowedProduct('pikachu-box');

    expect(useFavoritesStore.getState().followedProductKeys).toEqual(['pikachu-box']);
    expect(useOfflineQueueStore.getState().operations).toHaveLength(0);
  });

  it('signedIn状態でtoggleFavoriteLottery（数値lotteryId）はキューへenqueueする', async () => {
    useNamespaceStore.setState({ namespace: 'userA', isSwitching: false });
    useAuthStore.setState({ status: 'signedIn', sessionAvailability: 'online', user: null, accessToken: 'at', accessTokenExpiresAt: Date.now() + 10_000 });
    await saveRefreshToken('rt-1', 'device-1');

    useFavoritesStore.getState().toggleFavoriteLottery('42');

    expect(useOfflineQueueStore.getState().operations).toHaveLength(1);
    const [op] = useOfflineQueueStore.getState().operations;
    expect(op.method).toBe('PUT');
    expect(op.path).toBe('/me/favorites/42');
  });

  it('applyLegacyFollowResolutionは解決済みキーをfollowedProductIdsへ移し、未解決キーは残す', () => {
    useFavoritesStore.setState({ followedProductKeys: ['pikachu-box', 'unresolved-key'], followedProductIds: [] });

    useFavoritesStore.getState().applyLegacyFollowResolution([{ legacyKey: 'pikachu-box', publicProductId: 'prod-uuid-1' }]);

    const state = useFavoritesStore.getState();
    expect(state.followedProductKeys).toEqual(['unresolved-key']);
    expect(state.followedProductIds).toEqual(['prod-uuid-1']);
  });

  it('applyServerFavoritesはサーバー由来のlotteryIdをマージする（重複しない）', () => {
    useFavoritesStore.setState({ favoriteLotteryIds: ['1'] });

    useFavoritesStore.getState().applyServerFavorites([
      { lotteryId: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { lotteryId: 2, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    expect(useFavoritesStore.getState().favoriteLotteryIds.sort()).toEqual(['1', '2']);
  });
});
