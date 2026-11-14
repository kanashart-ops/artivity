import Ionicons from '@expo/vector-icons/Ionicons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { loadCalendarMonth, type CalendarDay } from '@/database/calendar';
import { artivityTheme, softShadow } from './artivity-theme';

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

type Props = {
  /** New daily snapshot triggers a refresh after editing the day or returning to Home. */
  refreshToken?: unknown;
};

type CalendarCell = {
  date: string;
  day: number;
} | null;

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getCalendarCells(year: number, month: number): CalendarCell[] {
  const pad = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = Array.from({ length: pad }, () => null);
  for (let day = 1; day <= count; day++) {
    cells.push({ date: dateKey(year, month, day), day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function kindIcon(kind: string): string {
  if (kind === 'strength') return '🏋️';
  if (kind === 'cardio') return '🏃';
  return '💪';
}

function foodIcon(name: string): string {
  const s = name.toLocaleLowerCase('ru-RU');
  if (s.includes('пицц')) return '🍕';
  if (s.includes('шаурм')) return '🌯';
  if (s.includes('бургер')) return '🍔';
  if (s.includes('mcdonald') || s.includes('фастфуд')) return '🍟';
  if (s.includes('снек') || s.includes('десерт') || s.includes('выпеч')) return '🍩';
  return '🍽️';
}

/** An icon is shown once per activity type; the details show every event. */
function dayIcons(entry?: CalendarDay): string[] {
  if (!entry) return [];
  const icons = new Set<string>();
  if (entry.pool) icons.add('🏊');
  for (const workout of entry.workouts) icons.add(kindIcon(workout.category));
  if (entry.manualWorkout && !entry.workouts.length) icons.add('🏋️');
  for (const food of entry.foods) icons.add(foodIcon(food));
  if (entry.lightDay) icons.add('🥗');
  if (entry.alcohol) icons.add('🍷');
  return [...icons];
}

const workoutNames: Record<string, string> = {
  strength: 'Силовая', cardio: 'Кардио', home: 'Домашняя',
};

export default function HabitCalendar({ refreshToken }: Props) {
  const db = useSQLiteContext();
  const dark = useColorScheme() === 'dark';
  const theme = artivityTheme(dark);
  const [month, setMonth] = useState(() => ({
    year: new Date().getFullYear(),
    index: new Date().getMonth(),
  }));
  const [selected, setSelected] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, CalendarDay>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cells = useMemo(
    () => getCalendarCells(month.year, month.index),
    [month.year, month.index]
  );
  const monthLabel = useMemo(() =>
    new Date(month.year, month.index, 1)
      .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
    [month.year, month.index]
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadCalendarMonth(db, month.year, month.index)
      .then((data) => {
        if (!mounted) return;
        setRecords(data);
        setError('');
      })
      .catch(() => {
        if (mounted) setError('Не удалось загрузить календарь.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [db, month.year, month.index, refreshToken]);

  function changeMonth(direction: number) {
    setMonth(current => {
      const next = new Date(current.year, current.index + direction, 1);
      return { year: next.getFullYear(), index: next.getMonth() };
    });
    setSelected(null);
  }

  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const activeDay = selected ? records[selected] : undefined;

  return (
    <View style={[styles.card, {
      backgroundColor: theme.card,
      borderColor: theme.border,
    }]}>
      <View style={styles.heading}>
        <View style={[styles.iconBox, { backgroundColor: dark ? '#244537' : '#E5FBEF' }]}>
          <Ionicons name="calendar-clear-outline" color="#10BF74" size={21} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Календарь привычек</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>Твои события по дням</Text>
        </View>
      </View>

      <View style={styles.monthRow}>
        <Pressable
          onPress={() => changeMonth(-1)}
          accessibilityLabel="Предыдущий месяц"
          hitSlop={10}
          style={[styles.arrow, { backgroundColor: dark ? '#263844' : '#F0F5F7' }]}
        >
          <Ionicons name="chevron-back" size={21} color={theme.text} />
        </Pressable>
        <Text style={[styles.month, { color: theme.text }]}>{monthLabel}</Text>
        <Pressable
          onPress={() => changeMonth(1)}
          accessibilityLabel="Следующий месяц"
          hitSlop={10}
          style={[styles.arrow, { backgroundColor: dark ? '#263844' : '#F0F5F7' }]}
        >
          <Ionicons name="chevron-forward" size={21} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        {WEEK_DAYS.map(label => (
          <View key={label} style={styles.weekday}>
            <Text style={[styles.weekdayText, { color: theme.muted }]}>{label}</Text>
          </View>
        ))}
        {cells.map((cell, index) => {
          if (!cell) return <View key={`empty-${index}`} style={styles.cellWrap} />;
          const info = records[cell.date];
          const icons = dayIcons(info);
          const chosen = selected === cell.date;
          const isToday = todayKey === cell.date;
          const hasCheck = info?.checkedIn ?? false;
          const shown = icons.slice(0, 2).join(' ');
          return (
            <View key={cell.date} style={styles.cellWrap}>
              <Pressable
                onPress={() => setSelected(chosen ? null : cell.date)}
                accessibilityRole="button"
                accessibilityLabel={`${cell.day} ${monthLabel}${hasCheck ? ', день отмечен' : ''}, событий: ${icons.length}`}
                style={[
                  styles.day,
                  { backgroundColor: chosen ? (dark ? '#1C5442' : '#DDF9E9')
                      : hasCheck ? (dark ? '#213D36' : '#F0FFF6')
                      : dark ? '#202C37' : '#F8FAFC',
                    borderColor: chosen ? '#11C779' : isToday ? '#89DDB4' : 'transparent',
                  },
                ]}
              >
                <View style={styles.numberRow}>
                  <Text style={[styles.dayNumber, { color: theme.text },
                    isToday && { color: '#0BBD70', fontWeight: '900' }]}>
                    {cell.day}
                  </Text>
                  {hasCheck ? <View style={styles.checkDot} /> : null}
                </View>
                <Text style={styles.emojis} numberOfLines={1}>
                  {shown}
                </Text>
                {icons.length > 2 ? <Text style={[styles.extra, { color: theme.muted }]}>+{icons.length - 2}</Text> : null}
              </Pressable>
            </View>
          );
        })}
      </View>

      {loading ? <ActivityIndicator style={styles.loader} color="#13C875" /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {selected ? (
        <View style={[styles.details, { backgroundColor: dark ? '#25343B' : '#F5FAF7' }]}>
          <View style={styles.detailsHeader}>
            <Text style={[styles.detailsTitle, { color: theme.text }]}>
              {new Date(Number(selected.slice(0, 4)), Number(selected.slice(5, 7)) - 1, Number(selected.slice(8, 10)))
                .toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            <Pressable onPress={() => setSelected(null)} accessibilityLabel="Закрыть события">
              <Ionicons name="close-circle-outline" size={22} color={theme.muted} />
            </Pressable>
          </View>
          {!activeDay ? (
            <Text style={[styles.detailText, { color: theme.muted }]}>За этот день записей пока нет.</Text>
          ) : (
            <View style={styles.detailList}>
              {activeDay.checkedIn ? (
                <Text style={[styles.detailText, { color: theme.text }]}>✓ День отмечен</Text>
              ) : null}
              {activeDay.workouts.map((workout, index) => (
                <Text key={`workout-${index}`} style={[styles.detailText, { color: theme.text }]}>
                  {kindIcon(workout.category)} {workoutNames[workout.category] ?? 'Тренировка'}: {workout.name}
                </Text>
              ))}
              {activeDay.manualWorkout && activeDay.workouts.length === 0 ? (
                <Text style={[styles.detailText, { color: theme.text }]}>🏋️ Тренировка отмечена в анкете</Text>
              ) : null}
              {activeDay.foods.map((food, index) => (
                <Text key={`food-${index}`} style={[styles.detailText, { color: theme.text }]}>
                  {foodIcon(food)} Ограниченная еда: {food}
                </Text>
              ))}
              {activeDay.lightDay ? (
                <Text style={[styles.detailText, { color: theme.text }]}>🥗 Разгрузочный день</Text>
              ) : null}
              {activeDay.pool ? (
                <Text style={[styles.detailText, { color: theme.text }]}>🏊 Посещение бассейна</Text>
              ) : null}
              {activeDay.alcohol ? (
                <Text style={[styles.detailText, { color: theme.text }]}>🍷 Отмечен алкоголь</Text>
              ) : null}
            </View>
          )}
        </View>
      ) : (
        <Text style={[styles.helper, { color: theme.muted }]}>Нажми на дату, чтобы посмотреть события.</Text>
      )}
      <View style={styles.legend}>
        <View style={styles.legendPair}>
          <View style={styles.legendDot} />
          <Text style={[styles.legendText, { color: theme.muted }]}>день отмечен</Text>
        </View>
        <Text style={[styles.legendText, { color: theme.muted }]}>🏋️ тренировка · 🏊 бассейн · 🍕 еда</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 23, borderWidth: 1, padding: 15, marginBottom: 15, ...softShadow },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconBox: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '900' },
  subtitle: { fontSize: 11, marginTop: 3 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 12 },
  arrow: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  month: { fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', alignItems: 'center', paddingBottom: 7 },
  weekdayText: { fontSize: 11, fontWeight: '800' },
  cellWrap: { width: '14.2857%', padding: 2 },
  day: { height: 63, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 2, paddingTop: 5, alignItems: 'center' },
  numberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayNumber: { fontSize: 12, fontWeight: '800' },
  checkDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#12C875' },
  emojis: { fontSize: 12, lineHeight: 18, marginTop: 3, textAlign: 'center' },
  extra: { fontSize: 9, fontWeight: '800', marginTop: 0 },
  loader: { paddingVertical: 7 },
  error: { marginTop: 9, fontSize: 12, color: '#E04D50' },
  details: { padding: 12, borderRadius: 14, marginTop: 12 },
  detailsHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' },
  detailsTitle: { fontSize: 14, fontWeight: '800', flex: 1, textTransform: 'capitalize' },
  detailList: { gap: 6, marginTop: 9 },
  detailText: { fontSize: 13, lineHeight: 19 },
  helper: { fontSize: 11, marginTop: 12, textAlign: 'center' },
  legend: { marginTop: 13, flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center' },
  legendPair: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#12C875' },
  legendText: { fontSize: 10 },
});
