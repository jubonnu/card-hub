import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSyncConflictsStore, type SyncConflictKind } from '@/lib/syncConflicts';
import { useTheme } from '@/theme/useTheme';

const TITLE_BY_KIND: Record<SyncConflictKind, string> = {
  bootstrapSummary: '一部のデータを移行できませんでした',
  lotteryVersionConflict: '別の端末で更新されました',
  checklistVersionConflict: '別の端末で更新されました',
  notificationPreferencesVersionConflict: '別の端末で通知設定が変更されています',
  idempotencyConflict: '操作を反映できませんでした',
  guestMigrationFailed: '一部データを同期できませんでした',
};

/**
 * 409競合・bootstrap要約の通知バナー（16・24-10章）。`lib/syncConflicts.ts`の
 * `useSyncConflictsStore`を購読し、通知が無ければ何もレンダリングしない。
 */
export function SyncConflictBanner() {
  const theme = useTheme();
  const { conflicts, dismiss } = useSyncConflictsStore();

  if (conflicts.length === 0) return null;

  return (
    <View style={styles.container}>
      {conflicts.map((conflict) => (
        <View
          key={conflict.id}
          style={[styles.banner, { backgroundColor: theme.colors.warnBg, borderColor: theme.colors.warnBorder }]}
        >
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: theme.colors.warnText }]}>{TITLE_BY_KIND[conflict.kind]}</Text>
            <Text style={[styles.message, { color: theme.colors.warnTextSub }]}>{conflict.message}</Text>
          </View>
          <Pressable hitSlop={8} onPress={() => dismiss(conflict.id)} style={styles.dismissButton}>
            <Text style={[styles.dismissLabel, { color: theme.colors.warnTextSub }]}>閉じる</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    gap: 8,
  },
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  textWrap: {
    flex: 1,
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
  dismissButton: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  dismissLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
