import { StyleSheet, Text, View } from 'react-native';

import { useAuthStore } from '@/stores/authStore';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';
import { useTheme } from '@/theme/useTheme';

/**
 * マイページ上部に置く、データ保護状態の案内バナー。
 *
 * 独立した「バックアップ」機能（手動エクスポート・復元等）は仕様が存在しないため実装しない
 * （サインイン済みユーザーのデータは`/me/*`への自動同期で既に保護されており、
 * ゲストユーザーの唯一のデータ保護手段はApple Sign-Inによる同期のため）。
 * このバナーは「バックアップ」という言葉を使わず、現在の保護状態をそのまま伝える。
 *
 * ゲスト時: 端末内にしかデータが無いことを警告トーン（warn配色）で伝える
 * （サインイン導線は画面上部の既存ボタンが担うため、このバナー自体には持たせない）。
 * サインイン時: 同期済みであることを伝える（最終同期日時は追跡する仕組みが無いため、
 * 保留中の同期操作件数から導出した簡易な状態のみを表示する）。
 */
export function DataSyncStatusBanner() {
  const theme = useTheme();
  const { status, user } = useAuthStore();
  const operations = useOfflineQueueStore((s) => s.operations);
  const isSignedIn = status === 'signedIn' && user != null;

  if (!isSignedIn) {
    return (
      <View style={styles.container}>
        <View style={[styles.banner, { backgroundColor: theme.colors.warnBg, borderColor: theme.colors.warnBorder }]}>
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: theme.colors.warnText }]}>
              データはこの端末にのみ保存されています
            </Text>
            <Text style={[styles.message, { color: theme.colors.warnTextSub }]}>
              アプリ削除や端末変更で失われる可能性があります
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const pendingCount = operations.filter((op) => op.status === 'pending').length;
  const statusLabel = pendingCount > 0 ? `同期中です（${pendingCount}件）` : '最新の状態です';

  return (
    <View style={styles.container}>
      <View style={[styles.banner, { backgroundColor: theme.colors.greenSoftBg, borderColor: theme.colors.greenBorder }]}>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>データはアカウントに同期されています</Text>
          <Text style={[styles.message, { color: theme.colors.textTertiary }]}>{statusLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  textWrap: {
    gap: 3,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  message: {
    fontSize: 12,
    lineHeight: 17,
  },
});
