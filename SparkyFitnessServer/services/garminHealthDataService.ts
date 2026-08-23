/**
 * Orchestrates GHD sidecar extract + projection into Sparky product tables.
 */

import { addDays, todayInZone } from '@workspace/shared';
import { log } from '../config/logging.js';
import { getClient } from '../db/poolManager.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import externalProviderRepository from '../models/externalProviderRepository.js';
import trainingPlanRepository from '../models/trainingPlanRepository.js';
import trainingAdherenceService from './trainingAdherenceService.js';
import trainingAthleteSnapshotService from './trainingAthleteSnapshotService.js';
import ghdMicroserviceClient, {
  GhdMicroserviceError,
} from '../integrations/garminHealthData/ghdMicroserviceClient.js';
import ghdHealthProjector from './garminHealthData/ghdHealthProjector.js';
import type { GhdHealthProjectStats } from './garminHealthData/ghdHealthProjector.js';
import ghdActivityProjector from './garminHealthData/ghdActivityProjector.js';
import type { GhdActivityProjectStats } from './garminHealthData/ghdActivityProjector.js';

export const GHD_PROVIDER_TYPE = 'garmin_health_data';
export const GHD_PROVIDER_NAME = 'garmin_health_data';

export type GhdSyncType = 'manual' | 'scheduled';

export interface GhdSyncResult {
  start_date: string;
  end_date: string;
  sync_run_id: string | null;
  status: 'success' | 'error';
  health: GhdHealthProjectStats | null;
  activities: GhdActivityProjectStats | null;
  error?: string;
}

interface ExternalProviderRow {
  id: string;
  user_id?: string;
  is_active?: boolean;
  provider_type?: string;
  provider_name?: string;
  sync_frequency?: string | null;
}

export async function resolveActiveGhdProvider(
  userId: string
): Promise<ExternalProviderRow | null> {
  const provider =
    await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(
      userId,
      GHD_PROVIDER_NAME
    );
  if (!provider || !provider.is_active) return null;
  if (provider.provider_type && provider.provider_type !== GHD_PROVIDER_TYPE) {
    return null;
  }
  return provider as ExternalProviderRow;
}

/**
 * Ensure an active garmin_health_data provider row exists after sidecar login.
 * Tokens stay in the sidecar; Postgres stores link status (+ optional email).
 */
export async function ensureGhdProviderLinked(
  userId: string,
  email?: string | null
): Promise<ExternalProviderRow> {
  const existing =
    await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(
      userId,
      GHD_PROVIDER_NAME
    );

  const updateData: Record<string, unknown> = {
    provider_name: GHD_PROVIDER_NAME,
    provider_type: GHD_PROVIDER_TYPE,
    user_id: userId,
    is_active: true,
    // Non-manual so hourly keep-alive cron actually runs (create defaults to manual).
    sync_frequency: 'hourly',
    base_url: process.env.GHD_MICROSERVICE_URL || 'http://sparkyfitness-ghd:8001',
  };
  if (email) {
    updateData.app_id = email;
  }

  if (existing?.id) {
    return (await externalProviderRepository.updateExternalDataProvider(
      existing.id,
      userId,
      updateData
    )) as ExternalProviderRow;
  }

  return (await externalProviderRepository.createExternalDataProvider(
    updateData
  )) as ExternalProviderRow;
}

export async function recordGhdSyncMeta(args: {
  userId: string;
  providerId: string | null;
  startDate: string;
  endDate: string;
  stats: Record<string, unknown>;
  status?: 'success' | 'error';
  errorSummary?: string | null;
}): Promise<void> {
  const {
    userId,
    providerId,
    startDate,
    endDate,
    stats,
    status = 'success',
    errorSummary = null,
  } = args;
  const syncRunId = await insertSyncRun(userId, providerId, startDate, endDate);
  await finishSyncRun(userId, syncRunId, status, stats, errorSummary);
  if (providerId) {
    await externalProviderRepository.updateProviderLastSync(
      providerId,
      new Date()
    );
  }
}

async function insertSyncRun(
  userId: string,
  providerId: string | null,
  startDate: string,
  endDate: string
): Promise<string> {
  const client = await getClient(userId);
  try {
    const res = await client.query(
      `INSERT INTO ghd_sync_runs
         (user_id, provider_id, status, start_date, end_date, stats)
       VALUES ($1, $2, 'running', $3::date, $4::date, '{}'::jsonb)
       RETURNING id`,
      [userId, providerId, startDate, endDate]
    );
    return res.rows[0].id as string;
  } finally {
    client.release();
  }
}

async function finishSyncRun(
  userId: string,
  syncRunId: string,
  status: 'success' | 'error',
  stats: Record<string, unknown>,
  errorSummary: string | null
): Promise<void> {
  const client = await getClient(userId);
  try {
    await client.query(
      `UPDATE ghd_sync_runs
       SET status = $2,
           finished_at = NOW(),
           stats = $3::jsonb,
           error_summary = $4
       WHERE id = $1 AND user_id = $5`,
      [syncRunId, status, JSON.stringify(stats), errorSummary, userId]
    );
  } finally {
    client.release();
  }
}

function resolveDateRange(
  syncType: GhdSyncType,
  today: string
): { startDate: string; endDate: string } {
  if (syncType === 'manual') {
    return { startDate: addDays(today, -7), endDate: today };
  }
  // Keep-alive: yesterday..today covers overnight sleep near midnight.
  return { startDate: addDays(today, -1), endDate: today };
}

function fireAndForgetPostSync(
  userId: string,
  startDate: string,
  endDate: string
): void {
  void trainingAdherenceService
    .matchForUser(userId, startDate, endDate)
    .catch((error: unknown) => {
      log(
        'warn',
        `[garminHealthDataService] adherence match failed for ${userId}:`,
        error
      );
    });

  void (async () => {
    try {
      const plans = await trainingPlanRepository.listPlans(userId);
      const active = plans.filter((p) => p.status === 'active');
      await Promise.all(
        active.map((plan) =>
          trainingAthleteSnapshotService
            .rebuildSnapshot(userId, plan.id)
            .catch((error: unknown) => {
              log(
                'warn',
                `[garminHealthDataService] snapshot rebuild failed for plan ${plan.id}:`,
                error
              );
            })
        )
      );
    } catch (error: unknown) {
      log(
        'warn',
        `[garminHealthDataService] listing active plans failed for ${userId}:`,
        error
      );
    }
  })();
}

export async function unlinkGhdProvider(userId: string): Promise<void> {
  const existing =
    await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(
      userId,
      GHD_PROVIDER_NAME
    );
  if (existing?.id) {
    await externalProviderRepository.updateExternalDataProvider(
      existing.id,
      userId,
      { is_active: false }
    );
  }
  try {
    await ghdMicroserviceClient.unlink(userId);
  } catch (error: unknown) {
    log(
      'warn',
      `[garminHealthDataService] sidecar unlink failed for ${userId}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function syncGarminHealthData(
  userId: string,
  syncType: GhdSyncType = 'manual',
  customStartDate: string | null = null,
  customEndDate: string | null = null
): Promise<GhdSyncResult> {
  const provider = await resolveActiveGhdProvider(userId);
  if (!provider) {
    throw new Error(
      'No active garmin_health_data provider. Link Garmin Health Data first.'
    );
  }

  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);
  const { startDate, endDate } = customStartDate
    ? {
        startDate: customStartDate,
        endDate: customEndDate || today,
      }
    : resolveDateRange(syncType, today);

  log(
    'info',
    `[garminHealthDataService] Starting ${syncType} sync for ${userId} ${startDate}..${endDate}`
  );

  const syncRunId = await insertSyncRun(
    userId,
    provider.id,
    startDate,
    endDate
  );

  try {
    await ghdMicroserviceClient.extract(userId, startDate, endDate);
    const projection = await ghdMicroserviceClient.getTrainingProjection(
      userId,
      startDate,
      endDate
    );

    const health = await ghdHealthProjector.projectHealthFromProjection(
      userId,
      userId,
      projection,
      startDate,
      endDate
    );
    const activities =
      await ghdActivityProjector.projectActivitiesFromProjection(
        userId,
        userId,
        projection
      );

    const stats = {
      health,
      activities,
    };

    await finishSyncRun(userId, syncRunId, 'success', stats, null);
    await externalProviderRepository.updateProviderLastSync(
      provider.id,
      new Date()
    );

    fireAndForgetPostSync(userId, startDate, endDate);

    return {
      start_date: startDate,
      end_date: endDate,
      sync_run_id: syncRunId,
      status: 'success',
      health,
      activities,
    };
  } catch (error: unknown) {
    const message =
      error instanceof GhdMicroserviceError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    log('error', `[garminHealthDataService] sync failed for ${userId}:`, message);
    await finishSyncRun(userId, syncRunId, 'error', {}, message);
    return {
      start_date: startDate,
      end_date: endDate,
      sync_run_id: syncRunId,
      status: 'error',
      health: null,
      activities: null,
      error: message,
    };
  }
}

const garminHealthDataService = {
  syncGarminHealthData,
  ensureGhdProviderLinked,
  resolveActiveGhdProvider,
  unlinkGhdProvider,
  recordGhdSyncMeta,
  GHD_PROVIDER_TYPE,
  GHD_PROVIDER_NAME,
};

export default garminHealthDataService;
