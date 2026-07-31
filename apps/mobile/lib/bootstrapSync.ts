import AsyncStorage from '@react-native-async-storage/async-storage';

import { freezeCurrentNamespace, syncNamespaceWithAuthUser } from '@/lib/accountNamespace';
import { generateClientRequestId } from '@/lib/clientRequestId';
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

async function isBootstrapped(publicUserId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(BOOTSTRAPPED_KEY_PREFIX + publicUserId)) === 'true';
}

async function markBootstrapped(publicUserId: string): Promise<void> {
  await AsyncStorage.setItem(BOOTSTRAPPED_KEY_PREFIX + publicUserId, 'true');
}

async function getOrCreateBatchClientRequestId(publicUserId: string): Promise<string> {
  const key = BATCH_ID_KEY_PREFIX + publicUserId;
  const existing = await AsyncStorage.getItem(key);
  if (existing) return existing;
  const id = generateClientRequestId();
  await AsyncStorage.setItem(key, id);
  return id;
}

async function clearBatchClientRequestId(publicUserId: string): Promise<void> {
  await AsyncStorage.removeItem(BATCH_ID_KEY_PREFIX + publicUserId);
}

/** guestストアの現在値からbootstrapリクエストを組み立てる（ステップ1・2）。 */
async function buildBootstrapRequest(publicUserId: string): Promise<SyncBootstrapRequest> {
  const batchClientRequestId = await getOrCreateBatchClientRequestId(publicUserId); // ステップ3

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
  const { request, guestSnapshots } = await freezeCurrentNamespace(async () => ({
    request: await buildBootstrapRequest(publicUserId), // ステップ1・2
    guestSnapshots: new Map(useMyLotteriesStore.getState().saved.map((s) => [s.record.id, s.record])),
  }));

  const response = await postSyncBootstrap(request); // ステップ4・5（Zod検証はpostSyncBootstrap内部）

  // ステップ9: namespace切替（authStore.userは既にこのpublicUserIdのため、guest→userへ切り替わる）。
  await syncNamespaceWithAuthUser();

  await applyServerState(response, guestSnapshots); // ステップ6・7・10

  await markBootstrapped(publicUserId); // ステップ8
  await clearBatchClientRequestId(publicUserId); // ステップ11相当（このbatchでの再試行は不要になった）
  // ステップ12: guestデータは削除しない（何もしない）。
}

/**
 * ログイン成功後・アプリ起動時のセッション復元後に呼ぶ、唯一の公開エントリポイント。
 * bootstrap未実施なら実行し、実施済みならnamespace切替のみ行う。
 */
export async function ensureNamespaceAndBootstrap(): Promise<void> {
  const publicUserId = useAuthStore.getState().user?.publicUserId;
  if (!publicUserId) return;

  if (bootstrapInFlight) return bootstrapInFlight;

  bootstrapInFlight = (async () => {
    if (await isBootstrapped(publicUserId)) {
      await syncNamespaceWithAuthUser();
      return;
    }
    await runBootstrapSync(publicUserId);
  })().finally(() => {
    bootstrapInFlight = null;
  });

  return bootstrapInFlight;
}
