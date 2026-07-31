import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/useTheme';

import { CalendarIcon, HomeIcon, ListIcon, PersonIcon } from './icons';

const TAB_ICON: Record<string, typeof HomeIcon> = {
  index: HomeIcon,
  lotteries: ListIcon,
  calendar: CalendarIcon,
  profile: PersonIcon,
};

const TAB_LABEL: Record<string, string> = {
  index: 'ホーム',
  lotteries: '抽選一覧',
  calendar: 'カレンダー',
  profile: 'マイページ',
};

export function BottomTabs({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const Icon = TAB_ICON[route.name] ?? HomeIcon;
        const label = TAB_LABEL[route.name] ?? route.name;
        const color = focused ? theme.colors.green : theme.colors.textMuted;

        return (
          <Pressable
            key={route.key}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            style={styles.tab}
          >
            <Icon color={color} strokeWidth={focused ? 2.3 : 1.8} />
            <Text style={[styles.label, { color, fontWeight: focused ? '700' : '500' }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 5,
  },
  label: {
    fontSize: 11,
  },
});
