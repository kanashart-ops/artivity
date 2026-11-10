import type { SQLiteDatabase } from 'expo-sqlite';

export type WorkoutCategory = 'strength' | 'cardio' | 'home';

export type Workout = {
  id: number;
  name: string;
  category: WorkoutCategory;
  session_count: number;
  last_date: string | null;
};

export type WorkoutSet = {
  weight_kg: number | null;
  reps: number | null;
};

export type WorkoutSession = {
  id: number;
  performed_on: string;
  sets: WorkoutSet[];
};

export const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  strength: 'Силовая',
  cardio: 'Кардио',
  home: 'Домашняя',
};

export async function listWorkouts(db: SQLiteDatabase): Promise<Workout[]> {
  return db.getAllAsync<Workout>(`
    SELECT w.id, w.name, w.category,
           COUNT(e.id) AS session_count,
           MAX(e.performed_on) AS last_date
    FROM workout_names w
    LEFT JOIN workout_entries e ON e.workout_id = w.id
    GROUP BY w.id
    ORDER BY w.name COLLATE NOCASE
  `);
}

export async function addWorkout(
  db: SQLiteDatabase,
  name: string,
  category: WorkoutCategory
): Promise<number> {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  if (!cleanName) throw new Error('Введи название тренировки');
  if (cleanName.length > 80) throw new Error('Слишком длинное название');

  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM workout_names WHERE name = ? COLLATE NOCASE',
    cleanName
  );
  if (existing) throw new Error('Такая тренировка уже есть в списке');

  const result = await db.runAsync(
    'INSERT INTO workout_names (name, category) VALUES (?, ?)',
    cleanName,
    category
  );
  return result.lastInsertRowId;
}

export async function getWorkout(
  db: SQLiteDatabase,
  id: number
): Promise<Workout | null> {
  return db.getFirstAsync<Workout>(`
    SELECT w.id, w.name, w.category,
           COUNT(e.id) AS session_count,
           MAX(e.performed_on) AS last_date
    FROM workout_names w
    LEFT JOIN workout_entries e ON e.workout_id = w.id
    WHERE w.id = ?
    GROUP BY w.id
  `, id);
}

type SessionRow = {
  id: number;
  performed_on: string;
};

export async function listSessions(
  db: SQLiteDatabase,
  workoutId: number
): Promise<WorkoutSession[]> {
  const sessions = await db.getAllAsync<SessionRow>(
    `SELECT id, performed_on FROM workout_entries
     WHERE workout_id = ? ORDER BY performed_on DESC, id DESC`,
    workoutId
  );

  const result: WorkoutSession[] = [];
  for (const session of sessions) {
    const sets = await db.getAllAsync<WorkoutSet>(
      `SELECT weight_kg, reps FROM workout_sets
       WHERE entry_id = ? ORDER BY set_index ASC`,
      session.id
    );
    result.push({ ...session, sets });
  }
  return result;
}

export async function saveSession(
  db: SQLiteDatabase,
  workoutId: number,
  date: string,
  sets: WorkoutSet[]
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Некорректная дата');
  }
  if (sets.length === 0) throw new Error('Добавь хотя бы один подход');

  await db.withExclusiveTransactionAsync(async (tx) => {
    const entry = await tx.runAsync(
      'INSERT INTO workout_entries (workout_id, performed_on) VALUES (?, ?)',
      workoutId,
      date
    );
    for (let i = 0; i < sets.length; i++) {
      await tx.runAsync(
        `INSERT INTO workout_sets (entry_id, set_index, weight_kg, reps)
         VALUES (?, ?, ?, ?)`,
        entry.lastInsertRowId,
        i + 1,
        sets[i].weight_kg,
        sets[i].reps
      );
    }
  });
}

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}
