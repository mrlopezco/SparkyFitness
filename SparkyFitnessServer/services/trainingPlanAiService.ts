import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addDays,
  compareDays,
  daysBetween,
  trainingPlanProposeResponseSchema,
  type TrainingAthleteSnapshotPayload,
  type TrainingPlanAdjustRequest,
  type TrainingPlanConfirmRequest,
  type TrainingPlanConfirmResponse,
  type TrainingPlanProposeRequest,
  type TrainingPlanProposeResponse,
  type TrainingPlanProposedSession,
  type TrainingPlanSessionPayload,
  type TrainingSessionPrescription,
  type TrainingSessionType,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type JsonSchemaNode,
} from '../ai/providerDispatch.js';
import trainingPlanRepository from '../models/trainingPlanRepository.js';
import trainingPlanPlannerRepository from '../models/trainingPlanPlannerRepository.js';
import trainingAthleteSnapshotService from './trainingAthleteSnapshotService.js';
import trainingFitnessTestService from './trainingFitnessTestService.js';
import {
  outlineWeeksForChunk,
  requestTrainingPlanOutline,
} from './trainingPlanOutlineService.js';
import { computeFeasibilityFlags } from './trainingGoalFeasibilityService.js';
import { computePlanHealth } from './trainingPlanHealthService.js';
import {
  ConfirmFailedError,
  dispatchErrorToThrow,
  loadProviderConfig,
  NotFoundError,
  ProviderResponseError,
} from './trainingAiSupport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROPOSE_PROMPT = readFileSync(
  join(__dirname, '../prompts/training-plan-propose.md'),
  'utf8'
);
const ADJUST_PROMPT = readFileSync(
  join(__dirname, '../prompts/training-plan-adjust.md'),
  'utf8'
);

export {
  AiTrainingPlanDisabledError,
  ConfirmFailedError,
  NoAiServiceError,
  NotFoundError,
  PrivateNetworkAiUrlError,
  ProviderResponseError,
} from './trainingAiSupport.js';

const SESSION_TYPES = [
  'easy_run',
  'intervals',
  'tempo',
  'long_run',
  'rest',
  'strength',
  'cross_train',
  'race',
  'other',
];

const FITNESS_TEST_TYPES = [
  '5k_time_trial',
  '10k_time_trial',
  'cooper_12min',
  'mile_effort',
  'easy_aerobic_check',
  'custom',
];

const RUNNING_SESSION_TYPES = new Set<TrainingSessionType>([
  'easy_run',
  'intervals',
  'tempo',
  'long_run',
  'race',
]);

const PROPOSE_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'sessions'],
  properties: {
    summary: { type: 'string' },
    weekly_volume_notes: { type: 'string' },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'client_id',
          'scheduled_date',
          'session_type',
          'prescription',
        ],
        properties: {
          client_id: { type: 'string' },
          scheduled_date: { type: 'string' },
          session_type: { type: 'string', enum: SESSION_TYPES },
          prescription: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'instructions'],
            properties: {
              title: { type: 'string' },
              distance_km: { type: 'number' },
              duration_minutes: { type: 'number' },
              pace_target: { type: 'string' },
              heart_rate_zone: { type: 'string' },
              instructions: { type: 'string' },
              notes: { type: 'string' },
            },
          },
        },
      },
    },
    fitness_tests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['client_id', 'test_type', 'title', 'scheduled_date'],
        properties: {
          client_id: { type: 'string' },
          test_type: { type: 'string', enum: FITNESS_TEST_TYPES },
          title: { type: 'string' },
          scheduled_date: { type: 'string' },
          prescription: {
            type: 'object',
            additionalProperties: false,
            properties: {
              distance_km: { type: 'number' },
              duration_minutes: { type: 'number' },
              target_effort: { type: 'string' },
              instructions: { type: 'string' },
            },
          },
          due_interval_days: { type: 'integer' },
          notes: { type: 'string' },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
};

function formatPaceMinPerKm(pace: number | null | undefined): string | null {
  if (pace === null || pace === undefined || !Number.isFinite(pace)) {
    return null;
  }
  const totalSeconds = Math.round(pace * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')} /km`;
}

function defaultZoneForType(sessionType: TrainingSessionType): string {
  switch (sessionType) {
    case 'easy_run':
    case 'long_run':
      return 'Z2';
    case 'tempo':
      return 'Z3';
    case 'intervals':
    case 'race':
      return 'Z4–Z5';
    default:
      return 'Z2';
  }
}

function defaultPaceForType(
  sessionType: TrainingSessionType,
  science: TrainingAthleteSnapshotPayload['running_science'] | undefined
): string | null {
  if (!science) return null;
  if (sessionType === 'easy_run' || sessionType === 'long_run') {
    return formatPaceMinPerKm(science.estimated_easy_pace_min_per_km);
  }
  if (sessionType === 'tempo') {
    return formatPaceMinPerKm(science.estimated_tempo_pace_min_per_km);
  }
  if (sessionType === 'intervals' || sessionType === 'race') {
    return formatPaceMinPerKm(science.estimated_threshold_pace_min_per_km);
  }
  return null;
}

function buildTitle(
  sessionType: TrainingSessionType,
  prescription: TrainingSessionPrescription
): string {
  if (prescription.title?.trim()) return prescription.title.trim();
  if (sessionType === 'rest') return 'Rest';
  if (prescription.distance_km != null && prescription.distance_km > 0) {
    return `${prescription.distance_km} km`;
  }
  if (
    prescription.duration_minutes != null &&
    prescription.duration_minutes > 0
  ) {
    return `${prescription.duration_minutes} min`;
  }
  return sessionType.replace(/_/g, ' ');
}

function buildInstructions(
  sessionType: TrainingSessionType,
  prescription: TrainingSessionPrescription
): string {
  if (prescription.instructions?.trim()) {
    return prescription.instructions.trim();
  }
  if (sessionType === 'rest') {
    return 'Full rest or easy mobility only. No structured training.';
  }
  if (sessionType === 'strength' || sessionType === 'cross_train') {
    return 'Complete the strength or mobility block as written. Log sets and reps after.';
  }
  const parts: string[] = [];
  if (prescription.heart_rate_zone) {
    parts.push(`Stay in ${prescription.heart_rate_zone}.`);
  }
  if (prescription.pace_target) {
    parts.push(`Target pace ${prescription.pace_target}.`);
  }
  if (parts.length === 0) {
    parts.push(
      'Execute as prescribed; keep effort honest and stop if pain appears.'
    );
  }
  return parts.join(' ');
}

/**
 * Fills missing title / instructions / pace / HR when the model omits them,
 * using athlete snapshot paces when available.
 */
export function enrichProposedSessions(
  sessions: TrainingPlanProposedSession[],
  science: TrainingAthleteSnapshotPayload['running_science'] | undefined
): TrainingPlanProposedSession[] {
  return sessions.map((session) => {
    const prescription = { ...session.prescription };
    if (RUNNING_SESSION_TYPES.has(session.session_type)) {
      if (!prescription.heart_rate_zone?.trim()) {
        prescription.heart_rate_zone = defaultZoneForType(session.session_type);
      }
      if (!prescription.pace_target?.trim()) {
        const pace = defaultPaceForType(session.session_type, science);
        if (pace) prescription.pace_target = pace;
      }
    }
    prescription.title = buildTitle(session.session_type, prescription);
    prescription.instructions = buildInstructions(
      session.session_type,
      prescription
    );
    return { ...session, prescription };
  });
}

function coverageWarnings(
  sessions: TrainingPlanProposedSession[],
  startDate: string,
  endDate: string
): string[] {
  const warnings: string[] = [];
  const byDate = new Set(sessions.map((session) => session.scheduled_date));
  const expectedDays = daysBetween(startDate, endDate) + 1;
  if (byDate.size < expectedDays) {
    warnings.push(
      `Plan covers ${byDate.size} distinct days but the window ${startDate}..${endDate} has ${expectedDays} days. Review gaps before confirming.`
    );
  }
  return warnings;
}

interface CoverageRequirement {
  must_cover_every_day: boolean;
  inclusive_from: string;
  inclusive_to: string;
  expected_session_count: number;
}

function asCoverageRequirement(value: unknown): CoverageRequirement | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.inclusive_from !== 'string' ||
    typeof record.inclusive_to !== 'string' ||
    typeof record.expected_session_count !== 'number'
  ) {
    return null;
  }
  return {
    must_cover_every_day: record.must_cover_every_day !== false,
    inclusive_from: record.inclusive_from,
    inclusive_to: record.inclusive_to,
    expected_session_count: record.expected_session_count,
  };
}

/** Split a plan window into ~28-day chunks so the model can fill long blocks. */
export function buildProposeChunks(
  startDate: string,
  endDate: string,
  chunkDays = 28
): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = [];
  let cursor = startDate;
  while (compareDays(cursor, endDate) <= 0) {
    const tentativeEnd = addDays(cursor, chunkDays - 1);
    const chunkEnd =
      compareDays(tentativeEnd, endDate) > 0 ? endDate : tentativeEnd;
    chunks.push({ start: cursor, end: chunkEnd });
    cursor = addDays(chunkEnd, 1);
  }
  return chunks;
}

export async function buildPlanContext(
  userId: string,
  planId: string,
  userNotes: string | undefined,
  extras: Record<string, unknown> = {}
): Promise<{
  context: string;
  science: TrainingAthleteSnapshotPayload['running_science'] | undefined;
  startDate: string;
  endDate: string;
}> {
  const plan = await trainingPlanRepository.getPlanById(userId, planId);
  if (!plan) {
    throw new NotFoundError(`Training plan ${planId} was not found.`);
  }

  const [goals, commitments] = await Promise.all([
    trainingPlanRepository.listGoals(userId, planId),
    trainingPlanRepository.listCommitments(userId, planId),
  ]);

  const snapshot = await trainingAthleteSnapshotService.ensureFreshSnapshot(
    userId,
    planId
  );

  const dayCount = daysBetween(plan.start_date, plan.target_date) + 1;
  const coverageFromExtras = asCoverageRequirement(extras['coverage_requirement']);
  const coverage = coverageFromExtras ?? {
    must_cover_every_day: true,
    inclusive_from: plan.start_date,
    inclusive_to: plan.target_date,
    expected_session_count: dayCount,
  };

  const restExtras = { ...extras };
  delete restExtras['coverage_requirement'];

  const feasibility_flags = computeFeasibilityFlags({
    goals,
    snapshot: snapshot.payload,
    startDate: plan.start_date,
    targetDate: plan.target_date,
    outline:
      typeof restExtras['plan_outline'] === 'object' &&
      restExtras['plan_outline'] !== null &&
      !Array.isArray(restExtras['plan_outline']) &&
      Array.isArray(
        (restExtras['plan_outline'] as { weeks?: unknown }).weeks
      )
        ? (restExtras['plan_outline'] as import('@workspace/shared').TrainingPlanOutlineResponse)
        : null,
  });

  const plan_health = await computePlanHealth(userId, planId, snapshot.as_of_date);

  const plan_change_history =
    await trainingPlanPlannerRepository.listConfirmedChangeSummaries(
      userId,
      planId,
      12
    );

  const context = {
    plan: {
      name: plan.name,
      description: plan.description,
      sport_focus: plan.sport_focus,
      start_date: plan.start_date,
      target_date: plan.target_date,
      day_count: dayCount,
      notes: plan.notes,
      ...(plan.intake_payload ? { intake_payload: plan.intake_payload } : {}),
    },
    coverage_requirement: coverage,
    goals: goals.map((goal) => ({
      type: goal.type,
      title: goal.title,
      target_date: goal.target_date,
      race_distance_meters: goal.race_distance_meters,
      race_target_seconds: goal.race_target_seconds,
      weight_target_kg: goal.weight_target_kg,
      weight_delta_kg: goal.weight_delta_kg,
      notes: goal.notes,
    })),
    commitments: commitments.map((commitment) => ({
      title: commitment.title,
      activity_type: commitment.activity_type,
      intensity: commitment.intensity,
      date: commitment.date,
      recurrence_rule: commitment.recurrence_rule,
      start_time: commitment.start_time,
      duration_minutes: commitment.duration_minutes,
      blocks_training: commitment.blocks_training,
      notes: commitment.notes,
    })),
    athlete_snapshot: snapshot.payload,
    feasibility_flags,
    plan_health,
    ...(plan_change_history.length ? { plan_change_history } : {}),
    ...(userNotes ? { user_notes: userNotes } : {}),
    ...restExtras,
  };

  return {
    context: JSON.stringify(context),
    science: snapshot.payload.running_science,
    startDate: coverage.inclusive_from,
    endDate: coverage.inclusive_to,
  };
}

function proposeSystemPrompt(
  sportFocus: string,
  basePrompt: string
): string {
  if (sportFocus === 'cycling' || sportFocus === 'mixed') {
    return `${basePrompt}\n\nThe athlete sport_focus is "${sportFocus}". Balance running with cross_train and sport-appropriate work; do not schedule running on every non-rest day.`;
  }
  if (sportFocus === 'other') {
    return `${basePrompt}\n\nThe athlete sport_focus is "other". Honor goals and commitments over default running templates.`;
  }
  return basePrompt;
}

async function requestSessionBlock(
  label: string,
  systemPrompt: string,
  contextPayload: {
    context: string;
    science: TrainingAthleteSnapshotPayload['running_science'] | undefined;
    startDate: string;
    endDate: string;
  },
  authenticatedUserId: string,
  planId: string,
  serviceConfigId: string | undefined,
  actorIsAdmin: boolean,
  coverageStart?: string,
  coverageEnd?: string
): Promise<TrainingPlanProposeResponse> {
  const { provider, networkPolicy } = await loadProviderConfig(
    authenticatedUserId,
    serviceConfigId,
    actorIsAdmin
  );

  const result = await dispatchAiRequest({
    provider,
    networkPolicy,
    prompt: `${systemPrompt}\n\nPLAN_CONTEXT:\n${contextPayload.context}`,
    jsonSchema: PROPOSE_SCHEMA,
    schemaName: 'training_plan_propose',
    parseJson: true,
    temperature: 0.2,
  });

  if (!result.ok) {
    log(
      result.category === 'refused' || result.category === 'no_content'
        ? 'warn'
        : 'error',
      `Training plan ${label}: ${provider.service_type} failed for user ${authenticatedUserId} (${result.category}): ${result.detail}`
    );
    throw dispatchErrorToThrow(result.category, result.detail);
  }

  const candidate = {
    ...(result.json as Record<string, unknown>),
    plan_id: planId,
  };
  const parsed = trainingPlanProposeResponseSchema.safeParse(candidate);
  if (!parsed.success) {
    log(
      'warn',
      `Training plan ${label} returned an unusable plan for user ${authenticatedUserId}: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`
    );
    throw new ProviderResponseError(
      'AI returned a training plan that failed validation.'
    );
  }

  const enrichedSessions = enrichProposedSessions(
    parsed.data.sessions,
    contextPayload.science
  );
  const windowStart = coverageStart ?? contextPayload.startDate;
  const windowEnd = coverageEnd ?? contextPayload.endDate;
  const extraWarnings = coverageWarnings(
    enrichedSessions,
    windowStart,
    windowEnd
  );

  return {
    ...parsed.data,
    sessions: enrichedSessions,
    warnings: [...(parsed.data.warnings ?? []), ...extraWarnings],
  };
}

function cumulativeRunningKm(
  sessions: readonly TrainingPlanProposedSession[]
): number {
  let total = 0;
  for (const session of sessions) {
    if (session.session_type === 'rest') continue;
    const km = session.prescription.distance_km;
    if (km != null && km > 0) total += km;
  }
  return Math.round(total * 10) / 10;
}

export async function proposeTrainingPlan(
  authenticatedUserId: string,
  actingUserId: string,
  request: TrainingPlanProposeRequest,
  actorIsAdmin = false
): Promise<TrainingPlanProposeResponse> {
  const plan = await trainingPlanRepository.getPlanById(
    actingUserId,
    request.plan_id
  );
  if (!plan) {
    throw new NotFoundError(`Training plan ${request.plan_id} was not found.`);
  }

  // Long blocks exceed reliable single-shot generation; propose in ~28-day
  // chunks and merge so confirm can persist the full start→target window.
  const chunks = buildProposeChunks(plan.start_date, plan.target_date, 28);

  const outlineContext = await buildPlanContext(
    actingUserId,
    request.plan_id,
    request.user_notes,
    {
      coverage_requirement: {
        must_cover_every_day: true,
        inclusive_from: plan.start_date,
        inclusive_to: plan.target_date,
        expected_session_count:
          daysBetween(plan.start_date, plan.target_date) + 1,
      },
    }
  );

  let planOutline;
  try {
    planOutline = await requestTrainingPlanOutline(
      authenticatedUserId,
      outlineContext.context,
      request.service_config_id,
      actorIsAdmin
    );
  } catch (error) {
    log(
      'warn',
      `[trainingPlanAi] Outline generation failed for plan ${request.plan_id}; continuing without macro skeleton:`,
      error
    );
  }

  const mergedSessions: TrainingPlanProposedSession[] = [];
  const mergedFitnessTests: NonNullable<
    TrainingPlanProposeResponse['fitness_tests']
  > = [];
  const warnings: string[] = [];
  const summaryParts: string[] = [];
  const volumeParts: string[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]!;
    const expected = daysBetween(chunk.start, chunk.end) + 1;
    const chunkOutlineWeeks = planOutline
      ? outlineWeeksForChunk(planOutline, chunk.start, chunk.end)
      : [];
    const priorKm = cumulativeRunningKm(mergedSessions);
    const contextPayload = await buildPlanContext(
      actingUserId,
      request.plan_id,
      request.user_notes,
      {
        coverage_requirement: {
          must_cover_every_day: true,
          inclusive_from: chunk.start,
          inclusive_to: chunk.end,
          expected_session_count: expected,
        },
        ...(planOutline
          ? {
              plan_outline: {
                summary: planOutline.summary,
                weeks: chunkOutlineWeeks,
                fitness_test_dates: planOutline.fitness_test_dates,
                taper_start_date: planOutline.taper_start_date ?? null,
                warnings: planOutline.warnings,
              },
            }
          : {}),
        ...(priorKm > 0
          ? { prior_chunk_cumulative_km: priorKm }
          : {}),
        propose_chunk: {
          index: index + 1,
          total: chunks.length,
          from_date: chunk.start,
          to_date: chunk.end,
          instruction: `Generate ONLY the sessions for ${chunk.start} through ${chunk.end} inclusive (exactly ${expected} days). This is chunk ${index + 1} of ${chunks.length} for the full plan ${plan.start_date}..${plan.target_date}.`,
        },
      }
    );

    const part = await requestSessionBlock(
      `propose[${index + 1}/${chunks.length}]`,
      proposeSystemPrompt(plan.sport_focus, PROPOSE_PROMPT),
      contextPayload,
      authenticatedUserId,
      request.plan_id,
      request.service_config_id,
      actorIsAdmin,
      chunk.start,
      chunk.end
    );

    for (const session of part.sessions) {
      if (
        compareDays(session.scheduled_date, chunk.start) >= 0 &&
        compareDays(session.scheduled_date, chunk.end) <= 0
      ) {
        mergedSessions.push(session);
      }
    }
    for (const test of part.fitness_tests ?? []) {
      if (
        compareDays(test.scheduled_date, chunk.start) >= 0 &&
        compareDays(test.scheduled_date, chunk.end) <= 0
      ) {
        mergedFitnessTests.push(test);
      }
    }
    if (part.summary.trim()) summaryParts.push(part.summary.trim());
    if (part.weekly_volume_notes?.trim()) {
      volumeParts.push(part.weekly_volume_notes.trim());
    }
    warnings.push(...(part.warnings ?? []));
  }

  const fullWarnings = [
    ...(planOutline?.warnings ?? []),
    ...warnings,
    ...coverageWarnings(mergedSessions, plan.start_date, plan.target_date),
  ];

  const outlineSummary = planOutline?.summary?.trim();
  return {
    plan_id: request.plan_id,
    summary:
      [outlineSummary, ...summaryParts.filter(Boolean)].join(' ').trim() ||
      `Proposed ${mergedSessions.length} sessions from ${plan.start_date} to ${plan.target_date}.`,
    weekly_volume_notes: volumeParts.length ? volumeParts.join(' ') : null,
    sessions: mergedSessions,
    ...(mergedFitnessTests.length
      ? { fitness_tests: mergedFitnessTests }
      : {}),
    ...(fullWarnings.length ? { warnings: fullWarnings } : {}),
    ...(planOutline ? { plan_outline: planOutline } : {}),
  };
}

const DEFAULT_ADJUST_WINDOW_DAYS = 21;

export async function adjustTrainingPlan(
  authenticatedUserId: string,
  actingUserId: string,
  request: TrainingPlanAdjustRequest,
  actorIsAdmin = false
): Promise<TrainingPlanProposeResponse> {
  const plan = await trainingPlanRepository.getPlanById(
    actingUserId,
    request.plan_id
  );
  if (!plan) {
    throw new NotFoundError(`Training plan ${request.plan_id} was not found.`);
  }

  const requestedStart = request.from_date ?? plan.start_date;
  const requestedEnd =
    request.to_date ?? addDays(requestedStart, DEFAULT_ADJUST_WINDOW_DAYS);
  const windowStart =
    compareDays(requestedStart, plan.start_date) < 0
      ? plan.start_date
      : requestedStart;
  const windowEnd =
    compareDays(requestedEnd, plan.target_date) > 0
      ? plan.target_date
      : requestedEnd;

  if (compareDays(windowStart, windowEnd) > 0) {
    throw new ConfirmFailedError(
      `Adjustment window ${windowStart}..${windowEnd} falls outside the plan ${plan.start_date}..${plan.target_date}.`
    );
  }

  const existing = await trainingPlanRepository.listSessionsInRange(
    actingUserId,
    windowStart,
    windowEnd,
    request.plan_id
  );

  const contextPayload = await buildPlanContext(
    actingUserId,
    request.plan_id,
    request.user_notes,
    {
      adjust_window: {
        from_date: windowStart,
        to_date: windowEnd,
        day_count: daysBetween(windowStart, windowEnd) + 1,
      },
      current_sessions: existing.map((session) => ({
        scheduled_date: session.scheduled_date,
        session_type: session.session_type,
        status: session.status,
        skip_reason: session.skip_reason ?? null,
        prescription: session.prescription,
        adherence_score: session.completion?.adherence_score ?? null,
      })),
    }
  );

  return requestSessionBlock(
    'adjust',
    proposeSystemPrompt(plan.sport_focus, ADJUST_PROMPT),
    contextPayload,
    authenticatedUserId,
    request.plan_id,
    request.service_config_id,
    actorIsAdmin,
    windowStart,
    windowEnd
  );
}

export async function confirmTrainingPlan(
  actingUserId: string,
  request: TrainingPlanConfirmRequest
): Promise<TrainingPlanConfirmResponse> {
  const plan = await trainingPlanRepository.getPlanById(
    actingUserId,
    request.plan_id
  );
  if (!plan) {
    throw new NotFoundError(`Training plan ${request.plan_id} was not found.`);
  }

  const outOfWindow = request.sessions.filter(
    (session) =>
      session.scheduled_date < plan.start_date ||
      session.scheduled_date > plan.target_date
  );
  if (outOfWindow.length > 0) {
    throw new ConfirmFailedError(
      `${outOfWindow.length} session(s) fall outside the plan window ${plan.start_date}..${plan.target_date}.`
    );
  }

  const payloads: TrainingPlanSessionPayload[] = request.sessions.map(
    (session, index) => ({
      scheduled_date: session.scheduled_date,
      session_type: session.session_type,
      status: 'planned',
      prescription: session.prescription,
      sort_order: index,
    })
  );

  const inserted = await trainingPlanRepository.replaceSessions(
    actingUserId,
    request.plan_id,
    payloads,
    request.replace_existing
  );

  if (inserted.length !== payloads.length) {
    throw new ConfirmFailedError(
      `Only ${inserted.length} of ${payloads.length} sessions were saved.`
    );
  }

  const fitnessTestIds: string[] = [];
  for (const test of request.fitness_tests ?? []) {
    try {
      const created = await trainingFitnessTestService.scheduleTest(
        actingUserId,
        {
          plan_id: request.plan_id,
          test_type: test.test_type,
          title: test.title,
          scheduled_date: test.scheduled_date,
          prescription: test.prescription ?? {},
          source: 'coach',
          due_interval_days: test.due_interval_days ?? null,
          notes: test.notes ?? null,
        }
      );
      if (created) fitnessTestIds.push(created.id);
    } catch (error) {
      log(
        'warn',
        `[trainingPlanAi] Failed to schedule proposed fitness test '${test.title}' for plan ${request.plan_id}:`,
        error
      );
    }
  }

  if (request.activate && plan.status === 'draft') {
    await trainingPlanRepository.updatePlan(actingUserId, request.plan_id, {
      status: 'active',
    });
  }

  return {
    plan_id: request.plan_id,
    created_count: inserted.length,
    session_ids: inserted.map((session) => session.id),
    ...(fitnessTestIds.length ? { fitness_test_ids: fitnessTestIds } : {}),
  };
}

export default {
  proposeTrainingPlan,
  adjustTrainingPlan,
  confirmTrainingPlan,
  enrichProposedSessions,
  buildProposeChunks,
};
