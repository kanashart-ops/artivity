import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
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

import SwipeTabScreen from '@/components/swipe-tab-screen';
import {
  levelDescription,
  loadIntervalSnapshot,
  markConsumedToday,
  type IntervalCard,
  type IntervalEvent,
  type IntervalSnapshot,
} from '@/database/intervals';

const GROUPS = [
  {
    tier: 1,
    title: 'Редкие удовольствия',
    description: 'Строгие интервалы. Тренировки сокращают их совсем немного.',
    color: '#C77B26',
  },
  {
    tier: 2,
    title: 'Умеренные ограничения',
    description: 'Интервалы средней длины с постепенной адаптацией.',
    color: '#3973B9',
  },
  {
    tier: 3,
    title: 'Небольшие удовольствия',
    description: 'Короткие интервалы, которые быстрее реагируют на привычки.',
    color: '#199D79',
  },
] as const;

function dateForDisplay(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

function dayWord(value: number) {
  const tens = value % 100;
  const units = value % 10;
  if (tens >= 11 && tens <= 14) return 'дней';
  if (units === 1) return 'день';
  if (units >= 2 && units <= 4) return 'дня';
  return 'дней';
}

function explanation(event: IntervalEvent) {
  const changes: string[] = [];
  if (event.training_bonus_days) changes.push(`тренировки −${event.training_bonus_days}`);
  if (event.light_bonus_days) changes.push(`регулярные лёгкие дни −${event.light_bonus_days}`);
  if (event.alcohol_extra_days) changes.push(`алкоголь +${event.alcohol_extra_days}`);
  if (event.early_penalty_days) changes.push(`ранний повтор +${event.early_penalty_days}`);
  return changes.length ? changes.join(' · ') : 'Без корректировок';
}

type CardProps = {
  item: IntervalCard;
  muted: string;
  text: string;
  border: string;
  surface: string;
  accent: string;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onMark: () => void;
};

function IntervalProductCard({
  item, muted, text, border, surface, accent, expanded, busy, onToggle, onMark,
}: CardProps) {
  const last = item.history[0];
  const available = item.remainingDays === 0;
  const statusColor = available ? '#199D79' : accent;
  const status = !last
    ? 'Ещё не отмечался'
    : available
      ? 'Снова доступен'
      : `Осталось ${item.remainingDays} ${dayWord(item.remainingDays)}`;

  return (
    <View style={[styles.productCard, { backgroundColor: surface, borderColor: border }]}>
      <View style={styles.productTop}>
        <Text style={[styles.productName, { color: text }]}>{item.name}</Text>
        {item.recordedToday ? (
          <Ionicons name="checkmark-circle" size={22} color="#22A788" />
        ) : null}
      </View>
      <Text style={[styles.status, { color: statusColor }]}>{status}</Text>
      <Text style={[styles.detail, { color: muted }]}>
        {last
          ? `Последний раз: ${dateForDisplay(last.consumed_at)} · интервал ${last.interval_days} ${dayWord(last.interval_days)}`
          : `Базовый интервал: ${item.base_interval_days} ${dayWord(item.base_interval_days)}`}
      </Text>
      {last && item.nextAvailableDate && !available ? (
        <Text style={[styles.detail, { color: muted }]}>
          Рекомендованная дата: {dateForDisplay(item.nextAvailableDate)}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          disabled={item.recordedToday || busy}
          onPress={onMark}
          style={[styles.actionPrimary, (item.recordedToday || busy) && styles.actionDisabled]}
          accessibilityRole="button"
        >
          <Ionicons
            name={item.recordedToday ? 'checkmark' : 'add'}
            color="#FFFFFF" size={17}
          />
          <Text style={styles.actionPrimaryText}>
            {item.recordedToday ? 'Отмечено сегодня' : 'Съел сегодня'}
          </Text>
        </Pressable>
        <Pressable onPress={onToggle} style={[styles.actionSecondary, { borderColor: border }]}>
          <Text style={[styles.actionSecondaryText, { color: text }]}>История</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} color={muted} size={17} />
        </Pressable>
      </View>

      {expanded ? (
        <View style={[styles.history, { borderTopColor: border }]}>
          <Text style={[styles.historyTitle, { color: text }]}>История употребления</Text>
          {item.history.length === 0 ? (
            <Text style={[styles.detail, { color: muted }]}>Записей пока нет.</Text>
          ) : item.history.map((event) => (
            <View key={event.id} style={[styles.historyRow, { borderBottomColor: border }]}>
              <View style={styles.historyDateRow}>
                <Text style={[styles.historyDate, { color: text }]}>
                  {dateForDisplay(event.consumed_at)}
                </Text>
                <Text style={[styles.historyInterval, { color: text }]}>
                  {event.interval_days} {dayWord(event.interval_days)}
                </Text>
              </View>
              {event.was_early ? (
                <Text style={styles.earlyText}>Раньше рекомендованного срока</Text>
              ) : null}
              <Text style={[styles.historyFactors, { color: muted }]}>
                {explanation(event)}
              </Text>
            </View>
          ))}
          {item.history.length >= 15 ? (
            <Text style={[styles.detail, { color: muted }]}>Показаны последние 15 записей.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function IntervalsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const bg = dark ? '#101720' : '#F7F9FB';
  const surface = dark ? '#19232D' : '#FFFFFF';
  const text = dark ? '#F6F8FB' : '#17212D';
  const muted = dark ? '#9FA9B6' : '#738091';
  const border = dark ? '#2D3946' : '#E4E9EE';

  const [snapshot, setSnapshot] = useState<IntervalSnapshot | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await loadIntervalSnapshot(db);
    setSnapshot(data);
  }, [db]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    loadIntervalSnapshot(db)
      .then((data) => { if (active) { setSnapshot(data); setError(''); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Ошибка базы данных'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db]));

  const submit = useCallback(async (itemId: number) => {
    if (busyId !== null) return;
    setBusyId(itemId);
    setError('');
    try {
      await markConsumedToday(db, itemId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить событие');
    } finally {
      setBusyId(null);
    }
  }, [busyId, db, refresh]);

  const confirm = useCallback((item: IntervalCard) => {
    const warning = item.remainingDays > 0
      ? `Интервал ещё не закончился (${item.remainingDays} ${dayWord(item.remainingDays)}). Следующий период может увеличиться. Записать употребление?`
      : 'Добавить употребление в сегодняшнюю анкету?';
    Alert.alert(item.name, warning, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Записать', onPress: () => { void submit(item.id); } },
    ]);
  }, [submit]);

  return (
    <SwipeTabScreen>
      <SafeAreaView style={[styles.root, { backgroundColor: bg }]} edges={['top', 'left', 'right']}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.brand}>ARTIVITY</Text>
          <Text style={[styles.title, { color: text }]}>Интервалы</Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            Рекомендуемые паузы между употреблениями. Это ориентиры, а не запреты.
          </Text>

          {loading ? (
            <ActivityIndicator color="#22A788" style={styles.spinner} />
          ) : snapshot ? (
            <>
              <View style={[styles.trainingCard, { backgroundColor: surface, borderColor: border }]}>
                <View style={styles.trainingHeader}>
                  <Ionicons name="barbell-outline" color="#22A788" size={22} />
                  <Text style={[styles.trainingTitle, { color: text }]}>Влияние тренировок</Text>
                </View>
                <Text style={[styles.trainingLevel, { color: '#22A788' }]}>
                  {levelDescription(snapshot.training.level)} · уровень {snapshot.training.level}/4
                </Text>
                <Text style={[styles.detail, { color: muted }]}>
                  За 7 дней: {snapshot.training.last7} · за 14: {snapshot.training.last14} · за 30: {snapshot.training.last30}
                </Text>
                <Text style={[styles.detail, { color: muted }]}>
                  Два тренировочных дня за неделю уже дают небольшой бонус. Регулярность усиливает его.
                  Расчёт применяется при следующем употреблении.
                </Text>
              </View>

              {GROUPS.map((group) => {
                const items = snapshot.items.filter((item) => item.tier === group.tier);
                return (
                  <View key={group.tier} style={styles.group}>
                    <View style={styles.groupHeading}>
                      <View style={[styles.groupDot, { backgroundColor: group.color }]} />
                      <Text style={[styles.groupTitle, { color: text }]}>{group.title}</Text>
                    </View>
                    <Text style={[styles.groupDescription, { color: muted }]}>
                      {group.description}
                    </Text>
                    {items.map((item) => (
                      <IntervalProductCard
                        key={item.id}
                        item={item}
                        muted={muted}
                        text={text}
                        border={border}
                        surface={surface}
                        accent={group.color}
                        expanded={expanded === item.id}
                        busy={busyId !== null}
                        onToggle={() => setExpanded((old) => old === item.id ? null : item.id)}
                        onMark={() => confirm(item)}
                      />
                    ))}
                  </View>
                );
              })}
              <Pressable onPress={() => router.navigate('/')} style={styles.todayLink}>
                <Ionicons name="create-outline" color="#22A788" size={18} />
                <Text style={styles.todayLinkText}>Исправить сегодняшние отметки</Text>
              </Pressable>
              <Text style={[styles.bottomNote, { color: muted }]}>
                Исправление анкеты пересчитывает только события сегодняшнего дня.
                Уже начатые ранее интервалы не изменяются.
              </Text>
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
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  brand: { color: '#22A788', fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  title: { fontSize: 32, fontWeight: '800', marginTop: 8 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 18 },
  spinner: { marginTop: 55 },
  trainingCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 25, gap: 7 },
  trainingHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  trainingTitle: { fontSize: 16, fontWeight: '700' },
  trainingLevel: { fontSize: 14, fontWeight: '700', marginTop: 3 },
  detail: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  group: { marginBottom: 20, gap: 10 },
  groupHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  groupDot: { width: 10, height: 10, borderRadius: 5 },
  groupTitle: { fontSize: 18, fontWeight: '800' },
  groupDescription: { fontSize: 12, lineHeight: 18, marginBottom: 1 },
  productCard: { borderWidth: 1, borderRadius: 16, padding: 15 },
  productTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  productName: { flex: 1, fontSize: 16, fontWeight: '700' },
  status: { fontSize: 14, fontWeight: '700', marginTop: 7 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 14 },
  actionPrimary: {
    flex: 1, backgroundColor: '#22A788', borderRadius: 10,
    minHeight: 43, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5,
  },
  actionPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  actionDisabled: { opacity: 0.45 },
  actionSecondary: {
    minWidth: 95, borderRadius: 10, borderWidth: 1, minHeight: 43,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingHorizontal: 10,
  },
  actionSecondaryText: { fontSize: 13, fontWeight: '700' },
  history: { marginTop: 16, paddingTop: 14, borderTopWidth: 1 },
  historyTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  historyRow: { borderBottomWidth: 1, paddingVertical: 10 },
  historyDateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyDate: { fontSize: 13, fontWeight: '700' },
  historyInterval: { fontSize: 13, fontWeight: '700' },
  historyFactors: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  earlyText: { fontSize: 12, color: '#C77B26', marginTop: 4 },
  todayLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 14 },
  todayLinkText: { color: '#22A788', fontSize: 14, fontWeight: '700' },
  bottomNote: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  error: { color: '#CC3E3E', fontSize: 13, lineHeight: 18, marginTop: 16 },
});
