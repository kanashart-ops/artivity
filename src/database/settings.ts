
import type { SQLiteDatabase } from 'expo-sqlite';

const TEST_KEY = 'sqlite_test_counter';

export async function readTestCounter(
  db: SQLiteDatabase
): Promise<number> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    TEST_KEY
  );

  return Number(row?.value ?? 0);
}

export async function incrementTestCounter(
  db: SQLiteDatabase
): Promise<number> {
  await db.runAsync(
    `
      INSERT INTO app_settings (key, value)
      VALUES (?, '1')
      ON CONFLICT(key)
      DO UPDATE SET value =
        CAST(CAST(value AS INTEGER) + 1 AS TEXT)
    `,
    TEST_KEY
  );

  return readTestCounter(db);
}
