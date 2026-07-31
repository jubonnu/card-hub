import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

interface SecondaryButtonProps {
  label: string;
  onPress?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  size?: 'md' | 'lg';
}

export function SecondaryButton({ label, onPress, icon, disabled, size = 'lg' }: SecondaryButtonProps) {
  const theme = useTheme();
  const height = size === 'lg' ? 52 : 46;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          height,
          borderColor: theme.colors.green,
          opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
        },
      ]}
    >
      <View style={styles.content}>
        {icon}
        <Text style={[styles.label, { color: theme.colors.green, fontSize: size === 'lg' ? 15 : 14 }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  label: {
    fontWeight: '700',
  },
});
