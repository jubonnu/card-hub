import type { CalendarEventType, LotteryStatus } from '@/theme/colors';

export type CardGame = 'ポケモンカード' | 'ワンピースカード' | 'その他';

export type ApplicationMethod = 'オンライン抽選' | '店頭応募' | 'はがき応募' | 'アプリ応募';

export type Region = '全国' | '北海道・東北' | '関東' | '中部' | '関西' | '中国・四国' | '九州・沖縄';

export interface Lottery {
  id: string;
  productKey: string;
  productName: string;
  productCategory: string;
  game: CardGame;
  shopName: string;
  region: Region;
  status: LotteryStatus;
  applicationDeadline: string;
  announcementDate: string;
  purchaseDeadline: string;
  applyUrl: string;
  method: ApplicationMethod;
  conditions: string[];
  isFavorite: boolean;
  isNew: boolean;
  isSaved: boolean;
  discoveredAt: string;
  nextLotteryLabel?: string;
}

export interface ProductSummary {
  key: string;
  name: string;
  category: string;
  game: CardGame;
  acceptingCount: number;
  resultPendingCount: number;
  endedCount: number;
  isFollowing: boolean;
}

export interface ChecklistStep {
  id: string;
  label: string;
  description?: string;
  done: boolean;
  completedAt?: string;
  completedNote?: string;
  sortOrder?: number;
  /** サーバーの`serverVersion`（未同期・ゲスト時は未設定＝0扱い）。G3-4のCAS用。 */
  serverVersion?: number;
}

export interface ChecklistGroup {
  lotteryId: string;
  steps: ChecklistStep[];
}

export interface CalendarEvent {
  id: string;
  date: string;
  time: string;
  type: CalendarEventType;
  lotteryId: string;
  productName: string;
  shopName: string;
}

export interface NotificationToggleSettings {
  deadlineReminder: boolean;
  announcementReminder: boolean;
  purchaseReminder: boolean;
  newLotteryAlert: boolean;
  favoriteUpdateAlert: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  deadlineReminderHoursBefore: number;
  announcementReminderHoursBefore: number;
  purchaseReminderHoursBefore: number;
}
