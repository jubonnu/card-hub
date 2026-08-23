import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';
import type { PublicTimelineStatus } from '@/utils/publicLotteryDisplay';

type BadgeSize = 'sm' | 'md';

const BADGE_DIMENSIONS: Record<BadgeSize, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { paddingVertical: 4, paddingHorizontal: 10, fontSize: 11 },
  md: { paddingVertical: 5, paddingHorizontal: 12, fontSize: 12 },
};

interface PublicStatusBadgeProps {
  status: PublicTimelineStatus;
  size?: BadgeSize;
}

/**
 * 実API連携画面（全国の抽選一覧・抽選詳細）専用のステータスバッジ。
 * Phase-Aモックの StatusBadge（応募予定/当選など個人の応募結果を含む）とは
 * 意味的に別物のため、既存 StatusBadge には手を加えず新規コンポーネントとして分離する。
 */
export function PublicStatusBadge({ status, size = 'sm' }: PublicStatusBadgeProps) {
  const theme = useTheme();
  const dim = BADGE_DIMENSIONS[size];

  const style =
    status === 'accepting'
      ? { ...theme.colors.status.accepting, label: '受付中' }
      : status === 'resultPending'
        ? { ...theme.colors.status.resultPending, label: '結果待ち' }
        : status === 'ended'
          ? { ...theme.colors.status.ended, label: '受付終了' }
          : { fg: theme.colors.textSecondary, bg: theme.colors.chipTrack, label: '詳細未定' };

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: style.bg, paddingVertical: dim.paddingVertical, paddingHorizontal: dim.paddingHorizontal },
      ]}
    >
      <Text style={[styles.text, { color: style.fg, fontSize: dim.fontSize }]}>{style.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 7,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '700',
  },
});
