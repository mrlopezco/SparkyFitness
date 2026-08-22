/**
 * Full-history gap-fill job orchestration for Garmin Health Data.
 * Cron advances one 7-day window at a time via advanceOneChunk.
 */

import type {
  GhdHistoryImportJobStatusResponse,
  GhdHistoryImportStartResponse,
} from '@workspace/shared';
import { todayInZone, compareDays, isDayString } from '@workspace/shared';
import { log } from '../config/logging.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import ghdMicroserviceClient, {
  GhdMicroserviceError,
} from '../integrations/garminHealthData/ghdMicroserviceClient.js';
import ghdHistoryImportRepository from '../models/ghdHistoryImportRepository.js';
import garminHealthDataService from './garminHealthDataService.js';
import ghdHealthProjector from './garminHealthData/ghdHealthProjector.js';
import ghdActivityProjector from './garminHealthData/ghdActivityProjector.js';
import trainingAdherenceService from './trainingAdherenceService.js';
import trainingPlanRepository from '../models/trainingPlanRepository.js';
import trainingAthleteSnapshotService from './trainingAthleteSnapshotService.js';

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function toStatusResponse(
  userId: string,
  job: Awaited<
    ReturnType<typeof ghdHistoryImportRepository.getLatestJobForUser>
  >
): Promise<GhdHistoryImportJobStatusResponse> {
  if (!job) {
    return {
      job_id: null,
      status: null,
      range_start: null,
      range_end: null,
      cursor_day: null,
      last_error: null,
      started_at: null,
      finished_at: null,
      updated_at: null,
      coverage: null,
    };
  }

  const coverage = await ghdHistoryImportRepository.buildCoverage(userId, job);
  return {
    job_id: job.id,
    status: job.status,
    range_start: job.range_start,
    range_end: job.range_end,
    cursor_day: job.cursor_day,
    last_error: job.last_error,
    started_at: toIso(job.started_at),
    finished_at: toIso(job.finished_at),
    updated_at: toIso(job.updated_at),
    coverage,
  };
}

export async function getJobStatus(
  userId: string
): Promise<GhdHistoryImportJobStatusResponse> {
  const job = await ghdHistoryImportRepository.getLatestJobForUser(userId);
  return toStatusResponse(userId, job);
}

export async function startJob(
  userId: string,
  startDate: string
): Promise<GhdHistoryImportStartResponse> {
  if (!isDayString(startDate)) {
    throw new Error('start_date must be a YYYY-MM-DD calendar day string');
  }

  const active = await ghdHistoryImportRepository.getActiveJobForUser(userId);
  if (active) {
    throw new Error(
      `An active history import already exists (status=${active.status}). Cancel or wait for it to finish.`
    );
  }

  const provider = await garminHealthDataService.resolveActiveGhdProvider(userId);
  if (!provider) {
    throw new Error(
      'No active garmin_health_data provider. Link Garmin Health Data first.'
    );
  }

  const tz = await loadUserTimezone(userId);
  const rangeEnd = todayInZone(tz);
  if (compareDays(startDate, rangeEnd) > 0) {
    throw new Error('start_date cannot be after today');
  }

  const job = await ghdHistoryImportRepository.createJob(
    userId,
    provider.id,
    startDate,
    rangeEnd
  );

  log(
    'info',
    `[ghdHistoryImportService] Started job ${job.id} for ${userId} ${startDate}..${rangeEnd} (${job.weeks_total} weeks)`
  );

  const status = await toStatusResponse(userId, job);
  return {
    ...status,
    job_id: job.id,
    status: job.status,
  };
}

export async function cancelJob(
  userId: string
): Promise<GhdHistoryImportJobStatusResponse> {
  const active = await ghdHistoryImportRepository.getActiveJobForUser(userId);
  if (!active) {
    return getJobStatus(userId);
  }
  const updated = await ghdHistoryImportRepository.setJobStatus(
    userId,
    active.id,
    'cancelled',
    { finished: true }
  );
  return toStatusResponse(userId, updated);
}

export async function pauseJob(
  userId: string
): Promise<GhdHistoryImportJobStatusResponse> {
  const active = await ghdHistoryImportRepository.getActiveJobForUser(userId);
  if (!active) {
    return getJobStatus(userId);
  }
  if (active.status === 'paused') {
    return toStatusResponse(userId, active);
  }
  if (active.status !== 'pending' && active.status !== 'running') {
    throw new Error(`Cannot pause job in status ${active.status}`);
  }
  const updated = await ghdHistoryImportRepository.setJobStatus(
    userId,
    active.id,
    'paused'
  );
  return toStatusResponse(userId, updated);
}

export async function resumeJob(
  userId: string
): Promise<GhdHistoryImportJobStatusResponse> {
  const active = await ghdHistoryImportRepository.getActiveJobForUser(userId);
  if (!active) {
    return getJobStatus(userId);
  }
  if (active.status !== 'paused') {
    throw new Error(`Cannot resume job in status ${active.status}`);
  }
  const updated = await ghdHistoryImportRepository.setJobStatus(
    userId,
    active.id,
    'pending'
  );
  return toStatusResponse(userId, updated);
}

function fireAndForgetPostChunk(
  userId: string,
  startDate: string,
  endDate: string
): void {
  void trainingAdherenceService
    .matchForUser(userId, startDate, endDate)
    .catch((error: unknown) => {
      log(
        'warn',
        `[ghdHistoryImportService] adherence match failed for ${userId}:`,
        error
      );
    });

  void (async () => {
    try {
      const plans = await trainingPlanRepository.listPlans(userId);
      await Promise.all(
        plans
          .filter((p) => p.status === 'active')
          .map((plan) =>
            trainingAthleteSnapshotService
              .rebuildSnapshot(userId, plan.id)
              .catch((error: unknown) => {
                log(
                  'warn',
                  `[ghdHistoryImportService] snapshot rebuild failed for plan ${plan.id}:`,
                  error
                );
              })
          )
      );
    } catch (error: unknown) {
      log(
        'warn',
        `[ghdHistoryImportService] listing plans failed for ${userId}:`,
        error
      );
    }
  })();
}

/**
 * Claim one pending week globally, extract+project it, and update coverage.
 * Returns true when work was performed.
 */
export async function advanceOneChunk(): Promise<boolean> {
  const claimed = await ghdHistoryImportRepository.claimNextPendingWeek();
  if (!claimed) return false;

  const { job, week } = claimed;
  const userId = job.user_id;
  log(
    'info',
    `[ghdHistoryImportService] Advancing job ${job.id} week ${week.week_start}..${week.week_end}`
  );

  try {
    await ghdMicroserviceClient.extract(
      userId,
      week.week_start,
      week.week_end
    );
    const projection = await ghdMicroserviceClient.getTrainingProjection(
      userId,
      week.week_start,
      week.week_end
    );

    const health = await ghdHealthProjector.projectHealthFromProjection(
      userId,
      userId,
      projection,
      week.week_start,
      week.week_end
    );
    const activities =
      await ghdActivityProjector.projectActivitiesFromProjection(
        userId,
        userId,
        projection
      );

    const isEmpty =
      health.daily_metrics === 0 &&
      health.sleep === 0 &&
      health.samples === 0 &&
      health.body_composition === 0 &&
      activities.created === 0 &&
      (!projection ||
        (typeof projection === 'object' &&
          Object.keys(projection as object).length === 0));

    await ghdHistoryImportRepository.markWeekResult(
      userId,
      job.id,
      week.id,
      week.week_start,
      week.week_end,
      {
        status: isEmpty ? 'empty' : 'complete',
        extract_ok: true,
        project_ok: true,
        error: null,
      }
    );

    fireAndForgetPostChunk(userId, week.week_start, week.week_end);
    return true;
  } catch (error: unknown) {
    const message =
      error instanceof GhdMicroserviceError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    log(
      'error',
      `[ghdHistoryImportService] Week failed for job ${job.id}:`,
      message
    );
    await ghdHistoryImportRepository.markWeekResult(
      userId,
      job.id,
      week.id,
      week.week_start,
      week.week_end,
      {
        status: 'failed',
        extract_ok: false,
        project_ok: false,
        error: message,
      }
    );
    return true;
  }
}

/** Cron helper: advance up to `maxChunks` pending weeks this tick. */
export async function advanceActiveJobs(maxChunks = 2): Promise<number> {
  let advanced = 0;
  for (let i = 0; i < maxChunks; i++) {
    const didWork = await advanceOneChunk();
    if (!didWork) break;
    advanced += 1;
  }
  return advanced;
}

const ghdHistoryImportService = {
  startJob,
  cancelJob,
  pauseJob,
  resumeJob,
  getJobStatus,
  advanceOneChunk,
  advanceActiveJobs,
};

export default ghdHistoryImportService;
