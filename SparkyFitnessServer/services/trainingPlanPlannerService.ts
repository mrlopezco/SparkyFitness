import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addDays,
  compareDays,
  todayInZone,
  type TrainingPlanPlannerChatResponse,
  type TrainingPlanPlannerCreateSessionRequest,
  type TrainingPlanPlannerDraftRequest,
  type TrainingPlanPlannerMessage,
  type TrainingPlanPlannerMode,
  type TrainingPlanPlannerSendMessageRequest,
  type TrainingPlanPlannerSession,
  type TrainingPlanPlannerSessionDetail,
  type TrainingPlanProposeResponse,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type JsonSchemaNode,
} from '../ai/providerDispatch.js';
import trainingPlanRepository from '../models/trainingPlanRepository.js';
import trainingPlanPlannerRepository from '../models/trainingPlanPlannerRepository.js';
import {
  adjustTrainingPlan,
  buildPlanContext,
  proposeTrainingPlan,
} from './trainingPlanAiService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  ConfirmFailedError,
  dispatchErrorToThrow,
  loadProviderConfig,
  NotFoundError,
  ProviderResponseError,
} from './trainingAiSupport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLANNER_CHAT_PROMPT = readFileSync(
  join(__dirname, '../prompts/training-plan-planner-chat.md'),
  'utf8'
);
const CHANGE_SUMMARY_PROMPT = readFileSync(
  join(__dirname, '../prompts/training-plan-change-summary.md'),
  'utf8'
);

const NOTES_MAX = 7800;

const PLANNER_CHAT_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'ready_for_draft'],
  properties: {
    reply: { type: 'string' },
    ready_for_draft: { type: 'boolean' },
    /** YYYY-MM-DD when mode is adjust and ready_for_draft; omit or empty otherwise. */
    adjust_from: { type: 'string' },
    adjust_to: { type: 'string' },
  },
};

const CHANGE_SUMMARY_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  required: ['summary'],
  properties: {
    summary: { type: 'string' },
  },
};

export function openerForMode(
  mode: TrainingPlanPlannerMode,
  startDate: string,
  targetDate: string
): string {
  if (mode === 'generate') {
    return `I'll help you shape a full plan from ${startDate} through ${targetDate}. Tell me about your running background, how many days per week you can train, fixed commitments, injuries, and anything you want emphasized. When we're aligned, use **Draft proposal** to generate sessions for review.`;
  }
  return `Tell me what changed — missed workouts, fatigue, travel, or a niggle — and what you want the next stretch of training to look like. We'll agree on a date range to update, then use **Draft proposal** for revised sessions to confirm.`;
}

function renderTranscript(
  messages: readonly Pick<TrainingPlanPlannerMessage, 'role' | 'content'>[]
): string {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) =>
      message.role === 'user'
        ? `ATHLETE: ${message.content}`
        : `PLANNER: ${message.content}`
    )
    .join('\n');
}

/** Fold the planning thread into planner user_notes, trimming from the start if needed. */
export function conversationToPlannerNotes(
  mode: TrainingPlanPlannerMode,
  messages: readonly Pick<TrainingPlanPlannerMessage, 'role' | 'content'>[]
): string {
  const header = `[Planner mode: ${mode}]\nConversation (binding guidance for drafting sessions):\n`;
  const footer =
    '\n\nHonor constraints and preferences from this thread when generating sessions.';
  let body = renderTranscript(messages);
  const maxBody = NOTES_MAX - header.length - footer.length;
  if (body.length > maxBody) {
    body = `…(earlier turns omitted)\n${body.slice(body.length - maxBody)}`;
  }
  let notes = `${header}${body}${footer}`;
  if (notes.length > NOTES_MAX) {
    notes = notes.slice(0, NOTES_MAX - 20) + '\n…(truncated)';
  }
  return notes;
}

function parsePlannerTurn(json: unknown): TrainingPlanPlannerChatResponse | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  const reply = typeof root.reply === 'string' ? root.reply.trim() : '';
  if (!reply) return null;
  const ready_for_draft = root.ready_for_draft === true;
  const adjust_from =
    typeof root.adjust_from === 'string' && root.adjust_from.trim()
      ? root.adjust_from.trim()
      : undefined;
  const adjust_to =
    typeof root.adjust_to === 'string' && root.adjust_to.trim()
      ? root.adjust_to.trim()
      : undefined;
  return {
    reply,
    ready_for_draft,
    ...(adjust_from ? { adjust_from } : {}),
    ...(adjust_to ? { adjust_to } : {}),
  };
}

async function requirePlan(userId: string, planId: string) {
  const plan = await trainingPlanRepository.getPlanById(userId, planId);
  if (!plan) {
    throw new NotFoundError(`Training plan ${planId} was not found.`);
  }
  return plan;
}

async function requireActiveSession(
  userId: string,
  planId: string,
  sessionId: string
): Promise<TrainingPlanPlannerSession> {
  const session = await trainingPlanPlannerRepository.getSession(
    userId,
    sessionId
  );
  if (!session || session.plan_id !== planId) {
    throw new NotFoundError(`Planner session ${sessionId} was not found.`);
  }
  if (session.status !== 'active') {
    throw new ConfirmFailedError(
      `Planner session ${sessionId} is ${session.status}.`
    );
  }
  return session;
}

async function requestPlannerTurn(
  authenticatedUserId: string,
  actingUserId: string,
  planId: string,
  mode: TrainingPlanPlannerMode,
  messages: readonly TrainingPlanPlannerMessage[],
  serviceConfigId: string | undefined,
  actorIsAdmin: boolean
): Promise<TrainingPlanPlannerChatResponse> {
  const { provider, networkPolicy } = await loadProviderConfig(
    authenticatedUserId,
    serviceConfigId,
    actorIsAdmin
  );

  const { context } = await buildPlanContext(actingUserId, planId, undefined, {
    planner_mode: mode,
  });

  const result = await dispatchAiRequest({
    provider,
    networkPolicy,
    prompt: `${PLANNER_CHAT_PROMPT}\n\nPLANNER_MODE: ${mode}\n\nPLANNER_CONTEXT:\n${context}\n\nTRANSCRIPT:\n${renderTranscript(messages)}`,
    jsonSchema: PLANNER_CHAT_SCHEMA,
    schemaName: 'training_plan_planner_chat',
    parseJson: true,
    temperature: 0.45,
  });

  if (!result.ok) {
    log(
      result.category === 'refused' || result.category === 'no_content'
        ? 'warn'
        : 'error',
      `Training planner chat: ${provider.service_type} failed for user ${authenticatedUserId} (${result.category}): ${result.detail}`
    );
    throw dispatchErrorToThrow(result.category, result.detail);
  }

  const turn = parsePlannerTurn(result.json);
  if (!turn) {
    throw new ProviderResponseError('AI returned an unusable planner reply.');
  }
  return turn;
}

export async function createPlannerSession(
  userId: string,
  planId: string,
  request: TrainingPlanPlannerCreateSessionRequest
): Promise<TrainingPlanPlannerSessionDetail> {
  const plan = await requirePlan(userId, planId);
  const session = await trainingPlanPlannerRepository.createSession(
    userId,
    planId,
    request.mode
  );
  const opener = openerForMode(
    request.mode,
    plan.start_date,
    plan.target_date
  );
  const message = await trainingPlanPlannerRepository.insertMessage(
    userId,
    session.id,
    'assistant',
    opener
  );
  return { session, messages: [message] };
}

export async function listPlannerSessions(
  userId: string,
  planId: string,
  status?: TrainingPlanPlannerSession['status']
): Promise<TrainingPlanPlannerSession[]> {
  await requirePlan(userId, planId);
  return trainingPlanPlannerRepository.listSessions(userId, planId, {
    status,
  });
}

export async function getPlannerSessionDetail(
  userId: string,
  planId: string,
  sessionId: string
): Promise<TrainingPlanPlannerSessionDetail> {
  const session = await trainingPlanPlannerRepository.getSession(
    userId,
    sessionId
  );
  if (!session || session.plan_id !== planId) {
    throw new NotFoundError(`Planner session ${sessionId} was not found.`);
  }
  const messages = await trainingPlanPlannerRepository.listMessages(
    userId,
    sessionId
  );
  return { session, messages };
}

export async function cancelPlannerSession(
  userId: string,
  planId: string,
  sessionId: string
): Promise<void> {
  await requireActiveSession(userId, planId, sessionId);
  await trainingPlanPlannerRepository.markSessionCancelled(userId, sessionId);
}

export async function sendPlannerSessionMessage(
  authenticatedUserId: string,
  actingUserId: string,
  planId: string,
  sessionId: string,
  request: TrainingPlanPlannerSendMessageRequest,
  actorIsAdmin = false
): Promise<TrainingPlanPlannerChatResponse & { assistant_message_id: string }> {
  const session = await requireActiveSession(
    actingUserId,
    planId,
    sessionId
  );

  await trainingPlanPlannerRepository.insertMessage(
    actingUserId,
    sessionId,
    'user',
    request.content
  );

  const history = await trainingPlanPlannerRepository.listMessages(
    actingUserId,
    sessionId
  );

  const turn = await requestPlannerTurn(
    authenticatedUserId,
    actingUserId,
    planId,
    session.mode,
    history,
    request.service_config_id,
    actorIsAdmin
  );

  const assistantMessage = await trainingPlanPlannerRepository.insertMessage(
    actingUserId,
    sessionId,
    'assistant',
    turn.reply
  );

  if (session.mode === 'adjust' && turn.adjust_from && turn.adjust_to) {
    await trainingPlanPlannerRepository.updateSessionAdjustWindow(
      actingUserId,
      sessionId,
      turn.adjust_from,
      turn.adjust_to
    );
  }

  return { ...turn, assistant_message_id: assistantMessage.id! };
}

export async function draftPlannerSession(
  authenticatedUserId: string,
  actingUserId: string,
  planId: string,
  sessionId: string,
  options: {
    service_config_id?: string;
    replace_existing?: boolean;
  },
  actorIsAdmin = false
): Promise<TrainingPlanProposeResponse> {
  const session = await requireActiveSession(
    actingUserId,
    planId,
    sessionId
  );
  const messages = await trainingPlanPlannerRepository.listMessages(
    actingUserId,
    sessionId
  );

  const chatMessages = messages
    .filter(
      (message) => message.role === 'user' || message.role === 'assistant'
    )
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));

  const draftRequest: TrainingPlanPlannerDraftRequest = {
    plan_id: planId,
    mode: session.mode,
    messages: chatMessages,
    service_config_id: options.service_config_id,
    replace_existing: options.replace_existing ?? true,
    ...(session.mode === 'adjust' && session.adjust_from
      ? {
          from_date: session.adjust_from,
          to_date: session.adjust_to ?? addDays(session.adjust_from, 6),
        }
      : {}),
  };

  return plannerDraft(
    authenticatedUserId,
    actingUserId,
    draftRequest,
    actorIsAdmin
  );
}

export async function plannerDraft(
  authenticatedUserId: string,
  actingUserId: string,
  request: TrainingPlanPlannerDraftRequest,
  actorIsAdmin = false
): Promise<TrainingPlanProposeResponse> {
  const plan = await requirePlan(actingUserId, request.plan_id);
  const user_notes = conversationToPlannerNotes(request.mode, request.messages);

  if (request.mode === 'generate') {
    return proposeTrainingPlan(
      authenticatedUserId,
      actingUserId,
      {
        plan_id: request.plan_id,
        service_config_id: request.service_config_id,
        user_notes,
        replace_existing: request.replace_existing,
      },
      actorIsAdmin
    );
  }

  const tz = await loadUserTimezone(actingUserId);
  const today = todayInZone(tz);
  const from_date = request.from_date ?? today;
  const to_date = request.to_date ?? addDays(from_date, 6);

  if (
    compareDays(from_date, plan.start_date) < 0 ||
    compareDays(to_date, plan.target_date) > 0
  ) {
    throw new ConfirmFailedError(
      `Adjustment window must stay within ${plan.start_date}..${plan.target_date}.`
    );
  }

  return adjustTrainingPlan(
    authenticatedUserId,
    actingUserId,
    {
      plan_id: request.plan_id,
      service_config_id: request.service_config_id,
      user_notes,
      from_date,
      to_date,
      replace_existing: request.replace_existing,
    },
    actorIsAdmin
  );
}

export async function recordPlannerSessionConfirmed(
  authenticatedUserId: string,
  actingUserId: string,
  planId: string,
  sessionId: string,
  input: {
    proposal_summary: string;
    sessions_written: number;
    service_config_id?: string;
  },
  actorIsAdmin = false
): Promise<TrainingPlanPlannerSession | null> {
  const session = await trainingPlanPlannerRepository.getSession(
    actingUserId,
    sessionId
  );
  if (!session || session.plan_id !== planId || session.status !== 'active') {
    return null;
  }

  const messages = await trainingPlanPlannerRepository.listMessages(
    actingUserId,
    sessionId
  );

  let summary = input.proposal_summary.trim();
  try {
    const { provider, networkPolicy } = await loadProviderConfig(
      authenticatedUserId,
      input.service_config_id,
      actorIsAdmin
    );
    const payload = {
      mode: session.mode,
      adjust_from: session.adjust_from,
      adjust_to: session.adjust_to,
      proposal_summary: input.proposal_summary,
      sessions_written: input.sessions_written,
      transcript: renderTranscript(messages),
    };
    const result = await dispatchAiRequest({
      provider,
      networkPolicy,
      prompt: `${CHANGE_SUMMARY_PROMPT}\n\n${JSON.stringify(payload)}`,
      jsonSchema: CHANGE_SUMMARY_SCHEMA,
      schemaName: 'training_plan_change_summary',
      parseJson: true,
      temperature: 0.3,
    });
    if (
      result.ok &&
      result.json &&
      typeof result.json === 'object' &&
      typeof (result.json as { summary?: unknown }).summary === 'string'
    ) {
      const aiSummary = (result.json as { summary: string }).summary.trim();
      if (aiSummary) summary = aiSummary;
    }
  } catch (error) {
    log(
      'warn',
      `[trainingPlanPlanner] Change summary AI failed for session ${sessionId}:`,
      error
    );
  }

  return trainingPlanPlannerRepository.markSessionConfirmed(
    actingUserId,
    sessionId,
    summary
  );
}

export default {
  createPlannerSession,
  listPlannerSessions,
  getPlannerSessionDetail,
  cancelPlannerSession,
  sendPlannerSessionMessage,
  draftPlannerSession,
  plannerDraft,
  recordPlannerSessionConfirmed,
  conversationToPlannerNotes,
  openerForMode,
};
