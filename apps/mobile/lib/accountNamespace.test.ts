import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GUEST_NAMESPACE,
  createAccountScopedStorage,
  deleteNamespaceData,
  getCurrentGeneration,
  getCurrentNamespace,
  isGenerationCurrent,
  isNamespaceSwitching,
  readNamespacedItem,
  registerAccountScopedStore,
  syncNamespaceWithAuthUser,
  useNamespaceStore,
} from '@/lib/accountNamespace';
import { useAuthStore } from '@/stores/authStore';

/**
 * `registeredStores`はモジュール内で一度きり蓄積されるため、テストファイル全体で1つの
 * フェイクストアだけを登録し、各テストではスパイの呼び出し履歴をクリアして使い回す。
 */
const resetSpy = vi.fn();
const rehydrateSpy = vi.fn(async () => {});
const storage = createAccountScopedStorage('test-store');

registerAccountScopedStore({
  baseName: 'test-store',
  resetToDefaults: resetSpy,
  rehydrate: rehydrateSpy,
});

function setAuthUser(publicUserId: string | null) {
  useAuthStore.setState({
    user: publicUserId
      ? { publicUserId, displayName: null, email: null, accountStatus: 'active', scheduledDeletionAt: null }
      : null,
  });
}

describe('accountNamespace', () => {
  beforeEach(async () => {
    resetSpy.mockClear();
    rehydrateSpy.mockClear();
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false, generation: 0 });
    setAuthUser(null);
    await AsyncStorage.removeItem('cardhub::guest::test-store');
    await AsyncStorage.removeItem('cardhub::userA::test-store');
    await AsyncStorage.removeItem('cardhub::userB::test-store');
  });

  it('初期namespaceはguest、世代は0', () => {
    expect(getCurrentNamespace()).toBe(GUEST_NAMESPACE);
    expect(getCurrentGeneration()).toBe(0);
  });

  it('guest→A→guest→Bと遷移してもAのデータがBへ混在しない', async () => {
    setAuthUser('userA');
    await syncNamespaceWithAuthUser();
    expect(getCurrentNamespace()).toBe('userA');
    await storage.setItem('test-store', JSON.stringify({ owner: 'A' }));

    setAuthUser(null);
    await syncNamespaceWithAuthUser();
    expect(getCurrentNamespace()).toBe(GUEST_NAMESPACE);

    setAuthUser('userB');
    await syncNamespaceWithAuthUser();
    expect(getCurrentNamespace()).toBe('userB');
    const bData = await storage.getItem('test-store');
    expect(bData).toBeNull();

    const aData = await readNamespacedItem('userA', 'test-store');
    expect(aData).toBe(JSON.stringify({ owner: 'A' }));
  });

  it('namespace切替中は書き込みが拒否される想定でresetToDefaultsがnamespace変更前に呼ばれる', async () => {
    setAuthUser('userA');
    const order: string[] = [];
    resetSpy.mockImplementationOnce(() => order.push('reset'));
    const switchPromise = syncNamespaceWithAuthUser();
    expect(isNamespaceSwitching()).toBe(true);
    await switchPromise;
    order.push('done');
    expect(order).toEqual(['reset', 'done']);
    expect(isNamespaceSwitching()).toBe(false);
  });

  it('切替のたびに世代がインクリメントされ、切替前に記録した世代は古くなる', async () => {
    const genBefore = getCurrentGeneration();
    setAuthUser('userA');
    const switchPromise = syncNamespaceWithAuthUser();
    // 切替開始時点で既に世代はインクリメントされている（切替完了を待たずに古くなる）。
    expect(isGenerationCurrent(genBefore)).toBe(false);
    await switchPromise;
    expect(getCurrentGeneration()).toBe(genBefore + 1);
  });

  it('同じnamespaceへの切替は何もしない（世代を進めない）', async () => {
    const genBefore = getCurrentGeneration();
    await syncNamespaceWithAuthUser(); // user未設定のためguest→guest
    expect(getCurrentGeneration()).toBe(genBefore);
    expect(resetSpy).not.toHaveBeenCalled();
  });

  it('deleteNamespaceDataは指定namespaceのストレージのみ削除する', async () => {
    await AsyncStorage.setItem('cardhub::userA::test-store', 'a-data');
    await AsyncStorage.setItem('cardhub::guest::test-store', 'guest-data');

    await deleteNamespaceData('userA');

    expect(await readNamespacedItem('userA', 'test-store')).toBeNull();
    expect(await readNamespacedItem(GUEST_NAMESPACE, 'test-store')).toBe('guest-data');
  });

  it('rehydrateは新namespaceへ切り替わった後に呼ばれる', async () => {
    setAuthUser('userA');
    rehydrateSpy.mockImplementationOnce(async () => {
      expect(getCurrentNamespace()).toBe('userA');
    });
    await syncNamespaceWithAuthUser();
    expect(rehydrateSpy).toHaveBeenCalledTimes(1);
  });
});
