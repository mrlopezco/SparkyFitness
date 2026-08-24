import {
  addDays,
  compareDays,
  dayOfWeek,
  daysBetween,
  TRAINING_PLAN_EXPORT_SCHEMA_VERSION,
  type TrainingAthleteSnapshot,
  type TrainingCalendarDay,
  type TrainingCalendarQuery,
  type TrainingCalendarResponse,
  type TrainingCommitment,
  type TrainingCommitmentPayload,
  type TrainingGoal,
  type TrainingGoalPayload,
  type TrainingPlan,
  type TrainingPlanConfirmRequest,
  type TrainingPlanConfirmResponse,
  type TrainingPlanCreateRequest,
  type TrainingPlanDetail,
  type TrainingPlanExportDocument,
  type TrainingPlanImportRequest,
  type TrainingPlanImportResponse,
  type TrainingPlanSession,
  type TrainingPlanSessionPayload,
  type TrainingPlanUpdateRequest,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import trainingPlanRepository from '../models/trainingPlanRepository.js';
import trainingAthleteSnapshotService from './trainingAthleteSnapshotService.js';
import { computeFeasibilityFlags } from './trainingGoalFeasibilityService.js';
import { computePlanHealth } from './trainingPlanHealthService.js';
import { confirmTrainingPlan, NotFoundError } from './trainingPlanAiService.js';

/**
 * Orchestration for the Training Plan domain: ownership checks, plan detail
 * assembly, calendar expansion, and keeping the athlete snapshot fresh after a
 * plan is created or confirmed.
 */

/** Guard against a client asking for a decade of calendar days in one request. */
const MAX_CALENDAR_DAYS = 400;

export class InvalidRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRangeError';
  }
}

async function requirePlan(
  userId: string,
  planId: string
): Promise<TrainingPlan> {
  const plan = await trainingPlanRepository.getPlanById(userId, planId);
  if (!plan) {
    throw new NotFoundError(`Training plan ${planId} was not found.`);
  }
  return plan;
}

/**
 * A stale snapshot only degrades the next AI proposal, so a rebuild failure is
 * logged and swallowed rather than failing the write the user asked for.
 */
async function refreshSnapshot(userId: string, planId: string): Promise<void> {
  try {
    await trainingAthleteSnapshotService.rebuildSnapshot(userId, planId);
  } catch (error) {
    log(
      'warn',
      `[trainingPlanService] Snapshot rebuild failed for user ${userId} plan ${planId}:`,
      error
    );
  }
}

export async function listPlans(userId: string): Promise<TrainingPlan[]> {
  return trainingPlanRepository.listPlans(userId);
}

export async function createPlan(
  userId: string,
  request: TrainingPlanCreateRequest
): Promise<TrainingPlanDetail> {
  if (compareDays(request.start_date, request.target_date) > 0) {
    throw new InvalidRangeError('start_date must not be after target_date.');
  }

  const { plan, goals, commitments } = await trainingPlanRepository.createPlan(
    userId,
    request
  );
  await refreshSnapshot(userId, plan.id);
  return { ...plan, goals, commitments, sessions: [] };
}

export async function getPlanDetail(
  userId: string,
  planId: string
): Promise<TrainingPlanDetail> {
  const plan = await requirePlan(userId, planId);
  const [goals, commitments, sessions] = await Promise.all([
    trainingPlanRepository.listGoals(userId, planId),
    trainingPlanRepository.listCommitments(userId, planId),
    trainingPlanRepository.listSessions(userId, planId),
  ]);
  return { ...plan, goals, commitments, sessions };
}

export async function updatePlan(
  userId: string,
  planId: string,
  updates: TrainingPlanUpdateRequest
): Promise<TrainingPlan> {
  const existing = await requirePlan(userId, planId);
  const start = updates.start_date ?? existing.start_date;
  const target = updates.target_date ?? existing.target_date;
  if (compareDays(start, target) > 0) {
    throw new InvalidRangeError('start_date must not be after target_date.');
  }

  const updated = await trainingPlanRepository.updatePlan(
    userId,
    planId,
    updates
  );
  if (!updated) {
    throw new NotFoundError(`Training plan ${planId} was not found.`);
  }
  return updated;
}

export async function deletePlan(
  userId: string,
  planId: string
): Promise<void> {
  const deleted = await trainingPlanRepository.deletePlan(userId, planId);
  if (!deleted) {
    throw new NotFoundError(`Training plan ${planId} was not found.`);
  }
}

export async function replaceGoals(
  userId: string,
  planId: string,
  goals: readonly TrainingGoalPayload[]
): Promise<TrainingGoal[]> {
  await requirePlan(userId, planId);
  return trainingPlanRepository.replaceGoals(userId, planId, goals);
}

export async function replaceCommitments(
  userId: string,
  planId: string,
  commitments: readonly TrainingCommitmentPayload[]
): Promise<TrainingCommitment[]> {
  await requirePlan(userId, planId);
  return trainingPlanRepository.replaceCommitments(userId, planId, commitments);
}

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/**
 * Reads the weekday list out of a recurrence rule. Only `BYDAY` is supported —
 * commitments are "soccer on Tuesdays and Thursdays", not arbitrary RRULEs.
 */
export function parseRecurrenceWeekdays(rule: string): string[] {
  const match = /BYDAY=([A-Za-z,]+)/.exec(rule);
  if (!match) return [];
  return match[1]
    .toUpperCase()
    .split(',')
    .map((code) => code.trim())
    .filter((code) => (WEEKDAY_CODES as readonly string[]).includes(code));
}

export function commitmentAppliesOn(
  commitment: Pick<TrainingCommitment, 'date' | 'recurrence_rule'>,
  day: string
): boolean {
  if (commitment.date) {
    return commitment.date === day;
  }
  if (!commitment.recurrence_rule) {
    return false;
  }
  return parseRecurrenceWeekdays(commitment.recurrence_rule).includes(
    WEEKDAY_CODES[dayOfWeek(day)]
  );
}

export async function getCalendar(
  userId: string,
  query: TrainingCalendarQuery
): Promise<TrainingCalendarResponse> {
  if (compareDays(query.start_date, query.end_date) > 0) {
    throw new InvalidRangeError('start_date must not be after end_date.');
  }
  const span = daysBetween(query.start_date, query.end_date);
  if (Math.abs(span) + 1 > MAX_CALENDAR_DAYS) {
    throw new InvalidRangeError(
      `Calendar range must not exceed ${MAX_CALENDAR_DAYS} days.`
    );
  }

  const [sessions, commitments] = await Promise.all([
    trainingPlanRepository.listSessionsInRange(
      userId,
      query.start_date,
      query.end_date,
      query.plan_id
    ),
    trainingPlanRepository.listCommitments(userId, query.plan_id),
  ]);

  const days: TrainingCalendarDay[] = [];
  for (
    let day = query.start_date;
    compareDays(day, query.end_date) <= 0;
    day = addDays(day, 1)
  ) {
    days.push({
      date: day,
      sessions: sessions.filter((session) => session.scheduled_date === day),
      commitments: commitments.filter((commitment) =>
        commitmentAppliesOn(commitment, day)
      ),
    });
  }

  return { days };
}

/**
 * Marks a planned session skipped with the athlete's reason. The reason is
 * mirrored onto the completion row so the adherence history carries it too —
 * that is what the coach and the plan adjuster read when deciding whether the
 * plan was too hard or just badly timed.
 */
export async function skipSession(
  userId: string,
  planId: string,
  sessionId: string,
  reason: string
): Promise<TrainingPlanSession> {
  await requirePlan(userId, planId);
  const existing = await trainingPlanRepository.getSessionById(
    userId,
    sessionId
  );
  if (!existing || existing.plan_id !== planId) {
    throw new NotFoundError(`Training session ${sessionId} was not found.`);
  }

  const updated = await trainingPlanRepository.updateSessionStatus(
    userId,
    sessionId,
    'skipped',
    reason
  );
  if (!updated) {
    throw new NotFoundError(`Training session ${sessionId} was not found.`);
  }

  await trainingPlanRepository.upsertCompletion(userId, {
    plan_session_id: sessionId,
    skip_reason: reason,
    matched_by: 'manual',
  });
  return updated;
}

export async function rebuildSnapshot(
  userId: string,
  planId: string
): Promise<TrainingAthleteSnapshot> {
  await requirePlan(userId, planId);
  return trainingAthleteSnapshotService.rebuildSnapshot(userId, planId);
}

export async function getLatestSnapshot(
  userId: string,
  planId: string
): Promise<TrainingAthleteSnapshot | null> {
  await requirePlan(userId, planId);
  return trainingAthleteSnapshotService.getLatestSnapshot(userId, planId);
}

export async function getFeasibilityFlags(
  userId: string,
  planId: string
): Promise<{ plan_id: string; flags: string[] }> {
  const plan = await requirePlan(userId, planId);
  const [goals, snapshot] = await Promise.all([
    trainingPlanRepository.listGoals(userId, planId),
    trainingAthleteSnapshotService.getLatestSnapshot(userId, planId),
  ]);
  const flags = computeFeasibilityFlags({
    goals,
    snapshot: snapshot?.payload ?? null,
    startDate: plan.start_date,
    targetDate: plan.target_date,
  });
  return { plan_id: planId, flags };
}

export async function getPlanHealth(
  userId: string,
  planId: string
): Promise<import('@workspace/shared').TrainingPlanHealth> {
  await requirePlan(userId, planId);
  return computePlanHealth(userId, planId);
}

/**
 * Persists an AI-proposed block and refreshes the snapshot so the numbers the
 * next proposal reads include the block that was just committed.
 */
export async function confirmPlan(
  userId: string,
  request: TrainingPlanConfirmRequest
): Promise<TrainingPlanConfirmResponse> {
  const result = await confirmTrainingPlan(userId, request);
  await refreshSnapshot(userId, request.plan_id);
  return result;
}

export async function exportPlan(
  userId: string,
  planId: string
): Promise<TrainingPlanExportDocument> {
  const detail = await getPlanDetail(userId, planId);
  return {
    schema_version: TRAINING_PLAN_EXPORT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    plan: detail,
    goals: detail.goals,
    commitments: detail.commitments,
    sessions: detail.sessions ?? [],
  };
}

export async function importPlan(
  userId: string,
  request: TrainingPlanImportRequest
): Promise<TrainingPlanImportResponse> {
  const { document } = request;
  const sessionPayloads: TrainingPlanSessionPayload[] = document.sessions.map(
    (session, index) => ({
      scheduled_date: session.scheduled_date,
      session_type: session.session_type,
      status: 'planned',
      prescription: session.prescription,
      sort_order: session.sort_order ?? index,
    })
  );

  let planId = request.replace_plan_id;
  if (planId) {
    await requirePlan(userId, planId);
    await trainingPlanRepository.updatePlan(userId, planId, {
      name: document.plan.name,
      description: document.plan.description,
      sport_focus: document.plan.sport_focus,
      start_date: document.plan.start_date,
      target_date: document.plan.target_date,
      notes: document.plan.notes,
      status: request.activate ? 'active' : document.plan.status,
    });
  } else {
    const created = await createPlan(userId, {
      name: document.plan.name,
      description: document.plan.description,
      sport_focus: document.plan.sport_focus,
      start_date: document.plan.start_date,
      target_date: document.plan.target_date,
      notes: document.plan.notes,
      goals: [],
      commitments: [],
    });
    planId = created.id;
    if (request.activate) {
      await trainingPlanRepository.updatePlan(userId, planId, {
        status: 'active',
      });
    }
  }

  await trainingPlanRepository.replaceGoals(userId, planId, document.goals);
  await trainingPlanRepository.replaceCommitments(
    userId,
    planId,
    document.commitments
  );
  await trainingPlanRepository.replaceSessions(
    userId,
    planId,
    sessionPayloads,
    true
  );
  await refreshSnapshot(userId, planId);
  return { plan: await getPlanDetail(userId, planId) };
}

export default {
  listPlans,
  createPlan,
  getPlanDetail,
  updatePlan,
  deletePlan,
  replaceGoals,
  replaceCommitments,
  getCalendar,
  skipSession,
  rebuildSnapshot,
  getLatestSnapshot,
  confirmPlan,
  exportPlan,
  importPlan,
  commitmentAppliesOn,
  parseRecurrenceWeekdays,
};
