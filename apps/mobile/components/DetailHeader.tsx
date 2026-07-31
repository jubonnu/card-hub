import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

import { BackIcon } from './icons';

interface DetailHeaderProps {
  title: string;
  right?: ReactNode;
  align?: 'center' | 'left';
}

export function DetailHeader({ title, right, align = 'center' }: DetailHeaderProps) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={styles.row}>
      <Pressable hitSlop={8} style={styles.iconButton} onPress={() => router.back()}>
        <BackIcon color={theme.colors.textPrimary} />
      </Pressable>
      <Text
        style={[
          styles.title,
          { color: theme.colors.textPrimary, textAlign: align === 'center' ? 'center' : 'left' },
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View style={styles.iconButton}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
});
