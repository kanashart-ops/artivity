
import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 1;

export async function initializeDatabase(
  db: SQLiteDatabase
): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const row = await db.getFirstAsync<{
    user_version: number;
  }>('PRAGMA user_version');

  if (!row) {
    throw new Error('Не удалось определить версию базы данных');
  }

  const currentVersion = row.user_version;

  if (currentVersion > DATABASE_VERSION) {
    throw new Error('Версия базы данных новее версии приложения');
  }

  if (currentVersion === DATABASE_VERSION) {
    return;
  }

  await db.withTransactionAsync(async () => {
    if (currentVersion < 1) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS daily_entries (
          date TEXT PRIMARY KEY NOT NULL,
          checked_in INTEGER NOT NULL DEFAULT 0,
          alcohol INTEGER NOT NULL DEFAULT 0,
          light_day INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS workout_names (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS workout_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workout_id INTEGER NOT NULL,
          performed_on TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

          FOREIGN KEY (workout_id)
            REFERENCES workout_names(id)
            ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workout_sets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_id INTEGER NOT NULL,
          set_index INTEGER NOT NULL,
          weight_kg REAL,
          reps INTEGER,

          FOREIGN KEY (entry_id)
            REFERENCES workout_entries(id)
            ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS restricted_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          tier INTEGER NOT NULL,
          base_interval_days INTEGER NOT NULL,
          minimum_interval_days INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS consumption_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL,
          consumed_at TEXT NOT NULL,
          interval_days INTEGER NOT NULL,
          was_early INTEGER NOT NULL DEFAULT 0,

          FOREIGN KEY (item_id)
            REFERENCES restricted_items(id)
            ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_workout_date
          ON workout_entries(performed_on);

        CREATE INDEX IF NOT EXISTS idx_consumption_item
          ON consumption_events(item_id, consumed_at);
      `);
    }

    await db.execAsync(
      'PRAGMA user_version = 1;'
    );
  });
}
