import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GUEST_NAMESPACE, getCurrentNamespace, useNamespaceStore } from '@/lib/accountNamespace';
import { ensureNamespaceAndBootstrap } from '@/lib/bootstrapSync';
import { useSyncConflictsStore } from '@/lib/syncConflicts';
import { useAuthStore } from '@/stores/authStore';
import { useChecklistStore } from '@/stores/checklistStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useMyLotteriesStore } from '@/stores/myLotteriesStore';
import { useNotificationSettingsStore } from '@/stores/notificationSettingsStore';
import { defaultNotificationSettings } from '@/data/mockData';
import type { LotteryRecord } from '@/schemas/lotteryApi';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const record: LotteryRecord = {
  id: 1,
  sourcePostId: null,
  productNameRaw: 'テストカード',
  normalizedProductName: 'テストカード',
  cardType: 'pokemon',
  storeNameRaw: null,
  normalizedStoreName: null,
  storeBranchRaw: null,
  normalizedStoreBranch: null,
  region: null,
  normalizerVersion: null,
  applicationStartAt: null,
  confirmedOpenAt: null,
  applicationEndAt: null,
  applicationEndDate: null,
  applicationEndPrecision: null,
  resultAnnouncementAt: null,
  resultAnnouncementDate: null,
  resultAnnouncementPrecision: null,
  purchaseStartAt: null,
  purchaseDeadlineAt: null,
  applicationUrl: null,
  resolvedApplicationUrl: null,
  applicationUrlHttpStatus: null,
  urlResolvedAt: null,
  officialInformationUrl: null,
  appDownloadUrl: null,
  applicationMethod: null,
  eligibilityConditions: null,
  pickupMethod: null,
  paymentMethod: null,
  price: null,
  status: null,
  completenessScore: null,
  verificationStatus: null,
  approvedBy: null,
  approvedAt: null,
  rejectedReason: null,
  rejectedAt: null,
  lifecycleStatus: 'active',
  orphanedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function signInAsGuestThenUser(publicUserId: string) {
  useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false, generation: 0 });
  useAuthStore.setState({
    status: 'signedIn',
    sessionAvailability: 'online',
    user: { publicUserId, displayName: null, email: null, accountStatus: 'active', scheduledDeletionAt: null, cachedAppleDisplayName: null },
    accessToken: 'at-valid',
    accessTokenExpiresAt: Date.now() + 10 * 60_000,
  });
}

function successBody(overrides: Partial<Record<string, unknown>> = {}, userLotteriesServerState?: unknown[]) {
  return {
    syncId: 'sync-1',
    results: {
      userLotteries: { accepted: 1, skipped: 0, conflicts: [] },
      favorites: { accepted: 0, skipped: 0, conflicts: [] },
      followedProducts: { accepted: 0, skipped: 0, conflicts: [] },
      legacyFollowedProducts: { resolved: [{ legacyKey: 'pikachu-box', publicProductId: 'prod-uuid-1' }], unresolved: [] },
      checklistSteps: { accepted: 0, skipped: 0, conflicts: [] },
      notificationPreferences: { accepted: true, skipped: false },
      ...overrides,
    },
    serverState: {
      userLotteries: userLotteriesServerState ?? [
        {
          id: 1,
          userId: 1,
          lotteryId: 1,
          status: 'unknown',
          snapshotJson: null,
          snapshotUpdatedAt: null,
          savedAt: '2026-01-01T00:00:00.000Z',
          serverVersion: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
        },
      ],
      favorites: [],
      followedProducts: [],
      checklistSteps: [],
      notificationPreferences: null,
    },
  };
}

describe('bootstrapSync', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    useMyLotteriesStore.setState({ saved: [{ record, savedAt: '2026-01-01T00:00:00.000Z' }] });
    useFavoritesStore.setState({ favoriteLotteryIds: [], followedProductKeys: ['pikachu-box'], followedProductIds: [] });
    useChecklistStore.setState({ groups: {} });
    useNotificationSettingsStore.setState({ ...defaultNotificationSettings, serverVersion: 0 });
    useSyncConflictsStore.getState().clear();
    await AsyncStorage.removeItem('cardhub.bootstrapped.userA');
    await AsyncStorage.removeItem('cardhub.bootstrapBatchId.userA');
    await AsyncStorage.removeItem('cardhub.guestRevision');
    await AsyncStorage.removeItem('cardhub.lastMigratedGuestRevision.userA');
    await AsyncStorage.removeItem('cardhub.guestDiffBatchId.userA');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('空guestデータでもbootstrapが成功し、notificationPreferencesの時刻はゼロ埋めHH:MM形式で送信される', async () => {
    signInAsGuestThenUser('userA');
    useMyLotteriesStore.setState({ saved: [] });
    useFavoritesStore.setState({ favoriteLotteryIds: [], followedProductKeys: [], followedProductIds: [] });
    useChecklistStore.setState({ groups: {} });

    let capturedBody: Record<string, unknown> | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return jsonResponse(
        200,
        successBody({ favorites: { accepted: 0, skipped: 0, conflicts: [] }, notificationPreferences: { accepted: true, skipped: false } })
      );
    });

    await ensureNamespaceAndBootstrap();

    expect(capturedBody?.userLotteries).toEqual([]);
    expect(capturedBody?.favorites).toEqual([]);
    expect(capturedBody?.checklistSteps).toEqual([]);
    expect(capturedBody?.legacyFollowedProductKeys).toEqual([]);
    // 「7:00」のような非ゼロ埋め時刻はバックエンドのQUIET_HOURS_TIME_REGEXで422になるため、
    // ここでリグレッションを防ぐ（実際にx-post-fetcherの実スキーマで422になることを確認済みのバグ）。
    const notificationPreferences = capturedBody?.notificationPreferences as { quietHoursStart: string; quietHoursEnd: string };
    expect(notificationPreferences.quietHoursStart).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    expect(notificationPreferences.quietHoursEnd).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    expect(await AsyncStorage.getItem('cardhub.bootstrapped.userA')).toBe('true');
  });

  it('成功時: namespaceがuserへ切り替わり、serverStateが反映され、bootstrapped flagが立つ', async () => {
    signInAsGuestThenUser('userA');
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, successBody()));

    await ensureNamespaceAndBootstrap();

    expect(getCurrentNamespace()).toBe('userA');
    expect(await AsyncStorage.getItem('cardhub.bootstrapped.userA')).toBe('true');
    expect(await AsyncStorage.getItem('cardhub.bootstrapBatchId.userA')).toBeNull();
    expect(useMyLotteriesStore.getState().getSaved(1)?.serverVersion).toBe(1);
  });

  it('legacy followedProductKeysの解決結果を反映する', async () => {
    signInAsGuestThenUser('userA');
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, successBody()));

    await ensureNamespaceAndBootstrap();

    const state = useFavoritesStore.getState();
    expect(state.followedProductKeys).toEqual([]);
    expect(state.followedProductIds).toEqual(['prod-uuid-1']);
  });

  it('失敗時: guestデータ・bootstrapped flagは変更されず、同じbatchClientRequestIdで再試行できる', async () => {
    signInAsGuestThenUser('userA');
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));

    await expect(ensureNamespaceAndBootstrap()).rejects.toThrow();

    expect(getCurrentNamespace()).toBe(GUEST_NAMESPACE);
    expect(await AsyncStorage.getItem('cardhub.bootstrapped.userA')).toBeNull();
    const batchId = await AsyncStorage.getItem('cardhub.bootstrapBatchId.userA');
    expect(batchId).not.toBeNull();
    expect(useMyLotteriesStore.getState().getSaved(1)?.record.id).toBe(1); // guestデータは無傷

    // 再試行: 同じbatchClientRequestIdが使われる
    let capturedBatchId: string | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      capturedBatchId = body.batchClientRequestId;
      return jsonResponse(200, successBody());
    });

    await ensureNamespaceAndBootstrap();
    expect(capturedBatchId).toBe(batchId);
  });

  it('bootstrap済みの場合はnamespace切替のみ行いbootstrap APIを呼ばない', async () => {
    await AsyncStorage.setItem('cardhub.bootstrapped.userA', 'true');
    signInAsGuestThenUser('userA');
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await ensureNamespaceAndBootstrap();

    expect(getCurrentNamespace()).toBe('userA');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bootstrap途中（serverState適用中）に失敗した場合もbootstrapped flagは立てず、同じbatchClientRequestIdで再試行できる', async () => {
    signInAsGuestThenUser('userA');
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, successBody()));
    const applySpy = vi.spyOn(useMyLotteriesStore.getState(), 'applyServerState').mockRejectedValueOnce(new Error('boom'));

    await expect(ensureNamespaceAndBootstrap()).rejects.toThrow('boom');

    // namespace切替はserverState適用より前に行われるため、切替自体は完了している（実装上の意図的な単純化）。
    expect(getCurrentNamespace()).toBe('userA');
    expect(await AsyncStorage.getItem('cardhub.bootstrapped.userA')).toBeNull();
    const batchId = await AsyncStorage.getItem('cardhub.bootstrapBatchId.userA');
    expect(batchId).not.toBeNull();

    applySpy.mockRestore();
    let capturedBatchId: string | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      capturedBatchId = body.batchClientRequestId;
      return jsonResponse(200, successBody());
    });

    await ensureNamespaceAndBootstrap();
    expect(capturedBatchId).toBe(batchId);
    expect(await AsyncStorage.getItem('cardhub.bootstrapped.userA')).toBe('true');
  });

  it('conflictsがある場合はSyncConflictBanner用の通知を積む', async () => {
    signInAsGuestThenUser('userA');
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, successBody({ favorites: { accepted: 0, skipped: 0, conflicts: [{ lotteryId: 2, reason: 'server_already_had_data' }] } }))
    );

    await ensureNamespaceAndBootstrap();

    expect(useSyncConflictsStore.getState().conflicts.some((c) => c.kind === 'bootstrapSummary')).toBe(true);
  });
});

describe('bootstrapSync: guest差分移行（Mobile-G4 Hardening）', () => {
  const originalFetch = global.fetch;
  const record2: LotteryRecord = { ...record, id: 2 };

  async function completeInitialBootstrap(): Promise<void> {
    signInAsGuestThenUser('userA');
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, successBody()));
    await ensureNamespaceAndBootstrap();
  }

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    useMyLotteriesStore.setState({ saved: [{ record, savedAt: '2026-01-01T00:00:00.000Z' }] });
    useFavoritesStore.setState({ favoriteLotteryIds: [], followedProductKeys: [], followedProductIds: [] });
    useChecklistStore.setState({ groups: {} });
    useNotificationSettingsStore.setState({ ...defaultNotificationSettings, serverVersion: 0 });
    useSyncConflictsStore.getState().clear();
    await AsyncStorage.removeItem('cardhub.bootstrapped.userA');
    await AsyncStorage.removeItem('cardhub.bootstrapBatchId.userA');
    await AsyncStorage.removeItem('cardhub.guestRevision');
    await AsyncStorage.removeItem('cardhub.lastMigratedGuestRevision.userA');
    await AsyncStorage.removeItem('cardhub.guestDiffBatchId.userA');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('ログアウト後にguestお気に入りを追加→再ログインで移行される', async () => {
    await completeInitialBootstrap();

    // ログアウト相当: guest namespaceへ戻る。
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useFavoritesStore.getState().toggleFavoriteLottery('42');

    let capturedBody: Record<string, unknown> | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return jsonResponse(200, successBody());
    });

    await ensureNamespaceAndBootstrap();

    expect(capturedBody?.favorites).toEqual([{ lotteryId: 42, clientRequestId: expect.any(String) }]);
    expect(getCurrentNamespace()).toBe('userA');
  });

  it('ログアウト後にguestで別の抽選を追加→再ログインで移行される', async () => {
    await completeInitialBootstrap();

    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useMyLotteriesStore.getState().saveLottery(record2);

    let capturedBody: Record<string, unknown> | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return jsonResponse(200, successBody());
    });

    await ensureNamespaceAndBootstrap();

    const userLotteries = capturedBody?.userLotteries as { lotteryId: number }[];
    expect(userLotteries.map((l) => l.lotteryId).sort()).toEqual([1, 2]);
  });

  it('複数のguest変更（抽選追加+お気に入り）が1回の差分移行にまとまる', async () => {
    await completeInitialBootstrap();

    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useMyLotteriesStore.getState().saveLottery(record2);
    useFavoritesStore.getState().toggleFavoriteLottery('42');

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, successBody()));
    global.fetch = fetchMock;

    await ensureNamespaceAndBootstrap();

    expect(fetchMock).toHaveBeenCalledTimes(1); // 1回のリクエストにまとまる
  });

  it('guestの未移行変更が無ければ再ログインで差分移行APIを呼ばない', async () => {
    await completeInitialBootstrap();

    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    // guestデータへ何も変更を加えない。

    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await ensureNamespaceAndBootstrap();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCurrentNamespace()).toBe('userA');
  });

  it('移行API失敗時もauth user namespaceが有効になる（guestのまま留めない）', async () => {
    await completeInitialBootstrap();

    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useMyLotteriesStore.getState().saveLottery(record2);

    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));

    await ensureNamespaceAndBootstrap(); // 失敗しても例外を投げない（ログイン自体は成立させる）

    // pending snapshot方式: 送信の成否によらず、snapshot確定後に即座にaccount namespaceへ切り替える。
    expect(getCurrentNamespace()).toBe('userA');
    expect(useSyncConflictsStore.getState().conflicts.some((c) => c.kind === 'guestMigrationFailed')).toBe(true);
    // pending snapshotとして保存されている（次回再試行できる）。
    const pendingRaw = await AsyncStorage.getItem('cardhub.pendingGuestMigration.userA');
    expect(pendingRaw).not.toBeNull();
    const pending = JSON.parse(pendingRaw!);
    expect(pending.request.userLotteries.map((l: { lotteryId: number }) => l.lotteryId).sort()).toEqual([1, 2]);
  });

  it('移行失敗後の通常syncにguest snapshotが混入しない（applyServerStateが呼ばれていないため反映されない）', async () => {
    await completeInitialBootstrap();

    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useMyLotteriesStore.getState().saveLottery(record2); // guestとして新しい抽選(id=2)を追加

    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));
    await ensureNamespaceAndBootstrap();

    // account namespace（userA）のuseMyLotteriesStoreは、初回bootstrapで確定した内容
    // （lotteryId=1のみ）のままで、未送信のguest分（id=2）はまだ反映されていない
    // （applyServerStateはpostSyncBootstrap成功時のみ呼ばれるため）。
    expect(useMyLotteriesStore.getState().getSaved(1)).toBeDefined();
    expect(useMyLotteriesStore.getState().getSaved(2)).toBeUndefined();
  });

  it('移行失敗後のユーザー操作はaccount namespaceへ保存される（guestへ紛れ込まない）', async () => {
    await completeInitialBootstrap();

    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useMyLotteriesStore.getState().saveLottery(record2);

    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));
    await ensureNamespaceAndBootstrap();
    expect(getCurrentNamespace()).toBe('userA');

    // 失敗直後、ユーザーが新たに行った操作（例: 別の抽選をお気に入り登録）。
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { serverVersion: 1 }));
    global.fetch = fetchMock;
    useFavoritesStore.getState().toggleFavoriteLottery('99');

    // account namespace（signedIn && namespace!==guest）なので、offlineQueueへ即座にenqueueされる
    // （＝guest操作ではなく通常のユーザー操作として扱われている証拠）。
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.method ?? 'GET').toUpperCase()).toBe('PUT');
  });

  it('pending snapshotの再試行成功: 同じbatchClientRequestIdで再送され、成功するとpendingが消えlastMigratedGuestRevisionが更新される', async () => {
    await completeInitialBootstrap();

    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useMyLotteriesStore.getState().saveLottery(record2);

    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));
    await ensureNamespaceAndBootstrap();
    expect(getCurrentNamespace()).toBe('userA'); // 失敗時点で既にaccount namespace
    const pendingBefore = await AsyncStorage.getItem('cardhub.pendingGuestMigration.userA');
    const failedBatchId = JSON.parse(pendingBefore!).request.batchClientRequestId;

    // 次回起動・再ログイン相当の再試行。
    let capturedBatchId: string | undefined;
    let capturedBody: Record<string, unknown> | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      capturedBatchId = body.batchClientRequestId;
      capturedBody = body;
      // 実際のバックエンドはリクエストに含まれた全項目をserverStateへ含めて返すため、
      // モックもlotteryId=1・2の両方を含む応答にする（既定のsuccessBody()は1のみ）。
      return jsonResponse(
        200,
        successBody({}, [1, 2].map((lotteryId) => ({
          id: lotteryId,
          userId: 1,
          lotteryId,
          status: 'unknown',
          snapshotJson: null,
          snapshotUpdatedAt: null,
          savedAt: '2026-01-01T00:00:00.000Z',
          serverVersion: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
        })))
      );
    });

    await ensureNamespaceAndBootstrap();

    expect(capturedBatchId).toBe(failedBatchId); // 同じbatchClientRequestIdが再利用される（保存済みsnapshotをそのまま再送）
    const userLotteries = capturedBody?.userLotteries as { lotteryId: number }[];
    expect(userLotteries.map((l) => l.lotteryId).sort()).toEqual([1, 2]);
    expect(await AsyncStorage.getItem('cardhub.pendingGuestMigration.userA')).toBeNull(); // 成功後はpendingが消える
    expect(await AsyncStorage.getItem('cardhub.guestDiffBatchId.userA')).toBeNull();
    expect(useMyLotteriesStore.getState().getSaved(2)).toBeDefined(); // 今度こそ反映される

    // 移行済みになったので、もう一度呼んでもAPIは呼ばれない。
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    await ensureNamespaceAndBootstrap();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('アプリ強制終了後の再試行: pending snapshotだけが残った状態（メモリは初期化済み）から正しく再開できる', async () => {
    await completeInitialBootstrap();

    // pending snapshotを直接保存する（「保存はできたがsyncNamespaceWithAuthUser前にKillされた」を含め、
    // 強制終了後の起動直後を模す——メモリ上のnamespace/各ストアは初期状態に戻っている）。
    const pendingRequest = {
      batchClientRequestId: 'diff-batch-crash-1',
      userLotteries: [{ lotteryId: 2, status: 'unknown', savedAt: '2026-01-02T00:00:00.000Z', snapshot: record2, clientRequestId: 'c-1' }],
      favorites: [],
      followedProducts: [],
      legacyFollowedProductKeys: [],
      checklistSteps: [],
      notificationPreferences: undefined,
    };
    await AsyncStorage.setItem(
      'cardhub.pendingGuestMigration.userA',
      JSON.stringify({ request: pendingRequest, guestRevisionAtSnapshot: 1 })
    );
    // 強制終了直後を模してnamespaceをguestへ戻す（切替が完了していたか未完了だったかに関わらず、
    // 次回起動時はnamespaceストアがデフォルト初期化されるため）。
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useMyLotteriesStore.setState({ saved: [] }); // このテストではメモリ状態は無関係（pendingのみから再送する）

    let capturedBatchId: string | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBatchId = JSON.parse(init.body as string).batchClientRequestId;
      return jsonResponse(200, successBody());
    });

    await ensureNamespaceAndBootstrap();

    expect(capturedBatchId).toBe('diff-batch-crash-1');
    expect(getCurrentNamespace()).toBe('userA');
    expect(await AsyncStorage.getItem('cardhub.pendingGuestMigration.userA')).toBeNull();
  });

  it('pending保存直後・namespace切替が完了する前に強制終了しても、次回起動で切替と送信が完了する', async () => {
    await completeInitialBootstrap();

    // captureAndSwitchToPendingGuestMigrationの「pending保存」直後、「namespace切替」前に
    // 強制終了したケース: pendingは存在するが、namespaceはguestのまま（次回起動時の初期値）。
    const pendingRequest = {
      batchClientRequestId: 'diff-batch-crash-2',
      userLotteries: [],
      favorites: [{ lotteryId: 42, clientRequestId: 'c-2' }],
      followedProducts: [],
      legacyFollowedProductKeys: [],
      checklistSteps: [],
      notificationPreferences: undefined,
    };
    await AsyncStorage.setItem(
      'cardhub.pendingGuestMigration.userA',
      JSON.stringify({ request: pendingRequest, guestRevisionAtSnapshot: 1 })
    );
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false }); // 切替未完了のまま再起動

    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, successBody()));

    await ensureNamespaceAndBootstrap();

    expect(getCurrentNamespace()).toBe('userA'); // 中断していた切替が完了する
    expect(await AsyncStorage.getItem('cardhub.pendingGuestMigration.userA')).toBeNull(); // 送信も完了する
  });

  it('RevenueCatログイン処理が始まる時点で、namespaceは既にguestではない（移行成否に関わらず）', async () => {
    await completeInitialBootstrap();

    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useMyLotteriesStore.getState().saveLottery(record2);
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network')); // 送信は失敗させる

    await ensureNamespaceAndBootstrap();

    // authActions.tsではensureNamespaceAndBootstrap()の直後にensureRevenueCatLogin()を呼ぶ。
    // 送信が失敗していても、この時点でnamespaceは既にaccount側になっていなければならない
    // （RevenueCatのユーザー切替判定がguest namespace状態で始まってはいけない）。
    expect(getCurrentNamespace()).not.toBe(GUEST_NAMESPACE);
    expect(getCurrentNamespace()).toBe('userA');
  });
});

describe('bootstrapSync: pending snapshotのアカウント間分離', () => {
  const originalFetch = global.fetch;
  const record2: LotteryRecord = { ...record, id: 2 };

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    useMyLotteriesStore.setState({ saved: [{ record, savedAt: '2026-01-01T00:00:00.000Z' }] });
    useFavoritesStore.setState({ favoriteLotteryIds: [], followedProductKeys: [], followedProductIds: [] });
    useChecklistStore.setState({ groups: {} });
    useNotificationSettingsStore.setState({ ...defaultNotificationSettings, serverVersion: 0 });
    useSyncConflictsStore.getState().clear();
    for (const uid of ['userA', 'userB']) {
      await AsyncStorage.removeItem(`cardhub.bootstrapped.${uid}`);
      await AsyncStorage.removeItem(`cardhub.bootstrapBatchId.${uid}`);
      await AsyncStorage.removeItem(`cardhub.lastMigratedGuestRevision.${uid}`);
      await AsyncStorage.removeItem(`cardhub.guestDiffBatchId.${uid}`);
      await AsyncStorage.removeItem(`cardhub.pendingGuestMigration.${uid}`);
    }
    await AsyncStorage.removeItem('cardhub.guestRevision');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function bootstrapAs(publicUserId: string): Promise<void> {
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false, generation: 0 });
    useAuthStore.setState({
      status: 'signedIn',
      sessionAvailability: 'online',
      user: { publicUserId, displayName: null, email: null, accountStatus: 'active', scheduledDeletionAt: null, cachedAppleDisplayName: null },
      accessToken: 'at-valid',
      accessTokenExpiresAt: Date.now() + 10 * 60_000,
    });
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, successBody()));
    await ensureNamespaceAndBootstrap();
  }

  it('userA向けpendingが残っている間にuserBがログインしても、Bの移行にAのpendingが送信されない', async () => {
    await bootstrapAs('userA');
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useMyLotteriesStore.getState().saveLottery(record2); // userA向けの未移行guest変更
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));
    await ensureNamespaceAndBootstrap(); // 失敗 → userA向けpendingがAsyncStorageへ残る
    expect(await AsyncStorage.getItem('cardhub.pendingGuestMigration.userA')).not.toBeNull();

    // 別アカウントBへログイン（Aとは無関係の新規ログイン）。
    await bootstrapAs('userB');

    // Bの初回bootstrap送信にAのuserLotteries（lotteryId=2）が混入していないこと。
    const bFetch = global.fetch as ReturnType<typeof vi.fn>;
    const bBody = JSON.parse((bFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect((bBody.userLotteries as { lotteryId: number }[]).some((l) => l.lotteryId === 2)).toBe(false);

    // Aのpendingは手つかずのまま残っている。
    expect(await AsyncStorage.getItem('cardhub.pendingGuestMigration.userA')).not.toBeNull();
  });

  it('userAに戻るとA向けpendingが再試行される', async () => {
    await bootstrapAs('userA');
    useNamespaceStore.setState({ namespace: GUEST_NAMESPACE, isSwitching: false });
    useMyLotteriesStore.getState().saveLottery(record2);
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));
    await ensureNamespaceAndBootstrap();
    const pendingRaw = await AsyncStorage.getItem('cardhub.pendingGuestMigration.userA');
    const originalBatchId = JSON.parse(pendingRaw!).request.batchClientRequestId;

    // userBへ切替（Aは未解決のまま）。
    await bootstrapAs('userB');

    // userAへ戻る（再ログイン相当）。
    useAuthStore.setState({
      status: 'signedIn',
      sessionAvailability: 'online',
      user: { publicUserId: 'userA', displayName: null, email: null, accountStatus: 'active', scheduledDeletionAt: null, cachedAppleDisplayName: null },
      accessToken: 'at-valid',
      accessTokenExpiresAt: Date.now() + 10 * 60_000,
    });
    let capturedBatchId: string | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBatchId = JSON.parse(init.body as string).batchClientRequestId;
      return jsonResponse(200, successBody());
    });

    await ensureNamespaceAndBootstrap();

    expect(capturedBatchId).toBe(originalBatchId); // Aの元々のpending snapshotがそのまま再送される
    expect(getCurrentNamespace()).toBe('userA');
    expect(await AsyncStorage.getItem('cardhub.pendingGuestMigration.userA')).toBeNull();
  });
});
