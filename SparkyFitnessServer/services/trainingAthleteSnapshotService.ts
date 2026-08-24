import {
  addDays,
  classifyActivitySport,
  todayInZone,
  type ActivitySport,
  type TrainingAthleteSnapshot,
  type TrainingAthleteSnapshotPayload,
  type TrainingFitnessTestResult,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import trainingPlanRepository, {
  type ActivityEntryRow,
  type RacePredictionAggregate,
  type ReadinessAggregate,
  type SleepAggregate,
  type WeightSample,
} from '../models/trainingPlanRepository.js';
import trainingFitnessTestRepository from '../models/trainingFitnessTestRepository.js';
import { buildNutritionSnapshotBlock } from './trainingNutritionSnapshotService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  derivePacesFromRacePredictions,
  formatPaceMinPerKm,
  hasUsablePaces,
  paceMinPerKm,
} from './trainingRunningScience.js';

/**
 * Builds the compact athlete snapshot the training-plan AI reads instead of raw
 * diary rows. Keeping it small is the point: the whole payload is inlined into
 * a prompt, so it summarizes a rolling window rather than listing activities.
 */

/** Six weeks: long enough to show a running build, short enough to stay current. */
export const DEFAULT_SNAPSHOT_WINDOW_DAYS = 42;

/** Weight is a trend signal, not a time series; a dozen points is plenty. */
const MAX_WEIGHT_SAMPLES = 12;

/** Enough test history to show a trend without bloating the prompt. */
export const MAX_RECENT_FITNESS_TESTS = 5;

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function roundNullable(
  value: number | null | undefined,
  decimals = 1
): number | null {
  if (value === null || value === undefined) return null;
  return round(value, decimals);
}

function sportOf(entry: ActivityEntryRow): ActivitySport {
  return classifyActivitySport({
    exerciseName: entry.exercise_name,
    category: entry.category,
    notes: entry.notes,
    providerName: entry.provider_name,
    detailData: entry.detail_data,
    exerciseSourceId: entry.exercise_source_id,
  }).sport;
}

/**
 * Thins a weight series to at most `MAX_WEIGHT_SAMPLES` evenly spaced points,
 * always keeping the newest one so `latest_kg` and the series agree.
 */
function downsampleWeights(series: readonly WeightSample[]): WeightSample[] {
  if (series.length <= MAX_WEIGHT_SAMPLES) return [...series];
  const step = (series.length - 1) / (MAX_WEIGHT_SAMPLES - 1);
  const picked: WeightSample[] = [];
  for (let i = 0; i < MAX_WEIGHT_SAMPLES; i += 1) {
    picked.push(series[Math.round(i * step)]);
  }
  return picked;
}

/** The subset of a fitness test the snapshot carries into the prompt. */
export type FitnessTestSummary = NonNullable<
  TrainingAthleteSnapshotPayload['recent_fitness_tests']
>[number];

export interface SnapshotInputs {
  asOfDate: string;
  windowDays: number;
  activities: readonly ActivityEntryRow[];
  weights: readonly WeightSample[];
  readiness: ReadinessAggregate;
  sleep?: SleepAggregate;
  racePredictions?: RacePredictionAggregate;
  fitnessTests?: readonly FitnessTestSummary[];
  nutrition?: TrainingAthleteSnapshotPayload['nutrition'];
}

function hasAnyNumber(
  ...values: ReadonlyArray<number | null | undefined>
): boolean {
  return values.some((value) => value !== null && value !== undefined);
}

export function buildSnapshotPayload(
  inputs: SnapshotInputs
): TrainingAthleteSnapshotPayload {
  const {
    asOfDate,
    windowDays,
    activities,
    weights,
    readiness,
    sleep,
    racePredictions,
    fitnessTests,
    nutrition,
  } = inputs;

  const bySport = new Map<
    ActivitySport,
    { sessions: number; minutes: number; distances: number[] }
  >();

  for (const entry of activities) {
    const sport = sportOf(entry);
    const bucket = bySport.get(sport) ?? {
      sessions: 0,
      minutes: 0,
      distances: [],
    };
    bucket.sessions += 1;
    bucket.minutes += entry.duration_minutes ?? 0;
    if (entry.distance_km !== null && entry.distance_km > 0) {
      bucket.distances.push(entry.distance_km);
    }
    bySport.set(sport, bucket);
  }

  const runs = bySport.get('running');
  const running = runs
    ? {
        session_count: runs.sessions,
        total_distance_km: round(
          runs.distances.reduce((sum, km) => sum + km, 0)
        ),
        total_duration_minutes: round(runs.minutes),
        avg_distance_km: runs.distances.length
          ? round(
              runs.distances.reduce((sum, km) => sum + km, 0) /
                runs.distances.length
            )
          : null,
        recent_long_run_km: runs.distances.length
          ? round(Math.max(...runs.distances))
          : null,
      }
    : undefined;

  const sportsBreakdown = [...bySport.entries()]
    .map(([sport, bucket]) => ({
      activity_key: sport,
      session_count: bucket.sessions,
      total_duration_minutes: round(bucket.minutes),
    }))
    .sort((a, b) => b.total_duration_minutes - a.total_duration_minutes);

  const series = downsampleWeights(weights);
  const latest = weights.length ? weights[weights.length - 1] : null;
  const earliest = weights.length ? weights[0] : null;
  const weight = latest
    ? {
        latest_kg: round(latest.kg, 2),
        latest_date: latest.date,
        delta_kg: earliest ? round(latest.kg - earliest.kg, 2) : null,
        series,
      }
    : undefined;

  const notes: string[] = [];
  if (!running || running.session_count === 0) {
    notes.push(`No running logged in the last ${windowDays} days.`);
  }
  if (!weight) {
    notes.push('No weight check-ins in the window; weight goals are unguided.');
  }

  const hasReadiness = hasAnyNumber(
    readiness.avg_training_readiness,
    readiness.latest_training_readiness,
    readiness.avg_acute_load,
    readiness.avg_chronic_load,
    readiness.latest_acwr,
    readiness.avg_recovery_time_hours,
    readiness.latest_rhr,
    readiness.avg_rhr,
    readiness.avg_body_battery_low,
    readiness.avg_body_battery_high,
    readiness.avg_stress,
    readiness.latest_overnight_hrv,
    readiness.avg_overnight_hrv,
    readiness.latest_vo2_max,
    readiness.lactate_threshold_bpm,
    readiness.lactate_threshold_speed_mps
  );

  if (hasReadiness && readiness.latest_acwr === null) {
    notes.push(
      'ACWR is missing; treat acute/chronic load as soft signals only.'
    );
  }

  const hasSleep = sleep !== undefined && sleep.nights_logged > 0;
  if (!hasSleep) {
    notes.push(
      'No sleep nights logged in the window; recovery advice is unanchored to sleep.'
    );
  }

  if (!nutrition || nutrition.days_logged === 0) {
    notes.push(
      'No food diary days in the window; nutrition context is omitted.'
    );
  }

  const runningScience = racePredictions
    ? derivePacesFromRacePredictions(racePredictions)
    : null;
  const hasRunningScience =
    runningScience !== null && hasUsablePaces(runningScience);
  if (racePredictions && !hasRunningScience) {
    notes.push(
      'No usable race predictions; training paces are unanchored to measured fitness.'
    );
  }

  const readinessTrend =
    readiness.readiness_trend.length > 0
      ? readiness.readiness_trend.map((point) => ({
          date: point.date,
          training_readiness: roundNullable(point.training_readiness),
          body_battery_lowest: roundNullable(point.body_battery_lowest),
        }))
      : undefined;

  return {
    as_of_date: asOfDate,
    window_days: windowDays,
    ...(running ? { running } : {}),
    ...(sportsBreakdown.length ? { sports_breakdown: sportsBreakdown } : {}),
    ...(weight ? { weight } : {}),
    ...(hasReadiness
      ? {
          readiness: {
            avg_training_readiness: roundNullable(
              readiness.avg_training_readiness
            ),
            latest_training_readiness: roundNullable(
              readiness.latest_training_readiness
            ),
            avg_acute_load: roundNullable(readiness.avg_acute_load),
            avg_chronic_load: roundNullable(readiness.avg_chronic_load),
            latest_acwr: roundNullable(readiness.latest_acwr, 2),
            avg_recovery_time_hours: roundNullable(
              readiness.avg_recovery_time_hours
            ),
            latest_rhr: roundNullable(readiness.latest_rhr),
            avg_rhr: roundNullable(readiness.avg_rhr),
            avg_body_battery_low: roundNullable(
              readiness.avg_body_battery_low
            ),
            avg_body_battery_high: roundNullable(
              readiness.avg_body_battery_high
            ),
            avg_stress: roundNullable(readiness.avg_stress),
            latest_overnight_hrv: roundNullable(
              readiness.latest_overnight_hrv
            ),
            avg_overnight_hrv: roundNullable(readiness.avg_overnight_hrv),
            latest_vo2_max: roundNullable(readiness.latest_vo2_max),
            lactate_threshold_bpm: readiness.lactate_threshold_bpm,
            lactate_threshold_speed_mps: roundNullable(
              readiness.lactate_threshold_speed_mps,
              2
            ),
          },
        }
      : {}),
    ...(hasSleep
      ? {
          sleep: {
            nights_logged: sleep.nights_logged,
            avg_sleep_score: roundNullable(sleep.avg_sleep_score),
            avg_hours_asleep: roundNullable(sleep.avg_hours_asleep, 2),
            avg_deep_hours: roundNullable(sleep.avg_deep_hours, 2),
          },
        }
      : {}),
    ...(readinessTrend ? { readiness_trend: readinessTrend } : {}),
    ...(hasRunningScience ? { running_science: runningScience } : {}),
    ...(fitnessTests && fitnessTests.length
      ? { recent_fitness_tests: [...fitnessTests] }
      : {}),
    ...(nutrition ? { nutrition } : {}),
    ...(notes.length ? { notes } : {}),
  };
}

/**
 * Flattens a reported test result into one short line. The snapshot is prompt
 * context, so a sentence the model can read beats a nested object it has to
 * interpret.
 */
export function summarizeTestResult(
  result: TrainingFitnessTestResult | null
): string | null {
  if (!result) return null;
  const parts: string[] = [];
  if (result.distance_km) parts.push(`${round(result.distance_km, 2)} km`);
  if (result.duration_seconds) {
    const minutes = Math.floor(result.duration_seconds / 60);
    const seconds = Math.round(result.duration_seconds % 60);
    parts.push(`${minutes}:${String(seconds).padStart(2, '0')}`);
  }
  if (result.distance_km && result.duration_seconds) {
    const pace = paceMinPerKm(result.duration_seconds, result.distance_km);
    const formatted = formatPaceMinPerKm(pace);
    if (formatted) parts.push(`${formatted}/km`);
  }
  if (result.avg_heart_rate) parts.push(`avg HR ${result.avg_heart_rate}`);
  if (result.perceived_effort) parts.push(`RPE ${result.perceived_effort}`);
  if (result.notes) parts.push(result.notes);
  return parts.length ? parts.join(', ') : null;
}

/** Rough token cost of the serialized payload; ~4 characters per token. */
export function estimateTokens(
  payload: TrainingAthleteSnapshotPayload
): number {
  return Math.ceil(JSON.stringify(payload).length / 4);
}

/**
 * Recomputes and persists the athlete snapshot. `planId` scopes the snapshot to
 * a plan so a re-plan reads the numbers that were current when it ran.
 */
export async function rebuildSnapshot(
  userId: string,
  planId: string | null,
  windowDays: number = DEFAULT_SNAPSHOT_WINDOW_DAYS
): Promise<TrainingAthleteSnapshot> {
  const tz = await loadUserTimezone(userId);
  const asOfDate = todayInZone(tz);
  const startDate = addDays(asOfDate, -windowDays);

  const [activities, weights, readiness, sleep, racePredictions, tests] =
    await Promise.all([
      trainingPlanRepository.listActivityEntries(userId, startDate, asOfDate),
      trainingPlanRepository.listWeightSeries(userId, startDate, asOfDate),
      trainingPlanRepository.getReadinessAggregate(userId, startDate, asOfDate),
      trainingPlanRepository.getSleepAggregate(userId, startDate, asOfDate),
      trainingPlanRepository.getRacePredictions(userId, startDate, asOfDate),
      trainingFitnessTestRepository.listTests(userId, {
        planId: planId ?? undefined,
        limit: MAX_RECENT_FITNESS_TESTS,
      }),
    ]);

  const payload = buildSnapshotPayload({
    asOfDate,
    windowDays,
    activities,
    weights,
    readiness,
    sleep,
    racePredictions,
    fitnessTests: tests.map((test) => ({
      id: test.id,
      test_type: test.test_type,
      title: test.title,
      scheduled_date: test.scheduled_date,
      status: test.status,
      result_summary: summarizeTestResult(test.result),
    })),
    nutrition:
      (await buildNutritionSnapshotBlock({
        userId,
        startDate,
        endDate: asOfDate,
        latestWeightKg: weights.length
          ? weights[weights.length - 1]!.kg
          : null,
      })) ?? undefined,
  });

  const snapshot = await trainingPlanRepository.insertSnapshot(
    userId,
    planId,
    asOfDate,
    payload,
    estimateTokens(payload)
  );

  log(
    'info',
    `[trainingAthleteSnapshot] Rebuilt snapshot for user ${userId} (plan ${planId ?? 'none'}), ~${snapshot.token_estimate} tokens.`
  );
  return snapshot;
}

export async function getLatestSnapshot(
  userId: string,
  planId?: string
): Promise<TrainingAthleteSnapshot | null> {
  return trainingPlanRepository.getLatestSnapshot(userId, planId);
}

const SNAPSHOT_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Rebuilds when missing or older than 24h so AI context stays current.
 */
export async function ensureFreshSnapshot(
  userId: string,
  planId: string | null,
  windowDays: number = DEFAULT_SNAPSHOT_WINDOW_DAYS
): Promise<TrainingAthleteSnapshot> {
  const latest = planId
    ? await trainingPlanRepository.getLatestSnapshot(userId, planId)
    : null;
  if (latest?.created_at) {
    const ageMs = Date.now() - new Date(latest.created_at).getTime();
    if (Number.isFinite(ageMs) && ageMs < SNAPSHOT_STALE_MS) {
      return latest;
    }
  }
  return rebuildSnapshot(userId, planId, windowDays);
}

export default {
  buildSnapshotPayload,
  estimateTokens,
  rebuildSnapshot,
  ensureFreshSnapshot,
  getLatestSnapshot,
  summarizeTestResult,
  DEFAULT_SNAPSHOT_WINDOW_DAYS,
};
