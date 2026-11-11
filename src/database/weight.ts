import type { SQLiteDatabase } from 'expo-sqlite';

export type WeightEntry = {
  date: string;
  weight_kg: number;
};

function validDate(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function readableDate(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
}

export function parseWeightDate(value: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) throw new Error('Введите дату в формате ДД.ММ.ГГГГ');
  const key = `${match[3]}-${match[2]}-${match[1]}`;
  if (!validDate(key)) throw new Error('Такой даты не существует');
  if (key > todayKey()) throw new Error('Нельзя записывать вес на будущую дату');
  return key;
}

export async function listWeightEntries(db: SQLiteDatabase): Promise<WeightEntry[]> {
  return db.getAllAsync<WeightEntry>(
    'SELECT date, weight_kg FROM weight_entries ORDER BY date ASC'
  );
}

export async function saveWeightEntry(
  db: SQLiteDatabase,
  date: string,
  rawWeight: string
): Promise<void> {
  if (!validDate(date) || date > todayKey()) throw new Error('Некорректная дата');
  const number = Number(rawWeight.trim().replace(',', '.'));
  if (!rawWeight.trim() || !Number.isFinite(number) || number <= 0 || number > 500) {
    throw new Error('Введите корректный вес в килограммах');
  }
  // Для одной даты — одно измерение; повторное сохранение исправляет его.
  await db.runAsync(
    `INSERT INTO weight_entries (date, weight_kg)
     VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET
       weight_kg = excluded.weight_kg,
       updated_at = CURRENT_TIMESTAMP`,
    date, Math.round(number * 10) / 10
  );
}

export async function deleteWeightEntry(db: SQLiteDatabase, date: string): Promise<void> {
  await db.runAsync('DELETE FROM weight_entries WHERE date = ?', date);
}
