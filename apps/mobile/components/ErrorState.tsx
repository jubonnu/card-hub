import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

import { OfflineIcon, RefreshIcon, WarningIcon } from './icons';
import { PrimaryButton } from './PrimaryButton';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = '情報を取得できませんでした',
  description = '通信状況を確認して、もう一度読み込んでください',
  onRetry,
}: ErrorStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: theme.colors.dangerBg }]}>
        <OfflineIcon color={theme.colors.danger} />
      </View>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.description, { color: theme.colors.textSecondary }]}>{description}</Text>
      <View style={styles.action}>
        <PrimaryButton label="再読み込み" onPress={onRetry} icon={<RefreshIcon />} />
      </View>
    </View>
  );
}

export function OfflineBanner({ lastSyncedLabel }: { lastSyncedLabel: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.banner,
        { borderColor: theme.colors.warnBorder, backgroundColor: theme.colors.warnBg },
      ]}
    >
      <View style={styles.bannerIcon}>
        <WarningIcon color={theme.colors.warnText} />
      </View>
      <View style={styles.bannerText}>
        <Text style={[styles.bannerTitle, { color: theme.colors.warnText }]}>オフラインです</Text>
        <Text style={[styles.bannerSub, { color: theme.colors.warnTextSub }]}>
          前回取得した情報（{lastSyncedLabel} 時点）を表示しています
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 13,
    paddingHorizontal: 40,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  action: {
    marginTop: 4,
    minWidth: 200,
  },
  banner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  bannerIcon: {
    marginTop: 1,
  },
  bannerText: {
    gap: 3,
    flex: 1,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  bannerSub: {
    fontSize: 11,
    lineHeight: 16,
  },
});
