import { getClient } from '../db/poolManager.js';
import {
  trainingFitnessTestPrescriptionSchema,
  trainingFitnessTestResultSchema,
  trainingFitnessTestStatusSchema,
  trainingFitnessTestTypeSchema,
  type TrainingFitnessTest,
  type TrainingFitnessTestCreateRequest,
  type TrainingFitnessTestPrescription,
  type TrainingFitnessTestResult,
  type TrainingFitnessTestStatus,
} from '@workspace/shared';

/**
 * Persistence for periodic fitness tests ("fitness snapshots"): the time
 * trials and aerobic checks the coach schedules so plan paces stay anchored to
 * measured fitness rather than to a stale race prediction. Runs through
 * `getClient(userId)` for the `create_diary_policy` RLS rules.
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

const TEST_COLUMNS = `id, plan_id, user_id, test_type, title,
    to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
    status, prescription, result, source, due_interval_days, notes,
    created_at, updated_at, completed_at`;

const SOURCES = new Set(['coach', 'system', 'user']);

interface TestRow {
  id: string;
  plan_id: string | null;
  user_id: string;
  test_type: string;
  title: string;
  scheduled_date: string;
  status: string;
  prescription: unknown;
  result: unknown;
  source: string;
  due_interval_days: number | null;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  completed_at: Timestamp | null;
}

/**
 * CHECK constraints keep these columns inside the shared enums; re-parsing
 * narrows the row's `string` back to the union without a cast, and falls back
 * for a row written before an enum was widened.
 */
function mapTest(row: TestRow): TrainingFitnessTest {
  const testType = trainingFitnessTestTypeSchema.safeParse(row.test_type);
  const status = trainingFitnessTestStatusSchema.safeParse(row.status);
  const prescription = trainingFitnessTestPrescriptionSchema.safeParse(
    row.prescription ?? {}
  );
  const result =
    row.result === null || row.result === undefined
      ? null
      : trainingFitnessTestResultSchema.safeParse(row.result);

  return {
    id: row.id,
    plan_id: row.plan_id,
    user_id: row.user_id,
    test_type: testType.success ? testType.data : 'custom',
    title: row.title,
    scheduled_date: row.scheduled_date,
    status: status.success ? status.data : 'scheduled',
    prescription: prescription.success
      ? prescription.data
      : ({} as TrainingFitnessTestPrescription),
    result: result && result.success ? result.data : null,
    source: SOURCES.has(row.source)
      ? (row.source as TrainingFitnessTest['source'])
      : 'user',
    due_interval_days: row.due_interval_days,
    notes: row.notes,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    completed_at: toIsoOrNull(row.completed_at),
  };
}

async function createTest(
  userId: string,
  request: TrainingFitnessTestCreateRequest
): Promise<TrainingFitnessTest> {
  const client = await connect(userId);
  try {
    const result = await client.query<TestRow>(
      `INSERT INTO training_fitness_tests
         (plan_id, user_id, test_type, title, scheduled_date, prescription,
          source, due_interval_days, notes)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING ${TEST_COLUMNS}`,
      [
        request.plan_id ?? null,
        userId,
        request.test_type,
        request.title,
        request.scheduled_date,
        JSON.stringify(request.prescription ?? {}),
        request.source,
        request.due_interval_days ?? null,
        request.notes ?? null,
      ]
    );
    return mapTest(result.rows[0]);
  } finally {
    client.release();
  }
}

export interface ListFitnessTestsFilter {
  planId?: string;
  status?: TrainingFitnessTestStatus;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

async function listTests(
  userId: string,
  filter: ListFitnessTestsFilter = {}
): Promise<TrainingFitnessTest[]> {
  const client = await connect(userId);
  try {
    const result = await client.query<TestRow>(
      `SELECT ${TEST_COLUMNS} FROM training_fitness_tests
       WHERE user_id = $1
         AND ($2::uuid IS NULL OR plan_id = $2::uuid)
         AND ($3::text IS NULL OR status = $3::text)
         AND ($4::date IS NULL OR scheduled_date >= $4::date)
         AND ($5::date IS NULL OR scheduled_date <= $5::date)
       ORDER BY scheduled_date DESC, created_at DESC
       LIMIT $6`,
      [
        userId,
        filter.planId ?? null,
        filter.status ?? null,
        filter.fromDate ?? null,
        filter.toDate ?? null,
        filter.limit ?? 200,
      ]
    );
    return result.rows.map(mapTest);
  } finally {
    client.release();
  }
}

async function getTestById(
  userId: string,
  testId: string
): Promise<TrainingFitnessTest | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<TestRow>(
      `SELECT ${TEST_COLUMNS} FROM training_fitness_tests
       WHERE id = $1 AND user_id = $2`,
      [testId, userId]
    );
    return result.rows[0] ? mapTest(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/**
 * Records the outcome. `completed_at` is only stamped for a completed test, so
 * a skipped test stays visibly unmeasured rather than looking like a result.
 */
async function reportResult(
  userId: string,
  testId: string,
  status: Extract<TrainingFitnessTestStatus, 'completed' | 'skipped'>,
  result: TrainingFitnessTestResult,
  notes: string | null
): Promise<TrainingFitnessTest | null> {
  const client = await connect(userId);
  try {
    const updated = await client.query<TestRow>(
      `UPDATE training_fitness_tests
         SET status = $3,
             result = $4::jsonb,
             notes = COALESCE($5, notes),
             completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE NULL END
       WHERE id = $1 AND user_id = $2
       RETURNING ${TEST_COLUMNS}`,
      [testId, userId, status, JSON.stringify(result), notes]
    );
    return updated.rows[0] ? mapTest(updated.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function deleteTest(userId: string, testId: string): Promise<boolean> {
  const client = await connect(userId);
  try {
    const result = await client.query(
      'DELETE FROM training_fitness_tests WHERE id = $1 AND user_id = $2',
      [testId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/** Newest scheduled date across every status; the check-in cadence signal. */
async function getLatestTestDate(
  userId: string,
  planId?: string
): Promise<string | null> {
  const client = await connect(userId);
  try {
    const result = await client.query<{ scheduled_date: string | null }>(
      `SELECT to_char(MAX(scheduled_date), 'YYYY-MM-DD') AS scheduled_date
       FROM training_fitness_tests
       WHERE user_id = $1
         AND ($2::uuid IS NULL OR plan_id = $2::uuid)
         AND status <> 'cancelled'`,
      [userId, planId ?? null]
    );
    return result.rows[0]?.scheduled_date ?? null;
  } finally {
    client.release();
  }
}

export {
  createTest,
  listTests,
  getTestById,
  reportResult,
  deleteTest,
  getLatestTestDate,
};

export default {
  createTest,
  listTests,
  getTestById,
  reportResult,
  deleteTest,
  getLatestTestDate,
};
