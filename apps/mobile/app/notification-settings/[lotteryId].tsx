import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { BackIcon, ChevronRightIcon, ClockIcon, MoonIcon, TrophyIcon } from '@/components/icons';
import { QuietHoursTimePickerModal } from '@/components/QuietHoursTimePickerModal';
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

/*
 * 将来機能（今回は非対応・UIから非表示）:
 * - メール通知（emailEnabled）: バックエンドにメール送信基盤が無いため未対応。
 * - 新着抽選のお知らせ（newLotteryAlert）: フォロー中商品の新着を検知してPush/ローカル通知
 *   する仕組みが無いため未対応（Push通知基盤・サーバー側トリガーの新規実装が必要）。
 * - お気に入り通知（favoriteUpdateAlert）: 「お気に入り」機能自体をUIから外したため、
 *   トリガーとなる「お気に入りの更新」という概念が現状存在しない。
 * ストア・サーバー同期の項目自体は残しているため、対応する仕組みができ次第、
 * ここにトグルを復活させるだけで良い。
 */

export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const settings = useNotificationSettingsStore();
  const { saved } = useMyLotteriesStore();
  const deniedAlertShownRef = useRef(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  function toggle(key: BooleanSettingKey) {
    settings.setToggle(key, !settings[key]);
  }

  // 通知設定（種類のON/OFF・マスターON/OFF・おやすみモード・リマインドタイミング）が
  // 変わるたびに、「自分の抽選」に保存済みの全件のローカル通知を再スケジュールする。
  // マスターOFF（pushEnabled=false）時は、scheduleApiLotteryReminders側で
  // 「既存分をキャンセルするが新規は作らない」という挙動になるため、ONに戻せば
  // ここで自動的に必要な通知が再作成される。
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
    settings.pushEnabled,
    settings.deadlineReminder,
    settings.announcementReminder,
    settings.purchaseReminder,
    settings.deadlineReminderHoursBefore,
    settings.announcementReminderHoursBefore,
    settings.purchaseReminderHoursBefore,
    settings.quietHoursEnabled,
    settings.quietHoursStart,
    settings.quietHoursEnd,
  ]);

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} style={styles.iconButton} onPress={() => router.back()}>
          <BackIcon size={22} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          通知設定
        </Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Section title="通知のマスター設定">
          <ToggleRow
            icon={<ClockIcon size={20} color={theme.colors.textSecondary} strokeWidth={1.9} />}
            label="アプリの通知"
            description="OFFにすると、下の設定に関わらず新しい通知を作りません（既存の予約分も取り消されます）"
            value={settings.pushEnabled}
            onChange={() => toggle('pushEnabled')}
            last
          />
        </Section>

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
            onPress={() => settings.setHours('purchaseReminderHoursBefore', nextPreset(settings.purchaseReminderHoursBefore))}
            last
          />
        </Section>

        <Section title="おやすみモード">
          <ToggleRow
            icon={<MoonIcon size={20} color={theme.colors.textSecondary} strokeWidth={1.9} />}
            label="おやすみモード"
            description="指定時間は通知しない（時間帯にかかる通知は前後にずらします）"
            value={settings.quietHoursEnabled}
            onChange={() => toggle('quietHoursEnabled')}
          />
          <ValueRow
            label="時間帯"
            value={`${settings.quietHoursStart} – ${settings.quietHoursEnd}`}
            onPress={() => setPickerVisible(true)}
            disabled={!settings.quietHoursEnabled}
            last
          />
        </Section>
      </ScrollView>

      <QuietHoursTimePickerModal
        visible={pickerVisible}
        initialStart={settings.quietHoursStart ?? '22:00'}
        initialEnd={settings.quietHoursEnd ?? '07:00'}
        onClose={() => setPickerVisible(false)}
        onConfirm={(start, end) => settings.setQuietHours(start, end)}
      />
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
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: theme.colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.rowDescription, { color: theme.colors.textTertiary }]}>{description}</Text>
      </View>
      <Switch
        style={styles.rowSwitch}
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
  disabled,
  last,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  disabled?: boolean;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.valueRow,
        !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.borderLighter },
        disabled && styles.valueRowDisabled,
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
    paddingTop: 12,
    paddingBottom: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 24,
  },
  section: {
    gap: 9,
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
    paddingVertical: 14,
    minHeight: 56,
  },
  rowIcon: {
    alignSelf: 'center',
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  rowDescription: {
    fontSize: 11,
    lineHeight: 15,
  },
  rowSwitch: {
    alignSelf: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 15,
    minHeight: 52,
  },
  valueRowDisabled: {
    opacity: 0.4,
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
});
