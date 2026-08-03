import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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

/**
 * `favoritesStore`等と同じ構成（zustand + persist + `createAccountScopedStorage`）の
 * 実際のpersist済みストアを使い、`resetToDefaults`がnamespace切替前のnamespaceへ
 * 空状態を書き込んでしまわないかを検証する（フェイクの`resetSpy`は`set()`を呼ばないため、
 * この不具合を再現できない）。
 */
interface FakePersistedState {
  value: string;
  setValue: (value: string) => void;
  resetToDefaults: () => void;
}

const useFakePersistedStore = create<FakePersistedState>()(
  persist(
    (set) => ({
      value: '',
      setValue: (value) => set({ value }),
      resetToDefaults: () => set({ value: '' }),
    }),
    { name: 'fake-persisted', storage: createJSONStorage(() => createAccountScopedStorage('fake-persisted')) }
  )
);

registerAccountScopedStore({
  baseName: 'fake-persisted',
  resetToDefaults: () => useFakePersistedStore.getState().resetToDefaults(),
  rehydrate: () => Promise.resolve(useFakePersistedStore.persist.rehydrate()),
});

function setAuthUser(publicUserId: string | null) {
  useAuthStore.setState({
    user: publicUserId
      ? { publicUserId, displayName: null, email: null, accountStatus: 'active', scheduledDeletionAt: null, cachedAppleDisplayName: null }
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
    await AsyncStorage.removeItem('cardhub::guest::fake-persisted');
    await AsyncStorage.removeItem('cardhub::userA::fake-persisted');
    useFakePersistedStore.setState({ value: '' });
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

  describe('サインアウト時にresetToDefaultsが切替元namespaceのデータを消さない（回帰テスト）', () => {
    it('userAとしてデータを保存→サインアウトしても、userAのディスク上のデータは残る', async () => {
      setAuthUser('userA');
      await syncNamespaceWithAuthUser();
      useFakePersistedStore.getState().setValue('important-data');
      // persistミドルウェアの書き込みが確実に完了するのを待つ（setValueの内部setItemはfire-and-forget）。
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(await readNamespacedItem('userA', 'fake-persisted')).toContain('important-data');

      setAuthUser(null);
      await syncNamespaceWithAuthUser(); // サインアウト相当（userA → guest）

      const stillOnDisk = await readNamespacedItem('userA', 'fake-persisted');
      expect(stillOnDisk).toContain('important-data');
    });

    it('サインアウト→再サインインでデータが正しく復元される', async () => {
      setAuthUser('userA');
      await syncNamespaceWithAuthUser();
      useFakePersistedStore.getState().setValue('important-data');
      await new Promise((resolve) => setTimeout(resolve, 0));

      setAuthUser(null);
      await syncNamespaceWithAuthUser(); // サインアウト
      expect(useFakePersistedStore.getState().value).toBe(''); // ゲストnamespaceは別データ（空）

      setAuthUser('userA');
      await syncNamespaceWithAuthUser(); // 再サインイン
      expect(useFakePersistedStore.getState().value).toBe('important-data');
    });
  });
});
