import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { BackIcon, ChevronRightIcon, ClockIcon, MailIcon, MoonIcon, PhoneIcon, StarIcon, TrophyIcon } from '@/components/icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ensureNotificationPermission, rescheduleAllApiReminders } from '@/lib/notifications';
import { useMyLotteriesStore } from '@/stores/myLotteriesStore';
import {
  useNotificationSettingsStore,
  type BooleanSettingKey,
} from '@/stores/notificationSettingsStore';
import { useTheme } from '@/theme/useTheme';

const HOUR_PRESETS = [1, 3, 6, 12, 24];

function nextPreset(current: number): number {
  const index = HOUR_PRESETS.indexOf(current);
  return HOUR_PRESETS[(index + 1) % HOUR_PRESETS.length] ?? HOUR_PRESETS[0];
}

function formatHours(hours: number): string {
  return hours >= 24 ? `${hours / 24}日前` : `${hours}時間前`;
}

export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const settings = useNotificationSettingsStore();
  const { saved } = useMyLotteriesStore();
  const deniedAlertShownRef = useRef(false);

  function toggle(key: BooleanSettingKey) {
    settings.setToggle(key, !settings[key]);
  }

  // 通知設定（種類のON/OFF・リマインドタイミング）が変わるたびに、
  // 「自分の抽選」に保存済みの全件のローカル通知を再スケジュールする。
  // 権限が未確認/未許可のまま scheduleNotificationAsync を呼んでも実際には配信されないため、
  // ここでも必ず権限確認してから再スケジュールする。
  // 権限が拒否されている場合、この画面滞在中に何度も設定を変更してもアラートが連発しないよう、
  // 表示済みかどうかを deniedAlertShownRef で1回だけに抑える。
  useEffect(() => {
    let cancelled = false;
    ensureNotificationPermission().then((granted) => {
      if (cancelled) return;
      if (granted) {
        rescheduleAllApiReminders(saved.map((s) => s.record), settings);
      } else if (!deniedAlertShownRef.current) {
        deniedAlertShownRef.current = true;
        Alert.alert('通知が許可されていません', '端末の設定から通知を許可すると、リマインドが届くようになります');
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    saved,
    settings.deadlineReminder,
    settings.announcementReminder,
    settings.purchaseReminder,
    settings.deadlineReminderHoursBefore,
    settings.announcementReminderHoursBefore,
    settings.purchaseReminderHoursBefore,
  ]);

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} style={styles.iconButton} onPress={() => router.back()}>
          <BackIcon size={22} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>通知設定</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Section title="通知の種類">
          <ToggleRow
            icon={<ClockIcon size={20} color={theme.colors.event.deadline.color} strokeWidth={1.9} />}
            label="締切リマインド"
            description="応募締切の前に通知"
            value={settings.deadlineReminder}
            onChange={() => toggle('deadlineReminder')}
          />
          <ToggleRow
            icon={<TrophyIcon size={20} color={theme.colors.event.announcement.color} strokeWidth={1.9} />}
            label="当選発表リマインド"
            description="当選発表の前に通知"
            value={settings.announcementReminder}
            onChange={() => toggle('announcementReminder')}
          />
          <ToggleRow
            icon={<ClockIcon size={20} color={theme.colors.event.purchase.color} strokeWidth={1.9} />}
            label="購入期限リマインド"
            description="購入期限の前に通知"
            value={settings.purchaseReminder}
            onChange={() => toggle('purchaseReminder')}
          />
          <ToggleRow
            icon={<ClockIcon size={20} color={theme.colors.textSecondary} strokeWidth={1.9} />}
            label="新着抽選のお知らせ"
            description="フォロー中の商品・店舗の新着"
            value={settings.newLotteryAlert}
            onChange={() => toggle('newLotteryAlert')}
          />
          <ToggleRow
            icon={<StarIcon size={20} color={theme.colors.textSecondary} />}
            label="お気に入り通知"
            description="お気に入りの更新を通知"
            value={settings.favoriteUpdateAlert}
            onChange={() => toggle('favoriteUpdateAlert')}
            last
          />
        </Section>

        <Section title="通知タイミング">
          <ValueRow
            label="締切リマインド"
            value={formatHours(settings.deadlineReminderHoursBefore)}
            onPress={() =>
              settings.setHours('deadlineReminderHoursBefore', nextPreset(settings.deadlineReminderHoursBefore))
            }
          />
          <ValueRow
            label="当選発表リマインド"
            value={formatHours(settings.announcementReminderHoursBefore)}
            onPress={() =>
              settings.setHours(
                'announcementReminderHoursBefore',
                nextPreset(settings.announcementReminderHoursBefore)
              )
            }
          />
          <ValueRow
            label="購入期限リマインド"
            value={formatHours(settings.purchaseReminderHoursBefore)}
            onPress={() =>
              settings.setHours('purchaseReminderHoursBefore', nextPreset(settings.purchaseReminderHoursBefore))
            }
            last
          />
        </Section>

        <Section title="通知方法">
          <ToggleRow
            icon={<PhoneIcon size={20} color={theme.colors.textSecondary} strokeWidth={1.9} />}
            label="プッシュ通知"
            description="端末に通知を表示"
            value={settings.pushEnabled}
            onChange={() => toggle('pushEnabled')}
          />
          <ToggleRow
            icon={<MailIcon size={20} color={theme.colors.textSecondary} strokeWidth={1.9} />}
            label="メール通知"
            description="重要な通知のみ送信"
            value={settings.emailEnabled}
            onChange={() => toggle('emailEnabled')}
            last
          />
        </Section>

        <Section title="おやすみモード">
          <ToggleRow
            icon={<MoonIcon size={20} color={theme.colors.textSecondary} strokeWidth={1.9} />}
            label="おやすみモード"
            description="指定時間は通知しない"
            value={settings.quietHoursEnabled}
            onChange={() => toggle('quietHoursEnabled')}
          />
          <ValueRow label="時間帯" value={`${settings.quietHoursStart} – ${settings.quietHoursEnd}`} last />
        </Section>
      </ScrollView>

      <View style={styles.handleWrap}>
        <View style={[styles.handle, { backgroundColor: theme.colors.thumbInner }]} />
      </View>
    </ScreenContainer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>{title}</Text>
      <View style={[styles.sectionBody, { borderTopColor: theme.colors.borderLight }]}>{children}</View>
    </View>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  value,
  onChange,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.borderLighter },
      ]}
    >
      {icon}
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: theme.colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.rowDescription, { color: theme.colors.textTertiary }]}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.colors.chipTrack, true: theme.colors.green }}
        thumbColor="#fff"
      />
    </View>
  );
}

function ValueRow({
  label,
  value,
  onPress,
  last,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.valueRow,
        !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.borderLighter },
      ]}
    >
      <Text style={[styles.rowLabelPlain, { color: theme.colors.textPrimary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.colors.textSecondary }]}>{value}</Text>
      <ChevronRightIcon />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '900',
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 16,
  },
  section: {
    gap: 7,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 20,
  },
  sectionBody: {
    borderTopWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    minHeight: 56,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  rowDescription: {
    fontSize: 11,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    minHeight: 52,
  },
  rowLabelPlain: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  handleWrap: {
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 130,
    height: 5,
    borderRadius: 999,
  },
});
