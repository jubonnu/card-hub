import { Image, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

interface ProductThumbProps {
  size?: 'sm' | 'md' | 'lg';
  /** 管理画面からアップロードされた商品画像（Phase 7）。未設定ならプレースホルダーを表示する。 */
  imageUrl?: string | null;
}

const SIZES = {
  sm: { width: 38, height: 50, inner: 16, radius: 5, innerRadius: 2 },
  md: { width: 46, height: 60, inner: 20, radius: 6, innerRadius: 3 },
  lg: { width: 82, height: 106, inner: 38, radius: 9, innerRadius: 4 },
};

export function ProductThumb({ size = 'md', imageUrl }: ProductThumbProps) {
  const theme = useTheme();
  const dims = SIZES[size];

  return (
    <View
      style={[
        styles.outer,
        {
          width: dims.width,
          height: dims.height,
          borderRadius: dims.radius,
          backgroundColor: theme.colors.thumbBg,
          borderColor: theme.colors.thumbBorder,
        },
      ]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: dims.width - 2, height: dims.height - 2, borderRadius: dims.radius - 1 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width: dims.inner,
            height: dims.inner * 1.4,
            borderRadius: dims.innerRadius,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.thumbInner,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
