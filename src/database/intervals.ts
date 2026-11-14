import type { SQLiteDatabase } from 'expo-sqlite';
import { getPoolConsistency, type PoolConsistency } from './pool';

export type Tier = 1 | 2 | 3;

export type IntervalEvent = {
  id: number;
  item_id: number;
  consumed_at: string;
  source_date: string | null;
  interval_days: number;
  was_early: number;
  training_bonus_days: number;
  light_bonus_days: number;
  alcohol_extra_days: number;
  early_penalty_days: number;
  pool_bonus_days: number;
  inactivity_extra_days: number;
};

type ItemRow = {
  id: number;
  name: string;
  tier: number;
  base_interval_days: number;
  minimum_interval_days: number;
  activity_impact_days: number | null;
};

export type IntervalCard = ItemRow & {
  history: IntervalEvent[];
  remainingDays: number;
  nextAvailableDate: string | null;
  recordedToday: boolean;
};

export type TrainingConsistency = {
  level: number;
  last7: number;
  last14: number;
  last30: number;
  last60: number;
};

export type IntervalSnapshot = {
  items: IntervalCard[];
  training: TrainingConsistency;
  pool: PoolConsistency;
};

function dateOrdinal(key: string): number {
  const [year, month, day] = key.slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function shiftDate(key: string, days: number): string {
  return new Date((dateOrdinal(key) + days) * 86_400_000)
    .toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return dateOrdinal(to) - dateOrdinal(from);
}

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Уникальные календарные дни, а не число подходов/упражнений.
// Учитываем и ручной ответ анкеты, и журнал тренировок.
export async function getTrainingConsistency(
  db: SQLiteDatabase,
  today = localToday()
): Promise<TrainingConsistency> {
  const rows = await db.getAllAsync<{ date: string }>(
    `SELECT date FROM (
       SELECT performed_on AS date FROM workout_entries
       UNION
       SELECT date FROM daily_entries WHERE trained = 1
     )
     WHERE date BETWEEN ? AND ?`,
    shiftDate(today, -59), today
  );
  const counts = (days: number) => rows.filter((r) =>
    daysBetween(r.date, today) >= 0 && daysBetween(r.date, today) < days
  ).length;
  const last7 = counts(7);
  const last14 = counts(14);
  const last30 = counts(30);
  const last60 = counts(60);

  let level = 0;
  if (last7 >= 2) level = 1;
  if (last7 >= 2 && last14 >= 4) level = 2;
  if (last14 >= 4 && last30 >= 9) level = 3;
  if (last30 >= 9 && last60 >= 18) level = 4;
  return { level, last7, last14, last30, last60 };
}

export function levelDescription(level: number): string {
  return [
    'Первые тренировки',
    'Первый бонус',
    'Формируется привычка',
    'Устойчивая регулярность',
    'Долгая стабильность',
  ][level] ?? 'Первые тренировки';
}

type CountRow = { total: number };

/** Custom food timers use a chosen maximum sensitivity of 0–14 days.
 *  The initial interval is not recalculated later; only NEW consumption events
 *  reflect the user's activity at the time of the event.
 */
export async function addCustomInterval(
  db: SQLiteDatabase,
  nameInput: string,
  baseDays: number,
  activityImpactDays: number
): Promise<void> {
  const name = nameInput.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 60) {
    throw new Error('Название должно содержать от 2 до 60 символов');
  }
  if (!Number.isInteger(baseDays) || baseDays < 1 || baseDays > 365) {
    throw new Error('Интервал должен быть целым числом от 1 до 365 дней');
  }
  if (!Number.isInteger(activityImpactDays) || activityImpactDays < 0 ||
      activityImpactDays > Math.min(14, baseDays - 1)) {
    throw new Error(`Влияние активности — от 0 до ${Math.min(14, baseDays - 1)} дней`);
  }
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM restricted_items WHERE name = ? COLLATE NOCASE', name
  );
  if (existing) throw new Error('Такой продукт уже существует');

  await db.runAsync(
    `INSERT INTO restricted_items
       (name, tier, base_interval_days, minimum_interval_days, activity_impact_days)
     VALUES (?, 2, ?, ?, ?)`,
    name, baseDays, Math.max(1, baseDays - activityImpactDays), activityImpactDays
  );
}


// Предварительные параметры v0.8. Заметно уже на 2 тренировочных днях
// за неделю, но максимальный бонус появляется только при регулярности.
async function calculateNewInterval(
  db: SQLiteDatabase,
  item: ItemRow,
  date: string
) {
  const [training, pool] = await Promise.all([
    getTrainingConsistency(db, date), getPoolConsistency(db, date),
  ]);
  const maxBonuses = [0, 1, 2, 3, 4];
  const maxReduction = Math.max(0, item.base_interval_days - item.minimum_interval_days);
  let trainingBonus = 0;
  let poolBonus = 0;
  let inactivityExtra = 0;

  if (item.activity_impact_days !== null) {
    const impact = item.activity_impact_days;
    // No regular training/swimming adds the chosen maximum extra days.
    // Swimming starts to count only at 2 visits in the last 7 days.
    if (training.level === 0 && pool.bonusDays === 0) {
      inactivityExtra = impact;
    } else {
      trainingBonus = Math.min(maxReduction, Math.round(impact * training.level / 4));
      const poolPotential = pool.bonusDays === 2 ? Math.ceil(impact / 2) : pool.bonusDays === 1 ? Math.max(1, Math.round(impact / 4)) : 0;
      poolBonus = Math.min(poolPotential, Math.max(0, impact - trainingBonus),
        Math.max(0, maxReduction - trainingBonus));
    }
  } else {
    // Pre-installed foods retain their original tier rules; the pool is an
    // independent, modest extra bonus only for systematic attendance.
    trainingBonus = Math.min(maxReduction, maxBonuses[training.level] ?? 0,
      item.tier === 3 ? 1 : 4);
    poolBonus = Math.min(pool.bonusDays, Math.max(0, maxReduction - trainingBonus),
      item.tier === 3 ? 1 : 2);
  }

  const lightCount = await db.getFirstAsync<CountRow>(
    `SELECT COUNT(*) AS total FROM daily_entries
     WHERE date BETWEEN ? AND ? AND light_day = 1`,
    shiftDate(date, -13), date
  );
  // Один разгрузочный день не даёт скидку. Только повторяемая привычка;
  // для строгой категории скидок за ограничение еды нет.
  const lightBonus = item.tier !== 1 && (lightCount?.total ?? 0) >= 3 ? 1 : 0;

  const alcoholCount = await db.getFirstAsync<CountRow>(
    `SELECT COUNT(*) AS total FROM daily_entries
     WHERE date BETWEEN ? AND ? AND alcohol = 1`,
    shiftDate(date, -13), date
  );
  const alcoholDays = Math.min(2, alcoholCount?.total ?? 0);
  const alcoholExtra = item.tier === 1 ? alcoholDays * 2 : alcoholDays;

  // Игнорируем событие за этот же день: редактирование анкеты не должно
  // выглядеть повторным употреблением и создавать дополнительный штраф.
  const previous = await db.getFirstAsync<Pick<IntervalEvent, 'consumed_at' | 'interval_days'>>(
    `SELECT consumed_at, interval_days FROM consumption_events
     WHERE item_id = ? AND consumed_at < ?
       AND (source_date IS NULL OR source_date <> ?)
     ORDER BY consumed_at DESC, id DESC LIMIT 1`,
    item.id, `${date}T12:00:00`, date
  );
  const remaining = previous
    ? Math.max(0, previous.interval_days - daysBetween(previous.consumed_at, date))
    : 0;
  const wasEarly = remaining > 0;
  const earlyPenalty = wasEarly
    ? Math.min(Math.ceil(remaining / 2), Math.ceil(item.base_interval_days * 0.25))
    : 0;

  const intervalDays = Math.max(
    item.minimum_interval_days,
    item.base_interval_days - trainingBonus - poolBonus - lightBonus
      + inactivityExtra + alcoholExtra + earlyPenalty
  );
  return {
    intervalDays,
    wasEarly: wasEarly ? 1 : 0,
    trainingBonus,
    poolBonus,
    inactivityExtra,
    lightBonus,
    alcoholExtra,
    earlyPenalty,
  };
}

// Вызывается как из анкеты «Сегодня», так и с вкладки «Интервалы».
// При редактировании сегодняшнего отчёта UPDATE заменяет расчёт, не плодит события.
export async function upsertConsumptionEvent(
  db: SQLiteDatabase,
  itemId: number,
  date: string
): Promise<void> {
  const item = await db.getFirstAsync<ItemRow>(
    `SELECT id, name, tier, base_interval_days, minimum_interval_days, activity_impact_days
     FROM restricted_items WHERE id = ?`,
    itemId
  );
  if (!item) throw new Error('Продукт не найден');
  const result = await calculateNewInterval(db, item, date);

  await db.runAsync(
    `INSERT INTO consumption_events
      (item_id, consumed_at, source_date, interval_days, was_early,
       training_bonus_days, light_bonus_days, alcohol_extra_days, early_penalty_days,
       pool_bonus_days, inactivity_extra_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_id, source_date) WHERE source_date IS NOT NULL
     DO UPDATE SET
       interval_days = excluded.interval_days,
       was_early = excluded.was_early,
       training_bonus_days = excluded.training_bonus_days,
       light_bonus_days = excluded.light_bonus_days,
       alcohol_extra_days = excluded.alcohol_extra_days,
       early_penalty_days = excluded.early_penalty_days,
       pool_bonus_days = excluded.pool_bonus_days,
       inactivity_extra_days = excluded.inactivity_extra_days`,
    itemId,
    `${date}T12:00:00`, date,
    result.intervalDays, result.wasEarly, result.trainingBonus,
    result.lightBonus, result.alcoholExtra, result.earlyPenalty,
    result.poolBonus, result.inactivityExtra
  );
}

export async function markConsumedToday(
  db: SQLiteDatabase,
  itemId: number
): Promise<void> {
  const today = localToday();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const existing = await tx.getFirstAsync<{ id: number }>(
      'SELECT id FROM consumption_events WHERE item_id = ? AND source_date = ?',
      itemId, today
    );
    if (existing) return;
    await upsertConsumptionEvent(tx, itemId, today);
  });
}

export async function loadIntervalSnapshot(
  db: SQLiteDatabase,
  today = localToday()
): Promise<IntervalSnapshot> {
  const [rows, training, pool] = await Promise.all([
    db.getAllAsync<ItemRow>(
      `SELECT id, name, tier, base_interval_days, minimum_interval_days, activity_impact_days
       FROM restricted_items ORDER BY tier, id`
    ),
    getTrainingConsistency(db, today),
    getPoolConsistency(db, today),
  ]);
  const items: IntervalCard[] = [];
  for (const row of rows) {
    const history = await db.getAllAsync<IntervalEvent>(
      `SELECT id, item_id, consumed_at, source_date, interval_days, was_early,
              training_bonus_days, light_bonus_days,
              alcohol_extra_days, early_penalty_days,
              pool_bonus_days, inactivity_extra_days
       FROM consumption_events WHERE item_id = ?
       ORDER BY consumed_at DESC, id DESC LIMIT 15`,
      row.id
    );
    const last = history[0];
    const until = last
      ? shiftDate(last.consumed_at, last.interval_days)
      : null;
    const remainingDays = until ? Math.max(0, daysBetween(today, until)) : 0;
    items.push({
      ...row,
      history,
      remainingDays,
      nextAvailableDate: until,
      recordedToday: history.some((event) => event.source_date === today),
    });
  }
  return { items, training, pool };
}
