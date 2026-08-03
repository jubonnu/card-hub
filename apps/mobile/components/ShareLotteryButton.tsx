import { useRef } from 'react';
import { Alert, Pressable, Share, StyleSheet } from 'react-native';

import { useTheme } from '@/theme/useTheme';

import { ShareIcon } from './icons';

interface ShareLotteryButtonProps {
  /** `utils/publicLotteryDisplay.ts`の`buildLotteryShareText`で組み立てた共有テキスト。 */
  shareText: string;
  /** データ未確定（読み込み中・エラー）時はtrue。見た目・操作の両方を無効化する。 */
  disabled?: boolean;
}

/**
 * 抽選詳細画面右上の共有ボタン。実データ画面・モックデータ画面の両方から
 * 同じコンポーネントを使うことで、「同じ共有アイコンなのに片方だけ押せる」状態を防ぐ
 * （両画面の差はここではなく、それぞれが渡す`shareText`の組み立て方の違いに閉じ込める）。
 */
export function ShareLotteryButton({ shareText, disabled = false }: ShareLotteryButtonProps) {
  const theme = useTheme();
  const sharingRef = useRef(false);

  async function handlePress() {
    if (disabled || sharingRef.current) return;
    sharingRef.current = true;
    try {
      // iOSではユーザーがキャンセルしても例外にはならず、dismissedActionで正常resolveされる。
      await Share.share({ message: shareText });
    } catch {
      Alert.alert('共有に失敗しました', 'もう一度お試しください');
    } finally {
      sharingRef.current = false;
    }
  }

  return (
    <Pressable
      hitSlop={8}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="抽選情報を共有"
      style={[styles.button, { opacity: disabled ? 0.4 : 1 }]}
    >
      <ShareIcon color={theme.colors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
