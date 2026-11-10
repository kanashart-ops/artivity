import type { SQLiteDatabase } from 'expo-sqlite';
import { upsertConsumptionEvent } from './intervals';

const ALCOHOL_FREE_START_KEY = 'alcohol_free_start_date';

export type RestrictedItem = {
  id: number;
  name: string;
  tier: number;
};

export type DayAnswers = {
  trained: boolean;
  lightDay: boolean;
  alcohol: boolean;
  restrictedIds: number[];
};

export type TodaySnapshot = {
  date: string;
  checkedIn: boolean;
  answers: DayAnswers;
  currentStreak: number;
  bestStreak: number;
  alcoholFreeDays: number;
  alcoholFreeSince: string;
  workoutEntries: number;
  workoutNames: string[];
};

type DailyRow = {
  checked_in: number;
  light_day: number;
  trained: number;
  alcohol: number;
};
type CheckinRow = { date: string };
type SettingRow = { value: string };
type CountRow = { total: number };
type WorkoutNameRow = { name: string };
type IdRow = { item_id: number };
// Сохраняем местную дату телефона, не UTC.
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function daysBetween(first: string, second: string): number {
  return dayNumber(second) - dayNumber(first);
}

function countStreaks(rows: CheckinRow[], today: string) {
  const checked = new Set(rows.map((row) => row.date));
  const start = dayNumber(today) - (checked.has(today) ? 0 : 1);
  let current = 0;

  for (let day = start; ; day--) {
    const key = new Date(day * 86_400_000).toISOString().slice(0, 10);
    if (!checked.has(key)) break;
    current++;
  }

  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of [...checked].sort()) {
    run = previous && daysBetween(previous, date) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }

  return { current, best };
}

export async function loadRestrictedItems(db: SQLiteDatabase): Promise<RestrictedItem[]> {
  return db.getAllAsync<RestrictedItem>(
    `SELECT id, name, tier FROM restricted_items
     ORDER BY tier, id`
  );
}

export async function loadToday(
  db: SQLiteDatabase,
  today: string = localDateKey()
): Promise<TodaySnapshot> {
  const daily = await db.getFirstAsync<DailyRow>(
    `SELECT checked_in, light_day, trained, alcohol
     FROM daily_entries WHERE date = ?`,
    today
  );
  const restricted = await db.getAllAsync<IdRow>(
    `SELECT item_id FROM consumption_events
     WHERE source_date = ? ORDER BY item_id`,
    today
  );
  const checkedDays = await db.getAllAsync<CheckinRow>(
    'SELECT date FROM daily_entries WHERE checked_in = 1 ORDER BY date DESC'
  );

  // Запоминаем начало счётчика лишь один раз.
  await db.runAsync(
    `INSERT INTO app_settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO NOTHING`,
    ALCOHOL_FREE_START_KEY,
    today
  );
  const startRow = await db.getFirstAsync<SettingRow>(
    'SELECT value FROM app_settings WHERE key = ?',
    ALCOHOL_FREE_START_KEY
  );
  const lastAlcohol = await db.getFirstAsync<{ date: string }>(
    `SELECT MAX(date) AS date FROM daily_entries
     WHERE alcohol = 1 AND date <= ?`,
    today
  );
  const baseDate = startRow?.value ?? today;
  const since = lastAlcohol?.date && lastAlcohol.date > baseDate
    ? lastAlcohol.date
    : baseDate;

  const count = await db.getFirstAsync<CountRow>(
    `SELECT COUNT(*) AS total FROM workout_entries
     WHERE performed_on = ?`,
    today
  );
  const names = await db.getAllAsync<WorkoutNameRow>(
    `SELECT wn.name
     FROM workout_entries we
     JOIN workout_names wn ON wn.id = we.workout_id
     WHERE we.performed_on = ?
     ORDER BY we.id DESC LIMIT 4`,
    today
  );
  const workoutEntries = count?.total ?? 0;
  const streaks = countStreaks(checkedDays, today);

  return {
    date: today,
    checkedIn: daily?.checked_in === 1,
    answers: {
      trained: daily?.trained === 1 || workoutEntries > 0,
      lightDay: daily?.light_day === 1,
      alcohol: daily?.alcohol === 1,
      restrictedIds: restricted.map((row) => row.item_id),
    },
    currentStreak: streaks.current,
    bestStreak: streaks.best,
    alcoholFreeDays: Math.max(0, daysBetween(since, today)),
    alcoholFreeSince: since,
    workoutEntries,
    workoutNames: names.map((row) => row.name),
  };
}

// Сохраняем анкету и события еды одной транзакцией, без повторных событий
// при редактировании и без возможности отменить уже засчитанный Streak.
export async function saveDayReport(
  db: SQLiteDatabase,
  date: string,
  answers: DayAnswers
): Promise<void> {
  if (date !== localDateKey()) {
    throw new Error('День изменился. Открой анкету заново.');
  }

  const restrictedIds = [...new Set(answers.restrictedIds)];

  await db.withExclusiveTransactionAsync(async (txn) => {
    const journal = await txn.getFirstAsync<CountRow>(
      `SELECT COUNT(*) AS total FROM workout_entries
       WHERE performed_on = ?`,
      date
    );
    const trained = answers.trained || (journal?.total ?? 0) > 0;

    await txn.runAsync(
      `INSERT INTO daily_entries
       (date, checked_in, trained, light_day, alcohol, updated_at)
       VALUES (?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(date) DO UPDATE SET
         checked_in = 1,
         trained = excluded.trained,
         light_day = excluded.light_day,
         alcohol = excluded.alcohol,
         updated_at = CURRENT_TIMESTAMP`,
      date,
      trained ? 1 : 0,
      answers.lightDay ? 1 : 0,
      answers.alcohol ? 1 : 0
    );

    const existing = await txn.getAllAsync<IdRow>(
      `SELECT item_id FROM consumption_events WHERE source_date = ?`,
      date
    );
    const oldIds = new Set(existing.map((row) => row.item_id));
    const newIds = new Set(restrictedIds);

    for (const id of oldIds) {
      if (!newIds.has(id)) {
        await txn.runAsync(
          `DELETE FROM consumption_events
           WHERE item_id = ? AND source_date = ?`,
          id,
          date
        );
      }
    }

    // Пересчитываем ТОЛЬКО события текущего дня при редактировании анкеты.
    // Ранее сохранённые даты и уже начатые таймеры не меняются.
    for (const id of newIds) {
      await upsertConsumptionEvent(txn, id, date);
    }
  });
}
