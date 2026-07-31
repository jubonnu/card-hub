import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

interface PrimaryButtonProps {
  label: string;
  onPress?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  size?: 'md' | 'lg';
}

export function PrimaryButton({ label, onPress, icon, disabled, loading, size = 'lg' }: PrimaryButtonProps) {
  const theme = useTheme();
  const height = size === 'lg' ? 52 : 46;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          height,
          backgroundColor: theme.colors.green,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.label, { fontSize: size === 'lg' ? 15 : 14 }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  label: {
    color: '#fff',
    fontWeight: '700',
  },
});
