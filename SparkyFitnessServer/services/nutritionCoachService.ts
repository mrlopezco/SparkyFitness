import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  NutritionCoachCreateSessionRequest,
  NutritionCoachMemory,
  NutritionCoachMemoryUpsert,
  NutritionCoachMessage,
  NutritionCoachSendMessageRequest,
  NutritionCoachSendMessageResponse,
  NutritionCoachSession,
  NutritionCoachSessionDetail,
  NutritionCoachSessionSummary,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type JsonSchemaNode,
} from '../ai/providerDispatch.js';
import nutritionCoachRepository from '../models/nutritionCoachRepository.js';
import trainingPlanRepository from '../models/trainingPlanRepository.js';
import nutritionCoachContextService, {
  metricsFromPayload,
} from './nutritionCoachContextService.js';
import {
  dispatchErrorToThrow,
  loadProviderConfig,
  NotFoundError,
  ProviderResponseError,
} from './trainingAiSupport.js';
import { buildExtractiveSummary } from './trainingCoachService.js';

export {
  NoAiServiceError,
  NotFoundError,
  PrivateNetworkAiUrlError,
  ProviderResponseError,
} from './trainingAiSupport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COACH_PROMPT = readFileSync(
  join(__dirname, '../prompts/nutrition-coach.md'),
  'utf8'
);

const TRANSCRIPT_MESSAGE_LIMIT = 20;
const MAX_MEMORIES_PER_TURN = 5;

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
  },
};

const SUMMARY_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  required: ['summary'],
  properties: { summary: { type: 'string' } },
};

interface NutritionTurn {
  reply: string;
  memories: NutritionCoachMemoryUpsert[];
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

export function parseNutritionCoachTurn(json: unknown): NutritionTurn | null {
  const root = asRecord(json);
  if (!root) return null;
  const reply = asNonEmptyString(root.reply);
  if (!reply) return null;

  const memories: NutritionCoachMemoryUpsert[] = [];
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

  return { reply, memories };
}

function renderTranscript(messages: readonly NutritionCoachMessage[]): string {
  return messages
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n');
}

async function resolveContextPlanId(
  userId: string,
  sessionPlanId: string | null
): Promise<string | null> {
  if (sessionPlanId) {
    const plan = await trainingPlanRepository.getPlanById(
      userId,
      sessionPlanId
    );
    if (plan?.status === 'active') return sessionPlanId;
  }
  const plans = await trainingPlanRepository.listPlans(userId);
  const active = plans.find((plan) => plan.status === 'active');
  return active?.id ?? sessionPlanId;
}

async function buildNutritionContext(
  userId: string,
  sessionId: string,
  sessionPlanId: string | null
): Promise<string> {
  const planId = await resolveContextPlanId(userId, sessionPlanId);
  const payload = await nutritionCoachContextService.ensureFreshContextSnapshot(
    userId,
    planId
  );
  const currentMetrics = metricsFromPayload(payload);

  const [memories, sessionSummary, lastClosed, lastClosedSummary] =
    await Promise.all([
      nutritionCoachRepository.listMemories(userId),
      nutritionCoachRepository.getSummary(userId, sessionId),
      nutritionCoachRepository.getLatestClosedSession(userId),
      nutritionCoachRepository.getSummaryForLatestClosedSession(userId),
    ]);

  const baseline = lastClosed?.metrics_at_close ?? null;
  const sinceIso = lastClosed?.closed_at ?? lastClosed?.created_at ?? null;
  const commitmentsSince = sinceIso
    ? await nutritionCoachRepository.listMemoriesUpdatedSince(userId, sinceIso)
    : [];

  const progress_since_last_check_in =
    nutritionCoachContextService.computeProgressSinceLastCheckIn(
      baseline ?? undefined,
      lastClosed?.id ?? null,
      lastClosed?.closed_at ?? null,
      currentMetrics,
      commitmentsSince
    );

  const context = {
    nutrition_snapshot: payload,
    memories: memories.map((memory) => ({
      memory_key: memory.memory_key,
      memory_value: memory.memory_value,
      source: memory.source,
    })),
    conversation_summary: sessionSummary?.summary ?? null,
    last_closed_session_summary: lastClosedSummary?.summary.summary ?? null,
    progress_since_last_check_in,
  };

  return JSON.stringify(context);
}

async function requireSession(
  userId: string,
  sessionId: string
): Promise<NutritionCoachSession> {
  const session = await nutritionCoachRepository.getSession(userId, sessionId);
  if (!session) {
    throw new NotFoundError(`Nutrition coach session ${sessionId} was not found.`);
  }
  return session;
}

export async function createSession(
  userId: string,
  request: NutritionCoachCreateSessionRequest
): Promise<NutritionCoachSession> {
  let planId: string | null = request.plan_id ?? null;
  if (planId) {
    const plan = await trainingPlanRepository.getPlanById(userId, planId);
    if (!plan) {
      throw new NotFoundError(`Training plan ${planId} was not found.`);
    }
  }
  return nutritionCoachRepository.createSession(
    userId,
    planId,
    request.title ?? null
  );
}

export async function listSessions(
  userId: string
): Promise<NutritionCoachSession[]> {
  return nutritionCoachRepository.listSessions(userId);
}

export async function getSessionDetail(
  userId: string,
  sessionId: string
): Promise<NutritionCoachSessionDetail> {
  const session = await requireSession(userId, sessionId);
  const [messages, summary] = await Promise.all([
    nutritionCoachRepository.listMessages(userId, sessionId, 200),
    nutritionCoachRepository.getSummary(userId, sessionId),
  ]);
  return {
    session,
    messages,
    ...(summary ? { summary } : {}),
  };
}

export async function sendMessage(
  authenticatedUserId: string,
  actingUserId: string,
  sessionId: string,
  request: NutritionCoachSendMessageRequest,
  actorIsAdmin = false
): Promise<NutritionCoachSendMessageResponse> {
  const session = await requireSession(actingUserId, sessionId);
  if (session.status === 'closed') {
    throw new NotFoundError(`Nutrition coach session ${sessionId} is closed.`);
  }

  const { provider, networkPolicy } = await loadProviderConfig(
    authenticatedUserId,
    request.service_config_id,
    actorIsAdmin
  );

  const userMessage = await nutritionCoachRepository.insertMessage(
    actingUserId,
    sessionId,
    'user',
    request.content
  );

  const [context, history] = await Promise.all([
    buildNutritionContext(actingUserId, sessionId, session.plan_id),
    nutritionCoachRepository.listMessages(
      actingUserId,
      sessionId,
      TRANSCRIPT_MESSAGE_LIMIT
    ),
  ]);

  const result = await dispatchAiRequest({
    provider,
    networkPolicy,
    prompt: `${COACH_PROMPT}\n\nNUTRITION_CONTEXT:\n${context}\n\nTRANSCRIPT:\n${renderTranscript(history)}`,
    jsonSchema: COACH_SCHEMA,
    schemaName: 'nutrition_coach_turn',
    parseJson: true,
    temperature: 0.4,
  });

  if (!result.ok) {
    log(
      result.category === 'refused' || result.category === 'no_content'
        ? 'warn'
        : 'error',
      `Nutrition coach: ${provider.service_type} failed for user ${authenticatedUserId} (${result.category}): ${result.detail}`
    );
    throw dispatchErrorToThrow(result.category, result.detail);
  }

  const turn = parseNutritionCoachTurn(result.json);
  if (!turn) {
    throw new ProviderResponseError('AI returned an unusable nutrition coach reply.');
  }

  let memoriesAdded = 0;
  for (const memory of turn.memories) {
    await nutritionCoachRepository.upsertMemory(actingUserId, memory);
    memoriesAdded += 1;
  }

  const assistantMessage = await nutritionCoachRepository.insertMessage(
    actingUserId,
    sessionId,
    'assistant',
    turn.reply
  );

  return {
    user_message: userMessage,
    assistant_message: assistantMessage,
    ...(memoriesAdded ? { memories_added: memoriesAdded } : {}),
  };
}

export async function closeSession(
  authenticatedUserId: string,
  actingUserId: string,
  sessionId: string,
  serviceConfigId?: string,
  actorIsAdmin = false
): Promise<{
  session: NutritionCoachSession;
  summary: NutritionCoachSessionSummary;
}> {
  const session = await requireSession(actingUserId, sessionId);
  const messages = await nutritionCoachRepository.listMessages(
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
        'Summarize this nutrition coaching conversation in at most 6 sentences for the coach to read at the start of the next check-in. Keep commitments, constraints, and agreed behavior changes. Drop small talk. Output ONLY JSON matching the schema.' +
        `\n\nTRANSCRIPT:\n${renderTranscript(messages)}`,
      jsonSchema: SUMMARY_SCHEMA,
      schemaName: 'nutrition_coach_summary',
      parseJson: true,
      temperature: 0.2,
    });
    if (result.ok) {
      summaryText = asNonEmptyString(asRecord(result.json)?.summary);
    }
  } catch (error) {
    log(
      'warn',
      `[nutritionCoach] Summary generation unavailable for session ${sessionId}:`,
      error
    );
  }

  const summaryBody =
    summaryText ??
    buildExtractiveSummary(messages as unknown as NutritionCoachMessage[]);

  const summary = await nutritionCoachRepository.upsertSummary(
    actingUserId,
    sessionId,
    summaryBody,
    Math.ceil(summaryBody.length / 4)
  );

  const planId = await resolveContextPlanId(actingUserId, session.plan_id);
  const payload = await nutritionCoachContextService.ensureFreshContextSnapshot(
    actingUserId,
    planId
  );
  const metricsAtClose = metricsFromPayload(payload);

  const closed = await nutritionCoachRepository.closeSession(
    actingUserId,
    sessionId,
    metricsAtClose
  );
  if (!closed) {
    throw new NotFoundError(`Nutrition coach session ${sessionId} was not found.`);
  }

  return { session: closed, summary };
}

export async function listMemories(
  userId: string
): Promise<NutritionCoachMemory[]> {
  return nutritionCoachRepository.listMemories(userId);
}

export async function upsertMemory(
  userId: string,
  memory: NutritionCoachMemoryUpsert
): Promise<NutritionCoachMemory> {
  return nutritionCoachRepository.upsertMemory(userId, memory);
}

export async function deleteMemory(
  userId: string,
  memoryId: string
): Promise<boolean> {
  return nutritionCoachRepository.deleteMemory(userId, memoryId);
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
  parseNutritionCoachTurn,
};
