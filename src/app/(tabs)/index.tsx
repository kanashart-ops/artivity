import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import SwipeTabScreen from '@/components/swipe-tab-screen';
import {
  loadRestrictedItems,
  loadToday,
  localDateKey,
  saveDayReport,
  type DayAnswers,
  type RestrictedItem,
  type TodaySnapshot,
} from '@/database/daily';

function formatDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long',
  });
}

function pluralDays(value: number): string {
  const two = value % 100;
  const one = value % 10;
  if (two >= 11 && two <= 14) return 'дней';
  if (one === 1) return 'день';
  return one >= 2 && one <= 4 ? 'дня' : 'дней';
}

type QuestionProps = {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (answer: boolean) => void;
  textColor: string;
  muted: string;
  border: string;
  disabledNo?: boolean;
};

function YesNoQuestion({
  label, hint, value, onChange, textColor, muted, border, disabledNo,
}: QuestionProps) {
  return (
    <View style={[styles.question, { borderBottomColor: border }]}>
      <Text style={[styles.questionTitle, { color: textColor }]}>{label}</Text>
      {hint ? <Text style={[styles.small, { color: muted }]}>{hint}</Text> : null}
      <View style={styles.choiceRow}>
        {([true, false] as const).map((choice) => {
          const selected = value === choice;
          const disabled = !choice && disabledNo;
          return (
            <Pressable
              key={String(choice)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(choice)}
              style={[
                styles.choice,
                { borderColor: selected ? '#22A788' : border },
                selected && styles.choiceSelected,
                disabled && styles.disabled,
              ]}
            >
              <Text style={[styles.choiceText, { color: selected ? '#127A5E' : textColor }]}>
                {choice ? 'Да' : 'Нет'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TodayScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const dark = useColorScheme() === 'dark';

  const [today, setToday] = useState<TodaySnapshot | null>(null);
  const [restrictedItems, setRestrictedItems] = useState<RestrictedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<DayAnswers>({
    trained: false,
    lightDay: false,
    alcohol: false,
    restrictedIds: [],
  });
  const [ateRestricted, setAteRestricted] = useState(false);
  const [error, setError] = useState('');

  const background = dark ? '#101720' : '#F7F9FB';
  const card = dark ? '#1C2733' : '#FFFFFF';
  const textColor = dark ? '#F4F7FA' : '#17212D';
  const muted = dark ? '#A8B5C3' : '#748293';
  const border = dark ? '#304052' : '#E8EDF1';

  const refresh = useCallback(async () => {
    const date = localDateKey();
    const [snapshot, items] = await Promise.all([
      loadToday(db, date),
      loadRestrictedItems(db),
    ]);
    setToday(snapshot);
    setRestrictedItems(items);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      async function load() {
        try {
          const date = localDateKey();
          const [snapshot, items] = await Promise.all([
            loadToday(db, date), loadRestrictedItems(db),
          ]);
          if (active) {
            setToday(snapshot);
            setRestrictedItems(items);
            setError('');
          }
        } catch {
          if (active) setError('Не удалось загрузить данные.');
        } finally {
          if (active) setLoading(false);
        }
      }
      void load();
      return () => { active = false; };
    }, [db])
  );

  function openForm() {
    if (!today || saving) return;
    setForm({
      trained: today.answers.trained,
      alcohol: today.answers.alcohol,
      lightDay: today.answers.lightDay,
      restrictedIds: [...today.answers.restrictedIds],
    });
    setAteRestricted(today.answers.restrictedIds.length > 0);
    setModalOpen(true);
  }

  function updateForm<K extends keyof DayAnswers>(key: K, value: DayAnswers[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleFood(id: number) {
    setForm((current) => ({
      ...current,
      restrictedIds: current.restrictedIds.includes(id)
        ? current.restrictedIds.filter((itemId) => itemId !== id)
        : [...current.restrictedIds, id],
    }));
  }

  async function submitForm() {
    if (!today || saving) return;
    if (ateRestricted && form.restrictedIds.length === 0) {
      Alert.alert('Выбери продукт', 'Отметь хотя бы одну позицию из списка.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await saveDayReport(db, today.date, {
        ...form,
        restrictedIds: ateRestricted ? form.restrictedIds : [],
      });
      setModalOpen(false);
      await refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Не удалось сохранить день.';
      setError(message);
      Alert.alert('Ошибка сохранения', message);
    } finally {
      setSaving(false);
    }
  }

  const foodNames = today?.answers.restrictedIds
    .map((id) => restrictedItems.find((item) => item.id === id)?.name)
    .filter((name): name is string => Boolean(name)) ?? [];

  return (
    <>
      <SwipeTabScreen>
        <SafeAreaView style={[styles.root, { backgroundColor: background }]} edges={['top', 'left', 'right']}>
          <StatusBar style={dark ? 'light' : 'dark'} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.brand}>ARTIVITY</Text>
            <Text style={[styles.heading, { color: textColor }]}>Сегодня</Text>
            <Text style={[styles.date, { color: muted }]}>{formatDate(localDateKey())}</Text>

            {loading ? (
              <ActivityIndicator color="#22A788" style={styles.loading} />
            ) : today ? (
              <>
                <View style={styles.statRow}>
                  <View style={[styles.statCard, { backgroundColor: card, borderColor: border }]}>
                    <Ionicons name="flame-outline" size={23} color="#E89B3A" />
                    <Text style={[styles.statNumber, { color: textColor }]}>{today.currentStreak}</Text>
                    <Text style={[styles.statLabel, { color: muted }]}>Streak · дней</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: card, borderColor: border }]}>
                    <Ionicons name="trophy-outline" size={23} color="#22A788" />
                    <Text style={[styles.statNumber, { color: textColor }]}>{today.bestStreak}</Text>
                    <Text style={[styles.statLabel, { color: muted }]}>Лучший результат</Text>
                  </View>
                </View>

                <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
                  <View style={styles.titleRow}>
                    <Ionicons
                      name={today.checkedIn ? 'checkmark-circle' : 'checkmark-circle-outline'}
                      color="#22A788"
                      size={23}
                    />
                    <Text style={[styles.cardTitle, { color: textColor }]}>Отметка дня</Text>
                  </View>
                  <Text style={[styles.helper, { color: muted }]}>
                    {today.checkedIn
                      ? 'Сегодняшний день засчитан. Можно исправить ответы, Streak останется.'
                      : 'Ответь на четыре коротких вопроса, чтобы засчитать день.'}
                  </Text>
                  <Pressable onPress={openForm} style={styles.mainButton}>
                    <Ionicons name={today.checkedIn ? 'create-outline' : 'checkmark'} size={19} color="#FFFFFF" />
                    <Text style={styles.mainButtonText}>
                      {today.checkedIn ? 'Редактировать день' : 'Отметить день'}
                    </Text>
                  </Pressable>
                  {today.checkedIn ? (
                    <View style={styles.summary}>
                      <Text style={[styles.summaryText, { color: muted }]}>
                        Тренировка: {today.answers.trained ? 'да' : 'нет'}
                      </Text>
                      <Text style={[styles.summaryText, { color: muted }]}>
                        Ограниченная еда: {foodNames.length ? foodNames.join(', ') : 'нет'}
                      </Text>
                      <Text style={[styles.summaryText, { color: muted }]}>
                        Разгрузочный день: {today.answers.lightDay ? 'да' : 'нет'}
                      </Text>
                      <Text style={[styles.summaryText, { color: muted }]}>
                        Алкоголь: {today.answers.alcohol ? 'да' : 'нет'}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
                  <View style={styles.titleRow}>
                    <Ionicons name="calendar-number-outline" color="#22A788" size={22} />
                    <Text style={[styles.cardTitle, { color: textColor }]}>Без алкоголя</Text>
                  </View>
                  <View style={styles.countRow}>
                    <Text style={[styles.bigNumber, { color: textColor }]}>{today.alcoholFreeDays}</Text>
                    <Text style={[styles.numberLabel, { color: muted }]}>
                      {pluralDays(today.alcoholFreeDays)}
                    </Text>
                  </View>
                  <Text style={[styles.helper, { color: muted }]}>
                    Отсчёт с {formatDate(today.alcoholFreeSince)}. Отметка алкоголя находится в анкете дня.
                  </Text>
                </View>

                <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
                  <View style={styles.titleRow}>
                    <Ionicons name="barbell-outline" color="#22A788" size={22} />
                    <Text style={[styles.cardTitle, { color: textColor }]}>Тренировки сегодня</Text>
                  </View>
                  <Text style={[styles.workoutCount, { color: textColor }]}>
                    {today.workoutEntries} {today.workoutEntries === 1 ? 'запись' : 'записей'}
                  </Text>
                  <Text style={[styles.helper, { color: muted }]} numberOfLines={2}>
                    {today.workoutNames.length
                      ? today.workoutNames.join(' · ')
                      : 'В журнале сегодня ещё нет занятий.'}
                  </Text>
                  <Pressable onPress={() => router.navigate('/workouts')} style={styles.linkRow}>
                    <Text style={styles.linkText}>Открыть журнал</Text>
                    <Ionicons name="arrow-forward" color="#22A788" size={18} />
                  </Pressable>
                </View>
              </>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </SafeAreaView>
      </SwipeTabScreen>

      <Modal
        visible={modalOpen}
        animationType="slide"
        onRequestClose={() => { if (!saving) setModalOpen(false); }}
      >
        <SafeAreaView style={[styles.root, { backgroundColor: background }]} edges={['top', 'bottom']}>
          <View style={[styles.modalHeader, { borderBottomColor: border }]}>
            <View style={styles.modalTitleWrap}>
              <Text style={[styles.modalTitle, { color: textColor }]}>
                {today?.checkedIn ? 'Редактировать день' : 'Отметить день'}
              </Text>
              <Text style={[styles.small, { color: muted }]}>{today ? formatDate(today.date) : ''}</Text>
            </View>
            <Pressable
              accessibilityLabel="Закрыть анкету"
              disabled={saving}
              onPress={() => setModalOpen(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={25} color={textColor} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <YesNoQuestion
              label="Была тренировка?"
              hint={today?.workoutEntries
                ? 'Тренировка уже есть в журнале, поэтому здесь выбран ответ «Да».'
                : 'Если записал тренировку в журнал, она также учитывается автоматически.'}
              value={form.trained}
              onChange={(value) => updateForm('trained', value)}
              disabledNo={(today?.workoutEntries ?? 0) > 0}
              textColor={textColor} muted={muted} border={border}
            />

            <YesNoQuestion
              label="Ел ограниченную еду?"
              hint="Можно выбрать несколько позиций из списка ниже."
              value={ateRestricted}
              onChange={setAteRestricted}
              textColor={textColor} muted={muted} border={border}
            />
            {ateRestricted ? (
              <View style={styles.foodList}>
                {restrictedItems.map((item) => {
                  const selected = form.restrictedIds.includes(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => toggleFood(item.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      style={[
                        styles.foodOption,
                        { backgroundColor: card, borderColor: selected ? '#22A788' : border },
                      ]}
                    >
                      <Ionicons
                        name={selected ? 'checkbox' : 'square-outline'}
                        color={selected ? '#22A788' : muted}
                        size={22}
                      />
                      <Text style={[styles.foodText, { color: textColor }]}>{item.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <YesNoQuestion
              label="Был разгрузочный день?"
              hint="Лёгкий сбалансированный рацион, не голодание."
              value={form.lightDay}
              onChange={(value) => updateForm('lightDay', value)}
              textColor={textColor} muted={muted} border={border}
            />

            <YesNoQuestion
              label="Употреблял алкоголь?"
              hint="Если ответить «Да», счётчик дней без алкоголя станет 0."
              value={form.alcohol}
              onChange={(value) => updateForm('alcohol', value)}
              textColor={textColor} muted={muted} border={border}
            />
            <Text style={[styles.modalNote, { color: muted }]}>
              Ответы можно изменить сегодня. Уже засчитанный день не отменяется.
            </Text>
          </ScrollView>

          <View style={[styles.footer, { backgroundColor: background, borderTopColor: border }]}>
            <Pressable
              disabled={saving}
              onPress={() => { void submitForm(); }}
              style={[styles.mainButton, styles.modalSave, saving && styles.disabled]}
            >
              <Text style={styles.mainButtonText}>
                {saving ? 'Сохранение...' : today?.checkedIn ? 'Сохранить изменения' : 'Сохранить день'}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 32 },
  brand: { color: '#22A788', fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  heading: { fontSize: 32, fontWeight: '800', marginTop: 8 },
  date: { marginTop: 4, marginBottom: 22, fontSize: 15 },
  loading: { marginTop: 55 },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 16, gap: 5 },
  statNumber: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12 },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  helper: { fontSize: 13, lineHeight: 19, marginTop: 7 },
  mainButton: {
    backgroundColor: '#22A788', borderRadius: 13, minHeight: 49,
    marginTop: 16, justifyContent: 'center', alignItems: 'center',
    flexDirection: 'row', gap: 8,
  },
  mainButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  summary: { marginTop: 15, gap: 5 },
  summaryText: { fontSize: 13, lineHeight: 19 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9, marginTop: 12 },
  bigNumber: { fontSize: 43, fontWeight: '800' },
  numberLabel: { fontSize: 17 },
  workoutCount: { fontSize: 20, fontWeight: '700', marginTop: 10 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 15 },
  linkText: { color: '#22A788', fontWeight: '700', fontSize: 14 },
  error: { color: '#CC3E3E', marginTop: 15, fontSize: 13 },
  modalHeader: {
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  modalTitleWrap: { flex: 1 },
  modalTitle: { fontSize: 23, fontWeight: '800' },
  small: { fontSize: 13, lineHeight: 18, marginTop: 5 },
  closeButton: { padding: 8 },
  modalBody: { paddingHorizontal: 20, paddingBottom: 30 },
  question: { paddingVertical: 18, borderBottomWidth: 1 },
  questionTitle: { fontSize: 17, fontWeight: '700' },
  choiceRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  choice: {
    flex: 1, height: 43, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  choiceSelected: { backgroundColor: '#E4F6EF' },
  choiceText: { fontSize: 15, fontWeight: '700' },
  foodList: { paddingVertical: 12, gap: 8 },
  foodOption: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  foodText: { fontSize: 14, fontWeight: '600', flex: 1 },
  modalNote: { fontSize: 12, lineHeight: 18, paddingTop: 20 },
  footer: { paddingHorizontal: 20, paddingBottom: 14, borderTopWidth: 1 },
  modalSave: { marginTop: 12 },
  disabled: { opacity: 0.5 },
});
