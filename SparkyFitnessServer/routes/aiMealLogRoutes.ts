import express from 'express';
import {
  aiMealLogAnalyzeRequestSchema,
  aiMealLogConfirmRequestSchema,
} from '@workspace/shared';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import { log } from '../config/logging.js';
import { resolveIsAdmin } from '../utils/adminCheck.js';
import {
  analyzeMealLogText,
  confirmMealLogItems,
  NoAiServiceError,
  AiMealLogDisabledError,
  ProviderResponseError,
  PrivateNetworkAiUrlError,
  MealTypeNotFoundError,
  ConfirmFailedError,
} from '../services/aiMealLogService.js';

const router = express.Router();

/**
 * @swagger
 * /ai/meal-log/analyze:
 *   post:
 *     summary: Parse natural-language meal text and resolve nutrition via food DB cascade
 *     tags: [AI]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Proposed meal items for user review.
 *       400:
 *         description: Invalid request body.
 *       403:
 *         description: AI disabled or private network forbidden.
 *       404:
 *         description: No AI service configured.
 *       502:
 *         description: AI provider error or malformed response.
 */
router.post(
  '/meal-log/analyze',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const validation = aiMealLogAnalyzeRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        code: 'invalid_request',
        error: 'Request body failed schema validation.',
        issues: validation.error.issues,
      });
    }

    try {
      const isAdmin = await resolveIsAdmin(req.user, req.authenticatedUserId);
      const authenticatedUserId = req.authenticatedUserId || req.userId;
      const actingUserId = req.userId;
      const result = await analyzeMealLogText(
        authenticatedUserId,
        actingUserId,
        validation.data,
        isAdmin
      );
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof NoAiServiceError) {
        return res
          .status(404)
          .json({ code: 'no_ai_service', error: error.message });
      }
      if (error instanceof AiMealLogDisabledError) {
        return res
          .status(403)
          .json({ code: 'ai_disabled', error: error.message });
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
      log(
        'error',
        `Unexpected error in AI meal log analyze for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /ai/meal-log/confirm:
 *   post:
 *     summary: Persist reviewed AI meal-log items as diary food entries
 *     tags: [AI]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Created food entry ids.
 *       400:
 *         description: Invalid request or meal type not found.
 *       502:
 *         description: Failed to create one or more entries.
 */
router.post(
  '/meal-log/confirm',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const validation = aiMealLogConfirmRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        code: 'invalid_request',
        error: 'Request body failed schema validation.',
        issues: validation.error.issues,
      });
    }

    try {
      const authenticatedUserId = req.authenticatedUserId || req.userId;
      const actingUserId = req.userId;
      const result = await confirmMealLogItems(
        authenticatedUserId,
        actingUserId,
        validation.data
      );
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof MealTypeNotFoundError) {
        return res
          .status(400)
          .json({ code: 'meal_type_not_found', error: error.message });
      }
      if (error instanceof ConfirmFailedError) {
        return res
          .status(502)
          .json({ code: 'confirm_failed', error: error.message });
      }
      log(
        'error',
        `Unexpected error in AI meal log confirm for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

export default router;
