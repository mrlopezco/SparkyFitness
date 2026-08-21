import { compareDays, daysBetween, todayInZone } from '@workspace/shared';
import type {
  TrainingFitnessTest,
  TrainingFitnessTestCreateRequest,
  TrainingFitnessTestReportRequest,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import trainingFitnessTestRepository, {
  type ListFitnessTestsFilter,
} from '../models/trainingFitnessTestRepository.js';
import trainingPlanRepository from '../models/trainingPlanRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { NotFoundError } from './trainingAiSupport.js';

/**
 * Orchestration for periodic fitness tests: ownership checks, scheduling, and
 * reporting results. A reported result feeds the athlete snapshot, which is
 * what re-anchors prescribed paces to measured fitness.
 */

/** A test scheduled further out than this is almost certainly a bad date. */
const MAX_SCHEDULE_HORIZON_DAYS = 365;

async function requirePlanOwnership(
  userId: string,
  planId: string | null | undefined
): Promise<void> {
  if (!planId) return;
  const plan = await trainingPlanRepository.getPlanById(userId, planId);
  if (!plan) {
    throw new NotFoundError(`Training plan ${planId} was not found.`);
  }
}

export async function createTest(
  userId: string,
  request: TrainingFitnessTestCreateRequest
): Promise<TrainingFitnessTest> {
  await requirePlanOwnership(userId, request.plan_id);
  return trainingFitnessTestRepository.createTest(userId, request);
}

export async function listTests(
  userId: string,
  filter: ListFitnessTestsFilter = {}
): Promise<TrainingFitnessTest[]> {
  await requirePlanOwnership(userId, filter.planId);
  return trainingFitnessTestRepository.listTests(userId, filter);
}

export async function getTest(
  userId: string,
  testId: string
): Promise<TrainingFitnessTest> {
  const test = await trainingFitnessTestRepository.getTestById(userId, testId);
  if (!test) {
    throw new NotFoundError(`Fitness test ${testId} was not found.`);
  }
  return test;
}

export async function reportResult(
  userId: string,
  testId: string,
  request: TrainingFitnessTestReportRequest
): Promise<TrainingFitnessTest> {
  await getTest(userId, testId);
  const updated = await trainingFitnessTestRepository.reportResult(
    userId,
    testId,
    request.status,
    request.result,
    request.notes ?? null
  );
  if (!updated) {
    throw new NotFoundError(`Fitness test ${testId} was not found.`);
  }
  log(
    'info',
    `[trainingFitnessTest] User ${userId} reported test ${testId} as ${request.status}.`
  );
  return updated;
}

export async function deleteTest(
  userId: string,
  testId: string
): Promise<void> {
  const deleted = await trainingFitnessTestRepository.deleteTest(
    userId,
    testId
  );
  if (!deleted) {
    throw new NotFoundError(`Fitness test ${testId} was not found.`);
  }
}

/**
 * True when the athlete has no measured fitness inside `staleAfterDays`. The
 * cadence question the weekly check-in and the coach both ask, kept in one
 * place so they cannot drift apart.
 */
export async function isFitnessTestOverdue(
  userId: string,
  planId: string | undefined,
  today: string,
  staleAfterDays: number
): Promise<boolean> {
  const latest = await trainingFitnessTestRepository.getLatestTestDate(
    userId,
    planId
  );
  if (!latest) return true;
  // A test scheduled in the future is not overdue, however old the last one is.
  if (compareDays(latest, today) >= 0) return false;
  return daysBetween(latest, today) > staleAfterDays;
}

/**
 * Schedules a test the coach or the check-in asked for, rejecting a date in
 * the past or absurdly far out rather than persisting a nonsense row.
 */
export async function scheduleTest(
  userId: string,
  request: TrainingFitnessTestCreateRequest
): Promise<TrainingFitnessTest | null> {
  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);
  if (compareDays(request.scheduled_date, today) < 0) {
    log(
      'warn',
      `[trainingFitnessTest] Refused a test scheduled in the past (${request.scheduled_date}) for user ${userId}.`
    );
    return null;
  }
  const horizonDays = daysBetween(today, request.scheduled_date);
  if (horizonDays > MAX_SCHEDULE_HORIZON_DAYS) {
    log(
      'warn',
      `[trainingFitnessTest] Refused a test scheduled ${horizonDays} days out (${request.scheduled_date}) for user ${userId}.`
    );
    return null;
  }
  return createTest(userId, request);
}

export default {
  createTest,
  listTests,
  getTest,
  reportResult,
  deleteTest,
  isFitnessTestOverdue,
  scheduleTest,
};
