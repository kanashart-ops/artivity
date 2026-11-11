import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import SwipeTabScreen from '@/components/swipe-tab-screen';
import {
  addWorkout,
  CATEGORY_LABELS,
  formatDate,
  listWorkouts,
  type Workout,
  type WorkoutCategory,
} from '@/database/workouts';

const categories: WorkoutCategory[] = ['strength', 'cardio', 'home'];

export default function WorkoutsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const background = dark ? '#0E1720' : '#F3F8FA';
  const foreground = dark ? '#FFFFFF' : '#17212D';
  const muted = dark ? '#A0ACBA' : '#738294';
  const card = dark ? '#1A2935' : '#FFFFFF';

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<WorkoutCategory>('strength');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setWorkouts(await listWorkouts(db));
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить список тренировок');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  function openCreate() {
    setName('');
    setCategory('strength');
    setModalVisible(true);
  }

  async function create() {
    if (saving) return;
    setSaving(true);
    try {
      const id = await addWorkout(db, name, category);
      setModalVisible(false);
      await refresh();
      router.push({ pathname: '/workout/[id]', params: { id: String(id) } });
    } catch (error) {
      Alert.alert('Не удалось добавить', error instanceof Error ? error.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SwipeTabScreen>
      <SafeAreaView style={[styles.container, { backgroundColor: background }]} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>ARTIVITY</Text>
            <Text style={[styles.title, { color: foreground }]}>Тренировки</Text>
          </View>
          <Pressable accessibilityLabel="Добавить тренировку" onPress={openCreate} style={styles.plus}>
            <Ionicons name="add" size={29} color="#FFFFFF" />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loading} color="#22A788" />
        ) : (
          <FlatList
            data={workouts}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="barbell-outline" size={52} color="#22A788" />
                <Text style={[styles.emptyTitle, { color: foreground }]}>Пока нет тренировок</Text>
                <Text style={[styles.emptyHint, { color: muted }]}>Нажми + и создай первую тренировку</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push({ pathname: '/workout/[id]', params: { id: String(item.id) } })}
                style={[styles.item, { backgroundColor: card, borderColor: dark ? '#2F4250' : '#E5EDF2' }]}
              >
                <View style={styles.itemIcon}>
                  <Ionicons name={item.category === 'cardio' ? 'heart-outline' : item.category === 'home' ? 'body-outline' : 'barbell-outline'} size={23} color="#22A788" />
                </View>
                <View style={styles.itemText}>
                  <Text style={[styles.itemTitle, { color: foreground }]}>{item.name}</Text>
                  <Text style={[styles.itemSubtitle, { color: muted }]}>
                    {CATEGORY_LABELS[item.category]} · {item.session_count ? `${item.session_count} записей` : 'Нет записей'}
                  </Text>
                  {item.last_date && <Text style={[styles.itemDate, { color: muted }]}>Последний раз: {formatDate(item.last_date)}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={20} color={muted} />
              </Pressable>
            )}
          />
        )}

        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
            <View style={[styles.modal, { backgroundColor: card }]}>
              <Text style={[styles.modalTitle, { color: foreground }]}>Новая тренировка</Text>
              <Text style={[styles.label, { color: muted }]}>Название</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Например, жим гантелей"
                placeholderTextColor={muted}
                maxLength={80}
                autoFocus
                style={[styles.input, { color: foreground, borderColor: dark ? '#415064' : '#D9E1E7' }]}
              />
              <Text style={[styles.label, { color: muted }]}>Тип</Text>
              <View style={styles.categoryRow}>
                {categories.map((item) => (
                  <Pressable key={item} onPress={() => setCategory(item)} style={[styles.category, { borderColor: category === item ? '#22A788' : dark ? '#415064' : '#D9E1E7', backgroundColor: category === item ? '#22A78820' : 'transparent' }]}>
                    <Text style={[styles.categoryText, { color: category === item ? '#22A788' : foreground }]}>{CATEGORY_LABELS[item]}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.actions}>
                <Pressable onPress={() => setModalVisible(false)} style={styles.cancel}>
                  <Text style={[styles.cancelText, { color: muted }]}>Отмена</Text>
                </Pressable>
                <Pressable disabled={saving || !name.trim()} onPress={() => void create()} style={[styles.save, (!name.trim() || saving) && { opacity: 0.5 }]}>
                  <Text style={styles.saveText}>{saving ? 'Сохраняем...' : 'Создать'}</Text>
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
  container: { flex: 1 },
  header: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontSize: 12, fontWeight: '800', letterSpacing: 3, color: '#22A788', marginBottom: 10 },
  title: { fontSize: 30, fontWeight: '800' },
  plus: { height: 49, width: 49, borderRadius: 15, backgroundColor: '#12C873', alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 18, paddingBottom: 24, flexGrow: 1 },
  loading: { marginTop: 50 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 70 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 20 },
  emptyHint: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 16, marginBottom: 11, borderWidth: 1, elevation: 2, shadowColor: '#1A5462', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  itemIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#22A7881F', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  itemText: { flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '700' },
  itemSubtitle: { fontSize: 12, marginTop: 5 },
  itemDate: { fontSize: 11, marginTop: 3 },
  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 20 },
  modal: { borderRadius: 22, padding: 22 },
  modalTitle: { fontSize: 22, fontWeight: '800', marginBottom: 22 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 16, marginBottom: 18 },
  categoryRow: { flexDirection: 'row', gap: 6, marginBottom: 24 },
  category: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 3, alignItems: 'center' },
  categoryText: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18 },
  cancel: { padding: 11 },
  cancelText: { fontSize: 15, fontWeight: '600' },
  save: { borderRadius: 12, backgroundColor: '#12C873', paddingHorizontal: 23, paddingVertical: 13 },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
