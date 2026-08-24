import {
  addDays,
  compareDays,
  daysBetween,
  todayInZone,
  type TrainingPlanHealth,
  type TrainingSessionType,
} from '@workspace/shared';
import trainingPlanRepository from '../models/trainingPlanRepository.js';
import trainingAthleteSnapshotService from './trainingAthleteSnapshotService.js';
import trainingFitnessTestService from './trainingFitnessTestService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

const QUALITY_TYPES = new Set<TrainingSessionType>([
  'intervals',
  'tempo',
  'race',
]);

const RUN_TYPES = new Set<TrainingSessionType>([
  'easy_run',
  'intervals',
  'tempo',
  'long_run',
  'race',
]);

const FITNESS_TEST_STALE_DAYS = 28;

function runKmForSession(
  sessionType: TrainingSessionType,
  distanceKm: number | null | undefined
): number {
  if (!RUN_TYPES.has(sessionType)) return 0;
  if (distanceKm == null || distanceKm <= 0) return 0;
  return distanceKm;
}

function isInjurySkip(reason: string | null | undefined): boolean {
  if (!reason) return false;
  const lower = reason.toLowerCase();
  return (
    lower.includes('injur') ||
    lower.includes('ill') ||
    lower.includes('sick') ||
    lower.includes('pain')
  );
}

function isScheduleSkip(reason: string | null | undefined): boolean {
  if (!reason) return false;
  const lower = reason.toLowerCase();
  return (
    lower.includes('travel') ||
    lower.includes('schedule') ||
    lower.includes('work') ||
    lower.includes('busy')
  );
}

export function buildPlanHealthAdjustNotes(health: TrainingPlanHealth): string {
  return health.summary_lines.join(' ');
}

/**
 * Rolling plan metrics for AI context and Overview UI (computed on read).
 */
export async function computePlanHealth(
  userId: string,
  planId: string,
  asOfDate?: string
): Promise<TrainingPlanHealth> {
  const plan = await trainingPlanRepository.getPlanById(userId, planId);
  if (!plan) {
    throw new Error(`Training plan ${planId} was not found.`);
  }

  const tz = await loadUserTimezone(userId);
  const today = asOfDate ?? todayInZone(tz);
  const weekStart = addDays(today, -6);
  const weekEnd = today;

  const [sessions, snapshot, fitnessTestOverdue] = await Promise.all([
    trainingPlanRepository.listSessionsInRange(
      userId,
      weekStart,
      weekEnd,
      planId
    ),
    trainingAthleteSnapshotService.getLatestSnapshot(userId, planId),
    trainingFitnessTestService.isFitnessTestOverdue(
      userId,
      planId,
      today,
      FITNESS_TEST_STALE_DAYS
    ),
  ]);

  let plannedRunKm = 0;
  let completedRunKm = 0;
  let qualityPlanned = 0;
  let qualityCompleted = 0;
  let unmatchedPlanned = 0;
  let injurySkips = 0;
  let scheduleSkips = 0;
  const executionScores: number[] = [];

  for (const session of sessions) {
    const km = runKmForSession(
      session.session_type,
      session.prescription.distance_km
    );
    if (compareDays(session.scheduled_date, today) <= 0) {
      plannedRunKm += km;
    }
    if (QUALITY_TYPES.has(session.session_type)) {
      qualityPlanned += 1;
    }
    if (session.status === 'completed' || session.status === 'partial') {
      completedRunKm += km;
      if (QUALITY_TYPES.has(session.session_type)) {
        qualityCompleted += 1;
      }
      const score = session.completion?.athlete_execution_score;
      if (score != null && Number.isFinite(score)) {
        executionScores.push(score);
      }
    } else if (
      session.status === 'planned' &&
      compareDays(session.scheduled_date, today) < 0
    ) {
      unmatchedPlanned += 1;
    } else if (session.status === 'skipped') {
      if (isInjurySkip(session.skip_reason)) injurySkips += 1;
      else if (isScheduleSkip(session.skip_reason)) scheduleSkips += 1;
    }
  }

  const avgExecution =
    executionScores.length > 0
      ? Math.round(
          (executionScores.reduce((a, b) => a + b, 0) /
            executionScores.length) *
            10
        ) / 10
      : null;

  const readiness = snapshot?.payload.readiness;
  const acwr = readiness?.latest_acwr ?? null;
  const readinessParts: string[] = [];
  if (readiness?.latest_training_readiness != null) {
    readinessParts.push(
      `training readiness ${readiness.latest_training_readiness}`
    );
  }
  if (readiness?.avg_recovery_time_hours != null) {
    readinessParts.push(
      `recovery time ~${readiness.avg_recovery_time_hours}h`
    );
  }
  const readiness_summary =
    readinessParts.length > 0 ? readinessParts.join('; ') : null;

  const summary_lines: string[] = [];
  if (unmatchedPlanned > 0) {
    summary_lines.push(
      `${unmatchedPlanned} planned session(s) in the last 7 days were not completed.`
    );
  }
  if (qualityPlanned > qualityCompleted) {
    summary_lines.push(
      `Quality sessions: ${qualityCompleted}/${qualityPlanned} completed in the last 7 days.`
    );
  }
  if (acwr != null && acwr > 1.3) {
    summary_lines.push(`ACWR ${acwr} is elevated; consider easing load.`);
  }
  if (injurySkips >= 2) {
    summary_lines.push(
      `${injurySkips} skips cited injury or illness in the last 7 days.`
    );
  }
  if (avgExecution != null && avgExecution < 5) {
    summary_lines.push(
      `Average execution score ${avgExecution}/10 is low over completed sessions.`
    );
  }
  if (fitnessTestOverdue) {
    summary_lines.push(
      'No recent fitness test; prescribed paces may be stale.'
    );
  }

  const daysToTarget = daysBetween(today, plan.target_date);

  return {
    plan_id: planId,
    as_of_date: today,
    days_to_target: daysToTarget,
    last_7_days: {
      planned_run_km: Math.round(plannedRunKm * 10) / 10,
      completed_run_km: Math.round(completedRunKm * 10) / 10,
      quality_planned: qualityPlanned,
      quality_completed: qualityCompleted,
      unmatched_planned: unmatchedPlanned,
      avg_execution_score: avgExecution,
      injury_skips: injurySkips,
      schedule_skips: scheduleSkips,
    },
    readiness_summary,
    acwr,
    fitness_test_stale: fitnessTestOverdue,
    summary_lines,
  };
}

export default {
  computePlanHealth,
  buildPlanHealthAdjustNotes,
};
