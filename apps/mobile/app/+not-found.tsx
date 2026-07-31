import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

export default function NotFoundScreen() {
  const theme = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'ページが見つかりません' }} />
      <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>ページが見つかりません</Text>
        <Link href="/" style={styles.link}>
          <Text style={{ color: theme.colors.green, fontWeight: '700' }}>ホームに戻る</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  link: {
    paddingVertical: 12,
  },
});
