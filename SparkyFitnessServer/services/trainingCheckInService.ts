import {
  addDays,
  compareDays,
  daysBetween,
  todayInZone,
  type TrainingFitnessTestCreateRequest,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import trainingCoachRepository from '../models/trainingCoachRepository.js';
import trainingPlanRepository, {
  type ActivePlanRef,
} from '../models/trainingPlanRepository.js';
import trainingAthleteSnapshotService from './trainingAthleteSnapshotService.js';
import trainingCoachService from './trainingCoachService.js';
import trainingFitnessTestService from './trainingFitnessTestService.js';
import { computePlanHealth } from './trainingPlanHealthService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

/**
 * Weekly coach check-in. Once a day the scan looks at every active training
 * plan and opens a coach session for the athletes who have drifted, so the
 * coach reaches out instead of waiting to be asked. Everything here is
 * best-effort: a failure for one athlete is logged and the scan moves on.
 */

/** Don't nag: a fresh check-in inside this window is enough. */
const CHECK_IN_INTERVAL_DAYS = 7;

/** Missed sessions in the last week that count as drift worth a conversation. */
const UNMATCHED_SESSION_THRESHOLD = 2;

/** Fitness measured longer ago than this is stale for an athlete in a build. */
const FITNESS_TEST_STALE_DAYS = 28;

/** How far out a suggested test lands: far enough to taper into, close enough to matter. */
const FITNESS_TEST_LEAD_DAYS = 5;

export interface CheckInPlanHealthSignals {
  acwr_elevated: boolean;
  missed_quality: boolean;
  low_execution: boolean;
  injury_skips: number;
}

export interface CheckInDecision {
  shouldOpen: boolean;
  reasons: string[];
  unmatchedCount: number;
  fitnessTestOverdue: boolean;
  overloadPattern?: boolean;
}

/**
 * Whether this athlete needs a check-in, and why. Pure so the cadence rules
 * can be tested without a database or a clock.
 */
export function decideCheckIn(inputs: {
  hasOpenSession: boolean;
  daysSinceLastCheckIn: number | null;
  unmatchedCount: number;
  fitnessTestOverdue: boolean;
  planHealth?: CheckInPlanHealthSignals;
}): CheckInDecision {
  const { hasOpenSession, daysSinceLastCheckIn, unmatchedCount, planHealth } =
    inputs;
  const reasons: string[] = [];

  if (daysSinceLastCheckIn === null) {
    reasons.push('no coach check-in has happened for this plan yet');
  } else if (daysSinceLastCheckIn >= CHECK_IN_INTERVAL_DAYS) {
    reasons.push(`the last check-in was ${daysSinceLastCheckIn} days ago`);
  }
  if (unmatchedCount > UNMATCHED_SESSION_THRESHOLD) {
    reasons.push(
      `${unmatchedCount} planned sessions in the last week were never logged`
    );
  }
  if (inputs.fitnessTestOverdue) {
    reasons.push(
      `no fitness test in the last ${FITNESS_TEST_STALE_DAYS} days, so prescribed paces are unanchored`
    );
  }

  let overloadPattern = false;
  if (planHealth) {
    if (planHealth.acwr_elevated && unmatchedCount >= 1) {
      reasons.push(
        'elevated ACWR with at least one missed session in the last week'
      );
      overloadPattern = true;
    }
    if (planHealth.missed_quality) {
      reasons.push('a quality session was missed in the last 7 days');
    }
    if (planHealth.injury_skips >= 3) {
      reasons.push(
        `${planHealth.injury_skips} skips cited injury or illness recently`
      );
      overloadPattern = true;
    }
    if (planHealth.low_execution) {
      reasons.push('execution scores on completed sessions are consistently low');
      overloadPattern = true;
    }
  }

  return {
    // An open session means the athlete is already mid-conversation; a second
    // thread would fragment the history the coach reads.
    shouldOpen: !hasOpenSession && reasons.length > 0,
    reasons,
    unmatchedCount,
    fitnessTestOverdue: inputs.fitnessTestOverdue,
    overloadPattern,
  };
}

export function buildOpeningBrief(
  plan: Pick<ActivePlanRef, 'name' | 'target_date'>,
  today: string,
  decision: CheckInDecision
): string {
  const daysToTarget = daysBetween(today, plan.target_date);
  const lines = [
    `Weekly check-in for "${plan.name}" on ${today}.`,
    daysToTarget >= 0
      ? `${daysToTarget} days remain until the target date (${plan.target_date}).`
      : `The target date (${plan.target_date}) has passed.`,
    `Reason for reaching out: ${decision.reasons.join('; ')}.`,
    'Open the conversation by naming what you noticed, ask one focused question about it, and only suggest a change once the athlete has answered.',
  ];
  if (decision.overloadPattern) {
    lines.push(
      'Lead with recovery and load management; the athlete may be overreaching even if some sessions were completed.'
    );
  } else if (decision.unmatchedCount > UNMATCHED_SESSION_THRESHOLD) {
    lines.push(
      'Focus on scheduling friction or plan ambition before pushing more volume.'
    );
  }
  if (decision.fitnessTestOverdue) {
    lines.push(
      'A fitness test is being offered alongside this check-in; confirm the date works for the athlete rather than assuming it.'
    );
  }
  return lines.join(' ');
}

function suggestedTest(
  planId: string,
  today: string
): TrainingFitnessTestCreateRequest {
  return {
    plan_id: planId,
    test_type: '5k_time_trial',
    title: '5K time trial',
    scheduled_date: addDays(today, FITNESS_TEST_LEAD_DAYS),
    prescription: {
      distance_km: 5,
      target_effort: 'Hard, evenly paced race effort',
      instructions:
        '15 minutes easy warm-up with a few strides, then 5 km as fast as you can hold evenly. 10 minutes easy cool-down. Report the finish time.',
    },
    source: 'system',
    due_interval_days: FITNESS_TEST_STALE_DAYS,
    notes: 'Scheduled automatically to re-anchor your training paces.',
  };
}

/** Runs the check-in for one active plan. Returns true when a session was opened. */
async function checkInOnPlan(plan: ActivePlanRef): Promise<boolean> {
  const tz = await loadUserTimezone(plan.user_id);
  const today = todayInZone(tz);

  const [openSession, lastCheckInAt] = await Promise.all([
    trainingCoachRepository.getOpenSession(plan.user_id, plan.plan_id),
    trainingCoachRepository.getLatestSessionCreatedAt(
      plan.user_id,
      plan.plan_id
    ),
  ]);

  // Cheapest possible exit: an open thread short-circuits every other query.
  if (openSession) return false;

  const [unmatchedCount, fitnessTestOverdue] = await Promise.all([
    trainingPlanRepository.countUnmatchedPlannedSessions(
      plan.user_id,
      plan.plan_id,
      addDays(today, -7),
      addDays(today, -1)
    ),
    trainingFitnessTestService.isFitnessTestOverdue(
      plan.user_id,
      plan.plan_id,
      today,
      FITNESS_TEST_STALE_DAYS
    ),
  ]);

  const daysSinceLastCheckIn = lastCheckInAt
    ? daysBetween(lastCheckInAt.slice(0, 10), today)
    : null;

  let planHealthSignals;
  try {
    const health = await computePlanHealth(plan.user_id, plan.plan_id, today);
    planHealthSignals = {
      acwr_elevated: health.acwr != null && health.acwr > 1.3,
      missed_quality:
        health.last_7_days.quality_planned >
        health.last_7_days.quality_completed,
      low_execution:
        health.last_7_days.avg_execution_score != null &&
        health.last_7_days.avg_execution_score < 5,
      injury_skips: health.last_7_days.injury_skips,
    };
  } catch (error) {
    log(
      'warn',
      `[trainingCheckIn] Plan health unavailable for user ${plan.user_id}:`,
      error
    );
  }

  const decision = decideCheckIn({
    hasOpenSession: false,
    daysSinceLastCheckIn,
    unmatchedCount,
    fitnessTestOverdue,
    planHealth: planHealthSignals,
  });
  if (!decision.shouldOpen) return false;

  // The brief the coach reads should describe today's athlete, not last
  // week's; a stale snapshot is the difference between useful and generic.
  try {
    await trainingAthleteSnapshotService.rebuildSnapshot(
      plan.user_id,
      plan.plan_id
    );
  } catch (error) {
    log(
      'warn',
      `[trainingCheckIn] Snapshot rebuild failed for user ${plan.user_id} plan ${plan.plan_id}; continuing with the previous snapshot:`,
      error
    );
  }

  if (
    decision.fitnessTestOverdue &&
    compareDays(addDays(today, FITNESS_TEST_LEAD_DAYS), plan.target_date) <= 0
  ) {
    try {
      await trainingFitnessTestService.scheduleTest(
        plan.user_id,
        suggestedTest(plan.plan_id, today)
      );
    } catch (error) {
      log(
        'warn',
        `[trainingCheckIn] Could not schedule a fitness test for user ${plan.user_id}:`,
        error
      );
    }
  }

  await trainingCoachService.createSession(plan.user_id, plan.plan_id, {
    title: `Weekly check-in ${today}`,
    opening_brief: buildOpeningBrief(plan, today, decision),
  });

  log(
    'info',
    `[trainingCheckIn] Opened a check-in for user ${plan.user_id} plan ${plan.plan_id}: ${decision.reasons.join('; ')}.`
  );
  return true;
}

/**
 * Scans every active plan. Never throws: this runs from cron, where an
 * unhandled rejection would take down the process rather than skip a user.
 */
export async function runWeeklyCheckIns(): Promise<number> {
  let opened = 0;
  try {
    const plans = await trainingPlanRepository.listActivePlansForScan();
    for (const plan of plans) {
      try {
        if (await checkInOnPlan(plan)) opened += 1;
      } catch (error) {
        log(
          'error',
          `[trainingCheckIn] Check-in failed for user ${plan.user_id} plan ${plan.plan_id}:`,
          error
        );
      }
    }
    if (opened > 0) {
      log(
        'info',
        `[trainingCheckIn] Opened ${opened} coach check-in(s) across ${plans.length} active plan(s).`
      );
    }
  } catch (error) {
    log('error', '[trainingCheckIn] Weekly check-in scan failed:', error);
  }
  return opened;
}

export default {
  runWeeklyCheckIns,
  decideCheckIn,
  buildOpeningBrief,
};
