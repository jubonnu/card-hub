import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PersonalLotteryStatus } from '@/theme/colors';
import { useTheme } from '@/theme/useTheme';

interface PersonalStatusBadgeProps {
  status: PersonalLotteryStatus;
  size?: 'sm' | 'md';
  onPress?: () => void;
}

/**
 * 個人ステータス（応募予定/応募済み/当選/落選/購入済み/見送り、Mobile-G6）用のバッジ。
 * `PublicStatusBadge`（公開抽選タイムラインのステータス）とは意味的に別物。
 * `onPress`を渡すとタップ可能になり、ステータス変更操作の起点として使う。
 */
export function PersonalStatusBadge({ status, size = 'sm', onPress }: PersonalStatusBadgeProps) {
  const theme = useTheme();
  const style = theme.colors.personalStatus[status];

  const badge = (
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

  if (!onPress) return badge;
  return <Pressable onPress={onPress}>{badge}</Pressable>;
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
