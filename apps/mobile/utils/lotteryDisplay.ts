import type { Lottery } from '@/types/models';

import { formatDateTimeShort, formatMonthDay, formatRemaining } from './time';

export interface HeaderMeta {
  label: string;
  tone: 'danger' | 'muted' | 'blue' | 'default';
}

export function getHeaderMeta(lottery: Lottery, nowIso: string): HeaderMeta {
  switch (lottery.status) {
    case 'accepting':
    case 'planned':
      return { label: formatRemaining(lottery.applicationDeadline, nowIso), tone: 'default' };
    case 'resultPending':
      return { label: `発表まで${formatRemaining(lottery.announcementDate, nowIso)}`, tone: 'muted' };
    case 'won':
      return { label: `購入期限まで${formatRemaining(lottery.purchaseDeadline, nowIso)}`, tone: 'blue' };
    case 'ended':
      return { label: `${formatMonthDay(lottery.applicationDeadline)} 締切済`, tone: 'muted' };
    case 'lost':
      return { label: `${formatMonthDay(lottery.announcementDate)} 発表`, tone: 'muted' };
    case 'expired':
      return { label: '期限切れ', tone: 'danger' };
    default:
      return { label: '', tone: 'muted' };
  }
}

export function getBodyMetaLine(lottery: Lottery): string {
  switch (lottery.status) {
    case 'accepting':
    case 'planned':
      return `応募締切　${formatDateTimeShort(lottery.applicationDeadline)}`;
    case 'resultPending':
      return `当選発表　${formatDateTimeShort(lottery.announcementDate)}`;
    case 'won':
      return `購入期限　${formatDateTimeShort(lottery.purchaseDeadline)}`;
    case 'ended':
      return `当選発表　${formatDateTimeShort(lottery.announcementDate)}`;
    case 'lost':
      return lottery.nextLotteryLabel ?? `当選発表　${formatDateTimeShort(lottery.announcementDate)}`;
    default:
      return '';
  }
}

export interface CardCta {
  label: string;
  variant: 'solid' | 'outline';
}

export function getPrimaryCta(lottery: Lottery): CardCta | null {
  switch (lottery.status) {
    case 'accepting':
    case 'planned':
      return { label: '応募ページへ', variant: 'solid' };
    case 'resultPending':
      return { label: '結果を確認する', variant: 'outline' };
    case 'won':
      return { label: '購入ページへ', variant: 'solid' };
    default:
      return null;
  }
}
