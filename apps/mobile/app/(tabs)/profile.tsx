import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  BackupIcon,
  ChevronRightIcon,
  ClockIcon,
  GearIcon,
  HeartIcon,
  PersonIcon,
} from '@/components/icons';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { SyncConflictBanner } from '@/components/auth/SyncConflictBanner';
import { monthlyStats } from '@/data/mockData';
import { deleteAccount, signOut, signOutAllDevices } from '@/lib/authActions';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme/useTheme';

/**
 * 今月の実績・データのバックアップは、集計・バックアップの実装が無いため一旦モック表示に
 * 戻している（本人の要望により復活。追って実装予定）。それ以外の応答しない導線（設定／
 * ヘルプ・お問い合わせ等）は非表示のまま。
 *
 * アカウント（プロフィール表示・ログアウト・アカウント削除、G3-2）は`authStore`の実データを使う。
 */
export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { favoriteLotteryIds, followedProductKeys } = useFavoritesStore();
  const { status, user } = useAuthStore();
  const latest = monthlyStats[monthlyStats.length - 1];
  const winRate = latest.applied > 0 ? ((latest.won / latest.applied) * 100).toFixed(1) : '0.0';
  const [pendingAction, setPendingAction] = useState<'signOut' | 'signOutAll' | 'delete' | null>(null);

  const isSignedIn = status === 'signedIn' && user != null;

  const handleSignOut = async () => {
    setPendingAction('signOut');
    try {
      await signOut();
    } catch {
      Alert.alert('ログアウトできませんでした', 'もう一度お試しください');
    } finally {
      setPendingAction(null);
    }
  };

  const handleSignOutAllDevices = () => {
    Alert.alert('全端末からログアウトしますか？', 'この端末を含む、すべての端末でログアウトされます', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト',
        style: 'destructive',
        onPress: async () => {
          setPendingAction('signOutAll');
          try {
            await signOutAllDevices();
          } catch {
            Alert.alert('全端末からのログアウトに失敗しました', '通信状況を確認してもう一度お試しください');
          } finally {
            setPendingAction(null);
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'アカウントを削除しますか？',
      '自分の抽選・お気に入り・フォロー中商品・通知設定がすべて削除されます。この操作は元に戻せません',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '次へ',
          style: 'destructive',
          onPress: () => {
            Alert.alert('本当に削除しますか？', 'もう一度確認します。削除を確定しますか？', [
              { text: 'キャンセル', style: 'cancel' },
              {
                text: '削除する',
                style: 'destructive',
                onPress: async () => {
                  setPendingAction('delete');
                  try {
                    const { scheduledDeletionAt } = await deleteAccount();
                    const date = new Date(scheduledDeletionAt);
                    Alert.alert(
                      'アカウントの削除を受け付けました',
                      `${date.toLocaleDateString('ja-JP')}に削除されます。それまでは再度サインインすると取り消せます`
                    );
                  } catch {
                    Alert.alert('アカウントを削除できませんでした', 'もう一度お試しください');
                  } finally {
                    setPendingAction(null);
                  }
                },
              },
            ]);
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer style={{ backgroundColor: theme.colors.surface }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <SyncConflictBanner />

        {isSignedIn ? (
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.thumbBg, borderColor: theme.colors.thumbBorder }]}>
              <PersonIcon size={30} color={theme.colors.textFaint} strokeWidth={1.8} />
            </View>
            <View style={styles.profileText}>
              <Text style={[styles.userName, { color: theme.colors.textPrimary }]}>{user!.displayName ?? 'ユーザー'}</Text>
              <Text style={[styles.userId, { color: theme.colors.textTertiary }]}>{user!.email ?? user!.publicUserId}</Text>
              {user!.accountStatus === 'pending_deletion' && (
                <Text style={[styles.userId, { color: theme.colors.danger }]}>
                  アカウント削除予定{user!.scheduledDeletionAt ? `: ${new Date(user!.scheduledDeletionAt).toLocaleDateString('ja-JP')}` : ''}
                </Text>
              )}
            </View>
            <Pressable
              hitSlop={8}
              style={styles.iconButton}
              onPress={() => Alert.alert('準備中です', 'アカウント設定は今後実装予定です')}
            >
              <GearIcon color={theme.colors.textPrimary} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.signInPrompt}>
            <Text style={[styles.userName, { color: theme.colors.textPrimary }]}>サインインしていません</Text>
            <Text style={[styles.userId, { color: theme.colors.textTertiary }]}>
              サインインすると端末をまたいでデータを同期できます
            </Text>
            {/* .expo/types/router.d.ts はローカル生成物で(auth)/sign-in追加前のキャッシュのため型が古い。
                `expo start`実行時に再生成されれば通常のリテラルで型が通るようになる。 */}
            <PrimaryButton label="サインイン" size="md" onPress={() => router.push('/sign-in' as Parameters<typeof router.push>[0])} />
          </View>
        )}

        <View style={styles.statsWrap}>
          <Pressable
            style={[styles.statsCard, { backgroundColor: theme.colors.darkCardBg }]}
            onPress={() => router.push('/stats')}
          >
            <View style={styles.statsHeaderRow}>
              <Text style={[styles.statsHeaderLabel, { color: theme.colors.darkCardText }]}>今月の実績</Text>
              <Text style={[styles.statsHeaderLink, { color: theme.colors.darkCardAccent }]}>詳しく見る ›</Text>
            </View>
            <View style={styles.statsGrid}>
              <StatItem label="応募数" value={String(latest.applied)} color="#fff" />
              <StatItem label="当選数" value={String(latest.won)} color="#fff" />
              <StatItem label="当選率" value={`${winRate}%`} color={theme.colors.darkCardAccent} />
              <StatItem label="購入数" value={String(latest.purchased)} color="#fff" />
            </View>
          </Pressable>
        </View>

        <View style={[styles.menu, { borderTopColor: theme.colors.borderLight }]}>
          <MenuRow
            icon={<ClockIcon size={20} color={theme.colors.textSecondary} strokeWidth={1.9} />}
            label="自分の抽選"
            onPress={() => router.push('/my-lotteries')}
          />
          <MenuRow
            icon={<HeartIcon size={20} color={theme.colors.textSecondary} strokeWidth={1.9} />}
            label="お気に入り"
            trailingText={`抽選 ${favoriteLotteryIds.length}`}
            onPress={() => router.push('/favorites')}
          />
          <MenuRow
            icon={<PersonIcon size={20} color={theme.colors.textSecondary} strokeWidth={1.9} />}
            label="フォロー中"
            trailingText={`商品 ${followedProductKeys.length}`}
            onPress={() => router.push('/following')}
          />
          <MenuRow
            icon={<ClockIcon size={20} color={theme.colors.textSecondary} strokeWidth={1.9} />}
            label="通知設定"
            onPress={() => router.push('/notification-settings/global')}
          />
          <MenuRow
            icon={<BackupIcon size={20} color={theme.colors.textSecondary} strokeWidth={1.9} />}
            label="データのバックアップ"
            onPress={() => Alert.alert('準備中です', 'データのバックアップ機能は今後実装予定です')}
            last={!isSignedIn}
          />
          {isSignedIn && (
            <>
              <MenuRow
                icon={<ClockIcon size={20} color={theme.colors.textSecondary} strokeWidth={1.9} />}
                label="ログアウト"
                onPress={handleSignOut}
                loading={pendingAction === 'signOut'}
              />
              <MenuRow
                icon={<ClockIcon size={20} color={theme.colors.textSecondary} strokeWidth={1.9} />}
                label="全端末からログアウト"
                onPress={handleSignOutAllDevices}
                loading={pendingAction === 'signOutAll'}
              />
              <MenuRow
                icon={<ClockIcon size={20} color={theme.colors.danger} strokeWidth={1.9} />}
                label="アカウントを削除"
                labelColor={theme.colors.danger}
                onPress={handleDeleteAccount}
                loading={pendingAction === 'delete'}
                last
              />
            </>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  const theme = useTheme();
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statLabel, { color: theme.colors.darkCardText }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  labelColor,
  trailingText,
  onPress,
  loading,
  last,
}: {
  icon: ReactNode;
  label: string;
  labelColor?: string;
  trailingText?: string;
  onPress?: () => void;
  loading?: boolean;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={[styles.menuRow, !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.borderLighter }, loading && { opacity: 0.5 }]}
    >
      {icon}
      <Text style={[styles.menuLabel, { color: labelColor ?? theme.colors.textPrimary }]}>{label}</Text>
      {trailingText ? (
        <Text style={[styles.menuTrailing, { color: theme.colors.textTertiary }]}>{trailingText}</Text>
      ) : null}
      <ChevronRightIcon />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profileRow: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    flex: 1,
    gap: 3,
  },
  signInPrompt: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 18,
    gap: 10,
  },
  userName: {
    fontSize: 19,
    fontWeight: '900',
  },
  userId: {
    fontSize: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsWrap: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  statsCard: {
    borderRadius: 16,
    padding: 15,
    gap: 12,
  },
  statsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsHeaderLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  statsHeaderLink: {
    fontSize: 11,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  menu: {
    borderTopWidth: 1,
    paddingBottom: 24,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    minHeight: 54,
    borderBottomWidth: 1,
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  menuTrailing: {
    fontSize: 11,
  },
});
