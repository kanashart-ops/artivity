import type { SQLiteDatabase } from 'expo-sqlite';

export type TonnageTotals = {
  weekKg: number;
  monthKg: number;
  yearKg: number;
  allKg: number;
};

function dayKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

// «Неделя» — с понедельника, «месяц» и «год» — текущие календарные.
// Считаем только подходы с указанными весом И повторениями.
// Записи внутри комплекса — те же workout_entries, считаются лишь один раз.
export async function loadTonnageTotals(db: SQLiteDatabase): Promise<TonnageTotals> {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstYear = new Date(today.getFullYear(), 0, 1);
  const current = dayKey(today);
  const row = await db.getFirstAsync<{
    week: number; month: number; year: number; all_time: number;
  }>(`
    SELECT
      COALESCE(SUM(CASE WHEN e.performed_on BETWEEN ? AND ? THEN s.weight_kg * s.reps ELSE 0 END), 0) AS week,
      COALESCE(SUM(CASE WHEN e.performed_on BETWEEN ? AND ? THEN s.weight_kg * s.reps ELSE 0 END), 0) AS month,
      COALESCE(SUM(CASE WHEN e.performed_on BETWEEN ? AND ? THEN s.weight_kg * s.reps ELSE 0 END), 0) AS year,
      COALESCE(SUM(s.weight_kg * s.reps), 0) AS all_time
    FROM workout_sets s
    JOIN workout_entries e ON e.id = s.entry_id
    WHERE s.weight_kg IS NOT NULL AND s.reps IS NOT NULL
      AND s.weight_kg >= 0 AND s.reps >= 0
      AND e.performed_on <= ?
  `, dayKey(monday), current, dayKey(firstMonth), current,
    dayKey(firstYear), current, current);

  return {
    weekKg: row?.week ?? 0,
    monthKg: row?.month ?? 0,
    yearKg: row?.year ?? 0,
    allKg: row?.all_time ?? 0,
  };
}

export function setTonnage(weightKg: number | null, reps: number | null): number {
  return weightKg !== null && reps !== null && weightKg > 0 && reps > 0
    ? weightKg * reps
    : 0;
}

export function sessionTonnage(sets: Array<{ weight_kg: number | null; reps: number | null }>): number {
  return sets.reduce((sum, set) => sum + setTonnage(set.weight_kg, set.reps), 0);
}

function niceNumber(value: number, fractionDigits = 0): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: fractionDigits });
}

export function formatTonnage(kg: number): string {
  if (kg >= 1000) return `${niceNumber(kg / 1000, 2)} т`;
  return `${niceNumber(kg, 1)} кг`;
}

export function formatKg(kg: number): string {
  return `${niceNumber(kg, 1)} кг`;
}
