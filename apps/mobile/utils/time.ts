const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** Asia/Tokyoは夏時間（DST）が無いため、常にUTC+9固定として扱う。 */
const JST_OFFSET_HOURS = 9;
/** UTC 0時（＝ある日付の日付のみ表現）から、日本時間で見た「翌日0時」に到達するまでの時間。 */
const HOURS_UNTIL_JST_NEXT_DAY_FROM_UTC_MIDNIGHT_MS = (24 - JST_OFFSET_HOURS) * 60 * 60 * 1000;

/**
 * 締切・当選発表日の「時刻付き（`_at`）」と「日付のみ（`_date`、例: "2026-07-26"）」の
 * 2フィールドから、判定・ソート・カーソル生成のすべてで共通して使う正規化済み終了時刻
 * （ISO文字列、UTC）を1つ算出する。
 *
 * `_at`があればそれをそのまま使う（タイムゾーン情報を含む前提）。
 * `_date`のみの場合、`new Date('YYYY-MM-DD')`へ直接渡すと**UTC 0時**（＝日本時間の午前9時）
 * として解釈されてしまい、「その日いっぱいは受付中」というユーザーの期待に反する
 * （日本時間午前9時の時点で受付終了扱いになってしまう）。これを避けるため、
 * 日付のみの場合は**日本時間の翌日0時**（＝その日の23:59:59.999 JSTまでを受付中とみなす、
 * 排他的な境界）をUTCへ変換した値を返す。
 *
 * 一覧表示・ステータス判定・並び替え・ページングカーソルは必ずこの関数を経由した値を使い、
 * `record.xxxAt ?? record.xxxDate`をそのまま`new Date()`へ渡す実装をしないこと
 * （サーバー側 `repositories/lotteryRepository.ts` の SQL も同じ境界値になるよう実装している）。
 */
export function normalizeDeadline(atValue: string | null | undefined, dateValue: string | null | undefined): string | null {
  if (atValue) return atValue;
  if (!dateValue) return null;

  const utcMidnightMs = new Date(`${dateValue}T00:00:00.000Z`).getTime();
  if (Number.isNaN(utcMidnightMs)) return null;

  const jstNextDayStartUtcMs = utcMidnightMs + HOURS_UNTIL_JST_NEXT_DAY_FROM_UTC_MIDNIGHT_MS;
  return new Date(jstNextDayStartUtcMs).toISOString();
}

/**
 * `isDateOnly`が真の場合、`targetIso`は`normalizeDeadline`が「日付のみ（時刻不明）」から
 * JST翌日0時として補完した値である（実際の締切時刻ではない）。締切当日（残り1日未満）に
 * なると時間・分単位の表示に切り替わってしまい、実在しない精度（例:「残り2時間30分」）を
 * 見せてしまうため、その場合は日数に関わらず「本日中」のような粗い表現に留める。
 */
export function formatRemaining(targetIso: string, nowIso: string, isDateOnly = false): string {
  const diffMs = new Date(targetIso).getTime() - new Date(nowIso).getTime();
  if (diffMs <= 0) return '期限切れ';

  const minutes = Math.floor(diffMs / 60000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;

  if (days >= 1) return `残り${days}日`;
  if (isDateOnly) return '本日中';
  if (hours >= 1) return `残り${hours}時間${mins}分`;
  return `残り${mins}分`;
}

export function isPast(targetIso: string, nowIso: string): boolean {
  return new Date(targetIso).getTime() <= new Date(nowIso).getTime();
}

export function formatMonthDayWeekday(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}

export function formatMonthDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDateTimeShort(iso: string): string {
  return `${formatMonthDayWeekday(iso)} ${formatTime(iso)}`;
}

export function formatRelativeMinutes(iso: string, nowIso: string): string {
  const diffMs = new Date(nowIso).getTime() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}
