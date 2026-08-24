import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addDays,
  todayInZone,
  trainingFitnessTestCreateRequestSchema,
  trainingPlanProposeResponseSchema,
  type TrainingCoachCreateSessionRequest,
  type TrainingCoachMemory,
  type TrainingCoachMemoryUpsert,
  type TrainingCoachMessage,
  type TrainingCoachSendMessageRequest,
  type TrainingCoachSendMessageResponse,
  type TrainingCoachSession,
  type TrainingCoachSessionSummary,
  type TrainingPlanProposeResponse,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type JsonSchemaNode,
} from '../ai/providerDispatch.js';
import trainingCoachRepository from '../models/trainingCoachRepository.js';
import trainingPlanRepository from '../models/trainingPlanRepository.js';
import trainingAthleteSnapshotService from './trainingAthleteSnapshotService.js';
import trainingCoachingSignalRepository from '../models/trainingCoachingSignalRepository.js';
import trainingFitnessTestService from './trainingFitnessTestService.js';
import { computeFeasibilityFlags } from './trainingGoalFeasibilityService.js';
import { computePlanHealth } from './trainingPlanHealthService.js';
import {
  adjustTrainingPlan,
  proposeTrainingPlan,
} from './trainingPlanAiService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  dispatchErrorToThrow,
  loadProviderConfig,
  NotFoundError,
  ProviderResponseError,
} from './trainingAiSupport.js';

/**
 * The conversational half of the fork Training Plan domain. A coach turn is a
 * single structured AI call: the athlete's message plus a compact context blob,
 * answered with a reply and optional side effects (durable memories, a
 * scheduled fitness test) that this service — not the model — applies.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const COACH_PROMPT = readFileSync(
  join(__dirname, '../prompts/training-coach.md'),
  'utf8'
);

// Re-exported so callers import every training AI error from one place.
export {
  AiTrainingPlanDisabledError,
  NoAiServiceError,
  NotFoundError,
  PrivateNetworkAiUrlError,
  ProviderResponseError,
} from './trainingAiSupport.js';

/** How far ahead the coach sees planned sessions and fixed commitments. */
const LOOKAHEAD_DAYS = 14;

/** How far back the coach reads adherence: last week's actual training. */
const LOOKBACK_DAYS = 7;

/** Transcript slice sent with each turn; older turns ride on the summary. */
const TRANSCRIPT_MESSAGE_LIMIT = 20;

/** Cap on memories written in one turn, so a runaway reply cannot spam the table. */
const MAX_MEMORIES_PER_TURN = 5;

/** Messages folded into an extractive summary when no AI summary is available. */
const FALLBACK_SUMMARY_MESSAGE_COUNT = 6;

const FITNESS_TEST_TYPES = [
  '5k_time_trial',
  '10k_time_trial',
  'cooper_12min',
  'mile_effort',
  'easy_aerobic_check',
  'custom',
];

const COACH_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  required: ['reply'],
  properties: {
    reply: { type: 'string' },
    memories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['memory_key', 'memory_value'],
        properties: {
          memory_key: { type: 'string' },
          memory_value: { type: 'string' },
        },
      },
    },
    schedule_fitness_test: {
      type: 'object',
      additionalProperties: false,
      required: ['test_type', 'title', 'scheduled_date'],
      properties: {
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
      },
    },
    ask_skip_for_session_id: { type: 'string' },
    propose_plan_adjustment: {
      type: 'object',
      additionalProperties: false,
      properties: {
        user_notes: { type: 'string' },
        from_date: { type: 'string' },
        to_date: { type: 'string' },
      },
    },
    propose_full_plan: {
      type: 'object',
      additionalProperties: false,
      properties: {
        user_notes: { type: 'string' },
      },
    },
  },
};

const SUMMARY_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  required: ['summary'],
  properties: { summary: { type: 'string' } },
};

interface CoachTurn {
  reply: string;
  memories: TrainingCoachMemoryUpsert[];
  scheduleFitnessTest: Record<string, unknown> | null;
  askSkipForSessionId: string | null;
  proposePlanAdjustment: Record<string, unknown> | null;
  proposeFullPlan: Record<string, unknown> | boolean | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Reads the model's answer defensively: only `reply` is required, and each
 * side effect is dropped individually when malformed. A coach reply is still
 * useful when the memory it tried to write was garbage.
 */
export function parseCoachTurn(json: unknown): CoachTurn | null {
  const root = asRecord(json);
  if (!root) return null;
  const reply = asNonEmptyString(root.reply);
  if (!reply) return null;

  const memories: TrainingCoachMemoryUpsert[] = [];
  if (Array.isArray(root.memories)) {
    for (const raw of root.memories.slice(0, MAX_MEMORIES_PER_TURN)) {
      const entry = asRecord(raw);
      if (!entry) continue;
      const key = asNonEmptyString(entry.memory_key);
      const value = asNonEmptyString(entry.memory_value);
      if (!key || !value) continue;
      memories.push({
        memory_key: key.slice(0, 120),
        memory_value: value.slice(0, 2000),
        source: 'coach',
      });
    }
  }

  return {
    reply,
    memories,
    scheduleFitnessTest: asRecord(root.schedule_fitness_test),
    askSkipForSessionId: asNonEmptyString(root.ask_skip_for_session_id),
    proposePlanAdjustment: asRecord(root.propose_plan_adjustment),
    proposeFullPlan:
      root.propose_full_plan === true
        ? true
        : asRecord(root.propose_full_plan),
  };
}

async function requirePlan(userId: string, planId: string) {
  const plan = await trainingPlanRepository.getPlanById(userId, planId);
  if (!plan) {
    throw new NotFoundError(`Training plan ${planId} was not found.`);
  }
  return plan;
}

async function requireSession(
  userId: string,
  planId: string,
  sessionId: string
): Promise<TrainingCoachSession> {
  const session = await trainingCoachRepository.getSession(userId, sessionId);
  if (!session || session.plan_id !== planId) {
    throw new NotFoundError(`Coach session ${sessionId} was not found.`);
  }
  return session;
}

/**
 * Everything the coach needs about the athlete in one compact JSON blob:
 * what they are training for, what is coming up, what they actually did last
 * week, and what the coach already knows about them.
 */
async function buildCoachContext(
  userId: string,
  planId: string,
  sessionId: string
): Promise<string> {
  const plan = await requirePlan(userId, planId);
  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);
  const lookbackStart = addDays(today, -LOOKBACK_DAYS);
  const lookaheadEnd = addDays(today, LOOKAHEAD_DAYS);

  const [
    goals,
    commitments,
    upcoming,
    recent,
    memories,
    summary,
    fitnessTests,
  ] = await Promise.all([
    trainingPlanRepository.listGoals(userId, planId),
    trainingPlanRepository.listCommitments(userId, planId),
    trainingPlanRepository.listSessionsInRange(
      userId,
      today,
      lookaheadEnd,
      planId
    ),
    trainingPlanRepository.listSessionsInRange(
      userId,
      lookbackStart,
      addDays(today, -1),
      planId
    ),
    trainingCoachRepository.listMemories(userId, planId),
    trainingCoachRepository.getSummary(userId, sessionId),
    trainingFitnessTestService.listTests(userId, { planId, limit: 5 }),
  ]);

  const snapshot = await trainingAthleteSnapshotService.ensureFreshSnapshot(
    userId,
    planId
  );

  const plan_health = await computePlanHealth(userId, planId, today);

  const feasibility_flags = computeFeasibilityFlags({
    goals,
    snapshot: snapshot.payload,
    startDate: plan.start_date,
    targetDate: plan.target_date,
  });

  const coaching_signals =
    await trainingCoachingSignalRepository.listRecentCoachingSignals(
      userId,
      planId,
      5
    );

  const context = {
    today,
    plan: {
      name: plan.name,
      sport_focus: plan.sport_focus,
      start_date: plan.start_date,
      target_date: plan.target_date,
      status: plan.status,
      ...(plan.intake_payload ? { intake_payload: plan.intake_payload } : {}),
    },
    goals: goals.map((goal) => ({
      type: goal.type,
      title: goal.title,
      target_date: goal.target_date,
      race_distance_meters: goal.race_distance_meters,
      race_target_seconds: goal.race_target_seconds,
      weight_target_kg: goal.weight_target_kg,
      weight_delta_kg: goal.weight_delta_kg,
    })),
    commitments: commitments.map((commitment) => ({
      title: commitment.title,
      activity_type: commitment.activity_type,
      intensity: commitment.intensity,
      date: commitment.date,
      recurrence_rule: commitment.recurrence_rule,
      blocks_training: commitment.blocks_training,
    })),
    upcoming_sessions: upcoming.map((session) => ({
      id: session.id,
      scheduled_date: session.scheduled_date,
      session_type: session.session_type,
      status: session.status,
      prescription: session.prescription,
    })),
    last_week_adherence: recent.map((session) => ({
      id: session.id,
      scheduled_date: session.scheduled_date,
      session_type: session.session_type,
      status: session.status,
      skip_reason: session.skip_reason ?? null,
      adherence_score: session.completion?.adherence_score ?? null,
    })),
    athlete_snapshot: snapshot.payload,
    feasibility_flags,
    plan_health,
    coaching_signals,
    memories: memories.map((memory) => ({
      memory_key: memory.memory_key,
      memory_value: memory.memory_value,
    })),
    recent_fitness_tests: fitnessTests.map((test) => ({
      id: test.id,
      test_type: test.test_type,
      title: test.title,
      scheduled_date: test.scheduled_date,
      status: test.status,
    })),
    ...(summary ? { conversation_summary: summary.summary } : {}),
  };

  return JSON.stringify(context);
}

function renderTranscript(messages: readonly TrainingCoachMessage[]): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n');
}

export async function createSession(
  userId: string,
  planId: string,
  request: TrainingCoachCreateSessionRequest
): Promise<{
  session: TrainingCoachSession;
  messages: TrainingCoachMessage[];
}> {
  await requirePlan(userId, planId);
  const session = await trainingCoachRepository.createSession(
    userId,
    planId,
    request.title ?? null
  );

  const messages: TrainingCoachMessage[] = [];
  if (request.opening_brief) {
    messages.push(
      await trainingCoachRepository.insertMessage(
        userId,
        session.id,
        'system',
        request.opening_brief
      )
    );
  }
  return { session, messages };
}

export async function listSessions(
  userId: string,
  planId: string
): Promise<TrainingCoachSession[]> {
  await requirePlan(userId, planId);
  return trainingCoachRepository.listSessions(userId, planId);
}

export interface CoachSessionDetail {
  session: TrainingCoachSession;
  messages: TrainingCoachMessage[];
  summary: TrainingCoachSessionSummary | null;
}

export async function getSessionDetail(
  userId: string,
  planId: string,
  sessionId: string
): Promise<CoachSessionDetail> {
  const session = await requireSession(userId, planId, sessionId);
  const [messages, summary] = await Promise.all([
    trainingCoachRepository.listMessages(userId, sessionId, 200),
    trainingCoachRepository.getSummary(userId, sessionId),
  ]);
  return { session, messages, summary };
}

/**
 * Applies the side effects the coach asked for. Each is independent and
 * failure-tolerant: a rejected fitness test must not lose the athlete's reply,
 * which is already persisted by the time this runs.
 */
async function applySideEffects(
  userId: string,
  planId: string,
  turn: CoachTurn
): Promise<{ memoriesAdded: number; scheduledTestIds: string[] }> {
  let memoriesAdded = 0;
  for (const memory of turn.memories) {
    try {
      await trainingCoachRepository.upsertMemory(userId, planId, memory);
      memoriesAdded += 1;
    } catch (error) {
      log(
        'warn',
        `[trainingCoach] Failed to store memory '${memory.memory_key}' for user ${userId}:`,
        error
      );
    }
  }

  const scheduledTestIds: string[] = [];
  if (turn.scheduleFitnessTest) {
    const parsed = trainingFitnessTestCreateRequestSchema.safeParse({
      ...turn.scheduleFitnessTest,
      plan_id: planId,
      source: 'coach',
    });
    if (!parsed.success) {
      log(
        'warn',
        `[trainingCoach] Discarded an unusable fitness test for user ${userId}: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`
      );
    } else {
      try {
        const test = await trainingFitnessTestService.scheduleTest(
          userId,
          parsed.data
        );
        if (test) scheduledTestIds.push(test.id);
      } catch (error) {
        log(
          'warn',
          `[trainingCoach] Failed to schedule a fitness test for user ${userId}:`,
          error
        );
      }
    }
  }

  return { memoriesAdded, scheduledTestIds };
}

/**
 * One coach turn. The athlete's message is persisted before the provider call
 * so a provider failure never silently drops what they typed.
 */
export async function sendMessage(
  authenticatedUserId: string,
  actingUserId: string,
  planId: string,
  sessionId: string,
  request: TrainingCoachSendMessageRequest,
  actorIsAdmin = false
): Promise<TrainingCoachSendMessageResponse> {
  const session = await requireSession(actingUserId, planId, sessionId);
  if (session.status === 'closed') {
    throw new NotFoundError(`Coach session ${sessionId} is closed.`);
  }

  const { provider, networkPolicy } = await loadProviderConfig(
    authenticatedUserId,
    request.service_config_id,
    actorIsAdmin
  );

  const userMessage = await trainingCoachRepository.insertMessage(
    actingUserId,
    sessionId,
    'user',
    request.content
  );

  const [context, history] = await Promise.all([
    buildCoachContext(actingUserId, planId, sessionId),
    trainingCoachRepository.listMessages(
      actingUserId,
      sessionId,
      TRANSCRIPT_MESSAGE_LIMIT
    ),
  ]);

  const result = await dispatchAiRequest({
    provider,
    networkPolicy,
    prompt: `${COACH_PROMPT}\n\nCOACH_CONTEXT:\n${context}\n\nTRANSCRIPT:\n${renderTranscript(history)}`,
    jsonSchema: COACH_SCHEMA,
    schemaName: 'training_coach_turn',
    parseJson: true,
    temperature: 0.4,
  });

  if (!result.ok) {
    log(
      result.category === 'refused' || result.category === 'no_content'
        ? 'warn'
        : 'error',
      `Training coach: ${provider.service_type} failed for user ${authenticatedUserId} (${result.category}): ${result.detail}`
    );
    throw dispatchErrorToThrow(result.category, result.detail);
  }

  const turn = parseCoachTurn(result.json);
  if (!turn) {
    log(
      'warn',
      `Training coach returned an unusable reply for user ${authenticatedUserId}.`
    );
    throw new ProviderResponseError('AI returned an unusable coach reply.');
  }

  // Only offer the skip prompt for a session the athlete actually owns; the
  // model can hallucinate an id, and the client would render a dead action.
  const askSkipSession = turn.askSkipForSessionId
    ? await trainingPlanRepository.getSessionById(
        actingUserId,
        turn.askSkipForSessionId
      )
    : null;

  const assistantMessage = await trainingCoachRepository.insertMessage(
    actingUserId,
    sessionId,
    'assistant',
    turn.reply,
    askSkipSession ? { ask_skip_for_session_id: askSkipSession.id } : null
  );

  const { memoriesAdded, scheduledTestIds } = await applySideEffects(
    actingUserId,
    planId,
    turn
  );

  let planProposal: TrainingPlanProposeResponse | undefined;
  try {
    if (turn.proposeFullPlan) {
      const notes =
        turn.proposeFullPlan === true
          ? request.content
          : (asNonEmptyString(turn.proposeFullPlan.user_notes) ??
            request.content);
      planProposal = await proposeTrainingPlan(
        authenticatedUserId,
        actingUserId,
        {
          plan_id: planId,
          user_notes: notes,
          replace_existing: true,
          service_config_id: request.service_config_id,
        },
        actorIsAdmin
      );
    } else if (turn.proposePlanAdjustment) {
      const notes =
        asNonEmptyString(turn.proposePlanAdjustment.user_notes) ??
        request.content;
      planProposal = await adjustTrainingPlan(
        authenticatedUserId,
        actingUserId,
        {
          plan_id: planId,
          user_notes: notes,
          from_date: asNonEmptyString(turn.proposePlanAdjustment.from_date) ?? undefined,
          to_date: asNonEmptyString(turn.proposePlanAdjustment.to_date) ?? undefined,
          replace_existing: true,
          service_config_id: request.service_config_id,
        },
        actorIsAdmin
      );
    }
    if (planProposal) {
      const parsed = trainingPlanProposeResponseSchema.safeParse(planProposal);
      if (!parsed.success) {
        log(
          'warn',
          `[trainingCoach] Discarded an unusable plan proposal for user ${actingUserId}`
        );
        planProposal = undefined;
      } else {
        planProposal = parsed.data;
      }
    }
  } catch (error) {
    log(
      'warn',
      `[trainingCoach] Plan proposal side effect failed for user ${actingUserId}:`,
      error
    );
  }

  return {
    user_message: userMessage,
    assistant_message: assistantMessage,
    ...(scheduledTestIds.length
      ? { scheduled_fitness_test_ids: scheduledTestIds }
      : {}),
    ...(memoriesAdded ? { memories_added: memoriesAdded } : {}),
    ...(planProposal ? { plan_proposal: planProposal } : {}),
  };
}

/**
 * Last resort when no AI summary is available: the newest exchanges verbatim.
 * A truncated transcript is a worse summary than a model would write but a far
 * better one than nothing, and the next session still gets the context.
 */
export function buildExtractiveSummary(
  messages: readonly TrainingCoachMessage[]
): string {
  const relevant = messages
    .filter((message) => message.role !== 'system')
    .slice(-FALLBACK_SUMMARY_MESSAGE_COUNT);
  if (relevant.length === 0) {
    return 'No conversation took place in this session.';
  }
  return relevant
    .map(
      (message) =>
        `${message.role === 'user' ? 'Athlete' : 'Coach'}: ${message.content.slice(0, 400)}`
    )
    .join('\n');
}

/**
 * Closes a session and leaves behind a summary, which is what a later session
 * reads instead of the whole transcript. A provider failure downgrades to the
 * extractive summary rather than blocking the close.
 */
export async function closeSession(
  authenticatedUserId: string,
  actingUserId: string,
  planId: string,
  sessionId: string,
  serviceConfigId?: string,
  actorIsAdmin = false
): Promise<{
  session: TrainingCoachSession;
  summary: TrainingCoachSessionSummary;
}> {
  await requireSession(actingUserId, planId, sessionId);
  const messages = await trainingCoachRepository.listMessages(
    actingUserId,
    sessionId,
    200
  );

  let summaryText: string | null = null;
  try {
    const { provider, networkPolicy } = await loadProviderConfig(
      authenticatedUserId,
      serviceConfigId,
      actorIsAdmin
    );
    const result = await dispatchAiRequest({
      provider,
      networkPolicy,
      prompt:
        'Summarize this coaching conversation in at most 6 sentences for the coach to read at the start of the next session. Keep decisions, constraints, injuries, and agreed next steps. Drop small talk. Output ONLY JSON matching the schema.' +
        `\n\nTRANSCRIPT:\n${renderTranscript(messages)}`,
      jsonSchema: SUMMARY_SCHEMA,
      schemaName: 'training_coach_summary',
      parseJson: true,
      temperature: 0.2,
    });
    if (result.ok) {
      summaryText = asNonEmptyString(asRecord(result.json)?.summary);
    } else {
      log(
        'warn',
        `[trainingCoach] Summary generation failed for session ${sessionId} (${result.category}); falling back to an extractive summary.`
      );
    }
  } catch (error) {
    log(
      'warn',
      `[trainingCoach] Summary generation unavailable for session ${sessionId}; falling back to an extractive summary:`,
      error
    );
  }

  const summaryBody = summaryText ?? buildExtractiveSummary(messages);
  const summary = await trainingCoachRepository.upsertSummary(
    actingUserId,
    sessionId,
    summaryBody,
    Math.ceil(summaryBody.length / 4)
  );
  const closed = await trainingCoachRepository.closeSession(
    actingUserId,
    sessionId
  );
  if (!closed) {
    throw new NotFoundError(`Coach session ${sessionId} was not found.`);
  }

  return { session: closed, summary };
}

export async function listMemories(
  userId: string,
  planId: string
): Promise<TrainingCoachMemory[]> {
  await requirePlan(userId, planId);
  return trainingCoachRepository.listMemories(userId, planId);
}

export async function upsertMemory(
  userId: string,
  planId: string,
  memory: TrainingCoachMemoryUpsert
): Promise<TrainingCoachMemory> {
  await requirePlan(userId, planId);
  return trainingCoachRepository.upsertMemory(userId, planId, {
    ...memory,
    source: memory.source ?? 'user',
  });
}

export async function deleteMemory(
  userId: string,
  planId: string,
  memoryKey: string
): Promise<void> {
  await requirePlan(userId, planId);
  const deleted = await trainingCoachRepository.deleteMemory(
    userId,
    planId,
    memoryKey
  );
  if (!deleted) {
    throw new NotFoundError(`Coach memory '${memoryKey}' was not found.`);
  }
}

export default {
  createSession,
  listSessions,
  getSessionDetail,
  sendMessage,
  closeSession,
  listMemories,
  upsertMemory,
  deleteMemory,
  parseCoachTurn,
  buildExtractiveSummary,
};
