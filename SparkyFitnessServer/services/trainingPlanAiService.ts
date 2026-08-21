import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addDays,
  compareDays,
  trainingPlanProposeResponseSchema,
  type TrainingPlanAdjustRequest,
  type TrainingPlanConfirmRequest,
  type TrainingPlanConfirmResponse,
  type TrainingPlanProposeRequest,
  type TrainingPlanProposeResponse,
  type TrainingPlanSessionPayload,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type JsonSchemaNode,
} from '../ai/providerDispatch.js';
import trainingPlanRepository from '../models/trainingPlanRepository.js';
import trainingAthleteSnapshotService from './trainingAthleteSnapshotService.js';
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

// Re-exported so routes and services keep importing the training AI errors
// from one place even though they now live in the shared support module.
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

/**
 * `plan_id` is injected server-side rather than requested from the model — the
 * caller already named the plan, and a hallucinated uuid would fail validation.
 */
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
            properties: {
              title: { type: 'string' },
              distance_km: { type: 'number' },
              duration_minutes: { type: 'number' },
              pace_target: { type: 'string' },
              heart_rate_zone: { type: 'string' },
              notes: { type: 'string' },
            },
          },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
};

/**
 * Everything the planner needs in one compact JSON blob: the plan window, the
 * goals, the fixed commitments it must schedule around, and the rolling athlete
 * snapshot. Serialized rather than prose so the token cost stays predictable.
 */
async function buildPlanContext(
  userId: string,
  planId: string,
  userNotes: string | undefined,
  extras: Record<string, unknown> = {}
): Promise<string> {
  const plan = await trainingPlanRepository.getPlanById(userId, planId);
  if (!plan) {
    throw new NotFoundError(`Training plan ${planId} was not found.`);
  }

  const [goals, commitments] = await Promise.all([
    trainingPlanRepository.listGoals(userId, planId),
    trainingPlanRepository.listCommitments(userId, planId),
  ]);

  const snapshot =
    (await trainingAthleteSnapshotService.getLatestSnapshot(userId, planId)) ??
    (await trainingAthleteSnapshotService.rebuildSnapshot(userId, planId));

  const context = {
    plan: {
      name: plan.name,
      description: plan.description,
      sport_focus: plan.sport_focus,
      start_date: plan.start_date,
      target_date: plan.target_date,
      notes: plan.notes,
    },
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
    ...(userNotes ? { user_notes: userNotes } : {}),
    ...extras,
  };

  return JSON.stringify(context);
}

/**
 * One dispatch-validate-or-throw pass. Propose and adjust return the same
 * shape, so they differ only in the system prompt and the extra context.
 */
async function requestSessionBlock(
  label: string,
  systemPrompt: string,
  context: string,
  authenticatedUserId: string,
  planId: string,
  serviceConfigId: string | undefined,
  actorIsAdmin: boolean
): Promise<TrainingPlanProposeResponse> {
  const { provider, networkPolicy } = await loadProviderConfig(
    authenticatedUserId,
    serviceConfigId,
    actorIsAdmin
  );

  const result = await dispatchAiRequest({
    provider,
    networkPolicy,
    prompt: `${systemPrompt}\n\nPLAN_CONTEXT:\n${context}`,
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

  return parsed.data;
}

export async function proposeTrainingPlan(
  authenticatedUserId: string,
  actingUserId: string,
  request: TrainingPlanProposeRequest,
  actorIsAdmin = false
): Promise<TrainingPlanProposeResponse> {
  const context = await buildPlanContext(
    actingUserId,
    request.plan_id,
    request.user_notes
  );

  return requestSessionBlock(
    'propose',
    PROPOSE_PROMPT,
    context,
    authenticatedUserId,
    request.plan_id,
    request.service_config_id,
    actorIsAdmin
  );
}

/** Default adjustment horizon when the caller does not name a window. */
const DEFAULT_ADJUST_WINDOW_DAYS = 21;

/**
 * Re-plans the sessions still ahead of the athlete instead of the whole block.
 * The window defaults to the next three weeks and is clamped to the plan, so a
 * revision can never rewrite training that has already happened.
 */
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

  const context = await buildPlanContext(
    actingUserId,
    request.plan_id,
    request.user_notes,
    {
      adjust_window: { from_date: windowStart, to_date: windowEnd },
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
    ADJUST_PROMPT,
    context,
    authenticatedUserId,
    request.plan_id,
    request.service_config_id,
    actorIsAdmin
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

  if (request.activate && plan.status === 'draft') {
    await trainingPlanRepository.updatePlan(actingUserId, request.plan_id, {
      status: 'active',
    });
  }

  return {
    plan_id: request.plan_id,
    created_count: inserted.length,
    session_ids: inserted.map((session) => session.id),
  };
}

export default {
  proposeTrainingPlan,
  adjustTrainingPlan,
  confirmTrainingPlan,
};
