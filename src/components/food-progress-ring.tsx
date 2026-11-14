import { Text, View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { IntervalCard } from '@/database/intervals';

type Props = {
  item: IntervalCard;
  size?: number;
  dark?: boolean;
  compact?: boolean;
};

function mix(from: number[], to: number[], amount: number): string {
  const x = Math.max(0, Math.min(1, amount));
  const n = from.map((v, i) => Math.round(v + (to[i] - v) * x));
  return `rgb(${n[0]}, ${n[1]}, ${n[2]})`;
}

// The ring stays complete; only its color changes from red to green.
export function ringColor(progress: number): string {
  const p = Math.max(0, Math.min(1, progress));
  if (p < 0.5) return mix([239, 80, 83], [245, 165, 53], p * 2);
  return mix([245, 165, 53], [23, 196, 109], (p - 0.5) * 2);
}

export function intervalProgress(item: IntervalCard): number {
  const last = item.history[0];
  if (!last) return 0;
  if (last.interval_days <= 0) return 1;
  return Math.max(0, Math.min(1,
    (last.interval_days - item.remainingDays) / last.interval_days
  ));
}

export function FoodProgressRing({ item, size = 112, dark = false, compact = false }: Props) {
  const last = item.history[0];
  const completed = Boolean(last) && item.remainingDays === 0;
  const progress = intervalProgress(item);
  const stroke = size >= 108 ? 10 : 8;
  const radius = (size - stroke - 4) / 2;
  const color = ringColor(last ? progress : 0);
  const foreground = dark ? '#F8FAFC' : '#152436';

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={stroke} />
      </Svg>
      <View style={styles.content}>
        <Text style={[styles.value, { color: completed ? '#16B869' : foreground, fontSize: compact ? (completed ? 12 : 17) : 21 }]}>
          {!last ? '—' : completed ? 'Готово' : item.remainingDays}
        </Text>
        <Text style={[styles.label, { color: dark ? '#B5C4D4' : '#728092', fontSize: compact ? 9 : 11 }]}>
          {!last ? 'нет записей' : completed ? 'доступно' : 'дней осталось'}
        </Text>
      </View>
    </View>
  );
}

export function WeeklyProgressRing({ count, size = 144, dark = false }: {
  count: number; size?: number; dark?: boolean;
}) {
  const stroke = 13;
  const radius = (size - stroke - 4) / 2;
  const c = 2 * Math.PI * radius;
  const p = Math.max(0, Math.min(1, count / 7));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={dark ? '#354454' : '#E1ECE9'} strokeWidth={stroke} fill="none" />
        {p > 0 && <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#11C777" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - p)}
          rotation={-90} origin={`${size / 2}, ${size / 2}`} fill="none" />}
      </Svg>
      <View style={styles.content}>
        <Text style={{ color: dark ? '#F8FAFC' : '#142332', fontSize: 33, fontWeight: '900' }}>
          {count}<Text style={{ fontSize: 17, fontWeight: '600' }}> / 7</Text>
        </Text>
        <Text style={{ color: dark ? '#AEBCCB' : '#64748B', fontSize: 11, textAlign: 'center' }}>дней отмечено</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  content: { position: 'absolute', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  value: { fontWeight: '900', textAlign: 'center' },
  label: { fontWeight: '500', textAlign: 'center', marginTop: 2 },
});
