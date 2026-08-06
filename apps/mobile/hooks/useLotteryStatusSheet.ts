import { Alert } from 'react-native';

import { isCorrectionTransition, nextLotteryStatusOptions } from '@/lib/lotteryStatusTransitions';
import { useMyLotteriesStore, type SavedLottery } from '@/stores/myLotteriesStore';
import { useTheme } from '@/theme/useTheme';

/**
 * 個人ステータス変更の操作シート（Mobile-G6）。「自分の抽選」を表示する画面が複数ある
 * （`app/my-lotteries/index.tsx`と`app/(tabs)/lotteries.tsx`のmode='mine'）ため、
 * 両者で同じ挙動になるよう共通化する。
 */
export function useLotteryStatusSheet() {
  const theme = useTheme();
  const { setStatus } = useMyLotteriesStore();

  return function openStatusSheet(item: SavedLottery) {
    if (item.serverVersion === undefined) {
      Alert.alert('同期中です', 'この抽選の保存が完了してから、ステータスを変更できます');
      return;
    }

    const options = nextLotteryStatusOptions(item.status);
    if (options.length === 0) return;

    const labelOf = (status: SavedLottery['status']) => theme.colors.personalStatus[status].label;

    const buttons = options.map((next) => ({
      text: labelOf(next),
      onPress: () => {
        if (isCorrectionTransition(item.status, next)) {
          Alert.alert('訂正しますか？', `「${labelOf(item.status)}」から「${labelOf(next)}」に戻します`, [
            { text: 'キャンセル', style: 'cancel' },
            { text: '訂正する', style: 'destructive', onPress: () => setStatus(item.record.id, next) },
          ]);
          return;
        }
        setStatus(item.record.id, next);
      },
    }));

    Alert.alert('ステータスを変更', `現在: ${labelOf(item.status)}`, [...buttons, { text: 'キャンセル', style: 'cancel' as const }]);
  };
}
