import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import type { TodaySnapshot } from '@/database/daily';
import { artivityTheme, softShadow } from './artivity-theme';
import { WeeklyProgressRing } from './food-progress-ring';
import HabitCalendar from './habit-calendar';
import { loadTonnageTotals, formatTonnage } from '@/database/tonnage';
import { hasPoolVisit, markPoolVisit, removePoolVisit } from '@/database/pool';

type Props = {
  today: TodaySnapshot | null;
  loading: boolean;
  error: string;
  onOpenForm: () => void;
};

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekDays(): { date: string; label: string }[] {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
  return ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((label, index) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
    return { date: dayKey(d), label };
  });
}

function plural(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 14) return 'дней';
  if (value % 10 === 1) return 'день';
  if ([2, 3, 4].includes(value % 10)) return 'дня';
  return 'дней';
}

function formatDate(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}


export default function ModernTodayBody({ today, loading, error, onOpenForm }: Props) {
  const dark = useColorScheme() === 'dark';
  const t = artivityTheme(dark);
  const router = useRouter();
  const db = useSQLiteContext();
  const [checkedDays, setCheckedDays] = useState<string[]>([]);
  const [weekKg, setWeekKg] = useState(0);
  const [poolMarked, setPoolMarked] = useState(false);
  const [poolBusy, setPoolBusy] = useState(false);
  const [poolRevision, setPoolRevision] = useState(0);
  const calendarToken = useMemo(() => ({ today, poolRevision }), [today, poolRevision]);
  const week = getWeekDays();
  const checked = new Set(checkedDays);
  const weekCount = week.filter((item) => checked.has(item.date)).length;

  useEffect(() => {
    let mounted = true;
    async function loadExtras() {
      try {
        const [dates, tonnage, visited] = await Promise.all([
          db.getAllAsync<{ date: string }>(
            'SELECT date FROM daily_entries WHERE checked_in = 1 AND date >= ? AND date <= ?',
            week[0].date, week[6].date
          ),
          loadTonnageTotals(db),
          hasPoolVisit(db),
        ]);
        if (mounted) {
          setCheckedDays(dates.map((row) => row.date));
          setWeekKg(tonnage.weekKg);
          setPoolMarked(visited);
        }
      } catch (cause) {
        // Основной экран и дневная анкета остаются доступны при ошибке дополнительной статистики.
        console.warn('Artivity dashboard extras:', cause);
      }
    }
    void loadExtras();
    return () => { mounted = false; };
  }, [db, today]);

  async function updatePool(remove: boolean) {
    if (poolBusy) return;
    setPoolBusy(true);
    try {
      if (remove) await removePoolVisit(db);
      else await markPoolVisit(db);
      setPoolMarked(!remove);
      setPoolRevision(revision => revision + 1);
    } catch (cause) {
      Alert.alert('Бассейн', cause instanceof Error ? cause.message : 'Не удалось сохранить отметку');
    } finally {
      setPoolBusy(false);
    }
  }

  function onPoolTap() {
    if (poolBusy) return;
    if (poolMarked) {
      Alert.alert('Бассейн', 'Убрать сегодняшнюю отметку посещения?', [
        { text: 'Нет', style: 'cancel' },
        { text: 'Убрать', style: 'destructive', onPress: () => { void updatePool(true); } },
      ]);
    } else {
      void updatePool(false);
    }
  }

  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Доброе утро!' : hour < 18 ? 'Добрый день!' : 'Добрый вечер!';
  const workouts = today?.workoutEntries ?? 0;

  return (
    <View style={styles.root}>
      <View style={styles.brandRow}>
        <View style={styles.logo}>
          <Ionicons name="fitness" color="#14C871" size={29} />
        </View>
        <Text style={[styles.brand, { color: t.text }]}>Artivity</Text>
        <View style={{ flex: 1 }} />
        <View style={[styles.datePill, { backgroundColor: t.card }]}>
          <Ionicons name="calendar-outline" color={t.primary} size={15} />
          <Text style={[styles.dateLabel, { color: t.muted }]}>
            {formatDate(dayKey(new Date()))}
          </Text>
        </View>
      </View>

      <View style={styles.greetingRow}>
        <Text style={[styles.greeting, { color: t.text }]}>{greeting}</Text>
        <View style={[styles.streakPill, { backgroundColor: dark ? '#42351D' : '#FFF2D9' }]}>
          <Ionicons name="flame" size={17} color="#EE9C27" />
          <Text style={[styles.streakText, { color: t.text }]}>{today?.currentStreak ?? 0} дн.</Text>
        </View>
      </View>
      <Text style={[styles.subtitle, { color: t.muted }]}>Маленькие шаги каждый день — большой результат.</Text>

      {loading && !today ? <ActivityIndicator color={t.primary} style={{ marginTop: 35 }} /> : null}

      {today ? (
        <>
          <LinearGradient colors={dark ? (['#1A3B39', '#1C2935'] as const) : (['#EDFFF5', '#FFFFFF', '#F5FCFF'] as const)}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.hero, { borderColor: t.border }]}
          >
            <View style={styles.heroTop}>
              <Text style={[styles.heroTitle, { color: t.text }]}>Твоя неделя</Text>
              <Text style={[styles.heroHint, { color: t.muted }]}>Ежедневные отметки</Text>
            </View>
            <View style={styles.heroMain}>
              <WeeklyProgressRing count={weekCount} dark={dark} size={146} />
              <View style={styles.heroDetails}>
                <View style={styles.heroDetail}>
                  <Ionicons name="barbell-outline" size={20} color="#13BE76" />
                  <Text style={[styles.heroValue, { color: t.text }]}>{formatTonnage(weekKg)}</Text>
                  <Text style={[styles.heroSmall, { color: t.muted }]}>тоннаж за неделю</Text>
                </View>
                <View style={[styles.line, { backgroundColor: t.border }]} />
                <View style={styles.heroDetail}>
                  <Ionicons name="checkmark-circle" size={20} color={today.checkedIn ? '#10C86C' : '#94A3B8'} />
                  <Text style={[styles.heroValue, { color: t.text }]}>{today.checkedIn ? 'Готово' : 'Не отмечен'}</Text>
                  <Text style={[styles.heroSmall, { color: t.muted }]}>сегодня</Text>
                </View>
              </View>
            </View>
            <Pressable accessibilityRole="button" onPress={onOpenForm} style={styles.cta}>
              <Ionicons name={today.checkedIn ? 'create-outline' : 'checkmark-circle-outline'} size={20} color="#FFFFFF" />
              <Text style={styles.ctaText}>{today.checkedIn ? 'Редактировать день' : 'Отметить день'}</Text>
            </Pressable>
          </LinearGradient>

          <View style={styles.statRow}>
            <Pressable
              onPress={onPoolTap}
              disabled={poolBusy}
              accessibilityRole="button"
              accessibilityLabel={poolMarked ? 'Посещение бассейна отмечено, нажмите для исправления' : 'Отметить посещение бассейна сегодня'}
              style={[styles.smallCard, { backgroundColor: dark ? '#213447' : '#E9F5FF' }]}
            >
              <Ionicons name={poolMarked ? 'checkmark-circle' : 'water-outline'} size={25} color="#2899D1" />
              <Text style={[styles.poolValue, { color: t.text }]}>{poolMarked ? '✓' : '+'}</Text>
              <Text style={[styles.statTitle, { color: t.text }]}>Бассейн</Text>
              <Text style={[styles.statHint, { color: t.muted }]}>{poolMarked ? 'Был сегодня' : 'Отметить поход'}</Text>
            </Pressable>
            <Pressable onPress={() => router.navigate('/workouts')} style={[styles.smallCard, { backgroundColor: dark ? '#302842' : '#F2EBFF' }]}>
              <Ionicons name="barbell" size={25} color="#9258E5" />
              <Text style={[styles.statValue, { color: t.text }]}>{workouts}</Text>
              <Text style={[styles.statTitle, { color: t.text }]}>Тренировки</Text>
              <Text style={[styles.statHint, { color: t.muted }]}>Записей сегодня</Text>
            </Pressable>
            <View style={[styles.smallCard, { backgroundColor: dark ? '#193A37' : '#E8F9F4' }]}>
              <Ionicons name="leaf-outline" size={25} color="#11AF87" />
              <Text style={[styles.statValue, { color: t.text }]}>{today.alcoholFreeDays}</Text>
              <Text style={[styles.statTitle, { color: t.text }]}>Без алкоголя</Text>
              <Text style={[styles.statHint, { color: t.muted }]}>{plural(today.alcoholFreeDays)}</Text>
            </View>
          </View>

          <HabitCalendar refreshToken={calendarToken} />
        </>
      ) : null}
      {error ? <Text style={{ color: '#EF5350', marginTop: 14 }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 19 },
  logo: { width: 40, height: 40, backgroundColor: '#E0FCEB', borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginRight: 9 },
  brand: { fontSize: 30, fontWeight: '900', letterSpacing: -1.2 },
  datePill: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateLabel: { fontSize: 11, fontWeight: '700' },
  greetingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 },
  greeting: { fontSize: 24, fontWeight: '900', letterSpacing: -0.6, flexShrink: 1 },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 13 },
  streakText: { fontWeight: '900', fontSize: 12 },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 20, lineHeight: 19 },
  hero: { borderWidth: 1, borderRadius: 24, padding: 17, ...softShadow },
  heroTop: { marginBottom: 8 },
  heroTitle: { fontSize: 19, fontWeight: '900' },
  heroHint: { fontSize: 12, marginTop: 3 },
  heroMain: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 10 },
  heroDetails: { flex: 1, paddingLeft: 9, gap: 10 },
  heroDetail: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  heroValue: { fontSize: 14, fontWeight: '800' },
  heroSmall: { width: '100%', paddingLeft: 26, fontSize: 11, marginTop: -4 },
  line: { height: 1, marginLeft: 26 },
  cta: { backgroundColor: '#13C875', borderRadius: 14, minHeight: 50, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontWeight: '800', color: '#FFFFFF', fontSize: 15 },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 13, marginBottom: 13 },
  smallCard: { flex: 1, minWidth: 0, borderRadius: 18, padding: 11, minHeight: 136 },
  statValue: { fontSize: 28, fontWeight: '900', marginTop: 9 },
  poolValue: { fontSize: 26, fontWeight: '900', marginTop: 5 },
  statTitle: { fontSize: 12, fontWeight: '800', marginTop: 1 },
  statHint: { fontSize: 10, marginTop: 4 },
  section: { borderRadius: 23, borderWidth: 1, padding: 15, marginBottom: 13, ...softShadow },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 15 },
  sectionIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  sectionSubtitle: { fontSize: 11, marginTop: 3 },
  more: { paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', gap: 4, alignItems: 'center', borderRadius: 15 },
  foodRow: { flexDirection: 'row', gap: 7 },
  foodTile: { flex: 1, borderRadius: 17, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 4 },
  foodTitle: { fontSize: 11, fontWeight: '700', textAlign: 'center', minHeight: 28, marginTop: 4 },
  caption: { fontSize: 10, lineHeight: 15, marginTop: 10, textAlign: 'center' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekCell: { flex: 1, alignItems: 'center', gap: 6 },
  weekBubble: { width: 31, height: 31, borderRadius: 11, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  weekLabel: { fontSize: 11, fontWeight: '700' },
});
