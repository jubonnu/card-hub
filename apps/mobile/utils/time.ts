const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function formatRemaining(targetIso: string, nowIso: string): string {
  const diffMs = new Date(targetIso).getTime() - new Date(nowIso).getTime();
  if (diffMs <= 0) return '期限切れ';

  const minutes = Math.floor(diffMs / 60000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;

  if (days >= 1) return `残り${days}日`;
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
