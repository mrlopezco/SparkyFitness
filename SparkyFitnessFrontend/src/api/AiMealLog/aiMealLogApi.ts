import {
  aiMealLogAnalyzeRequestSchema,
  aiMealLogAnalyzeResponseSchema,
  aiMealLogConfirmRequestSchema,
  aiMealLogConfirmResponseSchema,
  type AiMealLogAnalyzeRequest,
  type AiMealLogAnalyzeResponse,
  type AiMealLogConfirmRequest,
  type AiMealLogConfirmResponse,
} from '@workspace/shared';
import { apiCall } from '../api';

export async function analyzeAiMealLog(
  payload: AiMealLogAnalyzeRequest
): Promise<AiMealLogAnalyzeResponse> {
  const validatedRequest = aiMealLogAnalyzeRequestSchema.parse(payload);
  const response = await apiCall('/ai/meal-log/analyze', {
    method: 'POST',
    body: validatedRequest,
  });
  return aiMealLogAnalyzeResponseSchema.parse(response);
}

export async function confirmAiMealLog(
  payload: AiMealLogConfirmRequest
): Promise<AiMealLogConfirmResponse> {
  const validatedRequest = aiMealLogConfirmRequestSchema.parse(payload);
  const response = await apiCall('/ai/meal-log/confirm', {
    method: 'POST',
    body: validatedRequest,
  });
  return aiMealLogConfirmResponseSchema.parse(response);
}
