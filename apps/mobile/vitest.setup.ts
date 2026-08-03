import { vi } from 'vitest';

/**
 * G3以降のテストが読み込むネイティブ専用モジュール（expo-secure-store等）は
 * Node環境のvitestでは動作しないため、全テストファイル共通でモック化する。
 * 各テストは`vi.mocked(...)`で個別の戻り値を設定できる（`resetMocks`はしない、
 * インメモリストレージの状態をテスト間で明示的に管理するため）。
 */

const asyncStorageMap = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStorageMap.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStorageMap.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      asyncStorageMap.delete(key);
    }),
  },
}));

const secureStoreMap = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secureStoreMap.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStoreMap.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStoreMap.delete(key);
  }),
}));

vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(() => `mock-uuid-${Math.random().toString(36).slice(2)}`),
  digestStringAsync: vi.fn(async (_algorithm: unknown, data: string) => `hashed-${data}`),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
}));

vi.mock('expo-apple-authentication', () => ({
  signInAsync: vi.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { BLACK: 0, WHITE: 1 },
}));

/**
 * lib/notifications.tsが呼ぶexpo-notificationsもネイティブ専用モジュールのため、
 * 他の同種モジュールと同じくモック化する。各テストは
 * `vi.mocked(Notifications.scheduleNotificationAsync)`等で呼び出し内容を検証できる。
 */
vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: vi.fn(async () => 'mock-notification-id'),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

/**
 * G4: react-native-purchasesはネイティブモジュールのため、vitest（Node環境）では動作しない。
 * 各テストは`vi.mocked(Purchases.xxx).mockResolvedValue(...)`等で個別の戻り値を設定できる。
 */
vi.mock('react-native-purchases', () => {
  const mockPurchases = {
    configure: vi.fn(),
    logIn: vi.fn(),
    logOut: vi.fn(),
    getCustomerInfo: vi.fn(),
    getOfferings: vi.fn(),
    purchasePackage: vi.fn(),
    restorePurchases: vi.fn(),
    getAppUserID: vi.fn(),
    isConfigured: vi.fn(async () => false),
    addCustomerInfoUpdateListener: vi.fn(),
    removeCustomerInfoUpdateListener: vi.fn(),
    setLogLevel: vi.fn(),
    showManageSubscriptions: vi.fn(),
  };
  return {
    default: mockPurchases,
    LOG_LEVEL: { DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR', VERBOSE: 'VERBOSE' },
    PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: '1' },
  };
});
