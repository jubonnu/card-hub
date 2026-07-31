import { DetailHeader } from '@/components/DetailHeader';
import { EmptyState } from '@/components/EmptyState';
import { HeartIcon } from '@/components/icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useTheme } from '@/theme/useTheme';

/**
 * 実API側の抽選詳細にはお気に入りボタンがまだ無く、この機能は現状使用できない
 * （架空のモック抽選をお気に入りとして表示することを避けるため、常に空状態にしている）。
 */
export default function FavoritesScreen() {
  const theme = useTheme();

  return (
    <ScreenContainer>
      <DetailHeader title="お気に入り" />
      <EmptyState
        icon={<HeartIcon size={34} color={theme.colors.green} strokeWidth={1.7} />}
        title="お気に入りはまだありません"
        description="抽選詳細画面からお気に入り登録できるようになる予定です"
      />
    </ScreenContainer>
  );
}
