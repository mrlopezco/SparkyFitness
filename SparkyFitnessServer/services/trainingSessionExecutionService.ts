import {
  type TrainingSessionAiReviewRequest,
  type TrainingSessionAiReviewResponse,
  type TrainingSessionCompletion,
  type TrainingSessionReportExecutionRequest,
  type TrainingSessionReportExecutionResponse,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type JsonSchemaNode,
} from '../ai/providerDispatch.js';
import trainingPlanRepository from '../models/trainingPlanRepository.js';
import {
  dispatchErrorToThrow,
  loadProviderConfig,
  NotFoundError,
  ProviderResponseError,
} from './trainingAiSupport.js';

const REVIEW_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  required: ['ai_review'],
  properties: {
    ai_review: { type: 'string' },
  },
};

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

async function requirePlanSession(
  userId: string,
  planId: string,
  sessionId: string
) {
  const session = await trainingPlanRepository.getSessionWithCompletion(
    userId,
    sessionId
  );
  if (!session || session.plan_id !== planId) {
    throw new NotFoundError(`Training session ${sessionId} was not found.`);
  }
  return session;
}

/**
 * Athlete-reported execution (done / partial + score + notes). Optionally runs
 * an AI review using a linked Garmin/diary entry when present, otherwise notes.
 */
export async function reportExecution(
  authenticatedUserId: string,
  actingUserId: string,
  planId: string,
  sessionId: string,
  request: TrainingSessionReportExecutionRequest,
  actorIsAdmin = false
): Promise<TrainingSessionReportExecutionResponse> {
  const existing = await requirePlanSession(actingUserId, planId, sessionId);

  const updated = await trainingPlanRepository.updateSessionStatus(
    actingUserId,
    sessionId,
    request.status
  );
  if (!updated) {
    throw new NotFoundError(`Training session ${sessionId} was not found.`);
  }

  let completion = await trainingPlanRepository.upsertCompletion(actingUserId, {
    plan_session_id: sessionId,
    athlete_execution_score: request.execution_score ?? null,
    notes: request.notes ?? null,
    matched_by: 'manual',
    exercise_entry_id: existing.completion?.exercise_entry_id ?? null,
    adherence_score: existing.completion?.adherence_score ?? null,
    ai_review: existing.completion?.ai_review ?? null,
  });

  if (request.request_ai_review) {
    const reviewed = await generateAiReview(
      authenticatedUserId,
      actingUserId,
      planId,
      sessionId,
      { service_config_id: request.service_config_id },
      actorIsAdmin
    );
    completion = reviewed.completion;
  }

  return { session: updated, completion };
}

export async function generateAiReview(
  authenticatedUserId: string,
  actingUserId: string,
  planId: string,
  sessionId: string,
  request: TrainingSessionAiReviewRequest,
  actorIsAdmin = false
): Promise<TrainingSessionAiReviewResponse> {
  const session = await requirePlanSession(actingUserId, planId, sessionId);
  const { provider, networkPolicy } = await loadProviderConfig(
    authenticatedUserId,
    request.service_config_id,
    actorIsAdmin
  );

  const context = {
    planned: {
      scheduled_date: session.scheduled_date,
      session_type: session.session_type,
      prescription: session.prescription,
      status: session.status,
    },
    athlete_report: {
      execution_score: session.completion?.athlete_execution_score ?? null,
      notes: session.completion?.notes ?? null,
      adherence_score: session.completion?.adherence_score ?? null,
      matched_by: session.completion?.matched_by ?? null,
      has_linked_activity: !!session.completion?.exercise_entry_id,
    },
  };

  const result = await dispatchAiRequest({
    provider,
    networkPolicy,
    prompt:
      'You are a running coach reviewing one workout for SparkyFitness. Compare the planned prescription to the athlete report and any matched activity signal. If no watch/activity was linked, review from the athlete notes and score only — do not invent Garmin data. Write 2-5 short sentences. Output ONLY JSON matching the schema.\n\n' +
      JSON.stringify(context),
    jsonSchema: REVIEW_SCHEMA,
    schemaName: 'training_session_ai_review',
    parseJson: true,
    temperature: 0.3,
  });

  if (!result.ok) {
    log(
      result.category === 'refused' || result.category === 'no_content'
        ? 'warn'
        : 'error',
      `Training session AI review failed for user ${authenticatedUserId} (${result.category}): ${result.detail}`
    );
    throw dispatchErrorToThrow(result.category, result.detail);
  }

  const aiReview = asNonEmptyString(asRecord(result.json)?.ai_review);
  if (!aiReview) {
    throw new ProviderResponseError('AI returned an unusable session review.');
  }

  const completion: TrainingSessionCompletion =
    await trainingPlanRepository.upsertCompletion(actingUserId, {
      plan_session_id: sessionId,
      ai_review: aiReview,
      matched_by: session.completion?.matched_by ?? 'ai',
      notes: session.completion?.notes ?? null,
      athlete_execution_score:
        session.completion?.athlete_execution_score ?? null,
      adherence_score: session.completion?.adherence_score ?? null,
      exercise_entry_id: session.completion?.exercise_entry_id ?? null,
    });

  return { completion, ai_review: aiReview };
}

export default {
  reportExecution,
  generateAiReview,
};
