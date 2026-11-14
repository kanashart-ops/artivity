import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 7;

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  if (!row) throw new Error('Не удалось определить версию базы данных');

  const currentVersion = row.user_version;
  if (currentVersion > DATABASE_VERSION) {
    throw new Error('Версия базы данных новее версии приложения');
  }
  if (currentVersion === DATABASE_VERSION) return;

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
          FOREIGN KEY (workout_id) REFERENCES workout_names(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workout_sets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_id INTEGER NOT NULL,
          set_index INTEGER NOT NULL,
          weight_kg REAL,
          reps INTEGER,
          FOREIGN KEY (entry_id) REFERENCES workout_entries(id) ON DELETE CASCADE
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
          FOREIGN KEY (item_id) REFERENCES restricted_items(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_workout_date
          ON workout_entries(performed_on);
        CREATE INDEX IF NOT EXISTS idx_consumption_item
          ON consumption_events(item_id, consumed_at);
      `);
    }

    if (currentVersion < 2) {
      // Существующие тренировки сохраняются, тип по умолчанию — силовая.
      await db.execAsync(`
        ALTER TABLE workout_names
        ADD COLUMN category TEXT NOT NULL DEFAULT 'strength';
      `);
    }

    if (currentVersion < 3) {
      // Новые поля дополняют существующие таблицы, не очищая их.
      await db.execAsync(`
        ALTER TABLE daily_entries
        ADD COLUMN trained INTEGER NOT NULL DEFAULT 0;

        ALTER TABLE consumption_events
        ADD COLUMN source_date TEXT;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_consumption_report_unique
        ON consumption_events(item_id, source_date)
        WHERE source_date IS NOT NULL;
      `);

      // Стартовый список ограничений. Параметры предварительные.
      const starterItems: Array<[string, number, number, number]> = [
        ["McDonald's", 1, 40, 30],
        ['Пицца', 1, 30, 21],
        ['Большой фастфуд', 1, 30, 21],
        ['Шаурма', 2, 7, 5],
        ['Бургер', 2, 12, 7],
        ['Выпечка и десерты', 2, 7, 3],
        ['Небольшой десерт или снек', 3, 2, 1],
      ];

      for (const [name, tier, baseDays, minimumDays] of starterItems) {
        await db.runAsync(
          `INSERT INTO restricted_items
           (name, tier, base_interval_days, minimum_interval_days)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(name) DO NOTHING`,
          name,
          tier,
          baseDays,
          minimumDays
        );
      }
    }

    if (currentVersion < 4) {
      // Поля объясняют адаптивный расчёт, старые события остаются неизменными.
      await db.execAsync(`
        ALTER TABLE consumption_events ADD COLUMN training_bonus_days INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE consumption_events ADD COLUMN light_bonus_days INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE consumption_events ADD COLUMN alcohol_extra_days INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE consumption_events ADD COLUMN early_penalty_days INTEGER NOT NULL DEFAULT 0;
      `);
    }

    if (currentVersion < 5) {
      // Отдельный журнал веса. Все прежние таблицы остаются без изменений.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS weight_entries (
          date TEXT PRIMARY KEY NOT NULL,
          weight_kg REAL NOT NULL CHECK(weight_kg > 0 AND weight_kg <= 500),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }

    if (currentVersion < 6) {
      // Программы/комплексы объединяют существующие упражнения.
      // История workout_entries и workout_sets не переносится и не обнуляется.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS workout_complexes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          category TEXT NOT NULL DEFAULT 'strength',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS workout_complex_items (
          complex_id INTEGER NOT NULL,
          workout_id INTEGER NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (complex_id, workout_id),
          FOREIGN KEY (complex_id) REFERENCES workout_complexes(id) ON DELETE CASCADE,
          FOREIGN KEY (workout_id) REFERENCES workout_names(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workout_complex_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          complex_id INTEGER NOT NULL,
          performed_on TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (complex_id) REFERENCES workout_complexes(id) ON DELETE CASCADE
        );

        ALTER TABLE workout_entries ADD COLUMN complex_session_id INTEGER
          REFERENCES workout_complex_sessions(id) ON DELETE SET NULL;

        CREATE INDEX IF NOT EXISTS idx_complex_session_date
          ON workout_complex_sessions(complex_id, performed_on);
        CREATE INDEX IF NOT EXISTS idx_workout_complex_session
          ON workout_entries(complex_session_id);
      `);
    }

    if (currentVersion < 7) {
      // Бассейн хранится отдельно и не заменяет ежедневную анкету.
      // Старые таймеры сохраняют свою прежнюю формулу (NULL = стандартное правило).
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS pool_visits (
          date TEXT PRIMARY KEY NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE restricted_items ADD COLUMN activity_impact_days INTEGER;
        ALTER TABLE consumption_events ADD COLUMN pool_bonus_days INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE consumption_events ADD COLUMN inactivity_extra_days INTEGER NOT NULL DEFAULT 0;
      `);
    }

    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
}
