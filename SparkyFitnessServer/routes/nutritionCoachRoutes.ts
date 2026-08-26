import express from 'express';
import { z } from 'zod';
import {
  nutritionCoachCreateSessionRequestSchema,
  nutritionCoachMemoryUpsertSchema,
  nutritionCoachSendMessageRequestSchema,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import { resolveIsAdmin } from '../utils/adminCheck.js';
import nutritionCoachService from '../services/nutritionCoachService.js';
import {
  activeUserId,
  invalidRequest,
  respondWithDomainError,
} from './trainingRouteHelpers.js';

const router = express.Router();
const uuidSchema = z.string().uuid();

router.get(
  '/sessions',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const sessions = await nutritionCoachService.listSessions(
        activeUserId(req)
      );
      return res.status(200).json({ sessions });
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error listing nutrition coach sessions for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

router.post(
  '/sessions',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const validation = nutritionCoachCreateSessionRequestSchema.safeParse(
      req.body ?? {}
    );
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const session = await nutritionCoachService.createSession(
        activeUserId(req),
        validation.data
      );
      return res.status(201).json({ session });
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error creating nutrition coach session for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

router.get(
  '/sessions/:sessionId',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const sessionId = uuidSchema.safeParse(req.params.sessionId);
    if (!sessionId.success) {
      return invalidRequest(res, sessionId.error.issues);
    }
    try {
      const detail = await nutritionCoachService.getSessionDetail(
        activeUserId(req),
        sessionId.data
      );
      return res.status(200).json(detail);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error loading nutrition coach session ${req.params.sessionId}:`,
        error
      );
      next(error);
    }
  }
);

router.post(
  '/sessions/:sessionId/messages',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const sessionId = uuidSchema.safeParse(req.params.sessionId);
    if (!sessionId.success) {
      return invalidRequest(res, sessionId.error.issues);
    }
    const validation = nutritionCoachSendMessageRequestSchema.safeParse(
      req.body ?? {}
    );
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const isAdmin = await resolveIsAdmin(req.user, req.authenticatedUserId);
      const result = await nutritionCoachService.sendMessage(
        req.authenticatedUserId || activeUserId(req),
        activeUserId(req),
        sessionId.data,
        validation.data,
        isAdmin
      );
      return res.status(200).json(result);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error in nutrition coach message for session ${req.params.sessionId}:`,
        error
      );
      next(error);
    }
  }
);

router.post(
  '/sessions/:sessionId/close',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const sessionId = uuidSchema.safeParse(req.params.sessionId);
    if (!sessionId.success) {
      return invalidRequest(res, sessionId.error.issues);
    }
    const body = z
      .object({ service_config_id: uuidSchema.optional() })
      .safeParse(req.body ?? {});
    if (!body.success) {
      return invalidRequest(res, body.error.issues);
    }
    try {
      const isAdmin = await resolveIsAdmin(req.user, req.authenticatedUserId);
      const result = await nutritionCoachService.closeSession(
        req.authenticatedUserId || activeUserId(req),
        activeUserId(req),
        sessionId.data,
        body.data.service_config_id,
        isAdmin
      );
      return res.status(200).json(result);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error closing nutrition coach session ${req.params.sessionId}:`,
        error
      );
      next(error);
    }
  }
);

router.get(
  '/memories',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const memories = await nutritionCoachService.listMemories(
        activeUserId(req)
      );
      return res.status(200).json({ memories });
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error listing nutrition coach memories for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

router.post(
  '/memories',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const validation = nutritionCoachMemoryUpsertSchema.safeParse(
      req.body ?? {}
    );
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const memory = await nutritionCoachService.upsertMemory(
        activeUserId(req),
        validation.data
      );
      return res.status(200).json({ memory });
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error upserting nutrition coach memory for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

router.delete(
  '/memories/:memoryId',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const memoryId = uuidSchema.safeParse(req.params.memoryId);
    if (!memoryId.success) {
      return invalidRequest(res, memoryId.error.issues);
    }
    try {
      const deleted = await nutritionCoachService.deleteMemory(
        activeUserId(req),
        memoryId.data
      );
      if (!deleted) {
        return res.status(404).json({
          code: 'not_found',
          error: 'Memory was not found.',
        });
      }
      return res.status(204).send();
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error deleting nutrition coach memory ${req.params.memoryId}:`,
        error
      );
      next(error);
    }
  }
);

export default router;
