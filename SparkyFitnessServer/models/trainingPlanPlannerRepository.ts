import { getClient } from '../db/poolManager.js';
import type {
  TrainingPlanPlannerMessage,
  TrainingPlanPlannerMode,
  TrainingPlanPlannerSession,
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

function toDayOrNull(value: Timestamp | null): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

const SESSION_COLUMNS = `id, plan_id, user_id, mode, status, summary,
    adjust_from, adjust_to, created_at, updated_at, confirmed_at, cancelled_at`;

const MESSAGE_COLUMNS = 'id, session_id, role, content, created_at';

interface SessionRow {
  id: string;
  plan_id: string;
  user_id: string;
  mode: string;
  status: string;
  summary: string | null;
  adjust_from: Timestamp | null;
  adjust_to: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  confirmed_at: Timestamp | null;
  cancelled_at: Timestamp | null;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: Timestamp;
}

function mapSession(row: SessionRow): TrainingPlanPlannerSession {
  return {
    id: row.id,
    plan_id: row.plan_id,
    user_id: row.user_id,
    mode: row.mode as TrainingPlanPlannerMode,
    status: row.status as TrainingPlanPlannerSession['status'],
    summary: row.summary,
    adjust_from: toDayOrNull(row.adjust_from),
    adjust_to: toDayOrNull(row.adjust_to),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    confirmed_at: toIsoOrNull(row.confirmed_at),
    cancelled_at: toIsoOrNull(row.cancelled_at),
  };
}

function mapMessage(row: MessageRow): TrainingPlanPlannerMessage {
  return {
    id: row.id,
    session_id: row.session_id,
    role: row.role as TrainingPlanPlannerMessage['role'],
    content: row.content,
    created_at: toIso(row.created_at),
  };
}

async function createSession(
  userId: string,
  planId: string,
  mode: TrainingPlanPlannerMode
): Promise<TrainingPlanPlannerSession> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `INSERT INTO training_plan_planner_sessions (plan_id, user_id, mode)
       VALUES ($1, $2, $3)
       RETURNING ${SESSION_COLUMNS}`,
      [planId, userId, mode]
    );
    return mapSession(result.rows[0]!);
  } finally {
    client.release();
  }
}

async function listSessions(
  userId: string,
  planId: string,
  options?: { status?: TrainingPlanPlannerSession['status'] }
): Promise<TrainingPlanPlannerSession[]> {
  const client = await connect(userId);
  try {
    const params: unknown[] = [planId, userId];
    let sql = `SELECT ${SESSION_COLUMNS}
      FROM training_plan_planner_sessions
      WHERE plan_id = $1 AND user_id = $2`;
    if (options?.status) {
      params.push(options.status);
      sql += ` AND status = $3`;
    }
    sql += ` ORDER BY COALESCE(confirmed_at, created_at) DESC`;
    const result = await client.query<SessionRow>(sql, params);
    return result.rows.map(mapSession);
  } finally {
    client.release();
  }
}

async function getSession(
  userId: string,
  sessionId: string
): Promise<TrainingPlanPlannerSession | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS}
       FROM training_plan_planner_sessions
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function updateSessionAdjustWindow(
  userId: string,
  sessionId: string,
  adjustFrom: string | null,
  adjustTo: string | null
): Promise<void> {
  const client = await connect(userId);
  try {
    await client.query(
      `UPDATE training_plan_planner_sessions
       SET adjust_from = $3, adjust_to = $4
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId, adjustFrom, adjustTo]
    );
  } finally {
    client.release();
  }
}

async function markSessionConfirmed(
  userId: string,
  sessionId: string,
  summary: string
): Promise<TrainingPlanPlannerSession | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `UPDATE training_plan_planner_sessions
       SET status = 'confirmed', summary = $3, confirmed_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'active'
       RETURNING ${SESSION_COLUMNS}`,
      [sessionId, userId, summary]
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function markSessionCancelled(
  userId: string,
  sessionId: string
): Promise<void> {
  const client = await connect(userId);
  try {
    await client.query(
      `UPDATE training_plan_planner_sessions
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'active'`,
      [sessionId, userId]
    );
  } finally {
    client.release();
  }
}

async function insertMessage(
  userId: string,
  sessionId: string,
  role: TrainingPlanPlannerMessage['role'],
  content: string
): Promise<TrainingPlanPlannerMessage> {
  const client = await connect(userId);
  try {
    const result = await client.query<MessageRow>(
      `INSERT INTO training_plan_planner_messages (session_id, role, content)
       VALUES ($1, $2, $3)
       RETURNING ${MESSAGE_COLUMNS}`,
      [sessionId, role, content]
    );
    return mapMessage(result.rows[0]!);
  } finally {
    client.release();
  }
}

async function listMessages(
  userId: string,
  sessionId: string,
  limit = 200
): Promise<TrainingPlanPlannerMessage[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS}
       FROM training_plan_planner_messages
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [sessionId, limit]
    );
    return result.rows.map(mapMessage);
  } finally {
    client.release();
  }
}

async function listConfirmedChangeSummaries(
  userId: string,
  planId: string,
  limit = 12
): Promise<
  Array<{
    confirmed_at: string;
    mode: TrainingPlanPlannerMode;
    summary: string;
    adjust_from: string | null;
    adjust_to: string | null;
  }>
> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS}
       FROM training_plan_planner_sessions
       WHERE plan_id = $1 AND user_id = $2 AND status = 'confirmed'
         AND summary IS NOT NULL
       ORDER BY confirmed_at DESC NULLS LAST
       LIMIT $3`,
      [planId, userId, limit]
    );
    return result.rows.map((row) => ({
      confirmed_at: toIsoOrNull(row.confirmed_at) ?? toIso(row.created_at),
      mode: row.mode as TrainingPlanPlannerMode,
      summary: row.summary ?? '',
      adjust_from: toDayOrNull(row.adjust_from),
      adjust_to: toDayOrNull(row.adjust_to),
    }));
  } finally {
    client.release();
  }
}

export default {
  createSession,
  listSessions,
  getSession,
  updateSessionAdjustWindow,
  markSessionConfirmed,
  markSessionCancelled,
  insertMessage,
  listMessages,
  listConfirmedChangeSummaries,
};
