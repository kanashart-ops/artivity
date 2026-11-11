import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { artivityTheme, softShadow } from '@/components/artivity-theme';
import { FoodProgressRing } from '@/components/food-progress-ring';
import SwipeTabScreen from '@/components/swipe-tab-screen';
import {
  loadIntervalSnapshot,
  markConsumedToday,
  type IntervalCard,
  type IntervalSnapshot,
} from '@/database/intervals';

function dayWord(value: number): string {
  const n = value % 100;
  if (n >= 11 && n <= 14) return 'дней';
  const last = value % 10;
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
}

function itemStatus(item: IntervalCard): string {
  if (!item.history.length) return 'Ещё не отмечено';
  if (item.remainingDays === 0) return 'Можно снова';
  return `Осталось ${item.remainingDays} ${dayWord(item.remainingDays)}`;
}

export default function IntervalsScreen() {
  const db = useSQLiteContext();
  const dark = useColorScheme() === 'dark';
  const t = artivityTheme(dark);
  const [snapshot, setSnapshot] = useState<IntervalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setSnapshot(await loadIntervalSnapshot(db));
  }, [db]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    loadIntervalSnapshot(db)
      .then(data => {
        if (active) { setSnapshot(data); setError(''); }
      })
      .catch(e => {
        if (active) setError(e instanceof Error ? e.message : 'Не удалось загрузить интервалы');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db]));

  const record = useCallback(async (item: IntervalCard) => {
    if (busyId !== null || item.recordedToday) return;
    setBusyId(item.id);
    setError('');
    try {
      await markConsumedToday(db, item.id);
      await refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Не удалось сохранить запись';
      setError(message);
      Alert.alert('Ошибка', message);
    } finally {
      setBusyId(null);
    }
  }, [busyId, db, refresh]);

  function confirm(item: IntervalCard) {
    const description = item.remainingDays > 0
      ? `До окончания интервала ещё ${item.remainingDays} ${dayWord(item.remainingDays)}. Отметить употребление сегодня?`
      : 'Отметить употребление сегодня?';
    Alert.alert(item.name, description, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Отметить', onPress: () => { void record(item); } },
    ]);
  }

  return (
    <SwipeTabScreen>
      <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]} edges={['top', 'left', 'right']}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.brandRow}>
            <Ionicons name="restaurant-outline" color={t.primary} size={28} />
            <Text style={[styles.brand, { color: t.text }]}>Artivity</Text>
          </View>
          <Text style={[styles.title, { color: t.text }]}>Интервалы еды</Text>

          {loading && !snapshot ? <ActivityIndicator color={t.primary} style={styles.loader} /> : null}
          {snapshot ? (
            <>
              <View style={styles.items}>
                {snapshot.items.map(item => (
                  <View key={item.id} style={[styles.item, { backgroundColor: t.card, borderColor: t.border }]}>
                    <FoodProgressRing item={item} size={78} dark={dark} compact />
                    <View style={styles.itemBody}>
                      <Text style={[styles.name, { color: t.text }]} numberOfLines={2}>{item.name}</Text>
                      <Text style={[styles.status, { color: item.history.length && item.remainingDays === 0 ? '#14B879' : t.muted }]} numberOfLines={1}>
                        {itemStatus(item)}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Отметить: ${item.name}`}
                      disabled={item.recordedToday || busyId !== null}
                      onPress={() => confirm(item)}
                      style={[styles.markButton, {
                        backgroundColor: item.recordedToday ? (dark ? '#263B39' : '#E1F5EC') : '#12C873',
                        opacity: busyId !== null && busyId !== item.id ? 0.5 : 1,
                      }]}
                    >
                      <Ionicons name={item.recordedToday ? 'checkmark' : 'add'} size={19} color={item.recordedToday ? '#12A96E' : '#FFFFFF'} />
                      <Text style={[styles.markText, { color: item.recordedToday ? '#12A96E' : '#FFFFFF' }]}>
                        {item.recordedToday ? 'Есть' : 'Съел'}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>

              <View style={[styles.training, { backgroundColor: t.card, borderColor: t.border }]}>
                <View style={styles.trainingTitleRow}>
                  <Ionicons name="barbell-outline" size={23} color={t.primary} />
                  <Text style={[styles.trainingTitle, { color: t.text }]}>Влияние тренировок</Text>
                  <Text style={styles.level}>Ур. {snapshot.training.level}/4</Text>
                </View>
                <Text style={[styles.trainingNumbers, { color: t.muted }]}>
                  {snapshot.training.last7} дн. за неделю · {snapshot.training.last14} за 14 дней · {snapshot.training.last30} за 30 дней
                </Text>
              </View>
            </>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </SwipeTabScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brand: { fontSize: 24, fontWeight: '900' },
  title: { fontSize: 29, fontWeight: '900', marginTop: 15, marginBottom: 15 },
  loader: { paddingTop: 45 },
  items: { gap: 9 },
  item: {
    minHeight: 93,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...softShadow,
  },
  itemBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  status: { fontSize: 12, marginTop: 4 },
  markButton: { minWidth: 62, height: 42, paddingHorizontal: 7, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 1 },
  markText: { fontSize: 11, fontWeight: '800' },
  training: { borderRadius: 19, borderWidth: 1, marginTop: 17, padding: 16, ...softShadow },
  trainingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  trainingTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  level: { fontSize: 13, fontWeight: '900', color: '#12B874' },
  trainingNumbers: { fontSize: 12, marginTop: 9, lineHeight: 18 },
  error: { color: '#E04D50', fontSize: 13, marginTop: 12 },
});
