/**
 * Persistence for GHD full-history import jobs and per-week coverage rows.
 */

import type {
  GhdHistoryImportCoverage,
  GhdHistoryImportFailedWeek,
  GhdHistoryImportJobStatus,
  GhdHistoryImportWeekStatus,
} from '@workspace/shared';
import { addDays, compareDays } from '@workspace/shared';
import { getClient, getSystemClient } from '../db/poolManager.js';

export interface GhdHistoryImportJobRow {
  id: string;
  user_id: string;
  provider_id: string | null;
  status: GhdHistoryImportJobStatus;
  range_start: string;
  range_end: string;
  cursor_day: string;
  weeks_total: number;
  weeks_completed: number;
  weeks_empty: number;
  weeks_failed: number;
  last_error: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface GhdHistoryImportWeekRow {
  id: string;
  job_id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  status: GhdHistoryImportWeekStatus;
  extract_ok: boolean | null;
  project_ok: boolean | null;
  error: string | null;
  updated_at: Date;
}

function toDayString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value);
  return text.slice(0, 10);
}

function mapJob(row: Record<string, unknown>): GhdHistoryImportJobRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    provider_id: row.provider_id ? String(row.provider_id) : null,
    status: row.status as GhdHistoryImportJobStatus,
    range_start: toDayString(row.range_start),
    range_end: toDayString(row.range_end),
    cursor_day: toDayString(row.cursor_day),
    weeks_total: Number(row.weeks_total),
    weeks_completed: Number(row.weeks_completed),
    weeks_empty: Number(row.weeks_empty),
    weeks_failed: Number(row.weeks_failed),
    last_error: row.last_error === null || row.last_error === undefined
      ? null
      : String(row.last_error),
    started_at: row.started_at ? new Date(String(row.started_at)) : null,
    finished_at: row.finished_at ? new Date(String(row.finished_at)) : null,
    created_at: new Date(String(row.created_at)),
    updated_at: new Date(String(row.updated_at)),
  };
}

function mapWeek(row: Record<string, unknown>): GhdHistoryImportWeekRow {
  return {
    id: String(row.id),
    job_id: String(row.job_id),
    user_id: String(row.user_id),
    week_start: toDayString(row.week_start),
    week_end: toDayString(row.week_end),
    status: row.status as GhdHistoryImportWeekStatus,
    extract_ok:
      row.extract_ok === null || row.extract_ok === undefined
        ? null
        : Boolean(row.extract_ok),
    project_ok:
      row.project_ok === null || row.project_ok === undefined
        ? null
        : Boolean(row.project_ok),
    error:
      row.error === null || row.error === undefined ? null : String(row.error),
    updated_at: new Date(String(row.updated_at)),
  };
}

/** Inclusive 7-day windows from rangeStart through rangeEnd. */
export function buildWeekWindows(
  rangeStart: string,
  rangeEnd: string
): Array<{ week_start: string; week_end: string }> {
  const windows: Array<{ week_start: string; week_end: string }> = [];
  let cursor = rangeStart;
  while (compareDays(cursor, rangeEnd) <= 0) {
    const weekEndCandidate = addDays(cursor, 6);
    const week_end =
      compareDays(weekEndCandidate, rangeEnd) > 0 ? rangeEnd : weekEndCandidate;
    windows.push({ week_start: cursor, week_end });
    cursor = addDays(week_end, 1);
  }
  return windows;
}

async function createJob(
  userId: string,
  providerId: string | null,
  rangeStart: string,
  rangeEnd: string
): Promise<GhdHistoryImportJobRow> {
  const windows = buildWeekWindows(rangeStart, rangeEnd);
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const jobRes = await client.query(
      `INSERT INTO ghd_history_import_jobs
         (user_id, provider_id, status, range_start, range_end, cursor_day,
          weeks_total, weeks_completed, weeks_empty, weeks_failed, started_at)
       VALUES ($1, $2, 'pending', $3::date, $4::date, $3::date,
               $5, 0, 0, 0, NOW())
       RETURNING *`,
      [userId, providerId, rangeStart, rangeEnd, windows.length]
    );
    const job = mapJob(jobRes.rows[0] as Record<string, unknown>);

    for (const window of windows) {
      await client.query(
        `INSERT INTO ghd_history_import_weeks
           (job_id, user_id, week_start, week_end, status)
         VALUES ($1, $2, $3::date, $4::date, 'pending')`,
        [job.id, userId, window.week_start, window.week_end]
      );
    }

    await client.query('COMMIT');
    return job;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getActiveJobForUser(
  userId: string
): Promise<GhdHistoryImportJobRow | null> {
  const client = await getClient(userId);
  try {
    const res = await client.query(
      `SELECT * FROM ghd_history_import_jobs
       WHERE user_id = $1
         AND status IN ('pending', 'running', 'paused')
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    return res.rows[0]
      ? mapJob(res.rows[0] as Record<string, unknown>)
      : null;
  } finally {
    client.release();
  }
}

async function getLatestJobForUser(
  userId: string
): Promise<GhdHistoryImportJobRow | null> {
  const client = await getClient(userId);
  try {
    const res = await client.query(
      `SELECT * FROM ghd_history_import_jobs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    return res.rows[0]
      ? mapJob(res.rows[0] as Record<string, unknown>)
      : null;
  } finally {
    client.release();
  }
}

async function getJobById(
  userId: string,
  jobId: string
): Promise<GhdHistoryImportJobRow | null> {
  const client = await getClient(userId);
  try {
    const res = await client.query(
      `SELECT * FROM ghd_history_import_jobs
       WHERE id = $1 AND user_id = $2`,
      [jobId, userId]
    );
    return res.rows[0]
      ? mapJob(res.rows[0] as Record<string, unknown>)
      : null;
  } finally {
    client.release();
  }
}

async function listWeeksForJob(
  userId: string,
  jobId: string
): Promise<GhdHistoryImportWeekRow[]> {
  const client = await getClient(userId);
  try {
    const res = await client.query(
      `SELECT * FROM ghd_history_import_weeks
       WHERE job_id = $1 AND user_id = $2
       ORDER BY week_start ASC`,
      [jobId, userId]
    );
    return (res.rows as Array<Record<string, unknown>>).map(mapWeek);
  } finally {
    client.release();
  }
}

async function buildCoverage(
  userId: string,
  job: GhdHistoryImportJobRow
): Promise<GhdHistoryImportCoverage> {
  const weeks = await listWeeksForJob(userId, job.id);
  const failed_weeks: GhdHistoryImportFailedWeek[] = weeks
    .filter((w) => w.status === 'failed')
    .map((w) => ({
      week_start: w.week_start,
      week_end: w.week_end,
      error: w.error,
    }));

  const weeks_pending = weeks.filter((w) => w.status === 'pending').length;

  return {
    weeks_total: job.weeks_total,
    weeks_completed: job.weeks_completed,
    weeks_empty: job.weeks_empty,
    weeks_failed: job.weeks_failed,
    weeks_pending,
    failed_weeks,
  };
}

async function setJobStatus(
  userId: string,
  jobId: string,
  status: GhdHistoryImportJobStatus,
  extras: {
    last_error?: string | null;
    finished?: boolean;
  } = {}
): Promise<GhdHistoryImportJobRow | null> {
  const client = await getClient(userId);
  try {
    const res = await client.query(
      `UPDATE ghd_history_import_jobs
       SET status = $3,
           last_error = COALESCE($4, last_error),
           finished_at = CASE WHEN $5 THEN NOW() ELSE finished_at END,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        jobId,
        userId,
        status,
        extras.last_error ?? null,
        extras.finished === true,
      ]
    );
    return res.rows[0]
      ? mapJob(res.rows[0] as Record<string, unknown>)
      : null;
  } finally {
    client.release();
  }
}

/**
 * Claim the next pending week for a pending/running job (FOR UPDATE SKIP LOCKED).
 * Marks the job running and the week claimed implicitly by returning it.
 */
async function claimNextPendingWeek(): Promise<{
  job: GhdHistoryImportJobRow;
  week: GhdHistoryImportWeekRow;
} | null> {
  const client = await getSystemClient();
  try {
    await client.query('BEGIN');
    const jobRes = await client.query(
      `SELECT * FROM ghd_history_import_jobs
       WHERE status IN ('pending', 'running')
       ORDER BY updated_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    );
    if (jobRes.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }
    const job = mapJob(jobRes.rows[0] as Record<string, unknown>);

    const weekRes = await client.query(
      `SELECT * FROM ghd_history_import_weeks
       WHERE job_id = $1 AND status = 'pending'
       ORDER BY week_start ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [job.id]
    );

    if (weekRes.rows.length === 0) {
      await client.query(
        `UPDATE ghd_history_import_jobs
         SET status = 'completed', finished_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [job.id]
      );
      await client.query('COMMIT');
      return null;
    }

    const week = mapWeek(weekRes.rows[0] as Record<string, unknown>);

    await client.query(
      `UPDATE ghd_history_import_jobs
       SET status = 'running',
           cursor_day = $2::date,
           updated_at = NOW(),
           started_at = COALESCE(started_at, NOW())
       WHERE id = $1`,
      [job.id, week.week_start]
    );

    await client.query('COMMIT');
    const refreshed = await getJobById(job.user_id, job.id);
    return {
      job: refreshed ?? job,
      week,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function markWeekResult(
  userId: string,
  jobId: string,
  weekId: string,
  _weekStart: string,
  weekEnd: string,
  result: {
    status: Exclude<GhdHistoryImportWeekStatus, 'pending'>;
    extract_ok: boolean;
    project_ok: boolean;
    error: string | null;
  }
): Promise<GhdHistoryImportJobRow | null> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE ghd_history_import_weeks
       SET status = $3,
           extract_ok = $4,
           project_ok = $5,
           error = $6,
           updated_at = NOW()
       WHERE id = $1 AND job_id = $2`,
      [
        weekId,
        jobId,
        result.status,
        result.extract_ok,
        result.project_ok,
        result.error,
      ]
    );

    const completedInc = result.status === 'complete' ? 1 : 0;
    const emptyInc = result.status === 'empty' ? 1 : 0;
    const failedInc = result.status === 'failed' ? 1 : 0;
    const nextCursor = addDays(weekEnd, 1);

    const jobRes = await client.query(
      `UPDATE ghd_history_import_jobs
       SET weeks_completed = weeks_completed + $3,
           weeks_empty = weeks_empty + $4,
           weeks_failed = weeks_failed + $5,
           cursor_day = $6::date,
           last_error = $7,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        jobId,
        userId,
        completedInc,
        emptyInc,
        failedInc,
        nextCursor,
        result.error,
      ]
    );

    const job = mapJob(jobRes.rows[0] as Record<string, unknown>);

    const pendingRes = await client.query(
      `SELECT COUNT(*)::int AS pending
       FROM ghd_history_import_weeks
       WHERE job_id = $1 AND status = 'pending'`,
      [jobId]
    );
    const pending = Number(pendingRes.rows[0]?.pending ?? 0);
    if (pending === 0) {
      const doneRes = await client.query(
        `UPDATE ghd_history_import_jobs
         SET status = 'completed', finished_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [jobId, userId]
      );
      await client.query('COMMIT');
      return mapJob(doneRes.rows[0] as Record<string, unknown>);
    }

    await client.query('COMMIT');
    return job;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Cross-user: users with an active history job (for hourly sync skip). */
async function listUserIdsWithActiveHistoryJobs(): Promise<Set<string>> {
  const client = await getSystemClient();
  try {
    const res = await client.query(
      `SELECT DISTINCT user_id
       FROM ghd_history_import_jobs
       WHERE status IN ('pending', 'running', 'paused')`
    );
    return new Set(
      (res.rows as Array<{ user_id: string }>).map((r) => String(r.user_id))
    );
  } finally {
    client.release();
  }
}

/** Cross-user: jobs eligible for cron chunk advancement. */
async function listClaimableJobUserIds(): Promise<string[]> {
  const client = await getSystemClient();
  try {
    const res = await client.query(
      `SELECT DISTINCT user_id
       FROM ghd_history_import_jobs
       WHERE status IN ('pending', 'running')
       ORDER BY updated_at ASC`
    );
    return (res.rows as Array<{ user_id: string }>).map((r) => String(r.user_id));
  } finally {
    client.release();
  }
}

const ghdHistoryImportRepository = {
  createJob,
  getActiveJobForUser,
  getLatestJobForUser,
  getJobById,
  listWeeksForJob,
  buildCoverage,
  setJobStatus,
  claimNextPendingWeek,
  markWeekResult,
  listUserIdsWithActiveHistoryJobs,
  listClaimableJobUserIds,
  buildWeekWindows,
};

export default ghdHistoryImportRepository;
