import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LotteryRecord } from '@/schemas/lotteryApi';
import type { PersonalLotteryStatus } from '@/theme/colors';
import { useTheme } from '@/theme/useTheme';
import {
  derivePublicTimelineStatus,
  getBodyMetaLine,
  getDisplayProductName,
  getDisplayShopName,
  getHeaderMetaLine,
  needsVerificationCaution,
} from '@/utils/publicLotteryDisplay';

import { ChevronRightIcon } from './icons';
import { PersonalStatusBadge } from './PersonalStatusBadge';
import { ProductThumb } from './ProductThumb';
import { PublicStatusBadge, VerificationCautionBadge } from './PublicStatusBadge';
import { SecondaryButton } from './SecondaryButton';

interface PublicLotteryCardProps {
  record: LotteryRecord;
  nowIso: string;
  onPress?: () => void;
  secondaryActionLabel?: string;
  onSecondaryActionPress?: () => void;
  /** 個人ステータス（Mobile-G6、「自分の抽選」一覧でのみ使用）。渡すとタップでステータス変更操作を開始できる。 */
  personalStatus?: PersonalLotteryStatus;
  onPersonalStatusPress?: () => void;
}

/**
 * 実API（/lotteries）のレコード用カード。見た目はLotteryCardと揃えるが、
 * productNameRaw等がnullになり得る実データの欠損を前提に組んでいる
 * （欠損を理由に一覧から除外しない方針のため、必ず何かしらのテキストを表示する）。
 * secondaryActionLabel/onSecondaryActionPress は「自分の抽選」一覧でのみ使用
 * （チェックリストなど、保存済み抽選に付随する操作への導線）。
 */
export function PublicLotteryCard({
  record,
  nowIso,
  onPress,
  secondaryActionLabel,
  onSecondaryActionPress,
  personalStatus,
  onPersonalStatusPress,
}: PublicLotteryCardProps) {
  const theme = useTheme();
  const status = derivePublicTimelineStatus(record, nowIso);
  const headerLabel = getHeaderMetaLine(record, nowIso);
  const bodyLine = getBodyMetaLine(record);
  const caution = needsVerificationCaution(record);

  const headerColor =
    status === 'accepting'
      ? theme.colors.danger
      : status === 'unknown'
        ? theme.colors.textFaint
        : theme.colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <PublicStatusBadge status={status} />
          {caution ? <VerificationCautionBadge /> : null}
        </View>
        <Text style={[styles.headerLabel, { color: headerColor }]}>{headerLabel}</Text>
      </View>
      <View style={styles.bodyRow}>
        <ProductThumb size="md" />
        <View style={styles.bodyText}>
          <Text style={[styles.productName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {getDisplayProductName(record)}
          </Text>
          <Text style={[styles.shopName, { color: theme.colors.textTertiary }]} numberOfLines={1}>
            {getDisplayShopName(record)}
          </Text>
          <Text style={[styles.metaLine, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {bodyLine}
          </Text>
        </View>
        <ChevronRightIcon />
      </View>
      {(personalStatus ?? (secondaryActionLabel && onSecondaryActionPress)) ? (
        <View style={styles.secondaryActionRow}>
          {personalStatus ? <PersonalStatusBadge status={personalStatus} size="md" onPress={onPersonalStatusPress} /> : null}
          {secondaryActionLabel && onSecondaryActionPress ? (
            <SecondaryButton label={secondaryActionLabel} size="md" onPress={onSecondaryActionPress} />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 11,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bodyText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
  },
  shopName: {
    fontSize: 12,
  },
  metaLine: {
    fontSize: 11,
  },
  secondaryActionRow: {
    marginTop: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
