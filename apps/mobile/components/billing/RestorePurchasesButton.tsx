import { SecondaryButton } from '@/components/SecondaryButton';

interface RestorePurchasesButtonProps {
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}

/** 購入復元ボタン（Mobile-G4-3）。signedIn時のみ有効化する（呼び出し側で`disabled`を制御する）。 */
export function RestorePurchasesButton({ loading, disabled, onPress }: RestorePurchasesButtonProps) {
  return <SecondaryButton label={loading ? '復元中…' : '購入を復元する'} disabled={disabled || loading} onPress={onPress} size="md" />;
}
