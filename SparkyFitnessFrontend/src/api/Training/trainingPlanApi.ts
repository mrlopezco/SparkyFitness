import { z } from 'zod';
import {
  trainingAdherenceMatchRequestSchema,
  trainingAdherenceMatchResponseSchema,
  trainingAthleteSnapshotPayloadSchema,
  trainingAthleteSnapshotSchema,
  trainingCalendarQuerySchema,
  trainingCalendarResponseSchema,
  trainingCoachCreateSessionRequestSchema,
  trainingCoachMemorySchema,
  trainingCoachMemoryUpsertSchema,
  trainingCoachMessageSchema,
  trainingCoachSendMessageRequestSchema,
  trainingCoachSendMessageResponseSchema,
  trainingCoachSessionSchema,
  trainingCoachSessionSummarySchema,
  trainingCommitmentPayloadSchema,
  trainingCommitmentSchema,
  trainingFitnessTestCreateRequestSchema,
  trainingFitnessTestReportRequestSchema,
  trainingFitnessTestSchema,
  trainingGoalPayloadSchema,
  trainingGoalSchema,
  trainingPlanAdjustRequestSchema,
  trainingPlanConfirmRequestSchema,
  trainingPlanConfirmResponseSchema,
  trainingPlanCreateRequestSchema,
  trainingPlanDetailSchema,
  trainingPlanProposeRequestSchema,
  trainingPlanProposeResponseSchema,
  trainingPlanSchema,
  trainingPlanSessionSchema,
  trainingPlanUpdateRequestSchema,
  trainingSessionSkipRequestSchema,
  trainingSessionReportExecutionRequestSchema,
  trainingSessionReportExecutionResponseSchema,
  trainingSessionAiReviewRequestSchema,
  trainingSessionAiReviewResponseSchema,
  trainingPlanExportDocumentSchema,
  trainingPlanImportRequestSchema,
  trainingPlanImportResponseSchema,
  type TrainingAdherenceMatchRequest,
  type TrainingAdherenceMatchResponse,
  type TrainingAthleteSnapshot,
  type TrainingAthleteSnapshotPayload,
  type TrainingCalendarQuery,
  type TrainingCalendarResponse,
  type TrainingCoachCreateSessionRequest,
  type TrainingCoachMemory,
  type TrainingCoachMemoryUpsert,
  type TrainingCoachMessage,
  type TrainingCoachSendMessageRequest,
  type TrainingCoachSendMessageResponse,
  type TrainingCoachSession,
  type TrainingCoachSessionSummary,
  type TrainingCommitment,
  type TrainingCommitmentPayload,
  type TrainingFitnessTest,
  type TrainingFitnessTestCreateRequest,
  type TrainingFitnessTestReportRequest,
  type TrainingGoal,
  type TrainingGoalPayload,
  type TrainingPlan,
  type TrainingPlanAdjustRequest,
  type TrainingPlanConfirmRequest,
  type TrainingPlanConfirmResponse,
  type TrainingPlanCreateRequest,
  type TrainingPlanDetail,
  type TrainingPlanExportDocument,
  type TrainingPlanImportRequest,
  type TrainingPlanImportResponse,
  type TrainingPlanProposeRequest,
  type TrainingPlanProposeResponse,
  type TrainingPlanSession,
  type TrainingPlanUpdateRequest,
  type TrainingSessionAiReviewRequest,
  type TrainingSessionAiReviewResponse,
  type TrainingSessionReportExecutionRequest,
  type TrainingSessionReportExecutionResponse,
  type TrainingSessionSkipRequest,
} from '@workspace/shared';
import { apiCall } from '../api';

const trainingPlanListResponseSchema = z.object({
  plans: z.array(trainingPlanSchema),
});
const trainingGoalsResponseSchema = z.object({
  goals: z.array(trainingGoalSchema),
});
const trainingCommitmentsResponseSchema = z.object({
  commitments: z.array(trainingCommitmentSchema),
});

/**
 * Training routes wrap collections under a named key (`{ goals: [...] }`) but
 * return single resources bare. These helpers read the wrapped form when it is
 * there and fall back to the bare payload, so a route that skips the envelope
 * still parses instead of throwing at the user.
 */
function unwrapEnvelope(response: unknown, key: string): unknown {
  if (
    response &&
    typeof response === 'object' &&
    !Array.isArray(response) &&
    key in response
  ) {
    return (response as Record<string, unknown>)[key];
  }
  return response;
}

function parseCollection<T>(
  response: unknown,
  key: string,
  item: z.ZodType<T>
): T[] {
  const payload = unwrapEnvelope(response, key);
  return z.array(item).parse(payload ?? []);
}

export async function listTrainingPlans(): Promise<TrainingPlan[]> {
  const response = await apiCall('/training-plans', { method: 'GET' });
  return trainingPlanListResponseSchema.parse(response).plans;
}

export async function getTrainingPlan(
  planId: string
): Promise<TrainingPlanDetail> {
  const response = await apiCall(`/training-plans/${planId}`, {
    method: 'GET',
  });
  return trainingPlanDetailSchema.parse(response);
}

export async function createTrainingPlan(
  payload: TrainingPlanCreateRequest
): Promise<TrainingPlanDetail> {
  const validatedRequest = trainingPlanCreateRequestSchema.parse(payload);
  const response = await apiCall('/training-plans', {
    method: 'POST',
    body: validatedRequest,
  });
  return trainingPlanDetailSchema.parse(response);
}

export async function updateTrainingPlan(
  planId: string,
  payload: TrainingPlanUpdateRequest
): Promise<TrainingPlan> {
  const validatedRequest = trainingPlanUpdateRequestSchema.parse(payload);
  const response = await apiCall(`/training-plans/${planId}`, {
    method: 'PATCH',
    body: validatedRequest,
  });
  return trainingPlanSchema.parse(response);
}

export async function deleteTrainingPlan(planId: string): Promise<void> {
  await apiCall(`/training-plans/${planId}`, { method: 'DELETE' });
}

export async function saveTrainingGoals(
  planId: string,
  goals: TrainingGoalPayload[]
): Promise<TrainingGoal[]> {
  const validatedGoals = z.array(trainingGoalPayloadSchema).parse(goals);
  const response = await apiCall(`/training-plans/${planId}/goals`, {
    method: 'POST',
    body: { goals: validatedGoals },
  });
  return trainingGoalsResponseSchema.parse(response).goals;
}

export async function saveTrainingCommitments(
  planId: string,
  commitments: TrainingCommitmentPayload[]
): Promise<TrainingCommitment[]> {
  const validatedCommitments = z
    .array(trainingCommitmentPayloadSchema)
    .parse(commitments);
  const response = await apiCall(`/training-plans/${planId}/commitments`, {
    method: 'POST',
    body: { commitments: validatedCommitments },
  });
  return trainingCommitmentsResponseSchema.parse(response).commitments;
}

export async function getTrainingCalendar(
  query: TrainingCalendarQuery
): Promise<TrainingCalendarResponse> {
  const validatedQuery = trainingCalendarQuerySchema.parse(query);
  const response = await apiCall('/training-plans/calendar', {
    method: 'GET',
    params: {
      start_date: validatedQuery.start_date,
      end_date: validatedQuery.end_date,
      plan_id: validatedQuery.plan_id,
    },
  });
  return trainingCalendarResponseSchema.parse(response);
}

/**
 * The server computes the athlete metrics; the client only asks for a window
 * (`as_of_date` + `window_days`), which is a valid subset of the payload shape.
 */
export async function createAthleteSnapshot(
  planId: string,
  payload: TrainingAthleteSnapshotPayload
): Promise<TrainingAthleteSnapshot> {
  const validatedRequest = trainingAthleteSnapshotPayloadSchema.parse(payload);
  const response = await apiCall(`/training-plans/${planId}/snapshots`, {
    method: 'POST',
    body: validatedRequest,
  });
  return trainingAthleteSnapshotSchema.parse(response);
}

export async function getLatestAthleteSnapshot(
  planId: string
): Promise<TrainingAthleteSnapshot | null> {
  const response = await apiCall(`/training-plans/${planId}/snapshots/latest`, {
    method: 'GET',
    suppress404Toast: true,
  });
  const snapshot = unwrapEnvelope(response, 'snapshot');
  if (!snapshot) return null;
  return trainingAthleteSnapshotSchema.parse(snapshot);
}

export async function proposeTrainingPlan(
  payload: TrainingPlanProposeRequest
): Promise<TrainingPlanProposeResponse> {
  const validatedRequest = trainingPlanProposeRequestSchema.parse(payload);
  const response = await apiCall('/training-plans/ai/propose', {
    method: 'POST',
    body: validatedRequest,
  });
  return trainingPlanProposeResponseSchema.parse(response);
}

export async function confirmTrainingPlan(
  payload: TrainingPlanConfirmRequest
): Promise<TrainingPlanConfirmResponse> {
  const validatedRequest = trainingPlanConfirmRequestSchema.parse(payload);
  const response = await apiCall('/training-plans/ai/confirm', {
    method: 'POST',
    body: validatedRequest,
  });
  return trainingPlanConfirmResponseSchema.parse(response);
}

export async function matchTrainingAdherence(
  payload: TrainingAdherenceMatchRequest
): Promise<TrainingAdherenceMatchResponse> {
  const validatedRequest = trainingAdherenceMatchRequestSchema.parse(payload);
  const response = await apiCall('/training-plans/adherence/match', {
    method: 'POST',
    body: validatedRequest,
  });
  return trainingAdherenceMatchResponseSchema.parse(response);
}

export async function skipTrainingSession(
  planId: string,
  sessionId: string,
  payload: TrainingSessionSkipRequest
): Promise<TrainingPlanSession> {
  const validatedRequest = trainingSessionSkipRequestSchema.parse(payload);
  const response = await apiCall(
    `/training-plans/${planId}/sessions/${sessionId}/skip`,
    { method: 'POST', body: validatedRequest }
  );
  return trainingPlanSessionSchema.parse(unwrapEnvelope(response, 'session'));
}

export async function reportTrainingSessionExecution(
  planId: string,
  sessionId: string,
  payload: TrainingSessionReportExecutionRequest
): Promise<TrainingSessionReportExecutionResponse> {
  const validatedRequest =
    trainingSessionReportExecutionRequestSchema.parse(payload);
  const response = await apiCall(
    `/training-plans/${planId}/sessions/${sessionId}/report-execution`,
    { method: 'POST', body: validatedRequest }
  );
  return trainingSessionReportExecutionResponseSchema.parse(response);
}

export async function reviewTrainingSessionExecution(
  planId: string,
  sessionId: string,
  payload: TrainingSessionAiReviewRequest = {}
): Promise<TrainingSessionAiReviewResponse> {
  const validatedRequest = trainingSessionAiReviewRequestSchema.parse(payload);
  const response = await apiCall(
    `/training-plans/${planId}/sessions/${sessionId}/ai-review`,
    { method: 'POST', body: validatedRequest }
  );
  return trainingSessionAiReviewResponseSchema.parse(response);
}

export async function adjustTrainingPlan(
  payload: TrainingPlanAdjustRequest
): Promise<TrainingPlanProposeResponse> {
  const validatedRequest = trainingPlanAdjustRequestSchema.parse(payload);
  const response = await apiCall('/training-plans/ai/adjust', {
    method: 'POST',
    body: validatedRequest,
  });
  return trainingPlanProposeResponseSchema.parse(response);
}

export async function exportTrainingPlan(
  planId: string
): Promise<TrainingPlanExportDocument> {
  const response = await apiCall(`/training-plans/${planId}/export`, {
    method: 'GET',
  });
  return trainingPlanExportDocumentSchema.parse(response);
}

export async function importTrainingPlan(
  payload: TrainingPlanImportRequest
): Promise<TrainingPlanImportResponse> {
  const validatedRequest = trainingPlanImportRequestSchema.parse(payload);
  const response = await apiCall('/training-plans/import', {
    method: 'POST',
    body: validatedRequest,
  });
  return trainingPlanImportResponseSchema.parse(response);
}

// --- Coach conversations ---

export interface TrainingCoachSessionDetail {
  session: TrainingCoachSession;
  messages: TrainingCoachMessage[];
  summary: TrainingCoachSessionSummary | null;
}

export async function listCoachSessions(
  planId: string
): Promise<TrainingCoachSession[]> {
  const response = await apiCall(`/training-plans/${planId}/coach/sessions`, {
    method: 'GET',
  });
  return parseCollection(response, 'sessions', trainingCoachSessionSchema);
}

export async function createCoachSession(
  planId: string,
  payload: TrainingCoachCreateSessionRequest
): Promise<TrainingCoachSession> {
  const validatedRequest =
    trainingCoachCreateSessionRequestSchema.parse(payload);
  const response = await apiCall(`/training-plans/${planId}/coach/sessions`, {
    method: 'POST',
    body: validatedRequest,
  });
  return trainingCoachSessionSchema.parse(unwrapEnvelope(response, 'session'));
}

export async function getCoachSession(
  planId: string,
  sessionId: string
): Promise<TrainingCoachSessionDetail> {
  const response = await apiCall(
    `/training-plans/${planId}/coach/sessions/${sessionId}`,
    { method: 'GET' }
  );
  return {
    session: trainingCoachSessionSchema.parse(
      unwrapEnvelope(response, 'session')
    ),
    messages: parseCollection(response, 'messages', trainingCoachMessageSchema),
    summary: trainingCoachSessionSummarySchema
      .nullable()
      .parse(unwrapEnvelope(response, 'summary') ?? null),
  };
}

export async function sendCoachMessage(
  planId: string,
  sessionId: string,
  payload: TrainingCoachSendMessageRequest
): Promise<TrainingCoachSendMessageResponse> {
  const validatedRequest = trainingCoachSendMessageRequestSchema.parse(payload);
  const response = await apiCall(
    `/training-plans/${planId}/coach/sessions/${sessionId}/messages`,
    { method: 'POST', body: validatedRequest }
  );
  return trainingCoachSendMessageResponseSchema.parse(response);
}

export async function closeCoachSession(
  planId: string,
  sessionId: string
): Promise<TrainingCoachSession> {
  const response = await apiCall(
    `/training-plans/${planId}/coach/sessions/${sessionId}/close`,
    { method: 'POST' }
  );
  return trainingCoachSessionSchema.parse(unwrapEnvelope(response, 'session'));
}

export async function listCoachMemories(
  planId: string
): Promise<TrainingCoachMemory[]> {
  const response = await apiCall(`/training-plans/${planId}/coach/memories`, {
    method: 'GET',
  });
  return parseCollection(response, 'memories', trainingCoachMemorySchema);
}

export async function upsertCoachMemory(
  planId: string,
  payload: TrainingCoachMemoryUpsert
): Promise<TrainingCoachMemory> {
  const validatedRequest = trainingCoachMemoryUpsertSchema.parse(payload);
  const response = await apiCall(`/training-plans/${planId}/coach/memories`, {
    method: 'POST',
    body: validatedRequest,
  });
  return trainingCoachMemorySchema.parse(unwrapEnvelope(response, 'memory'));
}

export async function deleteCoachMemory(
  planId: string,
  memoryId: string
): Promise<void> {
  await apiCall(`/training-plans/${planId}/coach/memories/${memoryId}`, {
    method: 'DELETE',
  });
}

// --- Fitness snapshots (periodic fitness tests) ---

export async function listFitnessTests(
  planId?: string
): Promise<TrainingFitnessTest[]> {
  const response = await apiCall('/training-plans/fitness-tests', {
    method: 'GET',
    params: { plan_id: planId },
  });
  return parseCollection(response, 'tests', trainingFitnessTestSchema);
}

export async function createFitnessTest(
  payload: TrainingFitnessTestCreateRequest
): Promise<TrainingFitnessTest> {
  const validatedRequest =
    trainingFitnessTestCreateRequestSchema.parse(payload);
  const response = await apiCall('/training-plans/fitness-tests', {
    method: 'POST',
    body: validatedRequest,
  });
  return trainingFitnessTestSchema.parse(unwrapEnvelope(response, 'test'));
}

export async function reportFitnessTest(
  testId: string,
  payload: TrainingFitnessTestReportRequest
): Promise<TrainingFitnessTest> {
  const validatedRequest =
    trainingFitnessTestReportRequestSchema.parse(payload);
  const response = await apiCall(
    `/training-plans/fitness-tests/${testId}/report`,
    { method: 'POST', body: validatedRequest }
  );
  return trainingFitnessTestSchema.parse(unwrapEnvelope(response, 'test'));
}

export async function deleteFitnessTest(testId: string): Promise<void> {
  await apiCall(`/training-plans/fitness-tests/${testId}`, {
    method: 'DELETE',
  });
}
