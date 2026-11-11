import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { artivityTheme, softShadow } from '@/components/artivity-theme';
import { WeeklyProgressRing } from '@/components/food-progress-ring';
import WeightSection from '@/components/weight-section';
import SwipeTabScreen from '@/components/swipe-tab-screen';
import { loadToday, type TodaySnapshot } from '@/database/daily';
import { getTrainingConsistency, type TrainingConsistency } from '@/database/intervals';

type Stats = {
  today: TodaySnapshot;
  training: TrainingConsistency;
  completedWeek: number;
  reports30: number;
  totalSessions: number;
  foodEvents: number;
  earlyEvents: number;
};

function key(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function daysAgo(days: number): string {
  const now = new Date();
  return key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
}

export default function ProgressScreen() {
  const db = useSQLiteContext();
  const dark = useColorScheme() === 'dark';
  const t = artivityTheme(dark);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    async function load() {
      try {
        const now = new Date();
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
        const [today, training, week, reports, sessions, food] = await Promise.all([
          loadToday(db), getTrainingConsistency(db),
          db.getFirstAsync<{ total: number }>(
            'SELECT COUNT(*) AS total FROM daily_entries WHERE checked_in = 1 AND date BETWEEN ? AND ?',
            key(monday), key(now)
          ),
          db.getFirstAsync<{ total: number }>(
            'SELECT COUNT(*) AS total FROM daily_entries WHERE checked_in = 1 AND date BETWEEN ? AND ?',
            daysAgo(29), key(now)
          ),
          db.getFirstAsync<{ total: number }>('SELECT COUNT(*) AS total FROM workout_entries'),
          db.getFirstAsync<{ total: number; early: number }>(
            'SELECT COUNT(*) AS total, COALESCE(SUM(was_early),0) AS early FROM consumption_events'
          ),
        ]);
        if (active) {
          setStats({ today, training, completedWeek: week?.total ?? 0, reports30: reports?.total ?? 0,
            totalSessions: sessions?.total ?? 0, foodEvents: food?.total ?? 0, earlyEvents: food?.early ?? 0 });
          setError('');
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Не удалось загрузить статистику');
      }
    }
    void load();
    return () => { active = false; };
  }, [db]));

  return (
    <SwipeTabScreen>
      <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]} edges={['top', 'left', 'right']}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.brandRow}>
            <Ionicons name="stats-chart" size={28} color={t.primary} />
            <Text style={[styles.brand, { color: t.text }]}>Artivity</Text>
          </View>
          <Text style={[styles.title, { color: t.text }]}>Мой прогресс</Text>
          {!stats && !error ? <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} /> : null}
          {stats ? (
            <>
              <View style={[styles.hero, { backgroundColor: t.card, borderColor: t.border }]}>
                <WeeklyProgressRing count={stats.completedWeek} size={143} dark={dark} />
                <View style={{ flex: 1, paddingLeft: 10 }}>
                  <Text style={[styles.cardTitle, { color: t.text }]}>Неделя привычек</Text>
                  <Text style={[styles.caption, { color: t.muted, marginTop: 8 }]}>Сколько дней ты отметил на этой неделе</Text>
                </View>
              </View>
              <WeightSection />
              <View style={styles.grid}>
                {[
                  { icon: 'flame-outline' as const, name: 'Серия', value: `${stats.today.currentStreak}`, label: 'дней подряд', color: '#EFA539' },
                  { icon: 'trophy-outline' as const, name: 'Рекорд', value: `${stats.today.bestStreak}`, label: 'дней', color: '#14C676' },
                  { icon: 'barbell-outline' as const, name: 'Тренировки', value: `${stats.totalSessions}`, label: 'занятий всего', color: '#9161E9' },
                  { icon: 'leaf-outline' as const, name: 'Без алкоголя', value: `${stats.today.alcoholFreeDays}`, label: 'дней', color: '#14B58C' },
                  { icon: 'calendar-outline' as const, name: 'Отметки', value: `${stats.reports30}`, label: 'за 30 дней', color: '#239CCC' },
                  { icon: 'restaurant-outline' as const, name: 'Интервалы', value: `${stats.foodEvents}`, label: 'записей еды', color: '#F5A623' },
                ].map(card => (
                  <View key={card.name} style={[styles.metric, { backgroundColor: t.card, borderColor: t.border }]}>
                    <Ionicons name={card.icon} size={25} color={card.color} />
                    <Text style={[styles.metricValue, { color: t.text }]}>{card.value}</Text>
                    <Text style={[styles.metricName, { color: t.text }]}>{card.name}</Text>
                    <Text style={[styles.caption, { color: t.muted }]}>{card.label}</Text>
                  </View>
                ))}
              </View>
              <View style={[styles.section, { backgroundColor: t.card, borderColor: t.border }]}>
                <View style={styles.sectionRow}>
                  <Ionicons name="barbell-outline" size={24} color="#12C873" />
                  <Text style={[styles.cardTitle, { color: t.text }]}>Стабильность тренировок</Text>
                </View>
                <Text style={[styles.metricValue, { color: t.text }]}>{stats.training.level} / 4</Text>
                <View style={[styles.track, { backgroundColor: t.border }]}>
                  <View style={[styles.fill, { width: `${stats.training.level * 25}%` as const }]} />
                </View>
                <Text style={[styles.caption, { color: t.muted, marginTop: 10 }]}>
                  За 7 дней: {stats.training.last7} · за 14: {stats.training.last14} · за 30: {stats.training.last30}
                </Text>
                <Text style={[styles.caption, { color: t.muted, marginTop: 10 }]}>
                  Употреблений раньше рекомендованного интервала: {stats.earlyEvents} из {stats.foodEvents}.
                </Text>
              </View>
            </>
          ) : null}
          {error ? <Text style={{ color: '#EF5350' }}>{error}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </SwipeTabScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 36 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 17 },
  brand: { fontSize: 25, fontWeight: '900' },
  title: { fontSize: 29, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 20 },
  hero: { flexDirection: 'row', alignItems: 'center', borderRadius: 23, borderWidth: 1, padding: 14, marginBottom: 12, ...softShadow },
  cardTitle: { fontSize: 17, fontWeight: '900' },
  caption: { fontSize: 12, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', flexGrow: 1, borderRadius: 20, borderWidth: 1, padding: 16, ...softShadow },
  metricValue: { fontSize: 31, fontWeight: '900', marginTop: 10 },
  metricName: { fontSize: 15, fontWeight: '800', marginTop: 3 },
  section: { borderRadius: 21, borderWidth: 1, padding: 18, marginTop: 14, ...softShadow },
  sectionRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  track: { height: 8, borderRadius: 9, marginTop: 14, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: '#12C873', borderRadius: 9 },
});
