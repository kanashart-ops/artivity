import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const dark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const bottomSpace = Platform.OS === 'android' ? Math.max(insets.bottom, 32) : insets.bottom;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarHideOnKeyboard: true,
      tabBarActiveTintColor: '#12C875',
      tabBarInactiveTintColor: dark ? '#9AAABC' : '#64748B',
      tabBarStyle: {
        backgroundColor: dark ? '#172530' : '#FFFFFF',
        borderTopColor: dark ? '#2B3B48' : '#E4EDF2',
        height: 61 + bottomSpace,
        paddingTop: 7,
        paddingBottom: bottomSpace + 3,
        elevation: 8,
        shadowOpacity: 0.07,
      },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '800' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Сегодня', tabBarIcon: ({ color, size, focused }) =>
        <Ionicons name={focused ? 'home' : 'home-outline'} color={String(color)} size={size} /> }} />
      <Tabs.Screen name="workouts" options={{ title: 'Тренировки', tabBarIcon: ({ color, size }) =>
        <Ionicons name="barbell-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="intervals" options={{ title: 'Интервалы', tabBarIcon: ({ color, size }) =>
        <Ionicons name="restaurant-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="progress" options={{ title: 'Прогресс', tabBarIcon: ({ color, size }) =>
        <Ionicons name="stats-chart-outline" color={String(color)} size={size} /> }} />
    </Tabs>
  );
}
