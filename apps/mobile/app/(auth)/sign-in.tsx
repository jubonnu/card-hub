import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/ScreenContainer';
import { SignInWithAppleButton } from '@/components/auth/SignInWithAppleButton';
import { useTheme } from '@/theme/useTheme';

/**
 * 未ログイン時の入口画面。ログインは必須導線ではなく、未ログインでも抽選一覧・詳細等の
 * 公開範囲は引き続き利用できる（`_layout.tsx`はこの画面へ強制リダイレクトしない）。
 */
export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <ScreenContainer padded>
      <View style={styles.content}>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>サインイン</Text>
          <Text style={[styles.description, { color: theme.colors.textTertiary }]}>
            サインインすると、自分の抽選・お気に入り・フォロー中商品を端末をまたいで同期できます
          </Text>
        </View>
        <SignInWithAppleButton onSuccess={() => router.back()} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 32,
  },
  heading: {
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
});
