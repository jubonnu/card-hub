import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Lottery } from '@/types/models';
import { useTheme } from '@/theme/useTheme';
import { getBodyMetaLine, getHeaderMeta, getPrimaryCta } from '@/utils/lotteryDisplay';

import { ChevronRightIcon, StarIcon } from './icons';
import { PrimaryButton } from './PrimaryButton';
import { ProductThumb } from './ProductThumb';
import { SecondaryButton } from './SecondaryButton';
import { StatusBadge } from './StatusBadge';

interface LotteryCardProps {
  lottery: Lottery;
  nowIso: string;
  onPress?: () => void;
  onCtaPress?: () => void;
  showFavorite?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  showChevron?: boolean;
  showCta?: boolean;
  highlight?: boolean;
}

export function LotteryCard({
  lottery,
  nowIso,
  onPress,
  onCtaPress,
  showFavorite = false,
  isFavorite = false,
  onToggleFavorite,
  showChevron = false,
  showCta = false,
  highlight = false,
}: LotteryCardProps) {
  const theme = useTheme();
  const header = getHeaderMeta(lottery, nowIso);
  const bodyLine = getBodyMetaLine(lottery);
  const cta = getPrimaryCta(lottery);

  const toneColor = {
    danger: theme.colors.danger,
    muted: theme.colors.textSecondary,
    blue: theme.colors.event.purchase.color,
    default: theme.colors.textSecondary,
  }[header.tone];

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        {
          borderColor: highlight ? theme.colors.greenDark : theme.colors.border,
          borderWidth: highlight ? 1.6 : 1,
          backgroundColor: highlight ? theme.colors.greenSoftBg : theme.colors.surface,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <StatusBadge status={lottery.status} />
        {header.label ? <Text style={[styles.headerLabel, { color: toneColor }]}>{header.label}</Text> : null}
      </View>
      <View style={styles.bodyRow}>
        <ProductThumb size="md" />
        <View style={styles.bodyText}>
          <Text style={[styles.productName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {lottery.productName}
          </Text>
          <Text style={[styles.shopName, { color: theme.colors.textTertiary }]} numberOfLines={1}>
            {lottery.shopName}
          </Text>
          {bodyLine ? (
            <Text style={[styles.metaLine, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {bodyLine}
            </Text>
          ) : null}
        </View>
        {showFavorite ? (
          <Pressable hitSlop={8} onPress={onToggleFavorite}>
            <StarIcon filled={isFavorite} />
          </Pressable>
        ) : null}
        {showChevron ? <ChevronRightIcon /> : null}
      </View>
      {showCta && cta ? (
        <View style={styles.ctaRow}>
          {cta.variant === 'solid' ? (
            <PrimaryButton label={cta.label} onPress={onCtaPress} size="md" />
          ) : (
            <SecondaryButton label={cta.label} onPress={onCtaPress} size="md" />
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    gap: 11,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  ctaRow: {
    marginTop: 1,
  },
});
