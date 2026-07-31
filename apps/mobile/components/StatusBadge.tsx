import { StyleSheet, Text, View } from 'react-native';

import type { LotteryStatus } from '@/theme/colors';
import { useTheme } from '@/theme/useTheme';

interface StatusBadgeProps {
  status: LotteryStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const theme = useTheme();
  const style = theme.colors.status[status];

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

const styles = StyleSheet.create({
  badge: {
    borderRadius: 7,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '700',
  },
});
