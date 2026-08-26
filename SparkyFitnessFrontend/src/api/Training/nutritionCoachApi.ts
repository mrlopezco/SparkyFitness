import { z } from 'zod';
import {
  nutritionCoachCreateSessionRequestSchema,
  nutritionCoachMemorySchema,
  nutritionCoachMemoryUpsertSchema,
  nutritionCoachSendMessageRequestSchema,
  nutritionCoachSendMessageResponseSchema,
  nutritionCoachSessionDetailSchema,
  nutritionCoachSessionSchema,
  nutritionCoachSessionSummarySchema,
  type NutritionCoachCreateSessionRequest,
  type NutritionCoachMemory,
  type NutritionCoachMemoryUpsert,
  type NutritionCoachSendMessageRequest,
  type NutritionCoachSendMessageResponse,
  type NutritionCoachSession,
  type NutritionCoachSessionDetail,
  type NutritionCoachSessionSummary,
} from '@workspace/shared';
import { apiCall } from '../api.js';

const sessionsListSchema = z.object({
  sessions: z.array(nutritionCoachSessionSchema),
});

export async function listNutritionCoachSessions(): Promise<
  NutritionCoachSession[]
> {
  const response = await apiCall('/nutrition-coach/sessions');
  return sessionsListSchema.parse(response).sessions;
}

export async function createNutritionCoachSession(
  payload: NutritionCoachCreateSessionRequest
): Promise<NutritionCoachSession> {
  const body = nutritionCoachCreateSessionRequestSchema.parse(payload);
  const response = await apiCall('/nutrition-coach/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return z.object({ session: nutritionCoachSessionSchema }).parse(response)
    .session;
}

export async function getNutritionCoachSession(
  sessionId: string
): Promise<NutritionCoachSessionDetail> {
  const response = await apiCall(`/nutrition-coach/sessions/${sessionId}`);
  return nutritionCoachSessionDetailSchema.parse(response);
}

export async function sendNutritionCoachMessage(
  sessionId: string,
  payload: NutritionCoachSendMessageRequest
): Promise<NutritionCoachSendMessageResponse> {
  const body = nutritionCoachSendMessageRequestSchema.parse(payload);
  const response = await apiCall(
    `/nutrition-coach/sessions/${sessionId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
  return nutritionCoachSendMessageResponseSchema.parse(response);
}

export async function closeNutritionCoachSession(
  sessionId: string,
  serviceConfigId?: string
): Promise<{
  session: NutritionCoachSession;
  summary: NutritionCoachSessionSummary;
}> {
  const response = await apiCall(
    `/nutrition-coach/sessions/${sessionId}/close`,
    {
      method: 'POST',
      body: JSON.stringify(
        serviceConfigId ? { service_config_id: serviceConfigId } : {}
      ),
    }
  );
  return z
    .object({
      session: nutritionCoachSessionSchema,
      summary: nutritionCoachSessionSummarySchema,
    })
    .parse(response);
}

export async function listNutritionCoachMemories(): Promise<
  NutritionCoachMemory[]
> {
  const response = await apiCall('/nutrition-coach/memories');
  return z.object({ memories: z.array(nutritionCoachMemorySchema) }).parse(
    response
  ).memories;
}

export async function upsertNutritionCoachMemory(
  payload: NutritionCoachMemoryUpsert
): Promise<NutritionCoachMemory> {
  const body = nutritionCoachMemoryUpsertSchema.parse(payload);
  const response = await apiCall('/nutrition-coach/memories', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return z.object({ memory: nutritionCoachMemorySchema }).parse(response).memory;
}

export async function deleteNutritionCoachMemory(
  memoryId: string
): Promise<void> {
  await apiCall(`/nutrition-coach/memories/${memoryId}`, {
    method: 'DELETE',
  });
}
