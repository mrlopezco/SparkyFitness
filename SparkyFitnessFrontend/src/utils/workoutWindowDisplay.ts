import {
  setsDurationMinutes,
  type ExerciseEntryResponse,
  type ExerciseSessionResponse,
  type IndividualSessionResponse,
  type TrainingPlanSession,
} from '@workspace/shared';

export type WorkoutWindowActivityKind = 'logged' | 'planned';

/** Normalized metrics for one row in the workout window card. */
export interface WorkoutWindowActivityItem {
  id: string;
  kind: WorkoutWindowActivityKind;
  name: string;
  distanceKm: number | null;
  durationMinutes: number | null;
  caloriesKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  /** Planned sessions: target HR zone when avg/max are not logged yet. */
  heartRateZone: string | null;
  paceSubtitle: string | null;
  plannedStatus?: TrainingPlanSession['status'];
}

function entryDurationMinutes(entry: ExerciseEntryResponse): number {
  const setsDuration = setsDurationMinutes(entry.sets);
  if (setsDuration > 0) return setsDuration;
  return entry.duration_minutes ?? 0;
}

function individualEntryMetrics(entry: ExerciseEntryResponse): {
  distanceKm: number | null;
  durationMinutes: number | null;
  caloriesKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
} {
  const duration = entryDurationMinutes(entry);
  return {
    distanceKm: entry.distance ?? null,
    durationMinutes: duration > 0 ? duration : null,
    caloriesKcal:
      entry.calories_burned != null && entry.calories_burned > 0
        ? entry.calories_burned
        : null,
    avgHeartRate: entry.avg_heart_rate ?? null,
    maxHeartRate: entry.max_heart_rate ?? null,
  };
}

function aggregatePresetMetrics(exercises: ExerciseEntryResponse[]): {
  distanceKm: number | null;
  durationMinutes: number | null;
  caloriesKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
} {
  if (exercises.length === 0) {
    return {
      distanceKm: null,
      durationMinutes: null,
      caloriesKcal: null,
      avgHeartRate: null,
      maxHeartRate: null,
    };
  }

  let distanceSum = 0;
  let hasDistance = false;
  let durationSum = 0;
  let caloriesSum = 0;
  let hasCalories = false;
  const avgHrValues: number[] = [];
  let maxHr: number | null = null;

  for (const ex of exercises) {
    if (ex.distance != null && ex.distance > 0) {
      distanceSum += ex.distance;
      hasDistance = true;
    }
    durationSum += entryDurationMinutes(ex);
    if (ex.calories_burned != null && ex.calories_burned > 0) {
      caloriesSum += ex.calories_burned;
      hasCalories = true;
    }
    if (ex.avg_heart_rate != null && ex.avg_heart_rate > 0) {
      avgHrValues.push(ex.avg_heart_rate);
    }
    if (ex.max_heart_rate != null && ex.max_heart_rate > 0) {
      maxHr =
        maxHr == null ? ex.max_heart_rate : Math.max(maxHr, ex.max_heart_rate);
    }
  }

  const avgHeartRate =
    avgHrValues.length > 0
      ? Math.round(
          avgHrValues.reduce((sum, v) => sum + v, 0) / avgHrValues.length
        )
      : null;

  return {
    distanceKm: hasDistance ? distanceSum : null,
    durationMinutes: durationSum > 0 ? durationSum : null,
    caloriesKcal: hasCalories ? caloriesSum : null,
    avgHeartRate,
    maxHeartRate: maxHr,
  };
}

function resolveIndividualName(session: IndividualSessionResponse): string {
  const fromName = session.name?.trim();
  if (fromName) return fromName;
  const fromSnapshot = session.exercise_snapshot?.name?.trim();
  if (fromSnapshot) return fromSnapshot;
  return 'Activity';
}

export function exerciseSessionToWorkoutWindowItem(
  session: ExerciseSessionResponse
): WorkoutWindowActivityItem {
  if (session.type === 'individual') {
    const metrics = individualEntryMetrics(session);
    return {
      id: session.id,
      kind: 'logged',
      name: resolveIndividualName(session),
      ...metrics,
      heartRateZone: null,
      paceSubtitle: null,
    };
  }

  const metrics = aggregatePresetMetrics(session.exercises);
  const fallbackDuration =
    session.total_duration_minutes > 0
      ? session.total_duration_minutes
      : metrics.durationMinutes;

  return {
    id: session.id,
    kind: 'logged',
    name: session.name?.trim() || 'Workout',
    distanceKm: metrics.distanceKm,
    durationMinutes: fallbackDuration,
    caloriesKcal: metrics.caloriesKcal,
    avgHeartRate: metrics.avgHeartRate,
    maxHeartRate: metrics.maxHeartRate,
    heartRateZone: null,
    paceSubtitle: null,
  };
}

export function exerciseSessionsToWorkoutWindowItems(
  sessions: ExerciseSessionResponse[] | undefined
): WorkoutWindowActivityItem[] {
  if (!sessions?.length) return [];
  return sessions.map(exerciseSessionToWorkoutWindowItem);
}

export function plannedSessionToWorkoutWindowItem(
  session: TrainingPlanSession,
  fallbackTitle: string
): WorkoutWindowActivityItem {
  const prescription = session.prescription;
  const title = prescription.title?.trim() || fallbackTitle;
  const paceSubtitle =
    prescription.pace_target?.trim() ||
    (prescription.heart_rate_zone
      ? null
      : prescription.notes?.trim()?.slice(0, 80) || null);

  return {
    id: session.id,
    kind: 'planned',
    name: title,
    distanceKm: prescription.distance_km ?? null,
    durationMinutes: prescription.duration_minutes ?? null,
    caloriesKcal: null,
    avgHeartRate: null,
    maxHeartRate: null,
    heartRateZone: prescription.heart_rate_zone?.trim() || null,
    paceSubtitle,
    plannedStatus: session.status,
  };
}

export function plannedSessionsToWorkoutWindowItems(
  sessions: TrainingPlanSession[] | undefined,
  sessionTypeLabel: (sessionType: TrainingPlanSession['session_type']) => string
): WorkoutWindowActivityItem[] {
  if (!sessions?.length) return [];
  return sessions.map((session) =>
    plannedSessionToWorkoutWindowItem(
      session,
      sessionTypeLabel(session.session_type)
    )
  );
}
