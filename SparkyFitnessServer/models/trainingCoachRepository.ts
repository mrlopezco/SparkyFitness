import { getClient } from '../db/poolManager.js';
import type {
  TrainingCoachMemory,
  TrainingCoachMemoryUpsert,
  TrainingCoachMessage,
  TrainingCoachSession,
  TrainingCoachSessionSummary,
} from '@workspace/shared';

/**
 * Persistence for the fork Training Coach domain (sessions, messages, rolling
 * summaries, durable memories). Every query runs through `getClient(userId)` so
 * the `create_diary_policy` rules in `db/rls_policies.sql` apply; the message
 * and summary tables inherit access from their parent coach session.
 */

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

const SESSION_COLUMNS = `id, plan_id, user_id, status, title,
    created_at, updated_at, closed_at`;

const MESSAGE_COLUMNS = 'id, session_id, role, content, parts, created_at';

const SUMMARY_COLUMNS = `id, session_id, summary, token_estimate,
    created_at, updated_at`;

const MEMORY_COLUMNS = `id, plan_id, user_id, memory_key, memory_value, source,
    created_at, updated_at`;

interface SessionRow {
  id: string;
  plan_id: string;
  user_id: string;
  status: string;
  title: string | null;
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
  plan_id: string | null;
  user_id: string;
  memory_key: string;
  memory_value: string;
  source: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

const MESSAGE_ROLES = new Set(['user', 'assistant', 'system']);

function mapSession(row: SessionRow): TrainingCoachSession {
  return {
    id: row.id,
    plan_id: row.plan_id,
    user_id: row.user_id,
    status: row.status === 'closed' ? 'closed' : 'open',
    title: row.title,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    closed_at: toIsoOrNull(row.closed_at),
  };
}

function mapMessage(row: MessageRow): TrainingCoachMessage {
  return {
    id: row.id,
    session_id: row.session_id,
    // A CHECK constraint keeps `role` inside the enum; the fallback only
    // covers a row written before the enum was widened.
    role: MESSAGE_ROLES.has(row.role)
      ? (row.role as TrainingCoachMessage['role'])
      : 'system',
    content: row.content,
    parts: row.parts ?? null,
    created_at: toIso(row.created_at),
  };
}

function mapSummary(row: SummaryRow): TrainingCoachSessionSummary {
  return {
    id: row.id,
    session_id: row.session_id,
    summary: row.summary,
    token_estimate: row.token_estimate,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapMemory(row: MemoryRow): TrainingCoachMemory {
  return {
    id: row.id,
    plan_id: row.plan_id,
    user_id: row.user_id,
    memory_key: row.memory_key,
    memory_value: row.memory_value,
    source: row.source,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

async function createSession(
  userId: string,
  planId: string,
  title: string | null
): Promise<TrainingCoachSession> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `INSERT INTO training_coach_sessions (plan_id, user_id, title)
       VALUES ($1, $2, $3)
       RETURNING ${SESSION_COLUMNS}`,
      [planId, userId, title]
    );
    return mapSession(result.rows[0]);
  } finally {
    client.release();
  }
}

async function listSessions(
  userId: string,
  planId: string
): Promise<TrainingCoachSession[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM training_coach_sessions
       WHERE user_id = $1 AND plan_id = $2
       ORDER BY created_at DESC`,
      [userId, planId]
    );
    return result.rows.map(mapSession);
  } finally {
    client.release();
  }
}

async function getSession(
  userId: string,
  sessionId: string
): Promise<TrainingCoachSession | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM training_coach_sessions
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function getOpenSession(
  userId: string,
  planId: string
): Promise<TrainingCoachSession | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM training_coach_sessions
       WHERE user_id = $1 AND plan_id = $2 AND status = 'open'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, planId]
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/** Newest session start for the plan, used to space out weekly check-ins. */
async function getLatestSessionCreatedAt(
  userId: string,
  planId: string
): Promise<string | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<{ created_at: Timestamp | null }>(
      `SELECT created_at FROM training_coach_sessions
       WHERE user_id = $1 AND plan_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, planId]
    );
    return result.rows[0] ? toIsoOrNull(result.rows[0].created_at) : null;
  } finally {
    client.release();
  }
}

async function closeSession(
  userId: string,
  sessionId: string
): Promise<TrainingCoachSession | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `UPDATE training_coach_sessions
         SET status = 'closed', closed_at = COALESCE(closed_at, NOW())
       WHERE id = $1 AND user_id = $2
       RETURNING ${SESSION_COLUMNS}`,
      [sessionId, userId]
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function insertMessage(
  userId: string,
  sessionId: string,
  role: TrainingCoachMessage['role'],
  content: string,
  parts: unknown = null
): Promise<TrainingCoachMessage> {
  const client = await connect(userId);
  try {
    const result = await client.query<MessageRow>(
      `INSERT INTO training_coach_messages (session_id, role, content, parts)
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

/**
 * Oldest first, so the transcript reads in order. `limit` caps the newest
 * slice: a long thread is carried by its summary, not by every message.
 */
async function listMessages(
  userId: string,
  sessionId: string,
  limit = 50
): Promise<TrainingCoachMessage[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<MessageRow>(
      `SELECT * FROM (
         SELECT ${MESSAGE_COLUMNS} FROM training_coach_messages
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
): Promise<TrainingCoachSessionSummary | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM training_coach_session_summaries
       WHERE session_id = $1`,
      [sessionId]
    );
    return result.rows[0] ? mapSummary(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function upsertSummary(
  userId: string,
  sessionId: string,
  summary: string,
  tokenEstimate: number | null
): Promise<TrainingCoachSessionSummary> {
  const client = await connect(userId);
  try {
    const result = await client.query<SummaryRow>(
      `INSERT INTO training_coach_session_summaries
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

async function listMemories(
  userId: string,
  planId?: string
): Promise<TrainingCoachMemory[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<MemoryRow>(
      `SELECT ${MEMORY_COLUMNS} FROM training_coach_memories
       WHERE user_id = $1 AND ($2::uuid IS NULL OR plan_id = $2::uuid)
       ORDER BY updated_at DESC`,
      [userId, planId ?? null]
    );
    return result.rows.map(mapMemory);
  } finally {
    client.release();
  }
}

/**
 * Keyed upsert without a unique index: the table allows the same key on
 * different plans, and a partial-unique index would still not cover the
 * plan-less rows. The read and the write share one transaction so two coach
 * turns cannot both insert the same key.
 */
async function upsertMemory(
  userId: string,
  planId: string | null,
  memory: TrainingCoachMemoryUpsert
): Promise<TrainingCoachMemory> {
  const client = await connect(userId);
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM training_coach_memories
       WHERE user_id = $1 AND memory_key = $2
         AND plan_id IS NOT DISTINCT FROM $3::uuid
       FOR UPDATE`,
      [userId, memory.memory_key, planId]
    );

    const result = existing.rows[0]
      ? await client.query<MemoryRow>(
          `UPDATE training_coach_memories
             SET memory_value = $2, source = $3
           WHERE id = $1
           RETURNING ${MEMORY_COLUMNS}`,
          [existing.rows[0].id, memory.memory_value, memory.source ?? null]
        )
      : await client.query<MemoryRow>(
          `INSERT INTO training_coach_memories
             (plan_id, user_id, memory_key, memory_value, source)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING ${MEMORY_COLUMNS}`,
          [
            planId,
            userId,
            memory.memory_key,
            memory.memory_value,
            memory.source ?? null,
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
  planId: string | null,
  memoryKey: string
): Promise<boolean> {
  const client = await connect(userId);
  try {
    const result = await client.query(
      `DELETE FROM training_coach_memories
       WHERE user_id = $1 AND memory_key = $2
         AND plan_id IS NOT DISTINCT FROM $3::uuid`,
      [userId, memoryKey, planId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export {
  createSession,
  listSessions,
  getSession,
  getOpenSession,
  getLatestSessionCreatedAt,
  closeSession,
  insertMessage,
  listMessages,
  getSummary,
  upsertSummary,
  listMemories,
  upsertMemory,
  deleteMemory,
};

export default {
  createSession,
  listSessions,
  getSession,
  getOpenSession,
  getLatestSessionCreatedAt,
  closeSession,
  insertMessage,
  listMessages,
  getSummary,
  upsertSummary,
  listMemories,
  upsertMemory,
  deleteMemory,
};
