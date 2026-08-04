import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PersonalLotteryStatus } from '@/theme/colors';
import { useTheme } from '@/theme/useTheme';

import { PencilIcon } from './icons';

interface PersonalStatusBadgeProps {
  status: PersonalLotteryStatus;
  size?: 'sm' | 'md';
  onPress?: () => void;
}

/**
 * `SecondaryButton`の`size="sm"`と寸法（高さ32・角丸8・横paddingその他）を揃えた設定。
 * カード内でチェックリストボタンと横に並ぶため、見た目のサイズ差でどちらかが軽視される
 * ことがないようにする。
 */
const MD_SIZE = { height: 32, fontSize: 12, borderRadius: 8, paddingHorizontal: 12, gap: 5 } as const;
const SM_SIZE = { height: 26, fontSize: 11, borderRadius: 7, paddingHorizontal: 10, gap: 4 } as const;

/**
 * 個人ステータス（応募予定/応募済み/当選/落選/購入済み/見送り、Mobile-G6）用のバッジ。
 * `PublicStatusBadge`（公開抽選タイムラインのステータス）とは意味的に別物。
 * `onPress`を渡すとタップ可能になり、ステータス変更操作の起点として使う。タップ可能な場合は
 * 鉛筆アイコンを添えて、隣接する非タップ可能なバッジ（`PublicStatusBadge`等）と見分けが
 * つくようにする（同じ見た目のバッジ・ボタンが並ぶと操作可能な方が埋もれてしまうため）。
 */
export function PersonalStatusBadge({ status, size = 'sm', onPress }: PersonalStatusBadgeProps) {
  const theme = useTheme();
  const style = theme.colors.personalStatus[status];
  const config = size === 'md' ? MD_SIZE : SM_SIZE;

  const badge = (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: style.bg,
          height: config.height,
          borderRadius: config.borderRadius,
          paddingHorizontal: config.paddingHorizontal,
          gap: config.gap,
        },
      ]}
    >
      {onPress ? <PencilIcon size={config.fontSize} color={style.fg} strokeWidth={2.2} /> : null}
      <Text style={[styles.text, { color: style.fg, fontSize: config.fontSize }]}>{style.label}</Text>
    </View>
  );

  if (!onPress) return badge;
  return <Pressable onPress={onPress}>{badge}</Pressable>;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '700',
  },
});
