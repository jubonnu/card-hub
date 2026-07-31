import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

function Bone({ width, height, style }: { width: number | `${number}%`; height: number; style?: object }) {
  const theme = useTheme();
  return (
    <View
      style={[
        { width, height, borderRadius: 5, backgroundColor: theme.colors.surfaceSubtle },
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  const theme = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.6));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.card,
        { borderColor: theme.colors.borderLight, opacity },
      ]}
    >
      <View style={styles.headerRow}>
        <Bone width={64} height={20} style={{ borderRadius: 7 }} />
        <Bone width={82} height={16} />
      </View>
      <View style={styles.body}>
        <Bone width={46} height={60} style={{ borderRadius: 6 }} />
        <View style={styles.lines}>
          <Bone width="60%" height={15} />
          <Bone width="40%" height={12} />
          <Bone width="50%" height={12} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 11,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  body: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  lines: {
    flex: 1,
    gap: 7,
  },
});
