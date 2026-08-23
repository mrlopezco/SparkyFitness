/**
 * Projects GHD activity JSON into exercise_entries + telemetry + ghd_activity_map.
 */

import type { PoolClient } from 'pg';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import { todayInZone } from '@workspace/shared';
import { log } from '../../config/logging.js';
import { getClient } from '../../db/poolManager.js';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import activityDetailsRepository from '../../models/activityDetailsRepository.js';
import * as workoutTelemetryRepo from '../../models/workoutTelemetryRepository.js';
import { getOrCreateGarminExercise } from '../garmin/garminExerciseMapper.js';
import {
  parseTrainingProjection,
  type GhdActivity,
} from './ghdProjectionTypes.js';
import { GHD_SOURCE_PROVIDER } from './ghdConstants.js';

export interface GhdActivityProjectStats {
  created: number;
  skipped: number;
  errors: string[];
}

function asFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function activityAlreadyMapped(
  client: PoolClient,
  userId: string,
  activityId: string
): Promise<boolean> {
  const mapRes = await client.query(
    `SELECT 1 FROM ghd_activity_map
     WHERE user_id = $1 AND garmin_activity_id = $2
     LIMIT 1`,
    [userId, activityId]
  );
  if (mapRes.rows.length > 0) return true;

  const entryRes = await client.query(
    `SELECT 1 FROM exercise_entries
     WHERE user_id = $1
       AND source_id = $2
       AND source IN ('garmin', 'garmin_health_data')
     LIMIT 1`,
    [userId, activityId]
  );
  return entryRes.rows.length > 0;
}

async function upsertActivityMap(
  client: PoolClient,
  userId: string,
  activityId: string,
  exerciseEntryId: string
): Promise<void> {
  await client.query(
    `INSERT INTO ghd_activity_map (user_id, garmin_activity_id, exercise_entry_id, last_projected_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, garmin_activity_id)
     DO UPDATE SET
       exercise_entry_id = EXCLUDED.exercise_entry_id,
       last_projected_at = NOW()`,
    [userId, activityId, exerciseEntryId]
  );
}

function lapNumber(lap: Record<string, unknown>, key: string): number | null {
  return asFiniteNumber(lap[key]);
}

function buildLapRows(
  userId: string,
  exerciseEntryId: string,
  entryDate: string,
  activity: GhdActivity,
  activityStart: Date | null
): Array<Record<string, unknown>> {
  const laps = activity.laps ?? [];
  if (laps.length === 0) return [];

  const rows: Array<Record<string, unknown>> = [];
  let cursorMs = activityStart?.getTime() ?? null;

  for (let i = 0; i < laps.length; i++) {
    const lap = laps[i] as Record<string, unknown>;
    const lapIndex =
      asFiniteNumber(lap.lap_index) ??
      asFiniteNumber(lap.lapIndex) ??
      i + 1;

    const explicitStart =
      parseInstant(
        typeof lap.start_time === 'string' ? lap.start_time : null
      ) ??
      parseInstant(
        typeof lap.startTimeGMT === 'string' ? lap.startTimeGMT : null
      );
    const durationSeconds = Math.round(
      lapNumber(lap, 'duration_seconds') ??
        lapNumber(lap, 'duration') ??
        lapNumber(lap, 'elapsedDuration') ??
        0
    );

    let startTime = explicitStart;
    if (!startTime && cursorMs !== null) {
      startTime = new Date(cursorMs);
    }
    if (!startTime) {
      // exercise_entry_laps.start_time is NOT NULL — skip unusable laps.
      continue;
    }

    const endTime =
      parseInstant(typeof lap.end_time === 'string' ? lap.end_time : null) ??
      new Date(startTime.getTime() + Math.max(durationSeconds, 0) * 1000);

    rows.push({
      user_id: userId,
      exercise_entry_id: exerciseEntryId,
      entry_date: entryDate,
      lap_index: lapIndex,
      start_time: startTime,
      end_time: endTime,
      duration_seconds: durationSeconds || Math.round((endTime.getTime() - startTime.getTime()) / 1000),
      distance_meters:
        lapNumber(lap, 'distance_meters') ?? lapNumber(lap, 'distance') ?? null,
      calories: lapNumber(lap, 'calories') ?? null,
      avg_heart_rate:
        lapNumber(lap, 'avg_heart_rate') ??
        lapNumber(lap, 'average_hr') ??
        null,
      max_heart_rate:
        lapNumber(lap, 'max_heart_rate') ?? lapNumber(lap, 'max_hr') ?? null,
      avg_respiration_brpm: null,
      max_respiration_brpm: null,
      avg_speed_mps:
        lapNumber(lap, 'avg_speed_mps') ?? lapNumber(lap, 'avg_speed') ?? null,
      max_speed_mps:
        lapNumber(lap, 'max_speed_mps') ?? lapNumber(lap, 'max_speed') ?? null,
      avg_cadence: lapNumber(lap, 'avg_cadence') ?? lapNumber(lap, 'cadence') ?? null,
      avg_power_watts:
        lapNumber(lap, 'avg_power_watts') ?? lapNumber(lap, 'avg_power') ?? null,
      elevation_gain_meters:
        lapNumber(lap, 'elevation_gain_meters') ??
        lapNumber(lap, 'elevation_gain') ??
        null,
      elevation_loss_meters:
        lapNumber(lap, 'elevation_loss_meters') ??
        lapNumber(lap, 'elevation_loss') ??
        null,
    });

    cursorMs = endTime.getTime();
  }

  return rows;
}

function buildGpsRows(
  userId: string,
  exerciseEntryId: string,
  entryDate: string,
  activity: GhdActivity,
  activityStart: Date | null
): workoutTelemetryRepo.FlatGpsPointRow[] {
  const points = activity.gps_points ?? [];
  const rows: workoutTelemetryRepo.FlatGpsPointRow[] = [];
  const baseMs = activityStart?.getTime() ?? Date.now();

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const lat = asFiniteNumber(pt.lat);
    const lon = asFiniteNumber(pt.lon);
    if (lat === null || lon === null) continue;

    let timestamp = parseInstant(pt.t ?? null);
    if (!timestamp) {
      timestamp = new Date(baseMs + i * 1000);
    }

    rows.push({
      user_id: userId,
      exercise_entry_id: exerciseEntryId,
      entry_date: entryDate,
      timestamp,
      latitude: lat,
      longitude: lon,
      altitude_meters: asFiniteNumber(pt.alt),
      speed_mps: asFiniteNumber(pt.speed),
      heart_rate_bpm: asFiniteNumber(pt.hr),
      cadence: asFiniteNumber(pt.cad),
    });
  }
  return rows;
}

async function projectOneActivity(
  client: PoolClient,
  userId: string,
  activity: GhdActivity,
  timezone: string,
  stats: GhdActivityProjectStats
): Promise<void> {
  const activityId = activity.activity_id;
  if (!activityId) {
    stats.skipped += 1;
    return;
  }

  if (await activityAlreadyMapped(client, userId, activityId)) {
    stats.skipped += 1;
    return;
  }

  const activityType = activity.activity_type || 'Garmin Activity';
  const exercise = await getOrCreateGarminExercise(
    userId,
    activityType,
    activityType
  );

  const startInstant = parseInstant(activity.start_time);
  let entryDate: string;
  let entryTime: string | null = null;

  if (activity.start_time && activity.start_time.length >= 10) {
    // start_time is local wall clock from GHD projection (Connect startTimeLocal
    // equivalent). Do not treat it as UTC or evening activities shift +1 day.
    entryDate = activity.start_time.substring(0, 10);
    if (activity.start_time.length >= 16) {
      const timePart = activity.start_time.includes('T')
        ? activity.start_time.split('T')[1]
        : activity.start_time.substring(11);
      entryTime = timePart.substring(0, 5);
    }
  } else {
    entryDate = todayInZone(timezone);
  }

  const distanceKm = asFiniteNumber(activity.distance_km);
  const exerciseEntryData = {
    exercise_id: exercise.id,
    exercise_name: activity.name || activityType,
    duration_minutes: asFiniteNumber(activity.duration_minutes) ?? 0,
    calories_burned: Math.round(asFiniteNumber(activity.calories) ?? 0),
    entry_date: entryDate,
    entry_time: entryTime,
    notes: `GHD Activity: ${activity.name || activityType} (${activityType})`,
    // exercise_entries.distance is kilometers (Diary convertDistance from 'km';
    // Training aliases it as distance_km). Projection already emits distance_km.
    distance: distanceKm,
    avg_heart_rate:
      asFiniteNumber(activity.avg_heart_rate) !== null
        ? Math.round(asFiniteNumber(activity.avg_heart_rate) as number)
        : null,
    max_heart_rate:
      asFiniteNumber(activity.max_heart_rate) !== null
        ? Math.round(asFiniteNumber(activity.max_heart_rate) as number)
        : null,
    source_id: activityId,
    steps: Math.round(asFiniteNumber(activity.steps) ?? 0),
  };

  const { entry: newEntry } =
    await exerciseEntryRepository._createExerciseEntryWithClient(
      client,
      userId,
      exerciseEntryData,
      userId,
      GHD_SOURCE_PROVIDER
    );

  if (!newEntry?.id) {
    stats.errors.push(`activity:${activityId}:create_failed`);
    return;
  }

  await activityDetailsRepository._createActivityDetailWithClient(client, {
    exercise_entry_id: newEntry.id,
    provider_name: GHD_SOURCE_PROVIDER,
    detail_type: 'full_activity_data',
    detail_data: {
      ...activity.detail_data,
      activity_id: activityId,
      name: activity.name,
      activity_type: activity.activity_type,
      start_time: activity.start_time,
    },
    created_by_user_id: userId,
  });

  const lapRows = buildLapRows(
    userId,
    newEntry.id,
    entryDate,
    activity,
    startInstant
  );
  if (lapRows.length > 0) {
    await workoutTelemetryRepo._bulkInsertExerciseEntryLapsWithClient(
      client,
      userId,
      lapRows as Parameters<
        typeof workoutTelemetryRepo._bulkInsertExerciseEntryLapsWithClient
      >[2]
    );
  }

  const gpsRows = buildGpsRows(
    userId,
    newEntry.id,
    entryDate,
    activity,
    startInstant
  );
  if (gpsRows.length > 0) {
    await workoutTelemetryRepo._bulkInsertExerciseEntryGpsPointsWithClient(
      client,
      userId,
      gpsRows
    );
  }

  await upsertActivityMap(client, userId, activityId, newEntry.id);
  stats.created += 1;
}

export async function projectActivitiesFromProjection(
  userId: string,
  actingUserId: string,
  payload: unknown
): Promise<GhdActivityProjectStats> {
  const projection = parseTrainingProjection(payload);
  const activities = projection.activities ?? [];
  const stats: GhdActivityProjectStats = {
    created: 0,
    skipped: 0,
    errors: [],
  };

  if (activities.length === 0) return stats;

  const timezone = await loadUserTimezone(userId);
  const client = await getClient(userId, actingUserId);
  try {
    await client.query('BEGIN');
    for (const activity of activities) {
      try {
        await projectOneActivity(client, userId, activity, timezone, stats);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log(
          'error',
          `[ghdActivityProjector] activity ${activity.activity_id}:`,
          message
        );
        stats.errors.push(`activity:${activity.activity_id}:${message}`);
      }
    }
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return stats;
}

const ghdActivityProjector = {
  projectActivitiesFromProjection,
};

export default ghdActivityProjector;
