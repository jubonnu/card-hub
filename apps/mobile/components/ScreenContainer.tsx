import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/useTheme';

interface ScreenContainerProps {
  children: ReactNode;
  edges?: readonly Edge[];
  style?: ViewStyle;
  padded?: boolean;
}

export function ScreenContainer({ children, edges = ['top'], style, padded = false }: ScreenContainerProps) {
  const theme = useTheme();

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: theme.colors.surface }, style]}>
      <View style={[styles.flex, padded && { paddingHorizontal: theme.spacing.xl }]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
