import { useColorScheme } from 'react-native';

import { useThemeStore } from '@/stores/themeStore';

import { darkColors, lightColors, type ColorScheme } from './colors';
import { fontSize, fontWeight, radius, spacing } from './tokens';

export interface Theme {
  colors: ColorScheme;
  isDark: boolean;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
}

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const preference = useThemeStore((state) => state.preference);

  const isDark = preference === 'system' ? systemScheme === 'dark' : preference === 'dark';

  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
    spacing,
    radius,
    fontSize,
    fontWeight,
  };
}
