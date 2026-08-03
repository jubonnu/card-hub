import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from 'expo-apple-authentication';

import { AppleSignInCancelledError, signInWithApple } from '@/lib/authActions';
import { useTheme } from '@/theme/useTheme';

interface SignInWithAppleButtonProps {
  onSuccess?: () => void;
}

/** Sign in with Appleボタン。多重タップ防止とログイン処理中表示を担う（4章要件）。 */
export function SignInWithAppleButton({ onSuccess }: SignInWithAppleButtonProps) {
  const theme = useTheme();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handlePress = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      await signInWithApple();
      onSuccess?.();
    } catch (e) {
      if (e instanceof AppleSignInCancelledError) return;
      console.error('[SignInWithApple] failed', e);
      Alert.alert('サインインできませんでした', 'もう一度お試しください');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppleAuthenticationButton
        buttonType={AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={theme.isDark ? AppleAuthenticationButtonStyle.WHITE : AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={12}
        style={styles.button}
        onPress={handlePress}
      />
      {isSigningIn && (
        <View style={styles.overlay} pointerEvents="auto">
          <ActivityIndicator color={theme.isDark ? '#fff' : '#000'} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: 52 },
  button: { width: '100%', height: 52 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
});
