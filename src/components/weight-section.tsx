import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import {
  deleteWeightEntry,
  listWeightEntries,
  parseWeightDate,
  readableDate,
  saveWeightEntry,
  todayKey,
  type WeightEntry,
} from '@/database/weight';
import { artivityTheme, softShadow } from './artivity-theme';

function kg(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

function dateOrdinal(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function WeightChart({ entries, dark }: { entries: WeightEntry[]; dark: boolean }) {
  const [width, setWidth] = useState(300);
  const shown = entries.slice(-16);
  if (!shown.length) return null;

  const height = 184;
  const left = 40;
  const right = 12;
  const top = 16;
  const bottom = 26;
  const w = Math.max(1, width - left - right);
  const h = height - top - bottom;
  const weights = shown.map(item => item.weight_kg);
  const minValue = Math.min(...weights);
  const maxValue = Math.max(...weights);
  const margin = Math.max(0.6, (maxValue - minValue) * 0.28);
  const minY = Math.max(0, minValue - margin);
  const maxY = maxValue + margin;
  const first = dateOrdinal(shown[0].date);
  const last = dateOrdinal(shown[shown.length - 1].date);
  const dx = Math.max(1, last - first);
  const points = shown.map((entry) => ({
    x: shown.length === 1 ? left + w / 2 : left + ((dateOrdinal(entry.date) - first) / dx) * w,
    y: top + (1 - (entry.weight_kg - minY) / (maxY - minY)) * h,
  }));
  const line = points.map(point => `${point.x},${point.y}`).join(' ');
  const grid = dark ? '#344656' : '#E9F0F2';
  const muted = dark ? '#A9B7C5' : '#82909D';

  return (
    <View style={styles.chartWrap} onLayout={e => {
      const measured = Math.round(e.nativeEvent.layout.width);
      if (measured > 0 && measured !== width) setWidth(measured);
    }}>
      <Svg width={width} height={height}>
        {[0, 0.5, 1].map((fraction, index) => {
          const y = top + fraction * h;
          return (
            <Line key={`grid-${index}`} x1={left} y1={y} x2={width - right} y2={y}
              stroke={grid} strokeWidth={1} strokeDasharray={index === 1 ? '3 4' : undefined} />
          );
        })}
        {[0, 0.5, 1].map((fraction, index) => (
          <SvgText key={`y-${index}`} x={0} y={top + fraction * h + 4} fill={muted} fontSize={10}>
            {(maxY - fraction * (maxY - minY)).toFixed(1)}
          </SvgText>
        ))}
        {shown.length > 1 ? (
          <Polyline points={line} stroke="#11C779" strokeWidth={3.5}
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ) : null}
        {points.map((point, index) => (
          <Circle key={`point-${index}`} cx={point.x} cy={point.y}
            r={index === points.length - 1 ? 5 : 3} fill="#11C779"
            stroke={dark ? '#1A2935' : '#FFFFFF'} strokeWidth={2} />
        ))}
        <SvgText x={left} y={height - 5} fill={muted} fontSize={11}>
          {readableDate(shown[0].date).slice(0, 5)}
        </SvgText>
        {shown.length > 1 ? (
          <SvgText x={width - right} y={height - 5} textAnchor="end" fill={muted} fontSize={11}>
            {readableDate(shown[shown.length - 1].date).slice(0, 5)}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}

export default function WeightSection() {
  const db = useSQLiteContext();
  const dark = useColorScheme() === 'dark';
  const t = artivityTheme(dark);
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [dateInput, setDateInput] = useState(readableDate(todayKey()));
  const [weightInput, setWeightInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setEntries(await listWeightEntries(db));
  }, [db]);

  useFocusEffect(useCallback(() => {
    let active = true;
    listWeightEntries(db).then(rows => {
      if (active) { setEntries(rows); setError(''); }
    }).catch(() => {
      if (active) setError('Не удалось загрузить измерения веса');
    });
    return () => { active = false; };
  }, [db]));

  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const date = parseWeightDate(dateInput);
      await saveWeightEntry(db, date, weightInput);
      await refresh();
      setWeightInput('');
      setDateInput(readableDate(todayKey()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить вес');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(date: string) {
    Alert.alert('Удалить измерение?', `Вес за ${readableDate(date)} будет удалён.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        void (async () => {
          try {
            await deleteWeightEntry(db, date);
            await refresh();
          } catch {
            setError('Не удалось удалить измерение');
          }
        })();
      } },
    ]);
  }

  const latest = entries[entries.length - 1];
  const previous = entries[entries.length - 2];
  const difference = latest && previous ? latest.weight_kg - previous.weight_kg : null;

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
      <View style={styles.heading}>
        <View style={[styles.iconBox, { backgroundColor: dark ? '#244338' : '#E4FBED' }]}>
          <Ionicons name="scale-outline" size={22} color={t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headingText, { color: t.text }]}>Вес</Text>
          <Text style={[styles.caption, { color: t.muted }]}>Динамика измерений</Text>
        </View>
      </View>

      <View style={styles.currentRow}>
        <Text style={[styles.currentValue, { color: t.text }]}>
          {latest ? `${kg(latest.weight_kg)} кг` : '— кг'}
        </Text>
        {difference !== null ? (
          <Text style={[styles.change, { color: t.muted }]}>
            {difference > 0 ? '+' : ''}{kg(difference)} кг от прошлого измерения
          </Text>
        ) : null}
      </View>

      {entries.length ? (
        <WeightChart entries={entries} dark={dark} />
      ) : (
        <View style={[styles.emptyChart, { backgroundColor: dark ? '#22333F' : '#F5FAF7' }]}>
          <Ionicons name="analytics-outline" color={t.primary} size={28} />
          <Text style={[styles.emptyText, { color: t.muted }]}>Добавь первое измерение — здесь появится график.</Text>
        </View>
      )}

      <View style={styles.inputs}>
        <View style={[styles.fieldDate]}>
          <Text style={[styles.inputLabel, { color: t.muted }]}>Дата</Text>
          <TextInput
            accessibilityLabel="Дата измерения веса"
            value={dateInput}
            onChangeText={setDateInput}
            placeholder="ДД.ММ.ГГГГ"
            placeholderTextColor={t.muted}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
          />
        </View>
        <View style={styles.fieldWeight}>
          <Text style={[styles.inputLabel, { color: t.muted }]}>Вес, кг</Text>
          <TextInput
            accessibilityLabel="Вес в килограммах"
            value={weightInput}
            onChangeText={setWeightInput}
            placeholder="85,5"
            placeholderTextColor={t.muted}
            keyboardType="decimal-pad"
            maxLength={6}
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
          />
        </View>
      </View>
      <Pressable disabled={busy} onPress={() => { void save(); }} style={[styles.save, busy && styles.disabled]}>
        <Ionicons name="add-circle-outline" size={19} color="#FFFFFF" />
        <Text style={styles.saveText}>{busy ? 'Сохраняем...' : 'Сохранить вес'}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {entries.length ? (
        <View style={[styles.history, { borderTopColor: t.border }]}>
          <Text style={[styles.historyTitle, { color: t.text }]}>Последние измерения</Text>
          {[...entries].reverse().slice(0, 4).map(entry => (
            <View key={entry.date} style={styles.historyRow}>
              <Pressable style={styles.historyValue} onPress={() => {
                setDateInput(readableDate(entry.date));
                setWeightInput(kg(entry.weight_kg));
              }}>
                <Text style={[styles.historyDate, { color: t.muted }]}>{readableDate(entry.date)}</Text>
                <Text style={[styles.historyNumber, { color: t.text }]}>{kg(entry.weight_kg)} кг</Text>
                <Ionicons name="pencil-outline" color={t.muted} size={16} />
              </Pressable>
              <Pressable accessibilityLabel={`Удалить измерение ${readableDate(entry.date)}`}
                onPress={() => confirmDelete(entry.date)} style={styles.delete}>
                <Ionicons name="trash-outline" size={18} color="#D46A67" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 22, padding: 17, marginBottom: 13, ...softShadow },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headingText: { fontSize: 19, fontWeight: '900' },
  caption: { fontSize: 12, marginTop: 3 },
  currentRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  currentValue: { fontSize: 29, fontWeight: '900' },
  change: { fontSize: 11 },
  chartWrap: { width: '100%', marginTop: 12, height: 187 },
  emptyChart: { marginTop: 14, borderRadius: 14, padding: 20, alignItems: 'center', gap: 9 },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  inputs: { flexDirection: 'row', gap: 10, marginTop: 15 },
  fieldDate: { flex: 1.2 },
  fieldWeight: { flex: 0.8 },
  inputLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 11, minHeight: 45, paddingHorizontal: 11, fontSize: 15 },
  save: { backgroundColor: '#12C873', minHeight: 45, marginTop: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  error: { fontSize: 12, color: '#E04D50', marginTop: 10 },
  history: { marginTop: 16, paddingTop: 12, borderTopWidth: 1 },
  historyTitle: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  historyValue: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  historyDate: { fontSize: 12, width: 75 },
  historyNumber: { fontSize: 14, fontWeight: '800' },
  delete: { width: 32, height: 34, alignItems: 'center', justifyContent: 'center' },
});
