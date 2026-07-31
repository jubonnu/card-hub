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
    user: { publicUserId, displayName: null, email: null, accountStatus: 'active', scheduledDeletionAt: null },
    accessToken: 'at-valid',
    accessTokenExpiresAt: Date.now() + 10 * 60_000,
  });
}

function successBody(overrides: Partial<Record<string, unknown>> = {}) {
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
      userLotteries: [
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
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
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
