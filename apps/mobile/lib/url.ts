import { Alert, Linking } from 'react-native';

export function isSafeExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/** http/https 以外のスキーム（例: javascript:, file:）は開かず、案内を表示する。 */
export function openExternalUrl(url: string): void {
  if (!isSafeExternalUrl(url)) {
    Alert.alert('リンクを開けません', 'このURLは安全に開ける形式ではありません');
    return;
  }
  Linking.openURL(url).catch(() => {
    Alert.alert('リンクを開けませんでした', 'もう一度お試しください');
  });
}
