import AsyncStorage from '@react-native-async-storage/async-storage';

import { GUEST_NAMESPACE, getCurrentNamespace } from '@/lib/accountNamespace';

/**
 * ログアウト後にゲストとして行った操作を、再ログイン時に検知してサーバーへ差分移行するための
 * 追跡機構（Mobile-G4 Hardening「guest差分移行」）。
 *
 * `guestRevision`はguest namespace中の書き込み系ストアアクションから呼ばれるたびに1増える
 * 単調カウンタ。`lastMigratedGuestRevision`はpublicUserIdごとに「どのguestRevisionまで
 * 移行済みか」を記録する。`guestRevision > lastMigratedGuestRevision[publicUserId]`であれば、
 * そのアカウントへ再ログインした時点でまだサーバーへ送っていないguestデータ変更がある。
 */

const GUEST_REVISION_KEY = 'cardhub.guestRevision';
const LAST_MIGRATED_REVISION_KEY_PREFIX = 'cardhub.lastMigratedGuestRevision.';

function parseRevision(value: string | null): number {
  const n = value ? Number(value) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function getGuestRevision(): Promise<number> {
  return parseRevision(await AsyncStorage.getItem(GUEST_REVISION_KEY));
}

/**
 * guest namespace中の書き込み系アクションから呼ぶ。現在のnamespaceがguestでない場合は
 * 何もしない（サインイン中ユーザーの操作はこのカウンタと無関係）。
 */
export async function markGuestDataChanged(): Promise<void> {
  if (getCurrentNamespace() !== GUEST_NAMESPACE) return;
  const current = await getGuestRevision();
  await AsyncStorage.setItem(GUEST_REVISION_KEY, String(current + 1));
}

export async function getLastMigratedGuestRevision(publicUserId: string): Promise<number> {
  return parseRevision(await AsyncStorage.getItem(LAST_MIGRATED_REVISION_KEY_PREFIX + publicUserId));
}

export async function setLastMigratedGuestRevision(publicUserId: string, revision: number): Promise<void> {
  await AsyncStorage.setItem(LAST_MIGRATED_REVISION_KEY_PREFIX + publicUserId, String(revision));
}

/** テスト専用: 永続化された値をリセットする。 */
export async function __resetGuestRevisionForTests(): Promise<void> {
  await AsyncStorage.removeItem(GUEST_REVISION_KEY);
}
