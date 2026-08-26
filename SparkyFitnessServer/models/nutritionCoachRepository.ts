import { getClient } from '../db/poolManager.js';
import type {
  NutritionCoachContextSnapshot,
  NutritionCoachMemory,
  NutritionCoachMemoryUpsert,
  NutritionCoachMessage,
  NutritionCoachMetricsAtClose,
  NutritionCoachSession,
  NutritionCoachSessionSummary,
  NutritionCoachContextPayload,
} from '@workspace/shared';

interface QueryResultLike<TRow> {
  rows: TRow[];
  rowCount: number | null;
}

interface DbClient {
  query<TRow>(
    sql: string,
    params?: readonly unknown[]
  ): Promise<QueryResultLike<TRow>>;
  release(): void;
}

async function connect(userId: string): Promise<DbClient> {
  return (await getClient(userId)) as unknown as DbClient;
}

type Timestamp = Date | string;

function toIso(value: Timestamp | null): string {
  if (value instanceof Date) return value.toISOString();
  return value ?? '';
}

function toIsoOrNull(value: Timestamp | null): string | null {
  if (value === null || value === undefined) return null;
  return toIso(value);
}

const SESSION_COLUMNS = `id, user_id, plan_id, status, title, metrics_at_close,
    created_at, updated_at, closed_at`;

const MESSAGE_COLUMNS = 'id, session_id, role, content, parts, created_at';

const SUMMARY_COLUMNS = `id, session_id, summary, token_estimate,
    created_at, updated_at`;

const MEMORY_COLUMNS = `id, user_id, memory_key, memory_value, source,
    created_at, updated_at`;

const SNAPSHOT_COLUMNS = `id, user_id, plan_id, as_of_date, payload, token_estimate,
    created_at`;

interface SessionRow {
  id: string;
  user_id: string;
  plan_id: string | null;
  status: string;
  title: string | null;
  metrics_at_close: unknown;
  created_at: Timestamp;
  updated_at: Timestamp;
  closed_at: Timestamp | null;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  parts: unknown;
  created_at: Timestamp;
}

interface SummaryRow {
  id: string;
  session_id: string;
  summary: string;
  token_estimate: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface MemoryRow {
  id: string;
  user_id: string;
  memory_key: string;
  memory_value: string;
  source: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface SnapshotRow {
  id: string;
  user_id: string;
  plan_id: string | null;
  as_of_date: string;
  payload: NutritionCoachContextPayload;
  token_estimate: number | null;
  created_at: Timestamp;
}

const MESSAGE_ROLES = new Set(['user', 'assistant', 'system']);

function mapSession(row: SessionRow): NutritionCoachSession {
  const metrics =
    row.metrics_at_close && typeof row.metrics_at_close === 'object'
      ? (row.metrics_at_close as NutritionCoachMetricsAtClose)
      : null;
  return {
    id: row.id,
    user_id: row.user_id,
    plan_id: row.plan_id,
    status: row.status === 'closed' ? 'closed' : 'open',
    title: row.title,
    ...(metrics ? { metrics_at_close: metrics } : {}),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    closed_at: toIsoOrNull(row.closed_at),
  };
}

function mapMessage(row: MessageRow): NutritionCoachMessage {
  return {
    id: row.id,
    session_id: row.session_id,
    role: MESSAGE_ROLES.has(row.role)
      ? (row.role as NutritionCoachMessage['role'])
      : 'system',
    content: row.content,
    parts: row.parts ?? null,
    created_at: toIso(row.created_at),
  };
}

function mapSummary(row: SummaryRow): NutritionCoachSessionSummary {
  return {
    id: row.id,
    session_id: row.session_id,
    summary: row.summary,
    token_estimate: row.token_estimate,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapMemory(row: MemoryRow): NutritionCoachMemory {
  return {
    id: row.id,
    user_id: row.user_id,
    memory_key: row.memory_key,
    memory_value: row.memory_value,
    source: row.source,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapSnapshot(row: SnapshotRow): NutritionCoachContextSnapshot {
  return {
    id: row.id,
    user_id: row.user_id,
    plan_id: row.plan_id,
    as_of_date: row.as_of_date,
    payload: row.payload,
    token_estimate: row.token_estimate,
    created_at: toIso(row.created_at),
  };
}

export interface TopFoodRow {
  name: string;
  log_count: number;
  avg_calories_per_log: number;
}

export interface MealStructureRow {
  meal_type: string;
  avg_calories_per_logged_day: number;
  avg_protein_g_per_logged_day: number;
}

export interface TimeBucketRow {
  bucket: string;
  calorie_share_pct: number;
}

async function createSession(
  userId: string,
  planId: string | null,
  title: string | null
): Promise<NutritionCoachSession> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `INSERT INTO nutrition_coach_sessions (user_id, plan_id, title)
       VALUES ($1, $2, $3)
       RETURNING ${SESSION_COLUMNS}`,
      [userId, planId, title]
    );
    return mapSession(result.rows[0]);
  } finally {
    client.release();
  }
}

async function listSessions(userId: string): Promise<NutritionCoachSession[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM nutrition_coach_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map(mapSession);
  } finally {
    client.release();
  }
}

async function getSession(
  userId: string,
  sessionId: string
): Promise<NutritionCoachSession | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM nutrition_coach_sessions
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function getLatestClosedSession(
  userId: string
): Promise<NutritionCoachSession | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM nutrition_coach_sessions
       WHERE user_id = $1 AND status = 'closed'
       ORDER BY closed_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function closeSession(
  userId: string,
  sessionId: string,
  metricsAtClose: NutritionCoachMetricsAtClose | null
): Promise<NutritionCoachSession | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `UPDATE nutrition_coach_sessions
         SET status = 'closed',
             closed_at = COALESCE(closed_at, NOW()),
             metrics_at_close = $3::jsonb
       WHERE id = $1 AND user_id = $2
       RETURNING ${SESSION_COLUMNS}`,
      [
        sessionId,
        userId,
        metricsAtClose ? JSON.stringify(metricsAtClose) : null,
      ]
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function insertMessage(
  userId: string,
  sessionId: string,
  role: NutritionCoachMessage['role'],
  content: string,
  parts: unknown = null
): Promise<NutritionCoachMessage> {
  const client = await connect(userId);
  try {
    const result = await client.query<MessageRow>(
      `INSERT INTO nutrition_coach_messages (session_id, role, content, parts)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING ${MESSAGE_COLUMNS}`,
      [
        sessionId,
        role,
        content,
        parts === null || parts === undefined ? null : JSON.stringify(parts),
      ]
    );
    return mapMessage(result.rows[0]);
  } finally {
    client.release();
  }
}

async function listMessages(
  userId: string,
  sessionId: string,
  limit = 50
): Promise<NutritionCoachMessage[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<MessageRow>(
      `SELECT * FROM (
         SELECT ${MESSAGE_COLUMNS} FROM nutrition_coach_messages
         WHERE session_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2
       ) recent
       ORDER BY created_at ASC, id ASC`,
      [sessionId, limit]
    );
    return result.rows.map(mapMessage);
  } finally {
    client.release();
  }
}

async function getSummary(
  userId: string,
  sessionId: string
): Promise<NutritionCoachSessionSummary | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM nutrition_coach_session_summaries
       WHERE session_id = $1`,
      [sessionId]
    );
    return result.rows[0] ? mapSummary(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function getSummaryForLatestClosedSession(
  userId: string
): Promise<{ session: NutritionCoachSession; summary: NutritionCoachSessionSummary } | null> {
  const session = await getLatestClosedSession(userId);
  if (!session) return null;
  const summary = await getSummary(userId, session.id);
  if (!summary) return null;
  return { session, summary };
}

async function upsertSummary(
  userId: string,
  sessionId: string,
  summary: string,
  tokenEstimate: number | null
): Promise<NutritionCoachSessionSummary> {
  const client = await connect(userId);
  try {
    const result = await client.query<SummaryRow>(
      `INSERT INTO nutrition_coach_session_summaries
         (session_id, summary, token_estimate)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id) DO UPDATE
         SET summary = EXCLUDED.summary,
             token_estimate = EXCLUDED.token_estimate
       RETURNING ${SUMMARY_COLUMNS}`,
      [sessionId, summary, tokenEstimate]
    );
    return mapSummary(result.rows[0]);
  } finally {
    client.release();
  }
}

async function listMemories(userId: string): Promise<NutritionCoachMemory[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<MemoryRow>(
      `SELECT ${MEMORY_COLUMNS} FROM nutrition_coach_memories
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    return result.rows.map(mapMemory);
  } finally {
    client.release();
  }
}

async function listMemoriesUpdatedSince(
  userId: string,
  sinceIso: string
): Promise<NutritionCoachMemory[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<MemoryRow>(
      `SELECT ${MEMORY_COLUMNS} FROM nutrition_coach_memories
       WHERE user_id = $1 AND updated_at >= $2::timestamptz
       ORDER BY updated_at DESC`,
      [userId, sinceIso]
    );
    return result.rows.map(mapMemory);
  } finally {
    client.release();
  }
}

async function upsertMemory(
  userId: string,
  memory: NutritionCoachMemoryUpsert
): Promise<NutritionCoachMemory> {
  const client = await connect(userId);
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM nutrition_coach_memories
       WHERE user_id = $1 AND memory_key = $2
       FOR UPDATE`,
      [userId, memory.memory_key]
    );

    const result = existing.rows[0]
      ? await client.query<MemoryRow>(
          `UPDATE nutrition_coach_memories
             SET memory_value = $2, source = COALESCE($3, source)
           WHERE id = $1
           RETURNING ${MEMORY_COLUMNS}`,
          [existing.rows[0].id, memory.memory_value, memory.source ?? null]
        )
      : await client.query<MemoryRow>(
          `INSERT INTO nutrition_coach_memories
             (user_id, memory_key, memory_value, source)
           VALUES ($1, $2, $3, $4)
           RETURNING ${MEMORY_COLUMNS}`,
          [
            userId,
            memory.memory_key,
            memory.memory_value,
            memory.source ?? 'coach',
          ]
        );
    await client.query('COMMIT');
    return mapMemory(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteMemory(
  userId: string,
  memoryId: string
): Promise<boolean> {
  const client = await connect(userId);
  try {
    const result = await client.query(
      `DELETE FROM nutrition_coach_memories
       WHERE id = $1 AND user_id = $2`,
      [memoryId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

async function insertContextSnapshot(
  userId: string,
  planId: string | null,
  asOfDate: string,
  payload: NutritionCoachContextPayload,
  tokenEstimate: number
): Promise<NutritionCoachContextSnapshot> {
  const client = await connect(userId);
  try {
    const result = await client.query<SnapshotRow>(
      `INSERT INTO nutrition_coach_context_snapshots
         (user_id, plan_id, as_of_date, payload, token_estimate)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING ${SNAPSHOT_COLUMNS}`,
      [userId, planId, asOfDate, JSON.stringify(payload), tokenEstimate]
    );
    return mapSnapshot(result.rows[0]);
  } finally {
    client.release();
  }
}

async function getLatestContextSnapshot(
  userId: string
): Promise<NutritionCoachContextSnapshot | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SnapshotRow>(
      `SELECT ${SNAPSHOT_COLUMNS} FROM nutrition_coach_context_snapshots
       WHERE user_id = $1
       ORDER BY as_of_date DESC, created_at DESC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] ? mapSnapshot(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function getTopFoodsByFrequency(
  userId: string,
  startDate: string,
  endDate: string,
  limit = 20
): Promise<TopFoodRow[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<{
      name: string;
      log_count: string;
      avg_calories_per_log: string | number;
    }>(
      `SELECT COALESCE(f.name, 'Unknown food') AS name,
              COUNT(*)::int AS log_count,
              AVG(
                COALESCE(fe.calories, 0) * fe.quantity / NULLIF(fe.serving_size, 0)
              ) AS avg_calories_per_log
       FROM food_entries fe
       LEFT JOIN foods f ON f.id = fe.food_id
       WHERE fe.user_id = $1
         AND fe.entry_date BETWEEN $2::date AND $3::date
         AND fe.food_entry_meal_id IS NULL
       GROUP BY f.id, f.name
       HAVING COUNT(*) >= 2
       ORDER BY log_count DESC
       LIMIT $4`,
      [userId, startDate, endDate, limit]
    );
    return result.rows.map((row) => ({
      name: row.name,
      log_count: Number(row.log_count),
      avg_calories_per_log: round(Number(row.avg_calories_per_log)),
    }));
  } finally {
    client.release();
  }
}

async function getMealStructureAggregates(
  userId: string,
  startDate: string,
  endDate: string
): Promise<MealStructureRow[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<{
      meal_type: string;
      avg_calories_per_logged_day: string | number;
      avg_protein_g_per_logged_day: string | number;
    }>(
      `WITH daily_meal AS (
         SELECT fe.entry_date,
                COALESCE(mt.name, 'Unknown') AS meal_type,
                SUM(COALESCE(fe.calories, 0) * fe.quantity / NULLIF(fe.serving_size, 0)) AS meal_calories,
                SUM(COALESCE(fe.protein, 0) * fe.quantity / NULLIF(fe.serving_size, 0)) AS meal_protein
         FROM food_entries fe
         LEFT JOIN meal_types mt ON mt.id = fe.meal_type_id
         WHERE fe.user_id = $1
           AND fe.entry_date BETWEEN $2::date AND $3::date
           AND fe.food_entry_meal_id IS NULL
         GROUP BY fe.entry_date, mt.name
       )
       SELECT meal_type,
              AVG(meal_calories) AS avg_calories_per_logged_day,
              AVG(meal_protein) AS avg_protein_g_per_logged_day
       FROM daily_meal
       GROUP BY meal_type
       ORDER BY avg_calories_per_logged_day DESC`,
      [userId, startDate, endDate]
    );
    return result.rows.map((row) => ({
      meal_type: row.meal_type,
      avg_calories_per_logged_day: round(Number(row.avg_calories_per_logged_day)),
      avg_protein_g_per_logged_day: round(
        Number(row.avg_protein_g_per_logged_day)
      ),
    }));
  } finally {
    client.release();
  }
}

async function getEntryTimeBucketShares(
  userId: string,
  startDate: string,
  endDate: string
): Promise<TimeBucketRow[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<{
      bucket: string;
      calorie_share_pct: string | number;
    }>(
      `WITH entry_calories AS (
         SELECT CASE
                  WHEN fe.entry_time IS NULL THEN 'unknown'
                  WHEN EXTRACT(HOUR FROM fe.entry_time) < 11 THEN 'morning'
                  WHEN EXTRACT(HOUR FROM fe.entry_time) < 16 THEN 'afternoon'
                  WHEN EXTRACT(HOUR FROM fe.entry_time) < 21 THEN 'evening'
                  ELSE 'late_night'
                END AS bucket,
                COALESCE(fe.calories, 0) * fe.quantity / NULLIF(fe.serving_size, 0) AS kcal
         FROM food_entries fe
         WHERE fe.user_id = $1
           AND fe.entry_date BETWEEN $2::date AND $3::date
           AND fe.food_entry_meal_id IS NULL
       ),
       totals AS (
         SELECT bucket, SUM(kcal) AS bucket_kcal FROM entry_calories GROUP BY bucket
       ),
       grand AS (
         SELECT SUM(bucket_kcal) AS total_kcal FROM totals
       )
       SELECT t.bucket,
              CASE WHEN g.total_kcal > 0
                   THEN (t.bucket_kcal / g.total_kcal) * 100
                   ELSE 0 END AS calorie_share_pct
       FROM totals t
       CROSS JOIN grand g
       ORDER BY calorie_share_pct DESC`,
      [userId, startDate, endDate]
    );
    return result.rows.map((row) => ({
      bucket: row.bucket,
      calorie_share_pct: round(Number(row.calorie_share_pct)),
    }));
  } finally {
    client.release();
  }
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export default {
  createSession,
  listSessions,
  getSession,
  getLatestClosedSession,
  closeSession,
  insertMessage,
  listMessages,
  getSummary,
  getSummaryForLatestClosedSession,
  upsertSummary,
  listMemories,
  listMemoriesUpdatedSince,
  upsertMemory,
  deleteMemory,
  insertContextSnapshot,
  getLatestContextSnapshot,
  getTopFoodsByFrequency,
  getMealStructureAggregates,
  getEntryTimeBucketShares,
};
