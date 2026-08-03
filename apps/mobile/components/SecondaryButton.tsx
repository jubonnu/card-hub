import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

interface SecondaryButtonProps {
  label: string;
  onPress?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  /** 'sm'はカード内でステータスバッジと並べる等、コンパクトに見せたい場合用。 */
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CONFIG = {
  lg: { height: 52, fontSize: 15, borderWidth: 1.6, borderRadius: 12, paddingHorizontal: 16, gap: 7 },
  md: { height: 46, fontSize: 14, borderWidth: 1.6, borderRadius: 12, paddingHorizontal: 16, gap: 7 },
  sm: { height: 32, fontSize: 12, borderWidth: 1.3, borderRadius: 8, paddingHorizontal: 12, gap: 5 },
} as const;

export function SecondaryButton({ label, onPress, icon, disabled, size = 'lg' }: SecondaryButtonProps) {
  const theme = useTheme();
  const config = SIZE_CONFIG[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          height: config.height,
          borderWidth: config.borderWidth,
          borderRadius: config.borderRadius,
          paddingHorizontal: config.paddingHorizontal,
          borderColor: theme.colors.green,
          opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
        },
      ]}
    >
      <View style={[styles.content, { gap: config.gap }]}>
        {icon}
        <Text style={[styles.label, { color: theme.colors.green, fontSize: config.fontSize }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontWeight: '700',
  },
});
