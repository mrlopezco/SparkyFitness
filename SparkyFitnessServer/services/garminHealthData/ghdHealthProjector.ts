/**
 * Projects GHD training JSON into Sparky product tables
 * (daily_health_metrics, sleep, health_metric_samples, check-in measurements).
 */

import type { HealthMetric } from '@workspace/shared';
import { log } from '../../config/logging.js';
import * as genericHealthRepo from '../../models/genericHealthRepository.js';
import sleepRepository from '../../models/sleepRepository.js';
import measurementService from '../measurementService.js';
import { upsertSamplesByDay, type FlatHealthSample } from '../healthMetricSampleWriter.js';
import {
  parseTrainingProjection,
  type GhdBodyComposition,
  type GhdDailyMetric,
  type GhdSleepEntry,
  type GhdTrainingProjection,
} from './ghdProjectionTypes.js';
import { GHD_SOURCE_PROVIDER } from './ghdConstants.js';

export { GHD_SOURCE_PROVIDER };

export interface GhdHealthProjectStats {
  daily_metrics: number;
  sleep: number;
  samples: number;
  body_composition: number;
  errors: string[];
}

function asFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Round for Postgres integer columns (AVG(...) from SQLite is often fractional). */
function asInteger(value: unknown): number | null {
  const n = asFiniteNumber(value);
  return n === null ? null : Math.round(n);
}

async function projectDailyMetrics(
  userId: string,
  actingUserId: string,
  rows: GhdDailyMetric[],
  stats: GhdHealthProjectStats
): Promise<void> {
  for (const row of rows) {
    try {
      const recoveryMinutes = asFiniteNumber(row.recovery_time_minutes);
      await genericHealthRepo.upsertDailyHealthMetrics(userId, actingUserId, {
        user_id: userId,
        entry_date: row.date,
        source_provider: GHD_SOURCE_PROVIDER,
        total_steps: asInteger(row.steps),
        floors_ascended: asInteger(row.floors_ascended),
        floors_descended: asInteger(row.floors_descended),
        active_calories: asInteger(row.active_calories),
        bmr_calories: asInteger(row.bmr_calories),
        total_calories: asInteger(row.total_calories),
        total_distance_meters: asFiniteNumber(row.total_distance_meters),
        moderate_intensity_minutes: asInteger(row.moderate_intensity_minutes),
        vigorous_intensity_minutes: asInteger(row.vigorous_intensity_minutes),
        resting_heart_rate: asInteger(row.resting_heart_rate),
        avg_stress_level: asInteger(row.avg_stress),
        max_stress_level: asInteger(row.max_stress),
        body_battery_highest: asInteger(row.body_battery_high),
        body_battery_lowest: asInteger(row.body_battery_low),
        body_battery_charged: asInteger(row.body_battery_charged),
        body_battery_drained: asInteger(row.body_battery_drained),
        vo2_max: asFiniteNumber(row.vo2_max),
        training_readiness_score: asInteger(row.training_readiness_score),
        acute_training_load: asFiniteNumber(row.acute_training_load),
        chronic_training_load: asFiniteNumber(row.chronic_training_load),
        acwr_ratio: asFiniteNumber(row.acwr),
        recovery_time_hours:
          recoveryMinutes !== null ? Math.round((recoveryMinutes / 60) * 100) / 100 : null,
      });
      stats.daily_metrics += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log('error', `[ghdHealthProjector] daily_metrics ${row.date}:`, message);
      stats.errors.push(`daily_metrics:${row.date}:${message}`);
    }
  }
}

async function projectSleep(
  userId: string,
  actingUserId: string,
  rows: GhdSleepEntry[],
  startDate: string,
  endDate: string,
  stats: GhdHealthProjectStats
): Promise<void> {
  if (rows.length === 0) return;

  await sleepRepository.deleteSleepEntriesByEntrySourceAndDate(
    userId,
    GHD_SOURCE_PROVIDER,
    startDate,
    endDate
  );

  for (const sleep of rows) {
    try {
      if (!sleep.entry_date || !sleep.bedtime || !sleep.wake_time) {
        continue;
      }
      const stage_events = (sleep.stages ?? [])
        .filter((s) => s.start_time && s.end_time)
        .map((s) => ({
          stage_type: s.stage_type,
          start_time: s.start_time,
          end_time: s.end_time,
          duration_in_seconds: s.duration_in_seconds ?? undefined,
        }));

      await measurementService.processSleepEntry(userId, actingUserId, {
        entry_date: sleep.entry_date,
        bedtime: sleep.bedtime,
        wake_time: sleep.wake_time,
        duration_in_seconds: sleep.duration_in_seconds,
        time_asleep_in_seconds: sleep.time_asleep_in_seconds,
        sleep_score: sleep.sleep_score,
        deep_sleep_seconds: sleep.deep_sleep_seconds,
        light_sleep_seconds: sleep.light_sleep_seconds,
        rem_sleep_seconds: sleep.rem_sleep_seconds,
        awake_sleep_seconds: sleep.awake_sleep_seconds,
        avg_overnight_hrv: asFiniteNumber(sleep.avg_overnight_hrv),
        resting_heart_rate: asInteger(sleep.resting_heart_rate),
        average_spo2_value: asFiniteNumber(sleep.average_spo2_value),
        source: GHD_SOURCE_PROVIDER,
        stage_events,
      });
      stats.sleep += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log('error', `[ghdHealthProjector] sleep ${sleep.entry_date}:`, message);
      stats.errors.push(`sleep:${sleep.entry_date}:${message}`);
    }
  }
}

function flattenSampleDays(
  days: Array<{ date: string; points: Array<Record<string, unknown>> }> | undefined,
  valueKeys: string[]
): FlatHealthSample[] {
  if (!days) return [];
  const out: FlatHealthSample[] = [];
  for (const day of days) {
    for (const point of day.points) {
      const rawT = point.t;
      if (typeof rawT !== 'string' || !rawT) continue;
      const timestamp = new Date(rawT);
      if (Number.isNaN(timestamp.getTime())) continue;

      const fields: Record<string, number> = {};
      for (const key of valueKeys) {
        const n = asFiniteNumber(point[key]);
        if (n !== null) fields[key] = n;
      }
      if (Object.keys(fields).length === 0) continue;

      out.push({
        entry_date: day.date,
        timestamp,
        ...fields,
      });
    }
  }
  return out;
}

async function projectSamples(
  userId: string,
  actingUserId: string,
  projection: GhdTrainingProjection,
  stats: GhdHealthProjectStats
): Promise<void> {
  const samples = projection.samples;
  if (!samples) return;

  const metricPlans: Array<{
    metric: HealthMetric;
    days: typeof samples.heart_rate;
    keys: string[];
  }> = [
    { metric: 'heart_rate', days: samples.heart_rate, keys: ['bpm'] },
    { metric: 'stress', days: samples.stress, keys: ['level'] },
    { metric: 'body_battery', days: samples.body_battery, keys: ['level'] },
    { metric: 'hrv', days: samples.hrv, keys: ['rmssd_ms', 'sdnn_ms'] },
    { metric: 'respiration', days: samples.respiration, keys: ['brpm'] },
    { metric: 'spo2', days: samples.spo2, keys: ['percentage'] },
  ];

  for (const plan of metricPlans) {
    const flat = flattenSampleDays(plan.days, plan.keys);
    if (flat.length === 0) continue;
    try {
      const buckets = await upsertSamplesByDay(
        userId,
        actingUserId,
        plan.metric,
        GHD_SOURCE_PROVIDER,
        flat
      );
      stats.samples += buckets;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log('error', `[ghdHealthProjector] samples ${plan.metric}:`, message);
      stats.errors.push(`samples:${plan.metric}:${message}`);
    }
  }
}

async function projectBodyComposition(
  userId: string,
  actingUserId: string,
  rows: GhdBodyComposition[],
  stats: GhdHealthProjectStats
): Promise<void> {
  const processed: Array<{
    type: string;
    value: number;
    date: string;
    source: string;
    dataType: string;
    measurementType: string;
  }> = [];

  for (const row of rows) {
    if (!row.date) continue;
    const fields: Array<{
      type: string;
      value: number | null | undefined;
      measurementType: string;
    }> = [
      { type: 'weight', value: row.weight_kg, measurementType: 'kg' },
      {
        type: 'body_fat_percentage',
        value: row.body_fat_percentage,
        measurementType: '%',
      },
      {
        type: 'body_water_percentage',
        value: row.body_water_percentage,
        measurementType: '%',
      },
      { type: 'bone_mass_kg', value: row.bone_mass_kg, measurementType: 'kg' },
      { type: 'muscle_mass_kg', value: row.muscle_mass_kg, measurementType: 'kg' },
    ];

    for (const field of fields) {
      const value = asFiniteNumber(field.value);
      if (value === null || value === 0) continue;
      processed.push({
        type: field.type,
        value,
        date: row.date,
        source: GHD_SOURCE_PROVIDER,
        dataType: 'numeric',
        measurementType: field.measurementType,
      });
    }

    const bmi = asFiniteNumber(row.bmi);
    if (bmi !== null && bmi !== 0) {
      processed.push({
        type: 'BMI',
        value: bmi,
        date: row.date,
        source: GHD_SOURCE_PROVIDER,
        dataType: 'numeric',
        measurementType: 'N/A',
      });
    }
  }

  if (processed.length === 0) return;

  try {
    await measurementService.processHealthData(processed, userId, actingUserId);
    stats.body_composition += processed.length;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log('error', '[ghdHealthProjector] body_composition:', message);
    stats.errors.push(`body_composition:${message}`);
  }
}

export async function projectHealthFromProjection(
  userId: string,
  actingUserId: string,
  payload: unknown,
  startDate: string,
  endDate: string
): Promise<GhdHealthProjectStats> {
  const projection = parseTrainingProjection(payload);
  const stats: GhdHealthProjectStats = {
    daily_metrics: 0,
    sleep: 0,
    samples: 0,
    body_composition: 0,
    errors: [],
  };

  log(
    'info',
    `[ghdHealthProjector] Projecting health for ${userId} ${startDate}..${endDate}`
  );

  if (projection.daily_metrics?.length) {
    await projectDailyMetrics(
      userId,
      actingUserId,
      projection.daily_metrics,
      stats
    );
  }
  if (projection.sleep?.length) {
    await projectSleep(
      userId,
      actingUserId,
      projection.sleep,
      startDate,
      endDate,
      stats
    );
  }
  await projectSamples(userId, actingUserId, projection, stats);
  if (projection.body_composition?.length) {
    await projectBodyComposition(
      userId,
      actingUserId,
      projection.body_composition,
      stats
    );
  }

  return stats;
}

const ghdHealthProjector = {
  projectHealthFromProjection,
  GHD_SOURCE_PROVIDER,
};

export default ghdHealthProjector;
