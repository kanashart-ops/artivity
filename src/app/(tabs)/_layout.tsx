
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  // Учитываем системные кнопки Android.
  const bottomSpace =
    Platform.OS === 'android'
      ? Math.max(insets.bottom, 32)
      : insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,

        tabBarActiveTintColor: '#22A788',
        tabBarInactiveTintColor: isDark ? '#8892A0' : '#84909C',

        tabBarStyle: {
          backgroundColor: isDark ? '#151C26' : '#FFFFFF',
          borderTopColor: isDark ? '#293343' : '#E9EDF2',
          height: 62 + bottomSpace,
          paddingTop: 6,
          paddingBottom: bottomSpace + 4,
        },

        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Сегодня',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="today-outline" color={String(color)} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="intervals"
        options={{
          title: 'Интервалы',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="timer-outline" color={String(color)} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="workouts"
        options={{
          title: 'Тренировки',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="barbell-outline" color={String(color)} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="progress"
        options={{
          title: 'Прогресс',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" color={String(color)} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
