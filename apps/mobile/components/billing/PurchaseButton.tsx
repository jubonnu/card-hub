import type { PurchasesPackage } from 'react-native-purchases';

import { PrimaryButton } from '@/components/PrimaryButton';

interface PurchaseButtonProps {
  label: string;
  pkg: PurchasesPackage | null | undefined;
  loading: boolean;
  disabled: boolean;
  onPress: (pkg: PurchasesPackage) => void;
}

/**
 * 購入ボタン（Mobile-G4-3）。価格は`pkg.product.priceString`（RevenueCat/Storeから取得した
 * 実際のローカライズ済み価格）のみを表示し、固定文字列をハードコードしない。
 * `pkg`が無い（Offeringに対象パッケージが設定されていない）場合は非表示にする。
 */
export function PurchaseButton({ label, pkg, loading, disabled, onPress }: PurchaseButtonProps) {
  if (!pkg) return null;

  return (
    <PrimaryButton label={`${label}（${pkg.product.priceString}）`} loading={loading} disabled={disabled} onPress={() => onPress(pkg)} />
  );
}
