import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';
import { formatRemaining, isPast } from '@/utils/time';

interface DeadlineBadgeProps {
  targetIso: string;
  nowIso: string;
}

export function DeadlineBadge({ targetIso, nowIso }: DeadlineBadgeProps) {
  const theme = useTheme();
  const urgent =
    !isPast(targetIso, nowIso) && new Date(targetIso).getTime() - new Date(nowIso).getTime() < 1000 * 60 * 60 * 6;
  const label = formatRemaining(targetIso, nowIso);
  const color = isPast(targetIso, nowIso) ? theme.colors.danger : urgent ? theme.colors.danger : theme.colors.textSecondary;

  return (
    <View style={styles.row}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
