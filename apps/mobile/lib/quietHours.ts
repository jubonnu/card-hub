/**
 * おやすみモード（通知を控える時間帯）の判定・時刻調整。
 *
 * 日時の計算は常に端末のローカルタイムゾーンを基準にする。固定のミリ秒加算
 * （例: +24時間）ではなく、`Date`の年月日フィールドを操作して「前日」「翌日」を
 * 求める（`setDate`は対象地域のDST（サマータイム）遷移日でも正しい実時刻を計算する。
 * 固定のミリ秒加算だとDST切り替え日に1時間ずれる）。
 */

export interface QuietHoursSettings {
  enabled: boolean;
  start: string | null; // "HH:mm"
  end: string | null; // "HH:mm"
}

export type QuietHoursAdjustment = { skip: false; triggerMs: number } | { skip: true; reason: string };

interface HourMinute {
  hours: number;
  minutes: number;
}

function parseHHMM(value: string): HourMinute | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  return { hours: Number(m[1]), minutes: Number(m[2]) };
}

/** `baseMs`と同じローカルタイムゾーンで、`dayOffset`日ずらした日の`hh:mm`のエポックミリ秒を返す。 */
function timeOnDate(baseMs: number, dayOffset: number, hm: HourMinute): number {
  const d = new Date(baseMs);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hm.hours, hm.minutes, 0, 0);
  return d.getTime();
}

interface QuietWindow {
  startMs: number;
  endMs: number;
}

/**
 * `triggerMs`を含むおやすみ時間帯[start, end)の具体的な区間（絶対ミリ秒）を求める。
 * 範囲外、またはstart===end（範囲なし扱い）ならnull。
 * start > end（例 22:00〜07:00）は日をまたぐ区間として、前日開始/翌日終了の
 * どちらの区間に該当するかを判定する。
 */
function findQuietWindowContaining(triggerMs: number, start: HourMinute, end: HourMinute): QuietWindow | null {
  const todayStart = timeOnDate(triggerMs, 0, start);
  const todayEnd = timeOnDate(triggerMs, 0, end);

  if (todayStart === todayEnd) return null;

  if (todayStart < todayEnd) {
    return triggerMs >= todayStart && triggerMs < todayEnd ? { startMs: todayStart, endMs: todayEnd } : null;
  }

  // 日またぎ（start > end）: 「前日start 〜 当日end」と「当日start 〜 翌日end」の2区間を見る。
  const prevWindow = { startMs: timeOnDate(triggerMs, -1, start), endMs: todayEnd };
  if (triggerMs >= prevWindow.startMs && triggerMs < prevWindow.endMs) return prevWindow;

  const nextWindow = { startMs: todayStart, endMs: timeOnDate(triggerMs, 1, end) };
  if (triggerMs >= nextWindow.startMs && triggerMs < nextWindow.endMs) return nextWindow;

  return null;
}

const ONE_MINUTE_MS = 60_000;

/**
 * 通知予定時刻(triggerMs)がおやすみ時間帯に入っている場合、実際に通知してよい時刻へ調整する。
 *
 * 1. まずおやすみ終了時刻まで繰り下げる
 * 2. それが採用できない（now以前、またはdeadline以降）場合、
 *    おやすみ開始時刻の1分前まで繰り上げる
 * 3. どちらも採用できなければ`skip: true`を返す（呼び出し側はスケジュールせずログに残す）
 *
 * 調整後の時刻は、どちらの候補も必ず「nowより後、かつdeadlineより前」の場合だけ採用する
 * （同時刻は不採用。境界は常に厳密不等号で判定する）。
 */
export function adjustTriggerForQuietHours(
  triggerMs: number,
  deadlineMs: number,
  nowMs: number,
  quietHours: QuietHoursSettings
): QuietHoursAdjustment {
  if (!quietHours.enabled || !quietHours.start || !quietHours.end) {
    return { skip: false, triggerMs };
  }

  const start = parseHHMM(quietHours.start);
  const end = parseHHMM(quietHours.end);
  if (!start || !end) return { skip: false, triggerMs };

  const window = findQuietWindowContaining(triggerMs, start, end);
  if (!window) return { skip: false, triggerMs };

  const delayed = window.endMs;
  if (delayed > nowMs && delayed < deadlineMs) {
    return { skip: false, triggerMs: delayed };
  }

  const advanced = window.startMs - ONE_MINUTE_MS;
  if (advanced > nowMs && advanced < deadlineMs) {
    return { skip: false, triggerMs: advanced };
  }

  return { skip: true, reason: 'quiet_hours_no_available_slot' };
}

/** `H:m`のような非ゼロ埋め入力も含め、常に`HH:mm`形式へ正規化する。不正な値はnull。 */
export function normalizeHHMM(value: string): string | null {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
