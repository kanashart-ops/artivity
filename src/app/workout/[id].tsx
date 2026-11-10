import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CATEGORY_LABELS,
  formatDate,
  getWorkout,
  listSessions,
  localDateString,
  saveSession,
  type Workout,
  type WorkoutSession,
  type WorkoutSet,
} from '@/database/workouts';

type SetDraft = { weight: string; reps: string };

function numericWeight(input: string): number | null {
  if (!input.trim()) return null;
  const value = Number(input.trim().replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) throw new Error('Проверь вес в подходах');
  return value;
}

function numericReps(input: string): number | null {
  if (!input.trim()) return null;
  const value = Number(input.trim());
  if (!Number.isInteger(value) || value < 0) throw new Error('Повторения должны быть целым числом');
  return value;
}

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workoutId = Number(id);
  const db = useSQLiteContext();
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const background = dark ? '#101720' : '#F7F9FB';
  const foreground = dark ? '#FFFFFF' : '#17212D';
  const muted = dark ? '#A0ACBA' : '#738294';
  const card = dark ? '#1B2633' : '#FFFFFF';
  const inputBorder = dark ? '#415064' : '#D9E1E7';

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [history, setHistory] = useState<WorkoutSession[]>([]);
  const [draft, setDraft] = useState<SetDraft[]>([{ weight: '', reps: '' }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(workoutId) || workoutId <= 0) return;
    try {
      const [found, sessions] = await Promise.all([
        getWorkout(db, workoutId),
        listSessions(db, workoutId),
      ]);
      setWorkout(found);
      setHistory(sessions);
      // Подставляем последний результат, чтобы повторить занятие быстро.
      if (sessions.length && sessions[0].sets.length) {
        setDraft(sessions[0].sets.map((set) => ({
          weight: set.weight_kg === null ? '' : String(set.weight_kg),
          reps: set.reps === null ? '' : String(set.reps),
        })));
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить историю тренировок');
    } finally {
      setLoading(false);
    }
  }, [db, workoutId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function changeSet(index: number, key: keyof SetDraft, value: string) {
    setDraft((previous) => previous.map((set, i) => i === index ? { ...set, [key]: value } : set));
  }

  async function save() {
    if (saving || !workout) return;
    try {
      const sets: WorkoutSet[] = draft.map((set) => ({
        weight_kg: numericWeight(set.weight),
        reps: numericReps(set.reps),
      })).filter((set) => set.weight_kg !== null || set.reps !== null);

      if (!sets.length) {
        Alert.alert('Нет подходов', 'Укажи вес или повторения хотя бы в одном подходе');
        return;
      }
      setSaving(true);
      await saveSession(db, workoutId, localDateString(), sets);
      const sessions = await listSessions(db, workoutId);
      setHistory(sessions);
      Alert.alert('Сохранено', 'Тренировка добавлена в историю');
    } catch (error) {
      Alert.alert('Не удалось сохранить', error instanceof Error ? error.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Назад">
          <Ionicons name="arrow-back" size={25} color={foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: foreground }]}>Тренировка</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 50 }} color="#22A788" />
      ) : !workout ? (
        <Text style={[styles.muted, { color: muted }]}>Тренировка не найдена</Text>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={[styles.name, { color: foreground }]}>{workout.name}</Text>
            <Text style={[styles.category, { color: muted }]}>{CATEGORY_LABELS[workout.category]}</Text>

            <View style={[styles.card, { backgroundColor: card }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: foreground }]}>Запись за сегодня</Text>
                <Text style={[styles.date, { color: muted }]}>{formatDate(localDateString())}</Text>
              </View>
              <Text style={[styles.hint, { color: muted }]}>Вес и повторения можно указать для каждого подхода. Ненужное поле оставь пустым.</Text>

              <View style={styles.tableHead}>
                <Text style={[styles.numColumn, { color: muted }]}>№</Text>
                <Text style={[styles.columnTitle, { color: muted }]}>Вес, кг</Text>
                <Text style={[styles.columnTitle, { color: muted }]}>Повторы</Text>
                <View style={{ width: 32 }} />
              </View>

              {draft.map((set, index) => (
                <View key={index} style={styles.setRow}>
                  <Text style={[styles.numColumn, { color: foreground }]}>{index + 1}</Text>
                  <TextInput
                    value={set.weight}
                    onChangeText={(value) => changeSet(index, 'weight', value)}
                    placeholder="—"
                    placeholderTextColor={muted}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    style={[styles.setInput, { color: foreground, borderColor: inputBorder }]}
                  />
                  <TextInput
                    value={set.reps}
                    onChangeText={(value) => changeSet(index, 'reps', value)}
                    placeholder="—"
                    placeholderTextColor={muted}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    style={[styles.setInput, { color: foreground, borderColor: inputBorder }]}
                  />
                  <Pressable accessibilityLabel="Убрать подход" onPress={() => setDraft((old) => old.length > 1 ? old.filter((_, i) => i !== index) : [{ weight: '', reps: '' }])} style={styles.removeButton}>
                    <Ionicons name="close-circle-outline" size={23} color={muted} />
                  </Pressable>
                </View>
              ))}

              <Pressable onPress={() => setDraft((old) => [...old, { weight: old[old.length - 1]?.weight ?? '', reps: old[old.length - 1]?.reps ?? '' }])} style={styles.addSet}>
                <Ionicons name="add-circle-outline" size={20} color="#22A788" />
                <Text style={styles.addSetText}>Добавить подход</Text>
              </Pressable>

              <Pressable onPress={() => void save()} disabled={saving} style={[styles.save, saving && { opacity: 0.5 }]}>
                <Text style={styles.saveText}>{saving ? 'Сохранение...' : 'Сохранить тренировку'}</Text>
              </Pressable>
            </View>

            <Text style={[styles.historyTitle, { color: foreground }]}>История ({history.length})</Text>
            {history.length === 0 ? (
              <Text style={[styles.hint, { color: muted, marginBottom: 32 }]}>Здесь появятся даты, подходы и веса после первой записи.</Text>
            ) : history.map((session) => (
              <View key={session.id} style={[styles.historyCard, { backgroundColor: card }]}>
                <Text style={[styles.historyDate, { color: foreground }]}>{formatDate(session.performed_on)}</Text>
                {session.sets.map((set, i) => (
                  <Text key={i} style={[styles.historySet, { color: muted }]}>
                    {i + 1}. {set.weight_kg === null ? 'Без веса' : `${set.weight_kg} кг`}
                    {set.reps === null ? '' : ` × ${set.reps}`}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { padding: 9 },
  topTitle: { fontSize: 18, fontWeight: '700' },
  content: { paddingHorizontal: 18, paddingBottom: 40 },
  name: { fontSize: 27, fontWeight: '800', marginTop: 8 },
  category: { marginTop: 6, marginBottom: 24, fontSize: 14 },
  card: { borderRadius: 18, padding: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  date: { fontSize: 12 },
  hint: { fontSize: 13, lineHeight: 19, marginTop: 12, marginBottom: 18 },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7 },
  numColumn: { width: 26, textAlign: 'center', fontSize: 13 },
  columnTitle: { flex: 1, textAlign: 'center', fontSize: 12 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  setInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 8, fontSize: 16, textAlign: 'center', minWidth: 0 },
  removeButton: { width: 32, alignItems: 'center', justifyContent: 'center' },
  addSet: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 13 },
  addSetText: { color: '#22A788', fontWeight: '700', fontSize: 14 },
  save: { marginTop: 8, backgroundColor: '#22A788', paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  historyTitle: { fontSize: 21, fontWeight: '800', marginTop: 28, marginBottom: 14 },
  historyCard: { borderRadius: 15, padding: 16, marginBottom: 10 },
  historyDate: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  historySet: { fontSize: 14, marginBottom: 5 },
  muted: { textAlign: 'center', marginTop: 40 },
});
