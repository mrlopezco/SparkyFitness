import type { z } from 'zod';
import { getClient, getSystemClient } from '../db/poolManager.js';
import {
  trainingCommitmentIntensitySchema,
  trainingGoalTypeSchema,
  trainingPlanStatusSchema,
  trainingSessionPrescriptionSchema,
  trainingSessionStatusSchema,
  trainingSessionTypeSchema,
  trainingSportFocusSchema,
  type TrainingAthleteSnapshot,
  type TrainingAthleteSnapshotPayload,
  type TrainingCommitment,
  type TrainingCommitmentPayload,
  type TrainingGoal,
  type TrainingGoalPayload,
  type TrainingPlan,
  type TrainingPlanCreateRequest,
  type TrainingPlanSession,
  type TrainingPlanSessionPayload,
  type TrainingPlanUpdateRequest,
  type TrainingSessionCompletion,
  type TrainingSessionPrescription,
  type TrainingSessionStatus,
} from '@workspace/shared';

/**
 * Persistence for the fork Training Plan domain. Every query runs through a
 * `getClient(userId)` connection so the `create_diary_policy` RLS rules in
 * `db/rls_policies.sql` scope rows to the acting user (or a delegate with
 * diary access).
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

/** DATE columns come back as day strings; TIMESTAMPTZ columns come back as Date. */
type Timestamp = Date | string;

function toIso(value: Timestamp | null): string {
  if (value instanceof Date) return value.toISOString();
  return value ?? '';
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * CHECK constraints keep these columns inside the shared enums, but a row
 * written before an enum was widened would otherwise widen the return type to
 * `string`. Re-parsing keeps the repository honest without a cast.
 */
function parseEnum<TValue extends string>(
  schema: z.ZodType<TValue>,
  value: unknown,
  fallback: TValue
): TValue {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function parsePrescription(value: unknown): TrainingSessionPrescription {
  const parsed = trainingSessionPrescriptionSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

const PLAN_COLUMNS = `id, user_id, name, description, sport_focus,
    to_char(start_date, 'YYYY-MM-DD') AS start_date,
    to_char(target_date, 'YYYY-MM-DD') AS target_date,
    status, notes, created_at, updated_at`;

const GOAL_COLUMNS = `id, plan_id, goal_type, title,
    to_char(target_date, 'YYYY-MM-DD') AS target_date,
    race_distance_meters, race_target_seconds, weight_target_kg,
    weight_delta_kg, notes, sort_order, created_at, updated_at`;

const COMMITMENT_COLUMNS = `id, plan_id, title, activity_type, intensity,
    to_char(commitment_date, 'YYYY-MM-DD') AS commitment_date,
    recurrence_rule, start_time, duration_minutes, blocks_training, notes,
    created_at, updated_at`;

const SESSION_COLUMNS = `id, plan_id,
    to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
    session_type, status, prescription, skip_reason, sort_order,
    created_at, updated_at`;

const COMPLETION_COLUMNS = `id, plan_session_id, exercise_entry_id,
    adherence_score, athlete_execution_score, matched_by, notes, skip_reason, ai_review,
    created_at, updated_at`;

const SNAPSHOT_COLUMNS = `id, user_id, plan_id,
    to_char(as_of_date, 'YYYY-MM-DD') AS as_of_date,
    payload, token_estimate, created_at`;

interface PlanRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  sport_focus: string;
  start_date: string;
  target_date: string;
  status: string;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface GoalRow {
  id: string;
  plan_id: string;
  goal_type: string;
  title: string;
  target_date: string | null;
  race_distance_meters: number | string | null;
  race_target_seconds: number | string | null;
  weight_target_kg: number | string | null;
  weight_delta_kg: number | string | null;
  notes: string | null;
  sort_order: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface CommitmentRow {
  id: string;
  plan_id: string;
  title: string;
  activity_type: string;
  intensity: string;
  commitment_date: string | null;
  recurrence_rule: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  blocks_training: boolean;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface SessionRow {
  id: string;
  plan_id: string;
  scheduled_date: string;
  session_type: string;
  status: string;
  prescription: unknown;
  skip_reason: string | null;
  sort_order: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface CompletionRow {
  id: string;
  plan_session_id: string;
  exercise_entry_id: string | null;
  adherence_score: number | string | null;
  athlete_execution_score: number | string | null;
  matched_by: string | null;
  notes: string | null;
  skip_reason: string | null;
  ai_review: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface SnapshotRow {
  id: string;
  user_id: string;
  plan_id: string | null;
  as_of_date: string;
  payload: unknown;
  token_estimate: number | null;
  created_at: Timestamp;
}

function mapPlan(row: PlanRow): TrainingPlan {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    description: row.description,
    sport_focus: parseEnum(trainingSportFocusSchema, row.sport_focus, 'other'),
    start_date: row.start_date,
    target_date: row.target_date,
    status: parseEnum(trainingPlanStatusSchema, row.status, 'draft'),
    notes: row.notes,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapGoal(row: GoalRow): TrainingGoal {
  return {
    id: row.id,
    plan_id: row.plan_id,
    type: parseEnum(trainingGoalTypeSchema, row.goal_type, 'custom'),
    title: row.title,
    target_date: row.target_date,
    race_distance_meters: toNumber(row.race_distance_meters),
    race_target_seconds: toNumber(row.race_target_seconds),
    weight_target_kg: toNumber(row.weight_target_kg),
    weight_delta_kg: toNumber(row.weight_delta_kg),
    notes: row.notes,
    sort_order: row.sort_order ?? 0,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapCommitment(row: CommitmentRow): TrainingCommitment {
  return {
    id: row.id,
    plan_id: row.plan_id,
    title: row.title,
    activity_type: row.activity_type,
    intensity: parseEnum(
      trainingCommitmentIntensitySchema,
      row.intensity,
      'moderate'
    ),
    date: row.commitment_date,
    recurrence_rule: row.recurrence_rule,
    start_time: row.start_time,
    duration_minutes: row.duration_minutes,
    blocks_training: row.blocks_training,
    notes: row.notes,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapSession(row: SessionRow): TrainingPlanSession {
  return {
    id: row.id,
    plan_id: row.plan_id,
    scheduled_date: row.scheduled_date,
    session_type: parseEnum(
      trainingSessionTypeSchema,
      row.session_type,
      'other'
    ),
    status: parseEnum(trainingSessionStatusSchema, row.status, 'planned'),
    prescription: parsePrescription(row.prescription),
    skip_reason: row.skip_reason,
    sort_order: row.sort_order ?? 0,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

const MATCHED_BY_VALUES = new Set(['auto', 'manual', 'ai']);

function mapCompletion(row: CompletionRow): TrainingSessionCompletion {
  return {
    id: row.id,
    plan_session_id: row.plan_session_id,
    exercise_entry_id: row.exercise_entry_id,
    adherence_score: toNumber(row.adherence_score),
    athlete_execution_score:
      row.athlete_execution_score === null ||
      row.athlete_execution_score === undefined
        ? null
        : Math.round(Number(row.athlete_execution_score)),
    matched_by:
      row.matched_by && MATCHED_BY_VALUES.has(row.matched_by)
        ? (row.matched_by as TrainingSessionCompletion['matched_by'])
        : null,
    notes: row.notes,
    skip_reason: row.skip_reason,
    ai_review: row.ai_review,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapSnapshot(row: SnapshotRow): TrainingAthleteSnapshot {
  return {
    id: row.id,
    user_id: row.user_id,
    plan_id: row.plan_id,
    as_of_date: row.as_of_date,
    // The payload is written from a validated object; a legacy row that no
    // longer matches keeps only the fields the current schema recognizes.
    payload: (row.payload ?? {}) as TrainingAthleteSnapshotPayload,
    token_estimate: row.token_estimate,
    created_at: toIso(row.created_at),
  };
}

async function insertGoals(
  client: DbClient,
  userId: string,
  planId: string,
  goals: readonly TrainingGoalPayload[]
): Promise<TrainingGoal[]> {
  const inserted: TrainingGoal[] = [];
  for (const [index, goal] of goals.entries()) {
    const result = await client.query<GoalRow>(
      `INSERT INTO training_goals
         (plan_id, user_id, goal_type, title, target_date, race_distance_meters,
          race_target_seconds, weight_target_kg, weight_delta_kg, notes, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${GOAL_COLUMNS}`,
      [
        planId,
        userId,
        goal.type,
        goal.title,
        goal.target_date ?? null,
        goal.race_distance_meters ?? null,
        goal.race_target_seconds ?? null,
        goal.weight_target_kg ?? null,
        goal.weight_delta_kg ?? null,
        goal.notes ?? null,
        goal.sort_order ?? index,
      ]
    );
    inserted.push(mapGoal(result.rows[0]));
  }
  return inserted;
}

async function insertCommitments(
  client: DbClient,
  userId: string,
  planId: string,
  commitments: readonly TrainingCommitmentPayload[]
): Promise<TrainingCommitment[]> {
  const inserted: TrainingCommitment[] = [];
  for (const commitment of commitments) {
    const result = await client.query<CommitmentRow>(
      `INSERT INTO training_commitments
         (plan_id, user_id, title, activity_type, intensity, commitment_date,
          recurrence_rule, start_time, duration_minutes, blocks_training, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${COMMITMENT_COLUMNS}`,
      [
        planId,
        userId,
        commitment.title,
        commitment.activity_type,
        commitment.intensity,
        commitment.date ?? null,
        commitment.recurrence_rule ?? null,
        commitment.start_time ?? null,
        commitment.duration_minutes ?? null,
        commitment.blocks_training,
        commitment.notes ?? null,
      ]
    );
    inserted.push(mapCommitment(result.rows[0]));
  }
  return inserted;
}

async function insertSessionRows(
  client: DbClient,
  userId: string,
  planId: string,
  sessions: readonly TrainingPlanSessionPayload[]
): Promise<TrainingPlanSession[]> {
  const inserted: TrainingPlanSession[] = [];
  for (const [index, session] of sessions.entries()) {
    const result = await client.query<SessionRow>(
      `INSERT INTO training_plan_sessions
         (plan_id, user_id, scheduled_date, session_type, status, prescription, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING ${SESSION_COLUMNS}`,
      [
        planId,
        userId,
        session.scheduled_date,
        session.session_type,
        session.status,
        JSON.stringify(session.prescription ?? {}),
        session.sort_order ?? index,
      ]
    );
    inserted.push(mapSession(result.rows[0]));
  }
  return inserted;
}

export interface CreatePlanResult {
  plan: TrainingPlan;
  goals: TrainingGoal[];
  commitments: TrainingCommitment[];
}

async function createPlan(
  userId: string,
  request: TrainingPlanCreateRequest
): Promise<CreatePlanResult> {
  const client = await connect(userId);
  try {
    await client.query('BEGIN');
    const planResult = await client.query<PlanRow>(
      `INSERT INTO training_plans
         (user_id, name, description, sport_focus, start_date, target_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${PLAN_COLUMNS}`,
      [
        userId,
        request.name,
        request.description ?? null,
        request.sport_focus,
        request.start_date,
        request.target_date,
        request.notes ?? null,
      ]
    );
    const plan = mapPlan(planResult.rows[0]);
    const goals = await insertGoals(client, userId, plan.id, request.goals);
    const commitments = await insertCommitments(
      client,
      userId,
      plan.id,
      request.commitments
    );
    await client.query('COMMIT');
    return { plan, goals, commitments };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listPlans(userId: string): Promise<TrainingPlan[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<PlanRow>(
      `SELECT ${PLAN_COLUMNS} FROM training_plans
       WHERE user_id = $1
       ORDER BY start_date DESC, created_at DESC`,
      [userId]
    );
    return result.rows.map(mapPlan);
  } finally {
    client.release();
  }
}

async function getPlanById(
  userId: string,
  planId: string
): Promise<TrainingPlan | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<PlanRow>(
      `SELECT ${PLAN_COLUMNS} FROM training_plans WHERE id = $1 AND user_id = $2`,
      [planId, userId]
    );
    return result.rows[0] ? mapPlan(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

const PLAN_UPDATE_COLUMNS: ReadonlyArray<keyof TrainingPlanUpdateRequest> = [
  'name',
  'description',
  'sport_focus',
  'start_date',
  'target_date',
  'status',
  'notes',
];

async function updatePlan(
  userId: string,
  planId: string,
  updates: TrainingPlanUpdateRequest
): Promise<TrainingPlan | null> {
  const assignments: string[] = [];
  const params: unknown[] = [planId, userId];

  for (const column of PLAN_UPDATE_COLUMNS) {
    const value = updates[column];
    if (value === undefined) continue;
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  }

  if (assignments.length === 0) {
    return getPlanById(userId, planId);
  }

  const client = await connect(userId);
  try {
    if (updates.status === 'active') {
      await client.query(
        `UPDATE training_plans
           SET status = 'draft'
         WHERE user_id = $1
           AND status = 'active'
           AND id <> $2`,
        [userId, planId]
      );
    }
    const result = await client.query<PlanRow>(
      `UPDATE training_plans SET ${assignments.join(', ')}
       WHERE id = $1 AND user_id = $2
       RETURNING ${PLAN_COLUMNS}`,
      params
    );
    return result.rows[0] ? mapPlan(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function deletePlan(userId: string, planId: string): Promise<boolean> {
  const client = await connect(userId);
  try {
    const result = await client.query(
      'DELETE FROM training_plans WHERE id = $1 AND user_id = $2',
      [planId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

async function listGoals(
  userId: string,
  planId: string
): Promise<TrainingGoal[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<GoalRow>(
      `SELECT ${GOAL_COLUMNS} FROM training_goals
       WHERE plan_id = $1 AND user_id = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [planId, userId]
    );
    return result.rows.map(mapGoal);
  } finally {
    client.release();
  }
}

async function replaceGoals(
  userId: string,
  planId: string,
  goals: readonly TrainingGoalPayload[]
): Promise<TrainingGoal[]> {
  const client = await connect(userId);
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM training_goals WHERE plan_id = $1 AND user_id = $2',
      [planId, userId]
    );
    const inserted = await insertGoals(client, userId, planId, goals);
    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listCommitments(
  userId: string,
  planId?: string
): Promise<TrainingCommitment[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<CommitmentRow>(
      `SELECT ${COMMITMENT_COLUMNS} FROM training_commitments
       WHERE user_id = $1 AND ($2::uuid IS NULL OR plan_id = $2::uuid)
       ORDER BY commitment_date ASC NULLS LAST, created_at ASC`,
      [userId, planId ?? null]
    );
    return result.rows.map(mapCommitment);
  } finally {
    client.release();
  }
}

async function replaceCommitments(
  userId: string,
  planId: string,
  commitments: readonly TrainingCommitmentPayload[]
): Promise<TrainingCommitment[]> {
  const client = await connect(userId);
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM training_commitments WHERE plan_id = $1 AND user_id = $2',
      [planId, userId]
    );
    const inserted = await insertCommitments(
      client,
      userId,
      planId,
      commitments
    );
    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listSessions(
  userId: string,
  planId: string
): Promise<TrainingPlanSession[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM training_plan_sessions
       WHERE plan_id = $1 AND user_id = $2
       ORDER BY scheduled_date ASC, sort_order ASC`,
      [planId, userId]
    );
    return result.rows.map(mapSession);
  } finally {
    client.release();
  }
}

/**
 * Writes a proposed block of sessions. When `replaceExisting` is set, only
 * `planned` sessions are cleared first — a completed or skipped session is
 * training history and must survive a re-plan.
 */
async function replaceSessions(
  userId: string,
  planId: string,
  sessions: readonly TrainingPlanSessionPayload[],
  replaceExisting: boolean
): Promise<TrainingPlanSession[]> {
  const client = await connect(userId);
  try {
    await client.query('BEGIN');
    if (replaceExisting) {
      await client.query(
        `DELETE FROM training_plan_sessions
         WHERE plan_id = $1 AND user_id = $2 AND status = 'planned'`,
        [planId, userId]
      );
    }
    const inserted = await insertSessionRows(client, userId, planId, sessions);
    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * `skipReason` is only written when supplied, so the auto-matcher flipping a
 * session to `completed` never wipes a reason the athlete typed earlier.
 */
async function updateSessionStatus(
  userId: string,
  sessionId: string,
  status: TrainingSessionStatus,
  skipReason?: string | null
): Promise<TrainingPlanSession | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `UPDATE training_plan_sessions
         SET status = $3,
             skip_reason = CASE WHEN $4::boolean THEN $5 ELSE skip_reason END
       WHERE id = $1 AND user_id = $2
       RETURNING ${SESSION_COLUMNS}`,
      [sessionId, userId, status, skipReason !== undefined, skipReason ?? null]
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function getSessionById(
  userId: string,
  sessionId: string
): Promise<TrainingPlanSession | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM training_plan_sessions
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export interface SessionWithCompletion extends TrainingPlanSession {
  completion: TrainingSessionCompletion | null;
}

interface SessionWithCompletionRow extends SessionRow {
  completion_id: string | null;
  completion_exercise_entry_id: string | null;
  completion_adherence_score: number | string | null;
  completion_athlete_execution_score: number | string | null;
  completion_matched_by: string | null;
  completion_notes: string | null;
  completion_skip_reason: string | null;
  completion_ai_review: string | null;
  completion_created_at: Timestamp | null;
  completion_updated_at: Timestamp | null;
}

function mapSessionWithCompletion(
  row: SessionWithCompletionRow
): SessionWithCompletion {
  const session = mapSession(row);
  if (!row.completion_id) {
    return { ...session, completion: null };
  }
  return {
    ...session,
    completion: mapCompletion({
      id: row.completion_id,
      plan_session_id: row.id,
      exercise_entry_id: row.completion_exercise_entry_id,
      adherence_score: row.completion_adherence_score,
      athlete_execution_score: row.completion_athlete_execution_score,
      matched_by: row.completion_matched_by,
      notes: row.completion_notes,
      skip_reason: row.completion_skip_reason,
      ai_review: row.completion_ai_review,
      created_at: row.completion_created_at ?? '',
      updated_at: row.completion_updated_at ?? '',
    }),
  };
}

async function listSessionsInRange(
  userId: string,
  startDate: string,
  endDate: string,
  planId?: string
): Promise<SessionWithCompletion[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionWithCompletionRow>(
      `SELECT s.id, s.plan_id,
              to_char(s.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
              s.session_type, s.status, s.prescription, s.skip_reason,
              s.sort_order, s.created_at, s.updated_at,
              c.id AS completion_id,
              c.exercise_entry_id AS completion_exercise_entry_id,
              c.adherence_score AS completion_adherence_score,
              c.athlete_execution_score AS completion_athlete_execution_score,
              c.matched_by AS completion_matched_by,
              c.notes AS completion_notes,
              c.skip_reason AS completion_skip_reason,
              c.ai_review AS completion_ai_review,
              c.created_at AS completion_created_at,
              c.updated_at AS completion_updated_at
       FROM training_plan_sessions s
       LEFT JOIN training_session_completions c ON c.plan_session_id = s.id
       WHERE s.user_id = $1
         AND s.scheduled_date BETWEEN $2::date AND $3::date
         AND ($4::uuid IS NULL OR s.plan_id = $4::uuid)
       ORDER BY s.scheduled_date ASC, s.sort_order ASC`,
      [userId, startDate, endDate, planId ?? null]
    );
    return result.rows.map(mapSessionWithCompletion);
  } finally {
    client.release();
  }
}

async function upsertCompletion(
  userId: string,
  completion: {
    plan_session_id: string;
    exercise_entry_id?: string | null;
    adherence_score?: number | null;
    athlete_execution_score?: number | null;
    matched_by?: TrainingSessionCompletion['matched_by'];
    notes?: string | null;
    skip_reason?: string | null;
    ai_review?: string | null;
  }
): Promise<TrainingSessionCompletion> {
  const client = await connect(userId);
  try {
    const result = await client.query<CompletionRow>(
      `INSERT INTO training_session_completions
         (plan_session_id, exercise_entry_id, adherence_score, athlete_execution_score,
          matched_by, notes, skip_reason, ai_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (plan_session_id) DO UPDATE
         SET exercise_entry_id = COALESCE(EXCLUDED.exercise_entry_id, training_session_completions.exercise_entry_id),
             adherence_score = COALESCE(EXCLUDED.adherence_score, training_session_completions.adherence_score),
             athlete_execution_score = COALESCE(EXCLUDED.athlete_execution_score, training_session_completions.athlete_execution_score),
             matched_by = COALESCE(EXCLUDED.matched_by, training_session_completions.matched_by),
             notes = COALESCE(EXCLUDED.notes, training_session_completions.notes),
             skip_reason = COALESCE(EXCLUDED.skip_reason, training_session_completions.skip_reason),
             ai_review = COALESCE(EXCLUDED.ai_review, training_session_completions.ai_review)
       RETURNING ${COMPLETION_COLUMNS}`,
      [
        completion.plan_session_id,
        completion.exercise_entry_id ?? null,
        completion.adherence_score ?? null,
        completion.athlete_execution_score ?? null,
        completion.matched_by ?? null,
        completion.notes ?? null,
        completion.skip_reason ?? null,
        completion.ai_review ?? null,
      ]
    );
    return mapCompletion(result.rows[0]);
  } finally {
    client.release();
  }
}

async function getSessionWithCompletion(
  userId: string,
  sessionId: string
): Promise<SessionWithCompletion | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SessionWithCompletionRow>(
      `SELECT s.id, s.plan_id,
              to_char(s.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
              s.session_type, s.status, s.prescription, s.skip_reason,
              s.sort_order, s.created_at, s.updated_at,
              c.id AS completion_id,
              c.exercise_entry_id AS completion_exercise_entry_id,
              c.adherence_score AS completion_adherence_score,
              c.athlete_execution_score AS completion_athlete_execution_score,
              c.matched_by AS completion_matched_by,
              c.notes AS completion_notes,
              c.skip_reason AS completion_skip_reason,
              c.ai_review AS completion_ai_review,
              c.created_at AS completion_created_at,
              c.updated_at AS completion_updated_at
       FROM training_plan_sessions s
       LEFT JOIN training_session_completions c ON c.plan_session_id = s.id
       WHERE s.id = $1 AND s.user_id = $2`,
      [sessionId, userId]
    );
    return result.rows[0] ? mapSessionWithCompletion(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function insertSnapshot(
  userId: string,
  planId: string | null,
  asOfDate: string,
  payload: TrainingAthleteSnapshotPayload,
  tokenEstimate: number
): Promise<TrainingAthleteSnapshot> {
  const client = await connect(userId);
  try {
    const result = await client.query<SnapshotRow>(
      `INSERT INTO training_athlete_snapshots
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

async function getLatestSnapshot(
  userId: string,
  planId?: string
): Promise<TrainingAthleteSnapshot | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<SnapshotRow>(
      `SELECT ${SNAPSHOT_COLUMNS} FROM training_athlete_snapshots
       WHERE user_id = $1 AND ($2::uuid IS NULL OR plan_id = $2::uuid)
       ORDER BY as_of_date DESC, created_at DESC
       LIMIT 1`,
      [userId, planId ?? null]
    );
    return result.rows[0] ? mapSnapshot(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/**
 * One logged activity, with every signal `classifyActivitySport` needs to
 * recover the sport (which `exercise_entries` does not store).
 */
export interface ActivityEntryRow {
  id: string;
  entry_date: string;
  exercise_name: string | null;
  category: string | null;
  notes: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  provider_name: string | null;
  detail_data: unknown;
  exercise_source_id: string | null;
}

interface RawActivityEntryRow extends Omit<
  ActivityEntryRow,
  'distance_km' | 'duration_minutes'
> {
  distance_km: number | string | null;
  duration_minutes: number | string | null;
}

const ACTIVITY_ENTRY_QUERY = `
  SELECT ee.id,
         to_char(ee.entry_date, 'YYYY-MM-DD') AS entry_date,
         ee.exercise_name, ee.category, ee.notes,
         ee.distance AS distance_km,
         ee.duration_minutes,
         d.provider_name, d.detail_data,
         x.source_id AS exercise_source_id
  FROM exercise_entries ee
  LEFT JOIN exercises x ON x.id = ee.exercise_id
  LEFT JOIN LATERAL (
    SELECT provider_name, detail_data
    FROM exercise_entry_activity_details
    WHERE exercise_entry_id = ee.id
    ORDER BY created_at DESC
    LIMIT 1
  ) d ON TRUE
  WHERE ee.user_id = $1
    AND ee.entry_date BETWEEN $2::date AND $3::date
  ORDER BY ee.entry_date ASC, ee.id ASC`;

async function listActivityEntries(
  userId: string,
  startDate: string,
  endDate: string
): Promise<ActivityEntryRow[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<RawActivityEntryRow>(
      ACTIVITY_ENTRY_QUERY,
      [userId, startDate, endDate]
    );
    return result.rows.map((row) => ({
      ...row,
      distance_km: toNumber(row.distance_km),
      duration_minutes: toNumber(row.duration_minutes),
    }));
  } finally {
    client.release();
  }
}

export interface WeightSample {
  date: string;
  kg: number;
}

async function listWeightSeries(
  userId: string,
  startDate: string,
  endDate: string
): Promise<WeightSample[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<{
      date: string;
      kg: number | string | null;
    }>(
      `SELECT to_char(entry_date, 'YYYY-MM-DD') AS date, weight AS kg
       FROM check_in_measurements
       WHERE user_id = $1
         AND entry_date BETWEEN $2::date AND $3::date
         AND weight IS NOT NULL
       ORDER BY entry_date ASC`,
      [userId, startDate, endDate]
    );
    return result.rows.flatMap((row) => {
      const kg = toNumber(row.kg);
      return kg === null ? [] : [{ date: row.date, kg }];
    });
  } finally {
    client.release();
  }
}

export interface ReadinessAggregate {
  avg_training_readiness: number | null;
  avg_acute_load: number | null;
  latest_vo2_max: number | null;
  lactate_threshold_bpm: number | null;
  lactate_threshold_speed_mps: number | null;
}

/**
 * Each "latest" column is fetched independently: a watch can publish VO2 max on
 * a day it has no lactate reading, so picking one newest row would drop the
 * other signal entirely.
 */
function latestMetric(column: string): string {
  return `(SELECT ${column} FROM daily_health_metrics
            WHERE user_id = $1
              AND entry_date BETWEEN $2::date AND $3::date
              AND ${column} IS NOT NULL
            ORDER BY entry_date DESC
            LIMIT 1)`;
}

async function getReadinessAggregate(
  userId: string,
  startDate: string,
  endDate: string
): Promise<ReadinessAggregate> {
  const client = await connect(userId);
  try {
    const result = await client.query<{
      avg_training_readiness: number | string | null;
      avg_acute_load: number | string | null;
      latest_vo2_max: number | string | null;
      lactate_threshold_bpm: number | string | null;
      lactate_threshold_speed_mps: number | string | null;
    }>(
      `SELECT AVG(training_readiness_score) AS avg_training_readiness,
              AVG(acute_training_load) AS avg_acute_load,
              ${latestMetric('vo2_max')} AS latest_vo2_max,
              ${latestMetric('lactate_threshold_bpm')} AS lactate_threshold_bpm,
              ${latestMetric('lactate_threshold_speed_mps')} AS lactate_threshold_speed_mps
       FROM daily_health_metrics
       WHERE user_id = $1 AND entry_date BETWEEN $2::date AND $3::date`,
      [userId, startDate, endDate]
    );
    const row = result.rows[0];
    return {
      avg_training_readiness: toNumber(row?.avg_training_readiness),
      avg_acute_load: toNumber(row?.avg_acute_load),
      latest_vo2_max: toNumber(row?.latest_vo2_max),
      lactate_threshold_bpm: toNumber(row?.lactate_threshold_bpm),
      lactate_threshold_speed_mps: toNumber(row?.lactate_threshold_speed_mps),
    };
  } finally {
    client.release();
  }
}

/** Watch-published race predictions, in seconds, newest non-null per distance. */
export interface RacePredictionAggregate {
  race_prediction_5k_seconds: number | null;
  race_prediction_10k_seconds: number | null;
  race_prediction_half_marathon_seconds: number | null;
}

async function getRacePredictions(
  userId: string,
  startDate: string,
  endDate: string
): Promise<RacePredictionAggregate> {
  const client = await connect(userId);
  try {
    const result = await client.query<{
      race_prediction_5k_seconds: number | string | null;
      race_prediction_10k_seconds: number | string | null;
      race_prediction_half_marathon_seconds: number | string | null;
    }>(
      `SELECT ${latestMetric('race_prediction_5k_seconds')} AS race_prediction_5k_seconds,
              ${latestMetric('race_prediction_10k_seconds')} AS race_prediction_10k_seconds,
              ${latestMetric('race_prediction_half_marathon_seconds')} AS race_prediction_half_marathon_seconds`,
      [userId, startDate, endDate]
    );
    const row = result.rows[0];
    return {
      race_prediction_5k_seconds: toNumber(row?.race_prediction_5k_seconds),
      race_prediction_10k_seconds: toNumber(row?.race_prediction_10k_seconds),
      race_prediction_half_marathon_seconds: toNumber(
        row?.race_prediction_half_marathon_seconds
      ),
    };
  } finally {
    client.release();
  }
}

/**
 * Planned sessions in the window that were never matched to an activity, and
 * were not deliberately skipped. This is the "drift" signal the weekly
 * check-in reads before deciding to open a coach session.
 */
async function countUnmatchedPlannedSessions(
  userId: string,
  planId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const client = await connect(userId);
  try {
    const result = await client.query<{ unmatched: number | string | null }>(
      `SELECT COUNT(*) AS unmatched
       FROM training_plan_sessions s
       LEFT JOIN training_session_completions c ON c.plan_session_id = s.id
       WHERE s.user_id = $1
         AND s.plan_id = $2
         AND s.scheduled_date BETWEEN $3::date AND $4::date
         AND s.status = 'planned'
         AND s.session_type <> 'rest'
         AND c.id IS NULL`,
      [userId, planId, startDate, endDate]
    );
    return toNumber(result.rows[0]?.unmatched) ?? 0;
  } finally {
    client.release();
  }
}

/** One active plan, as seen by the cron scan. */
export interface ActivePlanRef {
  plan_id: string;
  user_id: string;
  name: string;
  sport_focus: string;
  target_date: string;
}

/**
 * Cron-only scan across every user, so it deliberately runs on the owner pool:
 * there is no acting user to set an RLS context for. Callers must switch to
 * `getClient(user_id)` before reading or writing anything per user.
 */
async function listActivePlansForScan(): Promise<ActivePlanRef[]> {
  const client = (await getSystemClient()) as unknown as DbClient;
  try {
    const result = await client.query<ActivePlanRef>(
      `SELECT id AS plan_id, user_id, name, sport_focus,
              to_char(target_date, 'YYYY-MM-DD') AS target_date
       FROM training_plans
       WHERE status = 'active'
       ORDER BY user_id ASC, target_date ASC`
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export {
  createPlan,
  listPlans,
  getPlanById,
  updatePlan,
  deletePlan,
  listGoals,
  replaceGoals,
  listCommitments,
  replaceCommitments,
  listSessions,
  listSessionsInRange,
  replaceSessions,
  updateSessionStatus,
  getSessionById,
  getSessionWithCompletion,
  upsertCompletion,
  insertSnapshot,
  getLatestSnapshot,
  listActivityEntries,
  listWeightSeries,
  getReadinessAggregate,
  getRacePredictions,
  countUnmatchedPlannedSessions,
  listActivePlansForScan,
};

export default {
  createPlan,
  listPlans,
  getPlanById,
  updatePlan,
  deletePlan,
  listGoals,
  replaceGoals,
  listCommitments,
  replaceCommitments,
  listSessions,
  listSessionsInRange,
  replaceSessions,
  updateSessionStatus,
  getSessionById,
  getSessionWithCompletion,
  upsertCompletion,
  insertSnapshot,
  getLatestSnapshot,
  listActivityEntries,
  listWeightSeries,
  getReadinessAggregate,
  getRacePredictions,
  countUnmatchedPlannedSessions,
  listActivePlansForScan,
};
