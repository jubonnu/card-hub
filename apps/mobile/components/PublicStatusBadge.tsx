import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';
import type { PublicTimelineStatus } from '@/utils/publicLotteryDisplay';

interface PublicStatusBadgeProps {
  status: PublicTimelineStatus;
  size?: 'sm' | 'md';
}

/**
 * 実API連携画面（全国の抽選一覧・抽選詳細）専用のステータスバッジ。
 * Phase-Aモックの StatusBadge（応募予定/当選など個人の応募結果を含む）とは
 * 意味的に別物のため、既存 StatusBadge には手を加えず新規コンポーネントとして分離する。
 */
export function PublicStatusBadge({ status, size = 'sm' }: PublicStatusBadgeProps) {
  const theme = useTheme();

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
        {
          backgroundColor: style.bg,
          paddingVertical: size === 'md' ? 5 : 4,
          paddingHorizontal: size === 'md' ? 12 : 10,
        },
      ]}
    >
      <Text style={[styles.text, { color: style.fg, fontSize: size === 'md' ? 12 : 11 }]}>{style.label}</Text>
    </View>
  );
}

/** verificationStatus が未承認（extracted等）のレコードに付ける小さな注意チップ。 */
export function VerificationCautionBadge() {
  const theme = useTheme();
  const style = theme.colors.status.needsCheck;

  return (
    <View style={[styles.badge, styles.captionBadge, { backgroundColor: style.bg }]}>
      <Text style={[styles.text, styles.captionText, { color: style.fg }]}>要確認</Text>
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
  captionBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  captionText: {
    fontSize: 10,
  },
});
