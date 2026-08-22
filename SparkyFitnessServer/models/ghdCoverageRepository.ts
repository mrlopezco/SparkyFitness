/**
 * High-level import coverage for wearable providers (row counts + date spans).
 */

import type {
  WearableCoverageResponse,
  WearableCoverageSource,
} from '@workspace/shared';
import { getClient } from '../db/poolManager.js';

interface DateSpanRow {
  row_count: number | string;
  earliest_date: string | Date | null;
  latest_date: string | Date | null;
}

function toDayString(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function asCount(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function queryDateSpan(
  userId: string,
  sql: string,
  params: unknown[]
): Promise<{
  row_count: number;
  earliest_date: string | null;
  latest_date: string | null;
}> {
  const client = await getClient(userId);
  try {
    const result = await client.query<DateSpanRow>(sql, params);
    const row = result.rows[0];
    return {
      row_count: asCount(row?.row_count),
      earliest_date: toDayString(row?.earliest_date ?? null),
      latest_date: toDayString(row?.latest_date ?? null),
    };
  } finally {
    client.release();
  }
}

export async function getProviderCoverage(
  userId: string,
  source: WearableCoverageSource
): Promise<WearableCoverageResponse> {
  const includeGhdMeta = source === 'garmin_health_data';
  const includeNutrition = source === 'garmin';

  const [
    dailyHealth,
    sleep,
    activities,
    samples,
    bodyComp,
    nutrition,
    sampleMetrics,
    lastSync,
    historyImport,
    providerLastSync,
  ] = await Promise.all([
    queryDateSpan(
      userId,
      `SELECT COUNT(*)::int AS row_count,
              MIN(entry_date)::text AS earliest_date,
              MAX(entry_date)::text AS latest_date
         FROM daily_health_metrics
        WHERE user_id = $1 AND source_provider = $2`,
      [userId, source]
    ),
    queryDateSpan(
      userId,
      `SELECT COUNT(*)::int AS row_count,
              MIN(entry_date)::text AS earliest_date,
              MAX(entry_date)::text AS latest_date
         FROM sleep_entries
        WHERE user_id = $1 AND source = $2`,
      [userId, source]
    ),
    queryDateSpan(
      userId,
      `SELECT COUNT(*)::int AS row_count,
              MIN(entry_date)::text AS earliest_date,
              MAX(entry_date)::text AS latest_date
         FROM exercise_entries
        WHERE user_id = $1 AND source = $2`,
      [userId, source]
    ),
    queryDateSpan(
      userId,
      `SELECT COUNT(*)::int AS row_count,
              MIN(entry_date)::text AS earliest_date,
              MAX(entry_date)::text AS latest_date
         FROM health_metric_samples
        WHERE user_id = $1 AND source_provider = $2`,
      [userId, source]
    ),
    queryDateSpan(
      userId,
      `SELECT COUNT(*)::int AS row_count,
              MIN(entry_date)::text AS earliest_date,
              MAX(entry_date)::text AS latest_date
         FROM custom_measurements
        WHERE user_id = $1 AND source = $2`,
      [userId, source]
    ),
    includeNutrition
      ? queryDateSpan(
          userId,
          `SELECT COUNT(*)::int AS row_count,
                  MIN(entry_date)::text AS earliest_date,
                  MAX(entry_date)::text AS latest_date
             FROM food_entries
            WHERE user_id = $1 AND source = $2`,
          [userId, source]
        )
      : Promise.resolve({
          row_count: 0,
          earliest_date: null,
          latest_date: null,
        }),
    (async () => {
      const client = await getClient(userId);
      try {
        const result = await client.query<{
          metric: string;
          row_count: number | string;
          earliest_date: string | null;
          latest_date: string | null;
        }>(
          `SELECT metric,
                  COUNT(*)::int AS row_count,
                  MIN(entry_date)::text AS earliest_date,
                  MAX(entry_date)::text AS latest_date
             FROM health_metric_samples
            WHERE user_id = $1 AND source_provider = $2
            GROUP BY metric
            ORDER BY metric`,
          [userId, source]
        );
        return result.rows.map((row) => ({
          metric: row.metric,
          row_count: asCount(row.row_count),
          earliest_date: toDayString(row.earliest_date),
          latest_date: toDayString(row.latest_date),
        }));
      } finally {
        client.release();
      }
    })(),
    includeGhdMeta
      ? (async () => {
          const client = await getClient(userId);
          try {
            const result = await client.query<{
              status: string;
              start_date: string | null;
              end_date: string | null;
              finished_at: Date | string | null;
            }>(
              `SELECT status, start_date::text AS start_date, end_date::text AS end_date, finished_at
                 FROM ghd_sync_runs
                WHERE user_id = $1
                ORDER BY started_at DESC
                LIMIT 1`,
              [userId]
            );
            const row = result.rows[0];
            if (!row) return null;
            return {
              status: row.status,
              start_date: toDayString(row.start_date),
              end_date: toDayString(row.end_date),
              finished_at: toIsoString(row.finished_at),
            };
          } finally {
            client.release();
          }
        })()
      : Promise.resolve(null),
    includeGhdMeta
      ? (async () => {
          const client = await getClient(userId);
          try {
            const result = await client.query<{
              status: string;
              range_start: string | null;
              range_end: string | null;
              weeks_completed: number | string;
              weeks_total: number | string;
            }>(
              `SELECT status,
                      range_start::text AS range_start,
                      range_end::text AS range_end,
                      weeks_completed,
                      weeks_total
                 FROM ghd_history_import_jobs
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT 1`,
              [userId]
            );
            const row = result.rows[0];
            if (!row) return null;
            return {
              status: row.status,
              range_start: toDayString(row.range_start),
              range_end: toDayString(row.range_end),
              weeks_completed: asCount(row.weeks_completed),
              weeks_total: asCount(row.weeks_total),
            };
          } finally {
            client.release();
          }
        })()
      : Promise.resolve(null),
    (async () => {
      const client = await getClient(userId);
      try {
        const result = await client.query<{
          last_sync_at: Date | string | null;
        }>(
          `SELECT last_sync_at
             FROM external_data_providers
            WHERE user_id = $1
              AND (provider_type = $2 OR provider_name = $2)
              AND is_active = TRUE
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 1`,
          [userId, source]
        );
        const finished = toIsoString(result.rows[0]?.last_sync_at ?? null);
        if (!finished) return null;
        return {
          status: 'provider_last_sync',
          start_date: null,
          end_date: null,
          finished_at: finished,
        };
      } finally {
        client.release();
      }
    })(),
  ]);

  const categories = [
    {
      key: 'daily_health' as const,
      row_count: dailyHealth.row_count,
      earliest_date: dailyHealth.earliest_date,
      latest_date: dailyHealth.latest_date,
    },
    {
      key: 'sleep' as const,
      row_count: sleep.row_count,
      earliest_date: sleep.earliest_date,
      latest_date: sleep.latest_date,
    },
    {
      key: 'activities' as const,
      row_count: activities.row_count,
      earliest_date: activities.earliest_date,
      latest_date: activities.latest_date,
    },
    {
      key: 'intraday_samples' as const,
      row_count: samples.row_count,
      earliest_date: samples.earliest_date,
      latest_date: samples.latest_date,
    },
    {
      key: 'body_composition' as const,
      row_count: bodyComp.row_count,
      earliest_date: bodyComp.earliest_date,
      latest_date: bodyComp.latest_date,
    },
  ];

  if (includeNutrition) {
    categories.push({
      key: 'nutrition',
      row_count: nutrition.row_count,
      earliest_date: nutrition.earliest_date,
      latest_date: nutrition.latest_date,
    });
  }

  return {
    source,
    categories,
    sample_metrics: sampleMetrics,
    last_sync: lastSync ?? providerLastSync,
    history_import: historyImport,
  };
}

/** @deprecated Use getProviderCoverage(userId, 'garmin_health_data') */
export async function getGhdCoverage(
  userId: string
): Promise<WearableCoverageResponse> {
  return getProviderCoverage(userId, 'garmin_health_data');
}

export default { getProviderCoverage, getGhdCoverage };
