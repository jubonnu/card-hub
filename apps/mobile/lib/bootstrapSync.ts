import AsyncStorage from '@react-native-async-storage/async-storage';

import { freezeCurrentNamespace, syncNamespaceWithAuthUser } from '@/lib/accountNamespace';
import { generateClientRequestId } from '@/lib/clientRequestId';
import { getGuestRevision, getLastMigratedGuestRevision, setLastMigratedGuestRevision } from '@/lib/guestRevision';
import { postSyncBootstrap } from '@/lib/syncClient';
import { useSyncConflictsStore } from '@/lib/syncConflicts';
import type { LotteryRecord } from '@/schemas/lotteryApi';
import {
  groupChecklistStepsByLottery,
  toFavoriteRow,
  toFollowedProductRow,
  toNotificationPreferencesState,
  toUserLotteryRow,
  type SyncBootstrapRequest,
  type SyncBootstrapResponse,
} from '@/schemas/syncApi';
import { useAuthStore } from '@/stores/authStore';
import { useChecklistStore } from '@/stores/checklistStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useMyLotteriesStore } from '@/stores/myLotteriesStore';
import { useNotificationSettingsStore } from '@/stores/notificationSettingsStore';

/**
 * 初回bootstrap同期（24-6章）。ログイン成功直後、bootstrap未実施のユーザーに対して呼ぶ。
 *
 * 24-6章の原文は「serverStateをuser namespaceへ一時的に書き込んでから切り替える」だが、
 * bootstrap対象のuser namespaceは初回ログイン時点で必ず空（初めてこの端末でこの
 * アカウントにログインした場合のみbootstrap未実施のため）なので、本実装では
 * 「先にnamespaceを切り替え（空のnamespaceへ）、その後serverStateを適用する」という
 * 同値だが単純な順序を採る。適用は各ストアの`applyServerState`（全置換・冪等）で行うため、
 * 同じ`batchClientRequestId`での再試行は失敗時・部分適用時のいずれからでも安全に完了できる
 * （guestデータは常に無傷、bootstrapped flagは全ステップ成功後にのみ立てる）。
 */

const BOOTSTRAPPED_KEY_PREFIX = 'cardhub.bootstrapped.';
const BATCH_ID_KEY_PREFIX = 'cardhub.bootstrapBatchId.';
const DIFF_BATCH_ID_KEY_PREFIX = 'cardhub.guestDiffBatchId.';

async function isBootstrapped(publicUserId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(BOOTSTRAPPED_KEY_PREFIX + publicUserId)) === 'true';
}

async function markBootstrapped(publicUserId: string): Promise<void> {
  await AsyncStorage.setItem(BOOTSTRAPPED_KEY_PREFIX + publicUserId, 'true');
}

/** `keyPrefix + publicUserId`をキーに、同じ移行試行の間だけ安定したbatchClientRequestIdを発行する。 */
async function getOrCreateBatchId(keyPrefix: string, publicUserId: string): Promise<string> {
  const key = keyPrefix + publicUserId;
  const existing = await AsyncStorage.getItem(key);
  if (existing) return existing;
  const id = generateClientRequestId();
  await AsyncStorage.setItem(key, id);
  return id;
}

async function clearBatchId(keyPrefix: string, publicUserId: string): Promise<void> {
  await AsyncStorage.removeItem(keyPrefix + publicUserId);
}

/** guestストアの現在値からリクエストを組み立てる（初回bootstrap・guest差分移行の両方で使う）。 */
async function buildSyncRequest(batchClientRequestId: string): Promise<SyncBootstrapRequest> {
  const myLotteries = useMyLotteriesStore.getState().saved;
  const favorites = useFavoritesStore.getState();
  const checklistGroups = useChecklistStore.getState().groups;
  const notifications = useNotificationSettingsStore.getState();

  return {
    batchClientRequestId,
    userLotteries: myLotteries.map((s) => ({
      lotteryId: s.record.id,
      status: 'unknown',
      savedAt: s.savedAt,
      snapshot: s.record,
      clientRequestId: generateClientRequestId(),
    })),
    favorites: favorites.favoriteLotteryIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
      .map((lotteryId) => ({ lotteryId, clientRequestId: generateClientRequestId() })),
    followedProducts: favorites.followedProductIds.map((publicProductId) => ({ publicProductId, clientRequestId: generateClientRequestId() })),
    legacyFollowedProductKeys: favorites.followedProductKeys,
    checklistSteps: Object.entries(checklistGroups)
      .flatMap(([lotteryId, steps]) =>
        steps.map((step) => ({
          lotteryId: Number(lotteryId),
          stepId: step.id,
          label: step.label,
          done: step.done,
          completedNote: step.completedNote ?? null,
          sortOrder: step.sortOrder ?? 0,
          clientRequestId: generateClientRequestId(),
        }))
      )
      .filter((s) => Number.isFinite(s.lotteryId)),
    notificationPreferences: {
      deadlineReminder: notifications.deadlineReminder,
      announcementReminder: notifications.announcementReminder,
      purchaseReminder: notifications.purchaseReminder,
      newLotteryAlert: notifications.newLotteryAlert,
      favoriteUpdateAlert: notifications.favoriteUpdateAlert,
      pushEnabled: notifications.pushEnabled,
      emailEnabled: notifications.emailEnabled,
      quietHoursEnabled: notifications.quietHoursEnabled,
      quietHoursStart: notifications.quietHoursStart,
      quietHoursEnd: notifications.quietHoursEnd,
      deadlineReminderHoursBefore: notifications.deadlineReminderHoursBefore,
      announcementReminderHoursBefore: notifications.announcementReminderHoursBefore,
      purchaseReminderHoursBefore: notifications.purchaseReminderHoursBefore,
      clientRequestId: generateClientRequestId(),
    },
  };
}

function recordBootstrapConflicts(response: SyncBootstrapResponse): void {
  const { results } = response;
  const totalConflicts =
    results.userLotteries.conflicts.length +
    results.favorites.conflicts.length +
    results.followedProducts.conflicts.length +
    results.checklistSteps.conflicts.length +
    results.legacyFollowedProducts.unresolved.length;
  if (totalConflicts === 0) return;

  useSyncConflictsStore.getState().addConflict({
    id: 'bootstrap-summary',
    kind: 'bootstrapSummary',
    message: `一部のデータを移行できませんでした（${totalConflicts}件）`,
  });
}

/**
 * ステップ6・7: 検証済みserverStateを（既に切り替え済みの）user namespaceの各ストアへ適用する。
 * `guestSnapshots`はnamespace切替でリセットされる前に退避したguest側のLotteryRecordで、
 * サーバーが返した自分の抽選のうち既にguest側で保存済みだった分を、公開APIへ再取得せずに
 * そのまま引き継ぐために使う（切替後の空のストアから`GET /lotteries/:id`を叩き直す必要をなくす）。
 */
async function applyServerState(response: SyncBootstrapResponse, guestSnapshots: Map<number, LotteryRecord>): Promise<void> {
  const { serverState, results } = response;

  await useMyLotteriesStore.getState().applyServerState(serverState.userLotteries.map(toUserLotteryRow), guestSnapshots);
  useFavoritesStore.getState().applyServerFavorites(serverState.favorites.map(toFavoriteRow));
  useFavoritesStore.getState().applyServerFollowedProducts(serverState.followedProducts.map(toFollowedProductRow));
  useFavoritesStore.getState().applyLegacyFollowResolution(results.legacyFollowedProducts.resolved);

  const grouped = groupChecklistStepsByLottery(serverState.checklistSteps);
  for (const [lotteryId, steps] of grouped) {
    useChecklistStore.getState().applyServerState(String(lotteryId), steps);
  }

  if (serverState.notificationPreferences) {
    useNotificationSettingsStore.getState().applyServerState(toNotificationPreferencesState(serverState.notificationPreferences));
  }

  recordBootstrapConflicts(response);
}

let bootstrapInFlight: Promise<void> | null = null;

async function runBootstrapSync(publicUserId: string): Promise<void> {
  const batchClientRequestId = await getOrCreateBatchId(BATCH_ID_KEY_PREFIX, publicUserId);

  const { request, guestSnapshots } = await freezeCurrentNamespace(async () => ({
    request: await buildSyncRequest(batchClientRequestId), // ステップ1・2・3
    guestSnapshots: new Map(useMyLotteriesStore.getState().saved.map((s) => [s.record.id, s.record])),
  }));

  const response = await postSyncBootstrap(request); // ステップ4・5（Zod検証はpostSyncBootstrap内部）

  // ステップ9: namespace切替（authStore.userは既にこのpublicUserIdのため、guest→userへ切り替わる）。
  await syncNamespaceWithAuthUser();

  await applyServerState(response, guestSnapshots); // ステップ6・7・10

  await markBootstrapped(publicUserId); // ステップ8
  await clearBatchId(BATCH_ID_KEY_PREFIX, publicUserId); // ステップ11相当（このbatchでの再試行は不要になった）
  // ステップ12: guestデータは削除しない（何もしない）。

  // このアカウントの初回bootstrap時点のguestRevisionまでは移行済みとして扱う
  // （直後にログアウトしてゲストとして何もしなければ、次回ログインで無駄な差分移行を走らせない）。
  await setLastMigratedGuestRevision(publicUserId, await getGuestRevision());
}

const PENDING_MIGRATION_KEY_PREFIX = 'cardhub.pendingGuestMigration.';

interface PendingGuestMigration {
  request: SyncBootstrapRequest;
  /** このsnapshotを作った時点のguestRevision。成功時にこの値を`lastMigratedGuestRevision`へ書く。 */
  guestRevisionAtSnapshot: number;
}

async function getPendingGuestMigration(publicUserId: string): Promise<PendingGuestMigration | null> {
  const raw = await AsyncStorage.getItem(PENDING_MIGRATION_KEY_PREFIX + publicUserId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingGuestMigration;
  } catch {
    return null; // 破損データは「pending無し」扱いにする（次回の差分検知が再度捕まえる）。
  }
}

async function savePendingGuestMigration(publicUserId: string, pending: PendingGuestMigration): Promise<void> {
  await AsyncStorage.setItem(PENDING_MIGRATION_KEY_PREFIX + publicUserId, JSON.stringify(pending));
}

async function clearPendingGuestMigration(publicUserId: string): Promise<void> {
  await AsyncStorage.removeItem(PENDING_MIGRATION_KEY_PREFIX + publicUserId);
}

/** 保存済みリクエストの`userLotteries[].snapshot`から`guestSnapshots`を再構築する（別途保持しない）。 */
function guestSnapshotsFromRequest(request: SyncBootstrapRequest): Map<number, LotteryRecord> {
  return new Map(
    request.userLotteries
      .filter((item): item is typeof item & { snapshot: LotteryRecord } => item.snapshot !== undefined)
      .map((item) => [item.lotteryId, item.snapshot])
  );
}

/**
 * guest差分移行（Mobile-G4 Hardening改訂: pending snapshot方式）。
 *
 * 「移行が終わるまでnamespaceをguestに留める」方式は、認証済み（authStore.status===
 * 'signedIn'）なのにローカルのnamespace境界だけguestのままという不整合を生み、通常sync・
 * 新規ユーザー操作・RevenueCatログインのいずれもaccount namespaceを前提にしているため
 * 危険と判断し廃止した。代わりに次の方式を採る:
 *
 * 1. guest payloadを不変スナップショットとして`publicUserId`ごとにAsyncStorageへ保存する
 *    （`batchClientRequestId`もリクエストに含めて一緒に確定・保存する）
 * 2. account namespaceへ即座に切り替える（送信の成否を待たない）
 * 3. 保存済みsnapshotをサーバーへ送信する（ベストエフォート、失敗しても例外を投げない）
 * 4. 成功した場合のみsnapshotを削除し`lastMigratedGuestRevision`を更新する
 *
 * こうすることで、送信が失敗しても認証・namespace・以降のユーザー操作は常にaccount側で
 * 一貫する。guest側の生きたstoreには依存しない（`performSwitch`がnamespace切替時に
 * 切替元のstorageを空にしても、既にsnapshotへ複写済みのため無関係）。snapshotは
 * `publicUserId`ごとに独立しているため、pending中に別アカウントへログインしても混線しない。
 */
async function captureAndSwitchToPendingGuestMigration(publicUserId: string): Promise<PendingGuestMigration> {
  const guestRevisionAtSnapshot = await getGuestRevision();
  const batchClientRequestId = await getOrCreateBatchId(DIFF_BATCH_ID_KEY_PREFIX, publicUserId);

  const request = await freezeCurrentNamespace(() => buildSyncRequest(batchClientRequestId));
  const pending: PendingGuestMigration = { request, guestRevisionAtSnapshot };
  await savePendingGuestMigration(publicUserId, pending);

  await syncNamespaceWithAuthUser(); // account namespaceへ切替。以降の通常操作は全てaccount側になる。

  return pending;
}

/** 保存済みpending snapshotをサーバーへ送信する。失敗しても例外を投げず、次回再試行に委ねる。 */
async function attemptPendingGuestMigration(publicUserId: string, pending: PendingGuestMigration): Promise<void> {
  try {
    const response = await postSyncBootstrap(pending.request);
    await applyServerState(response, guestSnapshotsFromRequest(pending.request));

    await setLastMigratedGuestRevision(publicUserId, pending.guestRevisionAtSnapshot);
    await clearBatchId(DIFF_BATCH_ID_KEY_PREFIX, publicUserId);
    await clearPendingGuestMigration(publicUserId);
  } catch {
    useSyncConflictsStore.getState().addConflict({
      id: 'guest-migration-failed',
      kind: 'guestMigrationFailed',
      message: 'ログアウト中に追加したデータを同期できませんでした。次回起動時に自動で再試行します',
    });
  }
}

/**
 * ログイン成功後・アプリ起動時のセッション復元後に呼ぶ、唯一の公開エントリポイント。
 * - bootstrap未実施なら初回bootstrapを実行する
 * - このアカウント宛の未完了pending snapshotがあれば、まずその再送を試みる
 *   （アプリ強制終了・前回ログイン失敗からの再開に対応。namespace切替も未完了の可能性が
 *   あるため`syncNamespaceWithAuthUser`を先に確定させる——既に切替済みなら即returnする）
 * - bootstrap済みで、前回ログイン以降にguestとして行った未移行の変更があれば、
 *   pending snapshotとして確定→account namespaceへ切替→送信を試みる
 * - 変更が無ければnamespace切替のみ
 */
export async function ensureNamespaceAndBootstrap(): Promise<void> {
  const publicUserId = useAuthStore.getState().user?.publicUserId;
  if (!publicUserId) return;

  if (bootstrapInFlight) return bootstrapInFlight;

  bootstrapInFlight = (async () => {
    if (!(await isBootstrapped(publicUserId))) {
      await runBootstrapSync(publicUserId);
      return;
    }

    const existingPending = await getPendingGuestMigration(publicUserId);
    if (existingPending) {
      await syncNamespaceWithAuthUser();
      await attemptPendingGuestMigration(publicUserId, existingPending);
      return;
    }

    const [guestRevision, lastMigrated] = await Promise.all([getGuestRevision(), getLastMigratedGuestRevision(publicUserId)]);
    if (guestRevision > lastMigrated) {
      const pending = await captureAndSwitchToPendingGuestMigration(publicUserId);
      await attemptPendingGuestMigration(publicUserId, pending);
      return;
    }

    await syncNamespaceWithAuthUser();
  })().finally(() => {
    bootstrapInFlight = null;
  });

  return bootstrapInFlight;
}
