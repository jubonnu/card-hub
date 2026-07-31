import { Tabs } from 'expo-router';

import { BottomTabs } from '@/components/BottomTabs';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <BottomTabs {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="lotteries" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
