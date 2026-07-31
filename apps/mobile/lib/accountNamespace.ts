import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';

import { useAuthStore } from '@/stores/authStore';

/**
 * アカウント別データ分離（11章）: namespaceは`guest`または`publicUserId`のみを取りうる。
 * ストア再構築ではなく「中央管理のaccount-scoped storage adapter」方式を採用する。
 * 各account-scopedストア（自分の抽選・お気に入り・チェックリスト・通知設定・オフラインキュー）は
 * `createAccountScopedStorage(baseName)`を`persist`の`storage`に渡すだけでよく、実際のキー
 * （`cardhub::<namespace>::<baseName>`）はこのモジュールが一元的に解決する。
 */
export type Namespace = 'guest' | (string & {});

export const GUEST_NAMESPACE: Namespace = 'guest';

interface NamespaceState {
  namespace: Namespace;
  /** namespace切替の最中。この間、account-scopedストアの書き込み系アクションは一時停止する。 */
  isSwitching: boolean;
  /**
   * namespace切替のたびにインクリメントされる世代カウンタ（24-2章）。bootstrap・差分同期等の
   * 非同期処理は開始時に`getCurrentGeneration()`を記録し、完了時に一致するか確認することで、
   * namespace切替をまたいで解決した古いレスポンスを破棄できる。
   */
  generation: number;
}

export const useNamespaceStore = create<NamespaceState>(() => ({
  namespace: GUEST_NAMESPACE,
  isSwitching: false,
  generation: 0,
}));

export function getCurrentNamespace(): Namespace {
  return useNamespaceStore.getState().namespace;
}

export function isNamespaceSwitching(): boolean {
  return useNamespaceStore.getState().isSwitching;
}

/** signedIn状態かつguest namespaceでない、すなわちオフラインキューへenqueueしてよい状態か。 */
export function isSyncEligible(): boolean {
  return useAuthStore.getState().status === 'signedIn' && getCurrentNamespace() !== GUEST_NAMESPACE;
}

export function getCurrentGeneration(): number {
  return useNamespaceStore.getState().generation;
}

/** 非同期処理の開始時に記録した世代が、まだ現在の世代と一致するかどうか。 */
export function isGenerationCurrent(generation: number): boolean {
  return getCurrentGeneration() === generation;
}

function resolveStorageKey(namespace: Namespace, baseName: string): string {
  return `cardhub::${namespace}::${baseName}`;
}

/**
 * account-scopedストアが使う共通の永続化ストレージ。呼び出し時点の`getCurrentNamespace()`で
 * キーを解決するため、`switchNamespaceTo`がnamespaceを切り替えた後にストアが
 * `persist.rehydrate()`されると、自動的に新namespaceのキーから読み直される。
 */
export function createAccountScopedStorage(baseName: string): StateStorage {
  return {
    getItem: (): Promise<string | null> => AsyncStorage.getItem(resolveStorageKey(getCurrentNamespace(), baseName)),
    setItem: (_name: string, value: string): Promise<void> =>
      AsyncStorage.setItem(resolveStorageKey(getCurrentNamespace(), baseName), value),
    removeItem: (): Promise<void> => AsyncStorage.removeItem(resolveStorageKey(getCurrentNamespace(), baseName)),
  };
}

/** namespace切替の対象外で、特定namespaceのキーを直接操作したい場合（bootstrap・削除）に使う。 */
export async function readNamespacedItem(namespace: Namespace, baseName: string): Promise<string | null> {
  return AsyncStorage.getItem(resolveStorageKey(namespace, baseName));
}

export async function removeNamespacedItem(namespace: Namespace, baseName: string): Promise<void> {
  await AsyncStorage.removeItem(resolveStorageKey(namespace, baseName));
}

export interface AccountScopedStore {
  /** `createAccountScopedStorage`に渡しているのと同じbaseName（24-2章のnamespace物理削除に使う）。 */
  baseName: string;
  /** メモリ上の状態をデフォルト（空）へ戻す。ストレージには触れない。 */
  resetToDefaults: () => void;
  /** 現在のnamespaceのストレージから明示的に読み直す（zustand persistの`rehydrate`）。 */
  rehydrate: () => Promise<void>;
}

const registeredStores: AccountScopedStore[] = [];

/** 各account-scopedストアが自身をnamespace切替の対象として登録する（起動時に1回）。 */
export function registerAccountScopedStore(store: AccountScopedStore): void {
  registeredStores.push(store);
}

let switchInFlight: Promise<void> | null = null;

/**
 * namespace切替の唯一の実装（11章: 切替処理を1か所へ集約）。
 * 0. 世代カウンタをインクリメントする（切替開始時点で、進行中の非同期処理をすべて「古い」扱いにする）
 * 1. 全ストアのメモリ状態を先にリセットする（旧namespaceのデータを一瞬でも表示しない）
 * 2. namespaceを切り替える（以降、ストレージアダプタは新namespaceのキーを解決する）
 * 3. 新namespaceから全ストアを明示的にrehydrateする
 * この間`isSwitching=true`とし、複数ストアが異なるnamespaceを参照する瞬間を作らない。
 */
async function performSwitch(nextNamespace: Namespace): Promise<void> {
  useNamespaceStore.setState((state) => ({ isSwitching: true, generation: state.generation + 1 }));
  try {
    for (const store of registeredStores) store.resetToDefaults();
    useNamespaceStore.setState({ namespace: nextNamespace });
    await Promise.all(registeredStores.map((store) => store.rehydrate()));
  } finally {
    useNamespaceStore.setState({ isSwitching: false });
  }
}

/**
 * アカウント削除（17・24-5章）: 削除対象namespace（=削除前の`publicUserId`）のストレージを
 * 全account-scopedストア分まとめて物理削除する。呼び出し時点では既にguest namespaceへ
 * 切り替わっている前提（削除対象namespaceはどのストアからも参照されていない）。
 */
export async function deleteNamespaceData(namespace: Namespace): Promise<void> {
  await Promise.all(registeredStores.map((store) => removeNamespacedItem(namespace, store.baseName)));
}

/**
 * `nextNamespace`を外部から自由に渡せる形にはせず、この関数はファイル内限定で使う
 * （`export`しない）。公開エントリポイントは`syncNamespaceWithAuthUser`のみとし、
 * 「publicUserIdをユーザー入力から受け取らない」「authStoreの認証済みuserからのみ
 * namespaceを決定する」という制約を構造的に保証する。
 */
async function switchNamespaceTo(nextNamespace: Namespace): Promise<void> {
  if (nextNamespace === getCurrentNamespace()) return;
  if (switchInFlight) await switchInFlight;
  if (nextNamespace === getCurrentNamespace()) return;

  switchInFlight = performSwitch(nextNamespace).finally(() => {
    switchInFlight = null;
  });
  await switchInFlight;
}

/**
 * namespace切替の唯一の公開エントリポイント。引数を取らず、`authStore`の認証済み`user`
 * （`publicUserId`）からのみ次のnamespaceを決定する（未ログインなら`guest`）。
 * ログイン成功後・ログアウト後・アカウント削除後に呼ぶ。
 */
export async function syncNamespaceWithAuthUser(): Promise<void> {
  const publicUserId = useAuthStore.getState().user?.publicUserId;
  await switchNamespaceTo(publicUserId ?? GUEST_NAMESPACE);
}

/**
 * bootstrap同期（24-6章）のステップ1「guest namespaceを凍結する」用。namespace自体は
 * 切り替えず（`performSwitch`とは別系統）、`isSwitching=true`の間だけ現namespaceの
 * account-scopedストアへの書き込みを一時停止する。`fn`実行中に他の`switchNamespaceTo`
 * 呼び出しが割り込まないよう、`switchInFlight`にも同じPromiseを割り当てる。
 */
export async function freezeCurrentNamespace<T>(fn: () => Promise<T>): Promise<T> {
  if (switchInFlight) await switchInFlight;

  useNamespaceStore.setState({ isSwitching: true });
  const result = fn().finally(() => {
    useNamespaceStore.setState({ isSwitching: false });
  });

  // 完了検知専用（switchInFlightを他の待ち手に共有するため）。エラー自体はresultをawaitする側が処理する。
  switchInFlight = result.then(
    () => undefined,
    () => undefined
  ).finally(() => {
    switchInFlight = null;
  });

  return result;
}
