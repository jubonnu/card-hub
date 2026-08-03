import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GUEST_NAMESPACE, useNamespaceStore } from '@/lib/accountNamespace';
import {
  getGuestRevision,
  getLastMigratedGuestRevision,
  markGuestDataChanged,
  setLastMigratedGuestRevision,
} from '@/lib/guestRevision';

describe('lib/guestRevision', () => {
  beforeEach(async () => {
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false, generation: 0 });
    await AsyncStorage.removeItem('cardhub.guestRevision');
    await AsyncStorage.removeItem('cardhub.lastMigratedGuestRevision.userA');
  });

  afterEach(async () => {
    await AsyncStorage.removeItem('cardhub.guestRevision');
    await AsyncStorage.removeItem('cardhub.lastMigratedGuestRevision.userA');
  });

  it('初期状態は0', async () => {
    expect(await getGuestRevision()).toBe(0);
  });

  it('guest namespace中はmarkGuestDataChangedのたびに1ずつ増える', async () => {
    await markGuestDataChanged();
    expect(await getGuestRevision()).toBe(1);
    await markGuestDataChanged();
    expect(await getGuestRevision()).toBe(2);
  });

  it('guest namespace以外では増えない', async () => {
    useNamespaceStore.setState({ namespace: 'userA', isSwitching: false });
    await markGuestDataChanged();
    expect(await getGuestRevision()).toBe(0);
  });

  it('lastMigratedGuestRevisionはpublicUserIdごとに独立して保存・取得できる', async () => {
    expect(await getLastMigratedGuestRevision('userA')).toBe(0);
    await setLastMigratedGuestRevision('userA', 3);
    expect(await getLastMigratedGuestRevision('userA')).toBe(3);
    expect(await getLastMigratedGuestRevision('userB')).toBe(0); // 別ユーザーには影響しない
  });
});
