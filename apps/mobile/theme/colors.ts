export type LotteryStatus =
  | 'accepting' // 受付中
  | 'planned' // 応募予定
  | 'resultPending' // 結果待ち
  | 'won' // 当選
  | 'purchasePending' // 購入待ち
  | 'ended' // 終了
  | 'lost' // 終了・落選
  | 'expired' // 期限切れ
  | 'needsCheck'; // 要確認

export type CalendarEventType = 'deadline' | 'announcement' | 'purchase';

/**
 * 個人ステータス（Mobile-G6）。上の`LotteryStatus`（公開抽選タイムラインのステータス）とは
 * 別物——こちらはユーザーが「自分の抽選」に対して記録する応募・当選結果。
 */
export type PersonalLotteryStatus = 'unknown' | 'planned' | 'applied' | 'won' | 'lost' | 'purchased' | 'skipped';

export interface ColorScheme {
  bg: string;
  surface: string;
  surfaceSubtle: string;
  chipTrack: string;
  border: string;
  borderLight: string;
  borderLighter: string;
  thumbBg: string;
  thumbBorder: string;
  thumbInner: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  textFaint: string;
  textLabel: string;
  green: string;
  greenDark: string;
  greenBg: string;
  greenBorder: string;
  greenSoftBg: string;
  darkCardBg: string;
  darkCardText: string;
  darkCardAccent: string;
  warnBorder: string;
  warnBg: string;
  warnText: string;
  warnTextSub: string;
  danger: string;
  dangerBg: string;
  status: Record<LotteryStatus, { fg: string; bg: string; label: string }>;
  personalStatus: Record<PersonalLotteryStatus, { fg: string; bg: string; label: string }>;
  event: Record<CalendarEventType, { color: string; label: string }>;
}

const statusLight: ColorScheme['status'] = {
  accepting: { fg: '#0A8F4D', bg: '#E7F5EE', label: '受付中' },
  planned: { fg: '#C96A05', bg: '#FDF1E3', label: '応募予定' },
  resultPending: { fg: '#6D3BD1', bg: '#F1EAFC', label: '結果待ち' },
  won: { fg: '#FFFFFF', bg: '#07733E', label: '当選' },
  purchasePending: { fg: '#2563C9', bg: '#E8F0FC', label: '購入待ち' },
  ended: { fg: '#4B5158', bg: '#F0F1F3', label: '終了' },
  lost: { fg: '#4B5158', bg: '#F0F1F3', label: '終了・落選' },
  expired: { fg: '#C62A20', bg: '#FDECEA', label: '期限切れ' },
  needsCheck: { fg: '#A66A00', bg: '#FBF3DF', label: '要確認' },
};

const personalStatusLight: ColorScheme['personalStatus'] = {
  unknown: { fg: '#6B7280', bg: '#F0F1F3', label: '未設定' },
  planned: { fg: '#C96A05', bg: '#FDF1E3', label: '応募予定' },
  applied: { fg: '#2563C9', bg: '#E8F0FC', label: '応募済み' },
  won: { fg: '#FFFFFF', bg: '#07733E', label: '当選' },
  lost: { fg: '#4B5158', bg: '#F0F1F3', label: '落選' },
  purchased: { fg: '#FFFFFF', bg: '#0A8F4D', label: '購入済み' },
  skipped: { fg: '#6B7280', bg: '#F0F1F3', label: '見送り' },
};

const personalStatusDark: ColorScheme['personalStatus'] = {
  unknown: { fg: '#8B9299', bg: '#22262B', label: '未設定' },
  planned: { fg: '#E0A24A', bg: '#2E2210', label: '応募予定' },
  applied: { fg: '#6C9FEE', bg: '#16233A', label: '応募済み' },
  won: { fg: '#FFFFFF', bg: '#1F8F5C', label: '当選' },
  lost: { fg: '#A7B1BB', bg: '#22262B', label: '落選' },
  purchased: { fg: '#FFFFFF', bg: '#2FBE73', label: '購入済み' },
  skipped: { fg: '#A7B1BB', bg: '#22262B', label: '見送り' },
};

const eventLight: ColorScheme['event'] = {
  deadline: { color: '#E8830C', label: '応募締切' },
  announcement: { color: '#6D3BD1', label: '当選発表' },
  purchase: { color: '#2563C9', label: '購入期限' },
};

export const lightColors: ColorScheme = {
  bg: '#F1F2F4',
  surface: '#FFFFFF',
  surfaceSubtle: '#F4F5F7',
  chipTrack: '#F2F3F5',
  border: '#E6E8EB',
  borderLight: '#EEEFF1',
  borderLighter: '#F0F1F3',
  thumbBg: '#EDEEF0',
  thumbBorder: '#E2E4E8',
  thumbInner: '#D5D8DE',
  textPrimary: '#111418',
  textSecondary: '#4B5158',
  textTertiary: '#6B7280',
  textMuted: '#70777F',
  textFaint: '#9AA1AA',
  textLabel: '#3A3F46',
  green: '#0A8F4D',
  greenDark: '#07733E',
  greenBg: '#E7F5EE',
  greenBorder: '#B7E0CB',
  greenSoftBg: '#F4FBF7',
  darkCardBg: '#141A20',
  darkCardText: '#A7B1BB',
  darkCardAccent: '#7DE0A8',
  warnBorder: '#F3D9C4',
  warnBg: '#FDF7F0',
  warnText: '#8A5800',
  warnTextSub: '#6B5433',
  danger: '#C62A20',
  dangerBg: '#FDECEA',
  status: statusLight,
  personalStatus: personalStatusLight,
  event: eventLight,
};

// Dark-mode foundation. The source design only specifies one dark surface
// (the My Page stats card), so the rest is derived by inverting the light
// scheme while keeping the same green accent family and status hues.
export const darkColors: ColorScheme = {
  bg: '#0B0D10',
  surface: '#16191D',
  surfaceSubtle: '#1D2126',
  chipTrack: '#22262B',
  border: '#2A2F35',
  borderLight: '#23272C',
  borderLighter: '#202429',
  thumbBg: '#22262B',
  thumbBorder: '#2A2F35',
  thumbInner: '#3A3F46',
  textPrimary: '#F2F3F5',
  textSecondary: '#C3C9CF',
  textTertiary: '#A7B1BB',
  textMuted: '#8B9299',
  textFaint: '#6B7280',
  textLabel: '#C3C9CF',
  green: '#2FBE73',
  greenDark: '#34C77D',
  greenBg: '#123423',
  greenBorder: '#1E5A3B',
  greenSoftBg: '#10241A',
  darkCardBg: '#141A20',
  darkCardText: '#A7B1BB',
  darkCardAccent: '#7DE0A8',
  warnBorder: '#4A3A24',
  warnBg: '#241C10',
  warnText: '#E8B25A',
  warnTextSub: '#C6A272',
  danger: '#E5675E',
  dangerBg: '#2E1613',
  status: {
    accepting: { fg: '#2FBE73', bg: '#123423', label: '受付中' },
    planned: { fg: '#E0A24A', bg: '#2E2210', label: '応募予定' },
    resultPending: { fg: '#A784EA', bg: '#251C3A', label: '結果待ち' },
    won: { fg: '#FFFFFF', bg: '#1F8F5C', label: '当選' },
    purchasePending: { fg: '#6C9FEE', bg: '#16233A', label: '購入待ち' },
    ended: { fg: '#A7B1BB', bg: '#22262B', label: '終了' },
    lost: { fg: '#A7B1BB', bg: '#22262B', label: '終了・落選' },
    expired: { fg: '#E5675E', bg: '#2E1613', label: '期限切れ' },
    needsCheck: { fg: '#E0A24A', bg: '#2E2210', label: '要確認' },
  },
  personalStatus: personalStatusDark,
  event: {
    deadline: { color: '#E0A24A', label: '応募締切' },
    announcement: { color: '#A784EA', label: '当選発表' },
    purchase: { color: '#6C9FEE', label: '購入期限' },
  },
};
