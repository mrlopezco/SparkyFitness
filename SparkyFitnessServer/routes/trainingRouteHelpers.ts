import type { Request, Response } from 'express';
import type { z } from 'zod';
import { InvalidRangeError } from '../services/trainingPlanService.js';
import {
  AiTrainingPlanDisabledError,
  ConfirmFailedError,
  NoAiServiceError,
  NotFoundError,
  PrivateNetworkAiUrlError,
  ProviderResponseError,
} from '../services/trainingAiSupport.js';

/**
 * Request plumbing shared by the training plan and training coach routers, so
 * both surfaces return the same `trainingPlanErrorCodeSchema` codes for the
 * same failures.
 */

export function invalidRequest(res: Response, issues: z.ZodIssue[]): Response {
  return res.status(400).json({
    code: 'invalid_request',
    error: 'Request failed schema validation.',
    issues,
  });
}

/**
 * Maps the domain errors to the `trainingPlanErrorCodeSchema` codes the clients
 * branch on. Returns false when the error is unexpected so the caller can hand
 * it to the Express error handler instead of swallowing it.
 */
export function respondWithDomainError(
  res: Response,
  error: unknown
): Response | false {
  if (error instanceof NotFoundError) {
    return res.status(404).json({ code: 'not_found', error: error.message });
  }
  if (error instanceof InvalidRangeError) {
    return res
      .status(400)
      .json({ code: 'invalid_request', error: error.message });
  }
  if (error instanceof NoAiServiceError) {
    return res
      .status(404)
      .json({ code: 'no_ai_service', error: error.message });
  }
  if (error instanceof AiTrainingPlanDisabledError) {
    return res.status(403).json({ code: 'ai_disabled', error: error.message });
  }
  if (error instanceof PrivateNetworkAiUrlError) {
    return res
      .status(403)
      .json({ code: 'private_network_forbidden', error: error.message });
  }
  if (error instanceof ProviderResponseError) {
    return res
      .status(502)
      .json({ code: 'provider_error', error: error.message });
  }
  if (error instanceof ConfirmFailedError) {
    return res
      .status(502)
      .json({ code: 'confirm_failed', error: error.message });
  }
  return false;
}

export function activeUserId(req: Request): string {
  return req.userId as string;
}
