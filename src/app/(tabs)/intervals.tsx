import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { artivityTheme, softShadow } from '@/components/artivity-theme';
import { FoodProgressRing } from '@/components/food-progress-ring';
import SwipeTabScreen from '@/components/swipe-tab-screen';
import {
  addCustomInterval, loadIntervalSnapshot, markConsumedToday,
  type IntervalCard, type IntervalSnapshot,
} from '@/database/intervals';

function daysLabel(value: number): string {
  const n = value % 100;
  if (n >= 11 && n <= 14) return 'дней';
  const last = value % 10;
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
}
function statusFor(item: IntervalCard): string {
  if (item.recordedToday) return 'Отмечено сегодня';
  if (!item.history.length) return 'Ещё не отмечалось';
  return item.remainingDays === 0 ? 'Можно снова' : `Осталось ${item.remainingDays} ${daysLabel(item.remainingDays)}`;
}

export default function IntervalsScreen() {
  const db = useSQLiteContext();
  const dark = useColorScheme() === 'dark';
  const t = artivityTheme(dark);
  const [snapshot, setSnapshot] = useState<IntervalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [interval, setInterval] = useState('14');
  const [activityImpact, setActivityImpact] = useState('2');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const data = await loadIntervalSnapshot(db);
    setSnapshot(data);
    setError('');
  }, [db]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    loadIntervalSnapshot(db)
      .then(data => { if (active) { setSnapshot(data); setError(''); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Ошибка загрузки'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db]));

  const record = useCallback(async (item: IntervalCard) => {
    if (busyId !== null || item.recordedToday) return;
    setBusyId(item.id);
    try {
      await markConsumedToday(db, item.id);
      await refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Не удалось отметить употребление';
      setError(message);
      Alert.alert('Ошибка', message);
    } finally { setBusyId(null); }
  }, [busyId, db, refresh]);

  function confirm(item: IntervalCard) {
    if (item.recordedToday) {
      Alert.alert(item.name, 'Употребление уже отмечено сегодня.');
      return;
    }
    const early = item.history.length > 0 && item.remainingDays > 0;
    const message = early
      ? `Интервал ещё не закончился (${item.remainingDays} ${daysLabel(item.remainingDays)}). Ты действительно ел этот продукт сегодня?`
      : 'Ты действительно употреблял этот продукт сегодня?';
    Alert.alert(item.name, message, [
      { text: 'Нет', style: 'cancel' },
      { text: 'Да, отметить', onPress: () => { void record(item); } },
    ]);
  }

  function startAdding() {
    setName('');
    setInterval('14');
    setActivityImpact('2');
    setAdding(true);
  }

  async function saveNew() {
    if (savingNew) return;
    const days = Number(interval.trim());
    const impact = Number(activityImpact.trim());
    if (!interval.trim() || !activityImpact.trim()) {
      Alert.alert('Заполни поля', 'Укажи интервал и влияние активности в днях.');
      return;
    }
    setSavingNew(true);
    try {
      await addCustomInterval(db, name, days, impact);
      await refresh();
      setAdding(false);
    } catch (cause) {
      Alert.alert('Не удалось добавить', cause instanceof Error ? cause.message : 'Ошибка сохранения');
    } finally { setSavingNew(false); }
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
          <View style={styles.headingRow}>
            <Text style={[styles.title, { color: t.text }]}>Интервалы еды</Text>
            <Pressable
              onPress={startAdding}
              accessibilityLabel="Добавить таймер продукта"
              accessibilityRole="button"
              hitSlop={10}
              style={styles.plusButton}
            >
              <Ionicons name="add" size={28} color="#FFFFFF" />
            </Pressable>
          </View>
          {loading && !snapshot ? <ActivityIndicator color={t.primary} style={styles.loader} /> : null}
          {snapshot ? (
            <>
              <View style={styles.grid}>
                {snapshot.items.map(item => (
                  <View key={item.id} style={[styles.tile, { backgroundColor: t.card, borderColor: t.border }]}>
                    <Pressable
                      onPress={() => confirm(item)}
                      disabled={busyId !== null}
                      accessibilityRole="button"
                      accessibilityLabel={`Отметить употребление: ${item.name}`}
                      accessibilityHint="Открывает подтверждение Да или Нет"
                      style={styles.ringButton}
                    >
                      <FoodProgressRing item={item} size={91} dark={dark} compact />
                    </Pressable>
                    <Text style={[styles.itemName, { color: t.text }]} numberOfLines={2}>{item.name}</Text>
                    <Text style={[styles.itemStatus, { color: item.history.length && item.remainingDays === 0 ? '#13B879' : t.muted }]} numberOfLines={1}>
                      {statusFor(item)}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={[styles.training, { backgroundColor: t.card, borderColor: t.border }]}>
                <View style={styles.trainingTitleRow}>
                  <Ionicons name="fitness-outline" size={23} color={t.primary} />
                  <Text style={[styles.trainingTitle, { color: t.text }]}>Влияние активности</Text>
                  <Text style={styles.level}>Ур. {snapshot.training.level}/4</Text>
                </View>
                <Text style={[styles.trainingNumbers, { color: t.muted }]}>
                  Тренировки: {snapshot.training.last7} за 7 дней · {snapshot.training.last14} за 14 дней
                </Text>
                <Text style={[styles.trainingNumbers, { color: t.muted }]}>
                  Бассейн: {snapshot.pool.last7} за 7 дней · {snapshot.pool.last14} за 14 дней
                </Text>
                <Text style={[styles.trainingNote, { color: t.muted }]}>
                  {snapshot.pool.bonusDays > 0
                    ? 'Регулярное плавание учитывается при новом запуске интервалов.'
                    : 'Бонус бассейна — начиная с 2 посещений за 7 дней.'}
                </Text>
              </View>
            </>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => {
  if (!savingNew) {
    setAdding(false);
  }
}}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.modalOuter} keyboardShouldPersistTaps="handled">
            <View style={[styles.modalBody, { backgroundColor: t.card }]}>
              <View style={styles.modalHead}>
                <Text style={[styles.modalTitle, { color: t.text }]}>Новый таймер</Text>
                <Pressable onPress={() => !savingNew && setAdding(false)} accessibilityLabel="Закрыть">
                  <Ionicons name="close" size={24} color={t.muted} />
                </Pressable>
              </View>
              <Text style={[styles.label, { color: t.text }]}>Название продукта</Text>
              <TextInput
                value={name} onChangeText={setName} maxLength={60}
                placeholder="Например, чипсы" placeholderTextColor={t.muted}
                style={[styles.input, { color: t.text, borderColor: t.border }]}
              />
              <Text style={[styles.label, { color: t.text }]}>Основной интервал, дней</Text>
              <TextInput
                value={interval} onChangeText={setInterval} keyboardType="number-pad"
                placeholder="14" placeholderTextColor={t.muted}
                style={[styles.input, { color: t.text, borderColor: t.border }]}
              />
              <Text style={[styles.label, { color: t.text }]}>Влияние активности, ± дней</Text>
              <TextInput
                value={activityImpact} onChangeText={setActivityImpact} keyboardType="number-pad"
                placeholder="2" placeholderTextColor={t.muted}
                style={[styles.input, { color: t.text, borderColor: t.border }]}
              />
              <Text style={[styles.explanation, { color: t.muted }]}>
                От 0 до 14 дней, не больше интервала минус один. При регулярной активности
                интервал сокращается, без неё — увеличивается на выбранное число дней.
                Один поход в бассейн скидку не даёт. Расчёт применяется к новой отметке еды,
                уже начатые таймеры не меняются.
              </Text>
              <View style={styles.modalActions}>
                <Pressable onPress={() => setAdding(false)} disabled={savingNew} style={[styles.cancel, { borderColor: t.border }]}>
                  <Text style={[styles.cancelText, { color: t.text }]}>Отмена</Text>
                </Pressable>
                <Pressable onPress={() => void saveNew()} disabled={savingNew} style={[styles.create, savingNew && { opacity: 0.5 }]}>
                  <Text style={styles.createText}>{savingNew ? 'Сохраняем…' : 'Добавить'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SwipeTabScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brand: { fontSize: 24, fontWeight: '900' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, marginBottom: 14 },
  title: { fontSize: 27, fontWeight: '900' },
  plusButton: { height: 40, width: 40, backgroundColor: '#12C873', borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  loader: { paddingTop: 45 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  tile: { width: '48%', alignItems: 'center', borderWidth: 1, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 5, minHeight: 156, ...softShadow },
  ringButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 50 },
  itemName: { fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center', marginTop: 6, minHeight: 31 },
  itemStatus: { fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  training: { borderRadius: 19, borderWidth: 1, marginTop: 18, padding: 16, ...softShadow },
  trainingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  trainingTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  level: { fontSize: 13, fontWeight: '900', color: '#12B874' },
  trainingNumbers: { fontSize: 12, marginTop: 9, lineHeight: 18 },
  trainingNote: { fontSize: 11, marginTop: 8, lineHeight: 17 },
  error: { color: '#E04D50', fontSize: 13, marginTop: 12 },
  overlay: { flex: 1, justifyContent: 'center', backgroundColor: '#00000099' },
  modalOuter: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  modalBody: { padding: 20, borderRadius: 22 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 22, fontWeight: '900' },
  label: { fontSize: 13, fontWeight: '800', marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 15, fontSize: 16 },
  explanation: { fontSize: 12, lineHeight: 18, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 10 },
  cancel: { flex: 1, borderWidth: 1, borderRadius: 12, alignItems: 'center', paddingVertical: 13 },
  cancelText: { fontWeight: '800' },
  create: { flex: 1, backgroundColor: '#12C873', borderRadius: 12, alignItems: 'center', paddingVertical: 13 },
  createText: { color: '#FFFFFF', fontWeight: '900' },
});
