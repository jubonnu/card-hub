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
 * lib/calendar.tsが`Platform`をimportしているが、実体の'react-native'（Flow構文を含む）は
 * vitest（esbuild/rolldown経由）ではパースできない。他のネイティブ専用モジュールと同じ理由で
 * `Platform`のみモック化する（`OS`は既定で'ios'。個別テストで`vi.mocked`で上書き可能）。
 */
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios },
}));

/**
 * lib/calendar.tsが呼ぶexpo-calendarもネイティブ専用モジュールのため、他と同じくモック化する。
 * 各テストは`vi.mocked(Calendar.createEventAsync)`等で呼び出し内容を検証できる。
 */
vi.mock('expo-calendar', () => ({
  requestCalendarPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  getCalendarsAsync: vi.fn(async () => []),
  getDefaultCalendarAsync: vi.fn(async () => ({ source: { id: 'mock-source' } })),
  createCalendarAsync: vi.fn(async () => 'mock-calendar-id'),
  createEventAsync: vi.fn(async () => 'mock-event-id'),
  EntityTypes: { EVENT: 'event' },
  CalendarAccessLevel: { OWNER: 'owner' },
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

/**
 * PostHog/Sentryは`react-native`本体（Flow構文を含む）を内部でimportするため、他のネイティブ
 * 専用モジュールと同じ理由（Node環境のvitestでは解析できない）でモック化する。
 */
vi.mock('posthog-react-native', () => {
  const mockClient = {
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  };
  return { default: vi.fn(() => mockClient) };
});

vi.mock('@sentry/react-native', () => ({
  init: vi.fn(),
}));
