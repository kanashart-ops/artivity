import type { SQLiteDatabase } from 'expo-sqlite';
import { type WorkoutCategory, type WorkoutSet } from './workouts';
import { sessionTonnage } from './tonnage';

export type WorkoutComplex = {
  id: number;
  name: string;
  category: WorkoutCategory;
  session_count: number;
  last_date: string | null;
  tonnage_kg: number;
};

export type ComplexExercise = {
  id: number;
  name: string;
  category: WorkoutCategory;
  sort_order: number;
};

export type ComplexSessionExercise = {
  workoutId: number;
  name: string;
  sets: WorkoutSet[];
};

export type ComplexSession = {
  id: number;
  performed_on: string;
  exercises: ComplexSessionExercise[];
  tonnage_kg: number;
};

export async function listComplexes(db: SQLiteDatabase): Promise<WorkoutComplex[]> {
  return db.getAllAsync<WorkoutComplex>(`
    SELECT c.id, c.name, c.category, COUNT(DISTINCT cs.id) AS session_count,
      MAX(cs.performed_on) AS last_date,
      COALESCE(SUM(s.weight_kg * s.reps), 0) AS tonnage_kg
    FROM workout_complexes c
    LEFT JOIN workout_complex_sessions cs ON cs.complex_id = c.id
    LEFT JOIN workout_entries e ON e.complex_session_id = cs.id
    LEFT JOIN workout_sets s ON s.entry_id = e.id
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE
  `);
}

export async function getComplex(db: SQLiteDatabase, id: number): Promise<WorkoutComplex | null> {
  const row = await db.getFirstAsync<WorkoutComplex>(`
    SELECT c.id, c.name, c.category, COUNT(DISTINCT cs.id) AS session_count,
      MAX(cs.performed_on) AS last_date,
      COALESCE(SUM(s.weight_kg * s.reps), 0) AS tonnage_kg
    FROM workout_complexes c
    LEFT JOIN workout_complex_sessions cs ON cs.complex_id = c.id
    LEFT JOIN workout_entries e ON e.complex_session_id = cs.id
    LEFT JOIN workout_sets s ON s.entry_id = e.id
    WHERE c.id = ? GROUP BY c.id
  `, id);
  return row ?? null;
}

export async function addComplex(db: SQLiteDatabase, name: string, category: WorkoutCategory): Promise<number> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > 80) throw new Error('Введите название комплекса (до 80 символов)');
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM workout_complexes WHERE name = ? COLLATE NOCASE', clean
  );
  if (existing) throw new Error('Комплекс с таким названием уже существует');
  const result = await db.runAsync(
    'INSERT INTO workout_complexes (name, category) VALUES (?, ?)', clean, category
  );
  return result.lastInsertRowId;
}

export async function updateComplex(db: SQLiteDatabase, id: number, name: string, category: WorkoutCategory) {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > 80) throw new Error('Введите название комплекса');
  if (!['strength', 'cardio', 'home'].includes(category)) throw new Error('Выберите тип');
  await db.runAsync('UPDATE workout_complexes SET name = ?, category = ? WHERE id = ?', clean, category, id);
}

// При удалении программы индивидуальная история упражнений сохраняется:
// workout_entries.complex_session_id станет NULL по внешнему ключу.
export async function deleteComplex(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM workout_complexes WHERE id = ?', id);
}

export async function listComplexExercises(db: SQLiteDatabase, id: number): Promise<ComplexExercise[]> {
  return db.getAllAsync<ComplexExercise>(`
    SELECT w.id, w.name, w.category, ci.sort_order
    FROM workout_complex_items ci JOIN workout_names w ON w.id = ci.workout_id
    WHERE ci.complex_id = ? ORDER BY ci.sort_order ASC, w.id ASC
  `, id);
}

export async function addComplexExercise(db: SQLiteDatabase, complexId: number, workoutId: number) {
  const next = await db.getFirstAsync<{ n: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM workout_complex_items WHERE complex_id = ?', complexId
  );
  await db.runAsync(
    `INSERT INTO workout_complex_items (complex_id, workout_id, sort_order)
     VALUES (?, ?, ?) ON CONFLICT(complex_id, workout_id) DO NOTHING`,
    complexId, workoutId, next?.n ?? 1
  );
}

export async function removeComplexExercise(db: SQLiteDatabase, complexId: number, workoutId: number) {
  await db.runAsync('DELETE FROM workout_complex_items WHERE complex_id = ? AND workout_id = ?', complexId, workoutId);
}

type ComplexSessionRow = { id: number; performed_on: string };
type ComplexEntryRow = { id: number; workout_id: number; name: string };

export async function listComplexSessions(db: SQLiteDatabase, complexId: number): Promise<ComplexSession[]> {
  const rows = await db.getAllAsync<ComplexSessionRow>(
    `SELECT id, performed_on FROM workout_complex_sessions
     WHERE complex_id = ? ORDER BY performed_on DESC, id DESC`, complexId
  );
  const result: ComplexSession[] = [];
  for (const row of rows) {
    const entries = await db.getAllAsync<ComplexEntryRow>(`
      SELECT e.id, e.workout_id, w.name
      FROM workout_entries e JOIN workout_names w ON w.id = e.workout_id
      WHERE e.complex_session_id = ? ORDER BY e.id ASC
    `, row.id);
    const exercises: ComplexSessionExercise[] = [];
    let tonnage = 0;
    for (const entry of entries) {
      const sets = await db.getAllAsync<WorkoutSet>(
        'SELECT weight_kg, reps FROM workout_sets WHERE entry_id = ? ORDER BY set_index', entry.id
      );
      tonnage += sessionTonnage(sets);
      exercises.push({ workoutId: entry.workout_id, name: entry.name, sets });
    }
    result.push({ ...row, exercises, tonnage_kg: tonnage });
  }
  return result;
}

export type ComplexSessionDraft = { workoutId: number; sets: WorkoutSet[] };

function validateDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Неверный формат даты');
  const [y, m, d] = date.split('-').map(Number);
  const actual = new Date(y, m - 1, d);
  if (actual.getFullYear() !== y || actual.getMonth() !== m - 1 || actual.getDate() !== d)
    throw new Error('Некорректная дата');
  const today = new Date();
  const max = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  if (date > max) throw new Error('Нельзя записывать будущие занятия');
}

// Редактирование полностью заменяет предыдущую запись комплекса одной транзакцией.
// Старые одиночные занятия и другие комплексы не затрагиваются.
export async function saveComplexSession(
  db: SQLiteDatabase,
  complexId: number,
  date: string,
  entries: ComplexSessionDraft[],
  editingId: number | null = null
): Promise<void> {
  validateDate(date);
  const usable = entries.filter(e => e.sets.length > 0);
  if (!usable.length) throw new Error('Заполни подходы хотя бы одного упражнения');
  const ids = usable.map(e => e.workoutId);
  if (new Set(ids).size !== ids.length) throw new Error('Упражнение добавлено дважды');
  for (const e of usable) {
    if (!Number.isSafeInteger(e.workoutId) || e.workoutId <= 0) throw new Error('Неизвестное упражнение');
    for (const s of e.sets) {
      if (s.weight_kg !== null && (!Number.isFinite(s.weight_kg) || s.weight_kg < 0)) throw new Error('Некорректный вес');
      if (s.reps !== null && (!Number.isInteger(s.reps) || s.reps < 0)) throw new Error('Некорректные повторы');
    }
  }
  await db.withExclusiveTransactionAsync(async tx => {
    let sessionId: number;
    if (editingId !== null) {
      const found = await tx.getFirstAsync<{ id: number }>(
        'SELECT id FROM workout_complex_sessions WHERE id = ? AND complex_id = ?', editingId, complexId
      );
      if (!found) throw new Error('Запись комплекса не найдена');
      sessionId = editingId;
      // Каскадно удаляет подходы только входящих в эту запись упражнений.
      await tx.runAsync('DELETE FROM workout_entries WHERE complex_session_id = ?', sessionId);
      await tx.runAsync('UPDATE workout_complex_sessions SET performed_on = ? WHERE id = ?', date, sessionId);
    } else {
      const result = await tx.runAsync(
        'INSERT INTO workout_complex_sessions (complex_id, performed_on) VALUES (?, ?)', complexId, date
      );
      sessionId = result.lastInsertRowId;
    }
    for (const e of usable) {
      const result = await tx.runAsync(
        'INSERT INTO workout_entries (workout_id, performed_on, complex_session_id) VALUES (?, ?, ?)',
        e.workoutId, date, sessionId
      );
      for (let i = 0; i < e.sets.length; i++) {
        await tx.runAsync(
          'INSERT INTO workout_sets (entry_id, set_index, weight_kg, reps) VALUES (?, ?, ?, ?)',
          result.lastInsertRowId, i + 1, e.sets[i].weight_kg, e.sets[i].reps
        );
      }
    }
  });
}

export async function deleteComplexSession(db: SQLiteDatabase, id: number) {
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync('DELETE FROM workout_entries WHERE complex_session_id = ?', id);
    await tx.runAsync('DELETE FROM workout_complex_sessions WHERE id = ?', id);
  });
}
