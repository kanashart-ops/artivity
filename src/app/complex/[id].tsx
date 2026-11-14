import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, type ScrollViewInstance, StyleSheet, Text, TextInput,
  View, useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  addComplexExercise, deleteComplex, deleteComplexSession, getComplex,
  listComplexExercises, listComplexSessions, removeComplexExercise,
  saveComplexSession, updateComplex,
  type ComplexExercise, type ComplexSession, type WorkoutComplex,
} from '@/database/complexes';
import {
  addWorkout, CATEGORY_LABELS, formatDate, listWorkouts, localDateString,
  type Workout, type WorkoutCategory, type WorkoutSet,
} from '@/database/workouts';
import { formatTonnage, sessionTonnage } from '@/database/tonnage';

const GREEN = '#22A788';
const categories: WorkoutCategory[] = ['strength', 'cardio', 'home'];
type SetDraft = { weight: string; reps: string };
type ExerciseDraft = { workoutId: number; name: string; sets: SetDraft[] };

function toDraft(sets?: WorkoutSet[]): SetDraft[] {
  return sets?.length
    ? sets.map(s => ({ weight: s.weight_kg === null ? '' : String(s.weight_kg), reps: s.reps === null ? '' : String(s.reps) }))
    : [{ weight: '', reps: '' }];
}
function parseDate(input: string): string {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(input.trim());
  if (!m) throw new Error('Введи дату ДД.ММ.ГГГГ');
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const actual = new Date(y, mo - 1, d);
  if (actual.getFullYear() !== y || actual.getMonth() !== mo - 1 || actual.getDate() !== d) throw new Error('Некорректная дата');
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (iso > localDateString()) throw new Error('Нельзя выбрать будущую дату');
  return iso;
}
function parseSets(sets: SetDraft[]): WorkoutSet[] {
  return sets.filter(s => s.weight.trim() || s.reps.trim()).map(s => {
    const weight = s.weight.trim() ? Number(s.weight.trim().replace(',', '.')) : null;
    const reps = s.reps.trim() ? Number(s.reps.trim()) : null;
    if (weight !== null && (!Number.isFinite(weight) || weight < 0)) throw new Error('Проверь вес');
    if (reps !== null && (!Number.isInteger(reps) || reps < 0)) throw new Error('Проверь повторы');
    return { weight_kg: weight, reps };
  });
}
function latestDraft(exercises: ComplexExercise[], history: ComplexSession[]): ExerciseDraft[] {
  return exercises.map(e => ({
    workoutId: e.id,
    name: e.name,
    sets: toDraft(history[0]?.exercises.find(old => old.workoutId === e.id)?.sets),
  }));
}

export default function ComplexDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const complexId = Number(id);
  const db = useSQLiteContext();
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const bg = dark ? '#101720' : '#F7F9FB';
  const card = dark ? '#1C2733' : '#FFFFFF';
  const foreground = dark ? '#F5F8FA' : '#17212D';
  const muted = dark ? '#9AAABB' : '#718090';
  const border = dark ? '#344454' : '#E0E8EC';
  const scrollRef = useRef<ScrollViewInstance>(null);

  const [complex, setComplex] = useState<WorkoutComplex | null>(null);
  const [exercises, setExercises] = useState<ComplexExercise[]>([]);
  const [history, setHistory] = useState<ComplexSession[]>([]);
  const [drafts, setDrafts] = useState<ExerciseDraft[]>([]);
  const [dateInput, setDateInput] = useState(formatDate(localDateString()));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [availableWorkouts, setAvailableWorkouts] = useState<Workout[]>([]);
  const [search, setSearch] = useState('');
  const [menuSession, setMenuSession] = useState<ComplexSession | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editInfo, setEditInfo] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<WorkoutCategory>('strength');

  const reload = useCallback(async (resetDraft = false) => {
    if (!Number.isSafeInteger(complexId) || complexId <= 0) throw new Error('Неизвестный комплекс');
    const [info, ex, sessions] = await Promise.all([
      getComplex(db, complexId), listComplexExercises(db, complexId), listComplexSessions(db, complexId),
    ]);
    setComplex(info); setExercises(ex); setHistory(sessions);
    if (resetDraft) {
      setEditingId(null);
      setDateInput(formatDate(localDateString()));
      setDrafts(latestDraft(ex, sessions));
    }
  }, [db, complexId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    reload(true).catch(e => { if (active) Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось загрузить комплекс'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]));

  function updateField(workoutId: number, index: number, field: keyof SetDraft, value: string) {
    setDrafts(old => old.map(e => e.workoutId === workoutId
      ? { ...e, sets: e.sets.map((s, i) => i === index ? { ...s, [field]: value } : s) }
      : e));
  }
  function addSet(workoutId: number) {
    setDrafts(old => old.map(e => e.workoutId === workoutId
      ? { ...e, sets: [...e.sets, { ...(e.sets[e.sets.length - 1] ?? { weight: '', reps: '' }) }] }
      : e));
  }
  function removeSet(workoutId: number, index: number) {
    setDrafts(old => old.map(e => e.workoutId === workoutId
      ? { ...e, sets: e.sets.length > 1 ? e.sets.filter((_, i) => i !== index) : [{ weight: '', reps: '' }] }
      : e));
  }
  function startNew(session?: ComplexSession) {
    setEditingId(null);
    setDateInput(formatDate(localDateString()));
    setDrafts(session
      ? exercises.map(e => ({ workoutId: e.id, name: e.name, sets: toDraft(session.exercises.find(s => s.workoutId === e.id)?.sets) }))
      : latestDraft(exercises, history));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }
  function startEdit(session: ComplexSession) {
    setEditingId(session.id);
    setDateInput(formatDate(session.performed_on));
    // Сохраняем возможность поправить старое занятие после удаления упражнения из шаблона.
    const all = [
      ...exercises.map(e => ({ workoutId: e.id, name: e.name, sets: toDraft(session.exercises.find(s => s.workoutId === e.id)?.sets) })),
      ...session.exercises.filter(e => !exercises.some(x => x.id === e.workoutId))
        .map(e => ({ workoutId: e.workoutId, name: e.name, sets: toDraft(e.sets) })),
    ];
    setDrafts(all);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }
  async function save() {
    if (saving || !complex) return;
    try {
      const date = parseDate(dateInput);
      const rows = drafts.map(e => ({ workoutId: e.workoutId, sets: parseSets(e.sets) }));
      if (rows.every(e => e.sets.length === 0)) throw new Error('Заполни подходы хотя бы одного упражнения');
      setSaving(true);
      await saveComplexSession(db, complexId, date, rows, editingId);
      await reload(true);
      Alert.alert('Сохранено', 'Занятие и тоннаж сохранены на телефоне');
    } catch (e) {
      Alert.alert('Не удалось сохранить', e instanceof Error ? e.message : 'Ошибка');
    } finally { setSaving(false); }
  }
  async function showPicker() {
    try {
      setAvailableWorkouts(await listWorkouts(db));
      setSearch(''); setPickerOpen(true);
    } catch { Alert.alert('Ошибка', 'Не удалось открыть список упражнений'); }
  }
  async function selectExercise(workoutId: number) {
    try {
      await addComplexExercise(db, complexId, workoutId);
      setPickerOpen(false);
      await reload(false);
      const ex = await listComplexExercises(db, complexId);
      const workout = ex.find(e => e.id === workoutId);
      if (workout) {
        setDrafts(old => old.some(e => e.workoutId === workoutId) ? old : [...old, { workoutId, name: workout.name, sets: toDraft() }]);
      }
    } catch(e) { Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось добавить'); }
  }
  async function createExercise() {
    if (!search.trim()) return;
    try {
      const workoutId = await addWorkout(db, search, complex?.category ?? 'strength');
      await selectExercise(workoutId);
    } catch(e) { Alert.alert('Не удалось создать', e instanceof Error ? e.message : 'Ошибка'); }
  }
  function confirmRemoveExercise(e: ComplexExercise) {
    Alert.alert('Убрать упражнение из комплекса?',
      `«${e.name}» исчезнет из шаблона, но его прежние результаты останутся в истории.`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Убрать', style: 'destructive', onPress: () => {
          void (async () => {
            await removeComplexExercise(db, complexId, e.id);
            setDrafts(old => old.filter(x => x.workoutId !== e.id));
            await reload(false);
          })().catch(() => Alert.alert('Ошибка', 'Не удалось убрать упражнение'));
        } },
      ]);
  }
  function confirmDeleteSession(session: ComplexSession) {
    Alert.alert('Удалить занятие?', `Удалить комплекс за ${formatDate(session.performed_on)} и все его подходы?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        void (async () => { await deleteComplexSession(db, session.id); await reload(true); })()
          .catch(() => Alert.alert('Ошибка', 'Не удалось удалить занятие'));
      } },
    ]);
  }
  function openInfo() {
    if (!complex) return;
    setNameInput(complex.name); setCategoryInput(complex.category); setEditInfo(true);
  }
  async function saveInfo() {
    try { await updateComplex(db, complexId, nameInput, categoryInput); setEditInfo(false); await reload(false); }
    catch (e) { Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось сохранить'); }
  }
  function confirmDeleteComplex() {
    Alert.alert('Удалить комплекс?', 'Сам комплекс исчезнет, но история упражнений и тоннаж останутся.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        void deleteComplex(db, complexId).then(() => router.replace('/workouts'))
          .catch(() => Alert.alert('Ошибка', 'Не удалось удалить комплекс'));
      } },
    ]);
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.root, { backgroundColor: bg }]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} style={styles.topButton} accessibilityLabel="Назад">
          <Ionicons name="arrow-back" color={foreground} size={24} />
        </Pressable>
        <Text style={[styles.barTitle, { color: foreground }]}>Комплекс</Text>
        <Pressable onPress={openInfo} style={styles.topButton} accessibilityLabel="Изменить комплекс">
          <Ionicons name="create-outline" color={foreground} size={23} />
        </Pressable>
      </View>
      {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 45 }} /> : !complex ? (
        <Text style={[styles.note, { color: muted }]}>Комплекс не найден</Text>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={[styles.heading, { color: foreground }]}>{complex.name}</Text>
            <Text style={[styles.note, { color: muted }]}>{CATEGORY_LABELS[complex.category]}</Text>
            <View style={[styles.total, { backgroundColor: dark ? '#1B3B33' : '#E6F9EE' }]}>
              <Ionicons name="barbell" color={GREEN} size={26} />
              <View>
                <Text style={[styles.totalValue, { color: foreground }]}>{formatTonnage(complex.tonnage_kg)}</Text>
                <Text style={[styles.note, { color: muted }]}>Тоннаж комплекса за всё время · {complex.session_count} занятий</Text>
              </View>
            </View>

            <View style={[styles.editor, { backgroundColor: card }]}>
              <Text style={[styles.sectionTitle, { color: foreground }]}>
                {editingId === null ? 'Новая тренировка' : 'Редактирование занятия'}
              </Text>
              <Text style={[styles.note, { color: muted }]}>Дата занятия</Text>
              <View style={styles.dateRow}>
                <TextInput value={dateInput} onChangeText={setDateInput}
                  keyboardType="numbers-and-punctuation" placeholder="ДД.ММ.ГГГГ"
                  style={[styles.dateInput, { color: foreground, borderColor: border }]} />
                <Pressable onPress={() => setDateInput(formatDate(localDateString()))} style={styles.todayChip}>
                  <Text style={styles.todayText}>Сегодня</Text>
                </Pressable>
              </View>
              <Text style={[styles.note, { color: muted, marginBottom: 9 }]}>Тоннаж = вес × повторы. Для двух гантелей укажи общий вес.</Text>
              {drafts.map(e => (
                <View key={e.workoutId} style={[styles.exerciseCard, { borderColor: border }]}>
                  <Text style={[styles.exerciseName, { color: foreground }]}>{e.name}</Text>
                  <View style={styles.setHead}>
                    <Text style={[styles.indexLabel, { color: muted }]}>№</Text>
                    <Text style={[styles.colLabel, { color: muted }]}>Вес, кг</Text>
                    <Text style={[styles.colLabel, { color: muted }]}>Повторы</Text>
                    <View style={{ width: 28 }} />
                  </View>
                  {e.sets.map((s, index) => (
                    <View key={index} style={styles.setRow}>
                      <Text style={[styles.indexLabel, { color: foreground }]}>{index + 1}</Text>
                      <TextInput value={s.weight} onChangeText={v => updateField(e.workoutId, index, 'weight', v)}
                        keyboardType="decimal-pad" placeholder="—" placeholderTextColor={muted}
                        style={[styles.setInput, { color: foreground, borderColor: border }]} />
                      <TextInput value={s.reps} onChangeText={v => updateField(e.workoutId, index, 'reps', v)}
                        keyboardType="number-pad" placeholder="—" placeholderTextColor={muted}
                        style={[styles.setInput, { color: foreground, borderColor: border }]} />
                      <Pressable style={{ width: 28, alignItems: 'center' }} onPress={() => removeSet(e.workoutId, index)}>
                        <Ionicons name="close-circle-outline" color={muted} size={21} />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable onPress={() => addSet(e.workoutId)} style={styles.inlineAdd}>
                    <Ionicons name="add-circle-outline" color={GREEN} size={18} />
                    <Text style={styles.inlineAddText}>Подход</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable onPress={() => void showPicker()} style={styles.addExercise}>
                <Ionicons name="add" size={19} color={GREEN} />
                <Text style={styles.addExerciseText}>Добавить упражнение</Text>
              </Pressable>
              {exercises.length > 0 ? (
                <View style={styles.currentExercises}>
                  {exercises.map(e => (
                    <View key={e.id} style={styles.exerciseTag}>
                      <Text style={[styles.tagText, { color: muted }]} numberOfLines={1}>{e.name}</Text>
                      <Pressable onPress={() => confirmRemoveExercise(e)} accessibilityLabel={`Убрать ${e.name}`}>
                        <Ionicons name="close" color={muted} size={18} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
              {editingId !== null ? (
                <Pressable onPress={() => startNew()} style={styles.cancelEdit}>
                  <Text style={{ color: muted }}>Отменить редактирование</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => void save()} disabled={saving || !drafts.length}
                style={[styles.save, (saving || !drafts.length) && { opacity: 0.5 }]}>
                <Text style={styles.saveText}>{saving ? 'Сохраняем…' : editingId === null ? 'Сохранить комплекс' : 'Сохранить изменения'}</Text>
              </Pressable>
            </View>

            <Text style={[styles.sectionTitle, { color: foreground, marginTop: 23, marginBottom: 12 }]}>История ({history.length})</Text>
            {history.length === 0 ? <Text style={[styles.note, { color: muted }]}>Пока нет записей занятий</Text> : null}
            {history.map(session => (
              <View key={session.id} style={[styles.historyRow, { backgroundColor: card }]}>
                <Pressable style={{ flex: 1 }} onPress={() => setExpandedId(old => old === session.id ? null : session.id)}>
                  <Text style={[styles.historyText, { color: foreground }]} numberOfLines={1}>
                    {formatDate(session.performed_on)} · {session.exercises.length} упр. · {formatTonnage(session.tonnage_kg)}
                  </Text>
                  {expandedId === session.id ? (
                    <Text style={[styles.historyDetails, { color: muted }]}>
                      {session.exercises.map(e => `${e.name}: ${e.sets.map(s => `${s.weight_kg ?? '—'}кг×${s.reps ?? '—'}`).join(', ')}`).join('\n')}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable onPress={() => setMenuSession(session)} accessibilityLabel="Действия с записью" style={styles.dots}>
                  <Ionicons name="ellipsis-vertical" color={muted} size={23} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <SafeAreaView style={[styles.root, { backgroundColor: bg }]} edges={['top', 'bottom']}>
          <View style={styles.modalTop}>
            <Text style={[styles.sectionTitle, { color: foreground }]}>Добавить упражнение</Text>
            <Pressable onPress={() => setPickerOpen(false)}><Ionicons name="close" color={foreground} size={26} /></Pressable>
          </View>
          <TextInput value={search} onChangeText={setSearch} placeholder="Поиск или новое название"
            placeholderTextColor={muted} style={[styles.search, { color: foreground, borderColor: border }]} />
          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            {availableWorkouts.filter(e => !exercises.some(x => x.id === e.id) && e.name.toLowerCase().includes(search.trim().toLowerCase()))
              .map(e => (
                <Pressable key={e.id} onPress={() => void selectExercise(e.id)} style={[styles.pickerRow, { borderBottomColor: border }]}>
                  <Text style={{ color: foreground, fontSize: 15, fontWeight: '600' }}>{e.name}</Text>
                  <Ionicons name="add-circle-outline" color={GREEN} size={23} />
                </Pressable>
              ))}
            {search.trim() ? (
              <Pressable onPress={() => void createExercise()} style={styles.createNew}>
                <Ionicons name="add" color="#FFFFFF" size={21} />
                <Text style={styles.saveText}>Создать «{search.trim()}»</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal transparent visible={menuSession !== null} onRequestClose={() => setMenuSession(null)} animationType="fade">
        <Pressable onPress={() => setMenuSession(null)} style={styles.overlay}>
          <View style={[styles.actionsSheet, { backgroundColor: card }]}>
            {menuSession ? (
              <>
                <Text style={[styles.menuTitle, { color: foreground }]}>{formatDate(menuSession.performed_on)}</Text>
                <Pressable style={styles.menuAction} onPress={() => { const selected = menuSession; setMenuSession(null); startNew(selected); }}>
                  <Ionicons name="repeat-outline" color={GREEN} size={21} /><Text style={[styles.menuLabel, { color: foreground }]}>Повторить</Text>
                </Pressable>
                <Pressable style={styles.menuAction} onPress={() => { const selected = menuSession; setMenuSession(null); startEdit(selected); }}>
                  <Ionicons name="pencil-outline" color={GREEN} size={21} /><Text style={[styles.menuLabel, { color: foreground }]}>Изменить</Text>
                </Pressable>
                <Pressable style={styles.menuAction} onPress={() => { const selected = menuSession; setMenuSession(null); confirmDeleteSession(selected); }}>
                  <Ionicons name="trash-outline" color="#E45858" size={21} /><Text style={[styles.menuLabel, { color: '#E45858' }]}>Удалить</Text>
                </Pressable>
                <Pressable style={styles.menuAction} onPress={() => setMenuSession(null)}>
                  <Text style={[styles.menuLabel, { color: muted }]}>Отмена</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>

      <Modal transparent visible={editInfo} onRequestClose={() => setEditInfo(false)} animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.actionsSheet, { backgroundColor: card }]}>
            <Text style={[styles.sectionTitle, { color: foreground }]}>Настройки комплекса</Text>
            <TextInput value={nameInput} onChangeText={setNameInput} placeholder="Название"
              style={[styles.search, { color: foreground, borderColor: border, marginHorizontal: 0 }]} />
            <View style={styles.categoryRow}>
              {categories.map(c => (
                <Pressable key={c} onPress={() => setCategoryInput(c)} style={[styles.categoryChip, { borderColor: categoryInput === c ? GREEN : border }]}>
                  <Text style={{ color: categoryInput === c ? GREEN : foreground, fontSize: 12 }}>{CATEGORY_LABELS[c]}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.save} onPress={() => void saveInfo()}><Text style={styles.saveText}>Сохранить</Text></Pressable>
            <Pressable onPress={() => setEditInfo(false)} style={styles.menuAction}><Text style={{ color: muted }}>Отмена</Text></Pressable>
            <Pressable onPress={() => { setEditInfo(false); confirmDeleteComplex(); }} style={styles.menuAction}>
              <Text style={{ color: '#E45858', fontWeight: '700' }}>Удалить комплекс</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  topButton: { padding: 10 }, barTitle: { fontSize: 17, fontWeight: '700' },
  content: { paddingHorizontal: 17, paddingBottom: 45 },
  heading: { fontSize: 28, fontWeight: '900', marginTop: 8 }, note: { fontSize: 13, marginTop: 4, lineHeight: 19 },
  total: { borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 17, marginBottom: 16 },
  totalValue: { fontSize: 25, fontWeight: '900' },
  editor: { borderRadius: 18, padding: 15 }, sectionTitle: { fontSize: 18, fontWeight: '800' },
  dateRow: { flexDirection: 'row', gap: 9, marginTop: 8, marginBottom: 13 },
  dateInput: { flex: 1, borderWidth: 1, borderRadius: 10, fontSize: 15, paddingHorizontal: 13, height: 44 },
  todayChip: { borderRadius: 10, backgroundColor: '#E0F8EC', paddingHorizontal: 12, justifyContent: 'center' },
  todayText: { color: GREEN, fontWeight: '700', fontSize: 12 },
  exerciseCard: { borderTopWidth: 1, paddingTop: 13, marginBottom: 12 },
  exerciseName: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  setHead: { flexDirection: 'row', gap: 7, alignItems: 'center', marginBottom: 5 },
  indexLabel: { width: 24, fontSize: 12, textAlign: 'center' },
  colLabel: { flex: 1, fontSize: 12, textAlign: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7 },
  setInput: { flex: 1, borderWidth: 1, height: 41, borderRadius: 10, minWidth: 0, textAlign: 'center', fontSize: 15 },
  inlineAdd: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 7 },
  inlineAddText: { color: GREEN, fontWeight: '700', fontSize: 13 },
  addExercise: { alignSelf: 'center', flexDirection: 'row', gap: 7, paddingVertical: 13 },
  addExerciseText: { fontWeight: '700', color: GREEN, fontSize: 14 },
  currentExercises: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 11 },
  exerciseTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#22A78818', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6, maxWidth: '100%' },
  tagText: { fontSize: 11, maxWidth: 170 },
  save: { backgroundColor: GREEN, minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 12, marginTop: 10 },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  cancelEdit: { alignSelf: 'center', paddingVertical: 11 },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 7 },
  historyText: { fontSize: 13, fontWeight: '700', marginTop: 6 },
  historyDetails: { fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 5 },
  dots: { padding: 7, marginLeft: 6 },
  pickerRow: { paddingVertical: 15, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: { borderWidth: 1, borderRadius: 12, height: 48, paddingHorizontal: 13, marginHorizontal: 18, marginVertical: 13 },
  createNew: { backgroundColor: GREEN, borderRadius: 13, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  modalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 15 },
  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 22 },
  actionsSheet: { borderRadius: 20, padding: 20 },
  menuTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  menuAction: { minHeight: 43, flexDirection: 'row', gap: 12, alignItems: 'center' },
  menuLabel: { fontSize: 15, fontWeight: '700' },
  categoryRow: { flexDirection: 'row', gap: 7, marginTop: 12 },
  categoryChip: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
});
