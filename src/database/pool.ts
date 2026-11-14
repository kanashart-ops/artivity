import type { SQLiteDatabase } from 'expo-sqlite';

export type PoolConsistency = {
  last7: number;
  last14: number;
  bonusDays: number;
};

function dateOrdinal(key: string): number {
  const [year, month, day] = key.slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}
function daysAgo(key: string, days: number): string {
  return new Date((dateOrdinal(key) - days) * 86_400_000).toISOString().slice(0, 10);
}
export function poolToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function hasPoolVisit(db: SQLiteDatabase, date = poolToday()): Promise<boolean> {
  const row = await db.getFirstAsync<{ date: string }>(
    'SELECT date FROM pool_visits WHERE date = ?', date
  );
  return Boolean(row);
}

export async function markPoolVisit(db: SQLiteDatabase, date = poolToday()): Promise<void> {
  if (date !== poolToday()) throw new Error('Дата изменилась. Попробуй ещё раз.');
  await db.runAsync('INSERT OR IGNORE INTO pool_visits (date) VALUES (?)', date);
}

export async function removePoolVisit(db: SQLiteDatabase, date = poolToday()): Promise<void> {
  if (date !== poolToday()) throw new Error('Можно исправить только сегодняшнюю отметку.');
  await db.runAsync('DELETE FROM pool_visits WHERE date = ?', date);
}

/** A single swim never shortens an interval: at least 2 distinct days in the last 7. */
export async function getPoolConsistency(db: SQLiteDatabase, date = poolToday()): Promise<PoolConsistency> {
  const rows = await db.getAllAsync<{ date: string }>(
    'SELECT date FROM pool_visits WHERE date BETWEEN ? AND ?', daysAgo(date, 13), date
  );
  const ordinal = dateOrdinal(date);
  const last7 = rows.filter(row => ordinal - dateOrdinal(row.date) < 7).length;
  const last14 = rows.length;
  // Established habit: 2 visits/7 days -> 1 day; 4 visits/14 days -> 2 days.
  const bonusDays = last7 >= 2 ? (last14 >= 4 ? 2 : 1) : 0;
  return { last7, last14, bonusDays };
}
