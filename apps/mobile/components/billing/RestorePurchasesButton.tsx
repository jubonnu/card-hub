import { SecondaryButton } from '@/components/SecondaryButton';

interface RestorePurchasesButtonProps {
  disabled: boolean;
  onPress: () => void;
}

/** 購入復元ボタン（Mobile-G4-3）。signedIn時のみ有効化する（呼び出し側で`disabled`を制御する）。 */
export function RestorePurchasesButton({ disabled, onPress }: RestorePurchasesButtonProps) {
  return <SecondaryButton label="購入を復元する" disabled={disabled} onPress={onPress} size="md" />;
}
