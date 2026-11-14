import type { SQLiteDatabase } from 'expo-sqlite';

export type WorkoutKind = 'strength' | 'cardio' | 'home';
export type CalendarWorkout = { name: string; category: WorkoutKind };

export type CalendarDay = {
  date: string;
  checkedIn: boolean;
  manualWorkout: boolean;
  lightDay: boolean;
  alcohol: boolean;
  pool: boolean;
  workouts: CalendarWorkout[];
  foods: string[];
};

type DailyRow = {
  date: string;
  checked_in: number;
  trained: number;
  light_day: number;
  alcohol: number;
};

type WorkoutRow = {
  date: string;
  name: string;
  category: WorkoutKind;
};

type FoodRow = { date: string; name: string };

export function monthDateKey(year: number, month: number): string {
  const m = String(month + 1).padStart(2, '0');
  return `${year}-${m}-01`;
}

/** Calendar data is read-only: opening a month never creates or changes records. */
export async function loadCalendarMonth(
  db: SQLiteDatabase,
  year: number,
  month: number
): Promise<Record<string, CalendarDay>> {
  const from = monthDateKey(year, month);
  const untilYear = month === 11 ? year + 1 : year;
  const next = monthDateKey(untilYear, month === 11 ? 0 : month + 1);

  const [daily, workouts, foods, pool] = await Promise.all([
    db.getAllAsync<DailyRow>(
      `SELECT date, checked_in, trained, light_day, alcohol
       FROM daily_entries WHERE date >= ? AND date < ?`,
      from, next
    ),
    db.getAllAsync<WorkoutRow>(
      `SELECT we.performed_on AS date, wn.name AS name, wn.category AS category
       FROM workout_entries we
       JOIN workout_names wn ON wn.id = we.workout_id
       WHERE we.performed_on >= ? AND we.performed_on < ?
       ORDER BY we.performed_on, we.id`,
      from, next
    ),
    db.getAllAsync<FoodRow>(
      `SELECT substr(ce.consumed_at, 1, 10) AS date, ri.name AS name
       FROM consumption_events ce
       JOIN restricted_items ri ON ri.id = ce.item_id
       WHERE ce.consumed_at >= ? AND ce.consumed_at < ?
       ORDER BY ce.consumed_at, ce.id`,
      `${from}T00:00:00`, `${next}T00:00:00`
    ),
    db.getAllAsync<{ date: string }>(
      'SELECT date FROM pool_visits WHERE date >= ? AND date < ?', from, next
    ),
  ]);

  const result: Record<string, CalendarDay> = {};
  const ensure = (date: string): CalendarDay => {
    if (!result[date]) {
      result[date] = {
        date, checkedIn: false, manualWorkout: false,
        lightDay: false, alcohol: false, pool: false, workouts: [], foods: [],
      };
    }
    return result[date];
  };

  for (const entry of daily) {
    const day = ensure(entry.date);
    day.checkedIn = entry.checked_in === 1;
    day.manualWorkout = entry.trained === 1;
    day.lightDay = entry.light_day === 1;
    day.alcohol = entry.alcohol === 1;
  }
  for (const visit of pool) {
    ensure(visit.date).pool = true;
  }
  for (const entry of workouts) {
    ensure(entry.date).workouts.push({
      name: entry.name,
      category: entry.category,
    });
  }
  for (const entry of foods) {
    const day = ensure(entry.date);
    if (!day.foods.includes(entry.name)) day.foods.push(entry.name);
  }

  return result;
}
