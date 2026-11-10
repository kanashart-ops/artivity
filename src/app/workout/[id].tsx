import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CATEGORY_LABELS,
  deleteSession,
  deleteWorkout,
  formatDate,
  getWorkout,
  listSessions,
  localDateString,
  saveSession,
  updateSession,
  updateWorkout,
  type Workout,
  type WorkoutCategory,
  type WorkoutSession,
  type WorkoutSet,
} from '@/database/workouts';

type SetDraft = { weight: string; reps: string };
const CATEGORIES: WorkoutCategory[] = ['strength', 'cardio', 'home'];
const PRIMARY = '#22A788';

function setsToDraft(sets: WorkoutSet[]): SetDraft[] {
  return sets.length
    ? sets.map((s) => ({
        weight: s.weight_kg === null ? '' : String(s.weight_kg),
        reps: s.reps === null ? '' : String(s.reps),
      }))
    : [{ weight: '', reps: '' }];
}

function numericWeight(input: string): number | null {
  if (!input.trim()) return null;
  const value = Number(input.trim().replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) throw new Error('Проверь вес в подходах');
  return value;
}

function numericReps(input: string): number | null {
  if (!input.trim()) return null;
  const value = Number(input.trim());
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Повторения должны быть целым числом');
  }
  return value;
}

function dateFromInput(input: string): string {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(input.trim());
  if (!match) throw new Error('Введи дату в формате ДД.ММ.ГГГГ');
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const actual = new Date(year, month - 1, day);
  if (
    actual.getFullYear() !== year ||
    actual.getMonth() !== month - 1 ||
    actual.getDate() !== day
  ) {
    throw new Error('Такой даты не существует');
  }
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (iso > localDateString()) throw new Error('Нельзя записать тренировку на будущую дату');
  return iso;
}

function yesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return formatDate(localDateString(date));
}

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workoutId = Number(id);
  const db = useSQLiteContext();
  const router = useRouter();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const dark = useColorScheme() === 'dark';
  const background = dark ? '#101720' : '#F7F9FB';
  const foreground = dark ? '#FFFFFF' : '#17212D';
  const muted = dark ? '#A0ACBA' : '#738294';
  const card = dark ? '#1B2633' : '#FFFFFF';
  const inputBorder = dark ? '#415064' : '#D9E1E7';

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [history, setHistory] = useState<WorkoutSession[]>([]);
  const [draft, setDraft] = useState<SetDraft[]>([{ weight: '', reps: '' }]);
  const [dateInput, setDateInput] = useState(formatDate(localDateString()));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<WorkoutCategory>('strength');

  const load = useCallback(async () => {
    if (!Number.isInteger(workoutId) || workoutId <= 0) {
      setLoading(false);
      return;
    }
    try {
      const [found, sessions] = await Promise.all([
        getWorkout(db, workoutId),
        listSessions(db, workoutId),
      ]);
      setWorkout(found);
      setHistory(sessions);
      setEditingId(null);
      setDateInput(formatDate(localDateString()));
      setDraft(setsToDraft(sessions[0]?.sets ?? []));
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить тренировки');
    } finally {
      setLoading(false);
    }
  }, [db, workoutId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function setField(index: number, key: keyof SetDraft, value: string) {
    setDraft((prev) => prev.map((s, i) => i === index ? { ...s, [key]: value } : s));
  }

  function beginNew(sets?: WorkoutSet[]) {
    setEditingId(null);
    setDateInput(formatDate(localDateString()));
    setDraft(setsToDraft(sets ?? history[0]?.sets ?? []));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function beginEdit(session: WorkoutSession) {
    setEditingId(session.id);
    setDateInput(formatDate(session.performed_on));
    setDraft(setsToDraft(session.sets));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  async function save() {
    if (saving || !workout) return;
    try {
      const date = dateFromInput(dateInput);
      const sets: WorkoutSet[] = draft.map((s) => ({
        weight_kg: numericWeight(s.weight),
        reps: numericReps(s.reps),
      })).filter((s) => s.weight_kg !== null || s.reps !== null);

      if (!sets.length) {
        Alert.alert('Нет подходов', 'Укажи вес или повторения хотя бы в одном подходе');
        return;
      }

      setSaving(true);
      if (editingId !== null) {
        await updateSession(db, editingId, date, sets);
      } else {
        await saveSession(db, workoutId, date, sets);
      }
      const sessions = await listSessions(db, workoutId);
      setHistory(sessions);
      setEditingId(null);
      setDateInput(formatDate(localDateString()));
      setDraft(setsToDraft(sets));
      Alert.alert('Сохранено', 'Запись сохранена на телефоне');
    } catch (error) {
      Alert.alert('Ошибка сохранения', error instanceof Error ? error.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteSession(session: WorkoutSession) {
    Alert.alert(
      'Удалить запись?',
      `Тренировка за ${formatDate(session.performed_on)} будет удалена.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteSession(db, session.id);
                const sessions = await listSessions(db, workoutId);
                setHistory(sessions);
                if (editingId === session.id) {
                  setEditingId(null);
                  setDateInput(formatDate(localDateString()));
                  setDraft(setsToDraft(sessions[0]?.sets ?? []));
                }
              } catch {
                Alert.alert('Ошибка', 'Не удалось удалить запись');
              }
            })();
          },
        },
      ]
    );
  }

  function openEditWorkout() {
    if (!workout) return;
    setNameInput(workout.name);
    setCategoryInput(workout.category);
    setEditModal(true);
  }

  async function saveWorkoutInfo() {
    if (!workout || saving) return;
    setSaving(true);
    try {
      await updateWorkout(db, workoutId, nameInput, categoryInput);
      setWorkout(await getWorkout(db, workoutId));
      setEditModal(false);
    } catch (error) {
      Alert.alert('Не удалось изменить', error instanceof Error ? error.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteWorkout() {
    if (!workout) return;
    Alert.alert(
      'Удалить тренировку целиком?',
      `«${workout.name}» и вся история её подходов будут удалены без возможности восстановления.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить всё',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteWorkout(db, workoutId);
                setEditModal(false);
                router.replace('/workouts');
              } catch {
                Alert.alert('Ошибка', 'Не удалось удалить тренировку');
              }
            })();
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.topButton} accessibilityLabel="Назад">
          <Ionicons name="arrow-back" size={24} color={foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: foreground }]}>Тренировка</Text>
        <Pressable onPress={openEditWorkout} style={styles.topButton} accessibilityLabel="Изменить название и тип">
          <Ionicons name="create-outline" size={23} color={foreground} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 50 }} color={PRIMARY} />
      ) : !workout ? (
        <Text style={[styles.centerMessage, { color: muted }]}>Тренировка не найдена</Text>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={[styles.workoutName, { color: foreground }]}>{workout.name}</Text>
            <Text style={[styles.category, { color: muted }]}>{CATEGORY_LABELS[workout.category]}</Text>

            <View style={[styles.card, { backgroundColor: card }]}>
              <Text style={[styles.sectionTitle, { color: foreground }]}>
                {editingId === null ? 'Новая запись' : 'Изменение записи'}
              </Text>
              <View style={styles.dateRow}>
                <Text style={[styles.label, { color: muted }]}>Дата занятия</Text>
                <View style={styles.quickDates}>
                  <Pressable onPress={() => setDateInput(formatDate(localDateString()))} style={styles.dateChip}>
                    <Text style={styles.dateChipText}>Сегодня</Text>
                  </Pressable>
                  <Pressable onPress={() => setDateInput(yesterday())} style={styles.dateChip}>
                    <Text style={styles.dateChipText}>Вчера</Text>
                  </Pressable>
                </View>
              </View>
              <TextInput
                value={dateInput}
                onChangeText={setDateInput}
                placeholder="ДД.ММ.ГГГГ"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                placeholderTextColor={muted}
                style={[styles.dateInput, { color: foreground, borderColor: inputBorder }]}
              />
              <Text style={[styles.hint, { color: muted }]}>
                Для каждого подхода введи вес и/или количество повторений.
              </Text>
              <View style={styles.tableHead}>
                <Text style={[styles.numColumn, { color: muted }]}>№</Text>
                <Text style={[styles.columnTitle, { color: muted }]}>Вес, кг</Text>
                <Text style={[styles.columnTitle, { color: muted }]}>Повторы</Text>
                <View style={{ width: 32 }} />
              </View>

              {draft.map((s, index) => (
                <View key={index} style={styles.setRow}>
                  <Text style={[styles.numColumn, { color: foreground }]}>{index + 1}</Text>
                  <TextInput
                    value={s.weight}
                    onChangeText={(value) => setField(index, 'weight', value)}
                    placeholder="—"
                    placeholderTextColor={muted}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    style={[styles.setInput, { color: foreground, borderColor: inputBorder }]}
                  />
                  <TextInput
                    value={s.reps}
                    onChangeText={(value) => setField(index, 'reps', value)}
                    placeholder="—"
                    placeholderTextColor={muted}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    style={[styles.setInput, { color: foreground, borderColor: inputBorder }]}
                  />
                  <Pressable
                    accessibilityLabel="Убрать подход"
                    onPress={() => setDraft((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : [{ weight: '', reps: '' }])}
                    style={styles.removeButton}
                  >
                    <Ionicons name="close-circle-outline" size={23} color={muted} />
                  </Pressable>
                </View>
              ))}

              <Pressable
                onPress={() => setDraft((prev) => [...prev, { ...(prev[prev.length - 1] ?? { weight: '', reps: '' }) }])}
                style={styles.addSet}
              >
                <Ionicons name="add-circle-outline" size={20} color={PRIMARY} />
                <Text style={styles.addSetText}>Добавить подход</Text>
              </Pressable>

              <Pressable disabled={saving} onPress={() => void save()} style={[styles.save, saving && styles.disabled]}>
                <Text style={styles.saveText}>{saving ? 'Сохранение…' : editingId === null ? 'Сохранить тренировку' : 'Сохранить изменения'}</Text>
              </Pressable>
              {editingId !== null && (
                <Pressable style={styles.cancelEdit} onPress={() => beginNew()}>
                  <Text style={[styles.secondaryAction, { color: muted }]}>Отменить редактирование</Text>
                </Pressable>
              )}
            </View>

            <Text style={[styles.historyTitle, { color: foreground }]}>История ({history.length})</Text>
            {history.length === 0 ? (
              <Text style={[styles.hint, { color: muted, marginBottom: 32 }]}>Записи появятся здесь после первой тренировки.</Text>
            ) : history.map((session) => (
              <View key={session.id} style={[styles.historyCard, { backgroundColor: card }]}>
                <Text style={[styles.historyDate, { color: foreground }]}>{formatDate(session.performed_on)}</Text>
                {session.sets.map((s, i) => (
                  <Text key={i} style={[styles.historySet, { color: muted }]}>
                    {i + 1}. {s.weight_kg === null ? 'Без веса' : `${s.weight_kg} кг`}{s.reps === null ? '' : ` × ${s.reps}`}
                  </Text>
                ))}
                <View style={styles.historyActions}>
                  <Pressable onPress={() => beginNew(session.sets)} style={styles.actionButton}>
                    <Ionicons name="repeat-outline" size={17} color={PRIMARY} />
                    <Text style={styles.actionText}>Повторить</Text>
                  </Pressable>
                  <Pressable onPress={() => beginEdit(session)} style={styles.actionButton}>
                    <Ionicons name="pencil-outline" size={17} color={PRIMARY} />
                    <Text style={styles.actionText}>Изменить</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmDeleteSession(session)} style={styles.actionButton}>
                    <Ionicons name="trash-outline" size={17} color="#D9534F" />
                    <Text style={[styles.actionText, { color: '#D9534F' }]}>Удалить</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal visible={editModal} transparent animationType="fade" onRequestClose={() => setEditModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: card }]}>
            <Text style={[styles.modalTitle, { color: foreground }]}>Изменить тренировку</Text>
            <Text style={[styles.label, { color: muted }]}>Название</Text>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              maxLength={80}
              style={[styles.nameInput, { color: foreground, borderColor: inputBorder }]}
            />
            <Text style={[styles.label, { color: muted }]}>Тип</Text>
            <View style={styles.categories}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setCategoryInput(cat)}
                  style={[styles.categoryChip, { borderColor: categoryInput === cat ? PRIMARY : inputBorder }]}
                >
                  <Text style={{ color: categoryInput === cat ? PRIMARY : foreground, fontSize: 12, fontWeight: '600' }}>
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setEditModal(false)} style={styles.modalCancel}>
                <Text style={[styles.secondaryAction, { color: muted }]}>Отмена</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={() => void saveWorkoutInfo()} style={[styles.modalSave, saving && styles.disabled]}>
                <Text style={styles.saveText}>Сохранить</Text>
              </Pressable>
            </View>
            <Pressable onPress={confirmDeleteWorkout} style={styles.deleteWhole}>
              <Text style={{ color: '#D9534F', fontWeight: '600' }}>Удалить тренировку и всю историю</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },
  topButton: { padding: 12 },
  topTitle: { fontSize: 17, fontWeight: '700' },
  centerMessage: { textAlign: 'center', marginTop: 40 },
  content: { paddingHorizontal: 18, paddingBottom: 50 },
  workoutName: { fontSize: 27, fontWeight: '800', marginTop: 12 },
  category: { marginTop: 6, marginBottom: 20, fontSize: 14 },
  card: { borderRadius: 18, padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  quickDates: { flexDirection: 'row', gap: 8 },
  dateChip: { paddingVertical: 7, paddingHorizontal: 9, backgroundColor: '#22A78820', borderRadius: 8 },
  dateChipText: { color: PRIMARY, fontSize: 12, fontWeight: '700' },
  dateInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  hint: { fontSize: 13, lineHeight: 19, marginVertical: 14 },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7 },
  numColumn: { width: 26, textAlign: 'center', fontSize: 13 },
  columnTitle: { flex: 1, textAlign: 'center', fontSize: 12 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  setInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 8, fontSize: 16, textAlign: 'center', minWidth: 0 },
  removeButton: { width: 32, alignItems: 'center' },
  addSet: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 13 },
  addSetText: { color: PRIMARY, fontWeight: '700', fontSize: 14 },
  save: { marginTop: 8, backgroundColor: PRIMARY, paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  cancelEdit: { alignItems: 'center', padding: 14 },
  secondaryAction: { fontSize: 14, fontWeight: '600' },
  historyTitle: { fontSize: 21, fontWeight: '800', marginTop: 28, marginBottom: 14 },
  historyCard: { borderRadius: 15, padding: 16, marginBottom: 10 },
  historyDate: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  historySet: { fontSize: 14, marginBottom: 5 },
  historyActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#8892A055', marginTop: 12, paddingTop: 12 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
  actionText: { color: PRIMARY, fontSize: 12, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'center', padding: 20 },
  modal: { borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 21, fontWeight: '800', marginBottom: 18 },
  nameInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 16 },
  categories: { flexDirection: 'row', gap: 6, marginBottom: 22 },
  categoryChip: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 11 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16 },
  modalCancel: { padding: 10 },
  modalSave: { backgroundColor: PRIMARY, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 10 },
  deleteWhole: { alignItems: 'center', marginTop: 23, paddingTop: 18, borderTopColor: '#8892A044', borderTopWidth: StyleSheet.hairlineWidth },
});
