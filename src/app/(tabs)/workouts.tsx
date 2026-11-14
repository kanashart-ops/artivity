import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, StyleSheet, Text, TextInput, View, useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SwipeTabScreen from '@/components/swipe-tab-screen';
import { addComplex, listComplexes, type WorkoutComplex } from '@/database/complexes';
import {
  addWorkout, CATEGORY_LABELS, formatDate, listWorkouts,
  type Workout, type WorkoutCategory,
} from '@/database/workouts';
import { formatTonnage } from '@/database/tonnage';

const categories: WorkoutCategory[] = ['strength', 'cardio', 'home'];
type CreateMode = 'complex' | 'exercise';

export default function WorkoutsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const bg = dark ? '#101720' : '#F7F9FB';
  const fg = dark ? '#FFFFFF' : '#17212D';
  const muted = dark ? '#A0ACBA' : '#738294';
  const card = dark ? '#1B2633' : '#FFFFFF';
  const border = dark ? '#3D4A59' : '#DEE6EC';

  const [exercises, setExercises] = useState<Workout[]>([]);
  const [complexes, setComplexes] = useState<WorkoutComplex[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<CreateMode>('complex');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<WorkoutCategory>('strength');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [ex, groups] = await Promise.all([listWorkouts(db), listComplexes(db)]);
      setExercises(ex); setComplexes(groups);
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить список тренировок');
    } finally { setLoading(false); }
  }, [db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  function openCreate() {
    setMode('complex'); setName(''); setCategory('strength'); setModalVisible(true);
  }
  async function create() {
    if (saving) return;
    setSaving(true);
    try {
      const id = mode === 'complex' ? await addComplex(db, name, category) : await addWorkout(db, name, category);
      setModalVisible(false);
      await refresh();
      if (mode === 'complex') router.push({ pathname: '/complex/[id]', params: { id: String(id) } });
      else router.push({ pathname: '/workout/[id]', params: { id: String(id) } });
    } catch (e) {
      Alert.alert('Не удалось добавить', e instanceof Error ? e.message : 'Ошибка');
    } finally { setSaving(false); }
  }

  return (
    <SwipeTabScreen>
      <SafeAreaView style={[styles.root, { backgroundColor: bg }]} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>ARTIVITY</Text>
            <Text style={[styles.title, { color: fg }]}>Тренировки</Text>
          </View>
          <Pressable accessibilityLabel="Добавить комплекс или упражнение" onPress={openCreate} style={styles.plus}>
            <Ionicons name="add" color="#FFFFFF" size={30} />
          </Pressable>
        </View>

        {loading ? <ActivityIndicator color="#22A788" style={{ marginTop: 45 }} /> : (
          <FlatList
            data={exercises}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View>
                <Text style={[styles.sectionTitle, { color: fg }]}>Комплексы</Text>
                {complexes.length === 0 ? (
                  <View style={[styles.emptyComplex, { backgroundColor: card }]}>
                    <Text style={{ color: muted, fontSize: 13 }}>Нажми +, чтобы собрать комплекс из нескольких упражнений.</Text>
                  </View>
                ) : complexes.map(item => (
                  <Pressable key={item.id} onPress={() => router.push({ pathname: '/complex/[id]', params: { id: String(item.id) } })}
                    style={[styles.item, { backgroundColor: card }]}>
                    <View style={styles.iconCircle}><Ionicons name="albums-outline" size={23} color="#22A788" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemTitle, { color: fg }]}>{item.name}</Text>
                      <Text style={[styles.subtitle, { color: muted }]}>
                        {CATEGORY_LABELS[item.category]} · {item.session_count} занятий
                      </Text>
                      <Text style={[styles.tonnage, { color: '#22A788' }]}>
                        {formatTonnage(item.tonnage_kg)} всего
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" color={muted} size={19} />
                  </Pressable>
                ))}
                <Text style={[styles.sectionTitle, { color: fg, marginTop: 18 }]}>Упражнения</Text>
                {exercises.length === 0 ? <Text style={{ color: muted, marginBottom: 20 }}>Пока нет упражнений</Text> : null}
              </View>
            }
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push({ pathname: '/workout/[id]', params: { id: String(item.id) } })}
                style={[styles.item, { backgroundColor: card }]}>
                <View style={styles.iconCircle}>
                  <Ionicons name={item.category === 'cardio' ? 'heart-outline' : item.category === 'home' ? 'body-outline' : 'barbell-outline'}
                    color="#22A788" size={23} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: fg }]}>{item.name}</Text>
                  <Text style={[styles.subtitle, { color: muted }]}>
                    {item.session_count} записей{item.last_date ? ` · ${formatDate(item.last_date)}` : ''}
                  </Text>
                  <Text style={[styles.tonnage, { color: '#22A788' }]}>{formatTonnage(item.tonnage_kg)} всего</Text>
                </View>
                <Ionicons name="chevron-forward" color={muted} size={19} />
              </Pressable>
            )}
          />
        )}

        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
            <View style={[styles.modal, { backgroundColor: card }]}>
              <Text style={[styles.modalTitle, { color: fg }]}>Добавить тренировку</Text>
              <View style={styles.choiceRow}>
                {(['complex', 'exercise'] as const).map(value => (
                  <Pressable key={value} onPress={() => setMode(value)}
                    style={[styles.choice, { borderColor: mode === value ? '#22A788' : border, backgroundColor: mode === value ? '#22A78820' : 'transparent' }]}>
                    <Text style={{ color: mode === value ? '#22A788' : fg, fontSize: 14, fontWeight: '700' }}>
                      {value === 'complex' ? 'Комплекс' : 'Упражнение'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.label, { color: muted }]}>Название</Text>
              <TextInput value={name} onChangeText={setName} maxLength={80} autoFocus
                placeholder={mode === 'complex' ? 'Например, день спины' : 'Например, жим гантелей'}
                placeholderTextColor={muted} style={[styles.input, { borderColor: border, color: fg }]} />
              <Text style={[styles.label, { color: muted }]}>Тип</Text>
              <View style={styles.choiceRow}>
                {categories.map(c => (
                  <Pressable key={c} onPress={() => setCategory(c)}
                    style={[styles.category, { borderColor: category === c ? '#22A788' : border }]}>
                    <Text style={{ color: category === c ? '#22A788' : fg, fontSize: 12, fontWeight: '700' }}>{CATEGORY_LABELS[c]}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.actions}>
                <Pressable onPress={() => setModalVisible(false)} style={styles.cancel}>
                  <Text style={{ color: muted, fontSize: 15 }}>Отмена</Text>
                </Pressable>
                <Pressable disabled={!name.trim() || saving} onPress={() => void create()}
                  style={[styles.save, (!name.trim() || saving) && { opacity: 0.45 }]}>
                  <Text style={styles.saveText}>{saving ? 'Сохраняем…' : 'Создать'}</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </SwipeTabScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#22A788', fontSize: 12, fontWeight: '800', letterSpacing: 3, marginBottom: 8 },
  title: { fontSize: 30, fontWeight: '900' },
  plus: { width: 49, height: 49, borderRadius: 15, backgroundColor: '#22A788', justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 18, paddingBottom: 35, flexGrow: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '900', marginBottom: 12 },
  emptyComplex: { padding: 18, borderRadius: 16, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 16, marginBottom: 9, gap: 12 },
  iconCircle: { width: 46, height: 46, borderRadius: 13, justifyContent: 'center', alignItems: 'center', backgroundColor: '#22A78820' },
  itemTitle: { fontSize: 16, fontWeight: '800' }, subtitle: { fontSize: 12, marginTop: 4 },
  tonnage: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 20 },
  modal: { padding: 20, borderRadius: 22 }, modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 12, height: 48, paddingHorizontal: 12, fontSize: 15, marginBottom: 18 },
  choiceRow: { flexDirection: 'row', gap: 7, marginBottom: 19 },
  choice: { flex: 1, borderRadius: 11, borderWidth: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  category: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 15, alignItems: 'center' },
  cancel: { padding: 10 }, save: { borderRadius: 12, backgroundColor: '#22A788', paddingHorizontal: 20, paddingVertical: 13 },
  saveText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});
