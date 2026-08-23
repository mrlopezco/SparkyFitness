import express from 'express';
import { z } from 'zod';
import {
  trainingCoachCreateSessionRequestSchema,
  trainingCoachMemoryUpsertSchema,
  trainingCoachSendMessageRequestSchema,
  trainingFitnessTestCreateRequestSchema,
  trainingFitnessTestReportRequestSchema,
  trainingFitnessTestStatusSchema,
  trainingPlanAdjustRequestSchema,
  trainingSessionAiReviewRequestSchema,
  trainingSessionReportExecutionRequestSchema,
  trainingSessionSkipRequestSchema,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import { resolveIsAdmin } from '../utils/adminCheck.js';
import trainingCoachService from '../services/trainingCoachService.js';
import trainingFitnessTestService from '../services/trainingFitnessTestService.js';
import trainingPlanService from '../services/trainingPlanService.js';
import trainingSessionExecutionService from '../services/trainingSessionExecutionService.js';
import { adjustTrainingPlan } from '../services/trainingPlanAiService.js';
import {
  activeUserId,
  invalidRequest,
  respondWithDomainError,
} from './trainingRouteHelpers.js';

/**
 * Phase 2/3 surface for the fork Training Plan domain: the coach chat, session
 * skip reasons, AI plan adjustment, and periodic fitness tests.
 *
 * Mounted on `/api/training-plans` ahead of `trainingPlanRoutes`, because the
 * static `/fitness-tests` and `/ai/adjust` paths would otherwise be swallowed
 * by that router's `/:id`. Anything this router does not define falls through
 * to it untouched.
 */

const router = express.Router();

const uuidSchema = z.string().uuid();

const memoryDeleteQuerySchema = z.object({
  memory_key: z.string().trim().min(1).max(120),
});

const fitnessTestQuerySchema = z.object({
  plan_id: uuidSchema.optional(),
  status: trainingFitnessTestStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

// ---------------------------------------------------------------------------
// Static paths first: Express matches in registration order, so `/:id/...`
// routes below must never see `/fitness-tests` or `/ai/adjust`.
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /training-plans/fitness-tests:
 *   get:
 *     summary: List the athlete's periodic fitness tests
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Fitness tests, newest scheduled date first.
 *       400:
 *         description: Invalid query parameters.
 */
router.get(
  '/fitness-tests',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const validation = fitnessTestQuerySchema.safeParse(req.query);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const tests = await trainingFitnessTestService.listTests(
        activeUserId(req),
        {
          planId: validation.data.plan_id,
          status: validation.data.status,
          limit: validation.data.limit,
        }
      );
      return res.status(200).json({ tests });
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error listing fitness tests for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/fitness-tests:
 *   post:
 *     summary: Schedule a fitness test
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The scheduled test.
 *       404:
 *         description: Plan not found.
 */
router.post(
  '/fitness-tests',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const validation = trainingFitnessTestCreateRequestSchema.safeParse(
      req.body
    );
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const test = await trainingFitnessTestService.createTest(
        activeUserId(req),
        validation.data
      );
      return res.status(201).json(test);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error scheduling a fitness test for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/fitness-tests/{testId}:
 *   get:
 *     summary: Read one fitness test
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The test.
 *       404:
 *         description: Test not found.
 */
router.get(
  '/fitness-tests/:testId',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const testId = uuidSchema.safeParse(req.params.testId);
    if (!testId.success) {
      return invalidRequest(res, testId.error.issues);
    }
    try {
      const test = await trainingFitnessTestService.getTest(
        activeUserId(req),
        testId.data
      );
      return res.status(200).json(test);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error loading fitness test ${req.params.testId} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/fitness-tests/{testId}/report:
 *   post:
 *     summary: Report the outcome of a fitness test
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The updated test.
 *       404:
 *         description: Test not found.
 */
router.post(
  '/fitness-tests/:testId/report',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const testId = uuidSchema.safeParse(req.params.testId);
    if (!testId.success) {
      return invalidRequest(res, testId.error.issues);
    }
    const validation = trainingFitnessTestReportRequestSchema.safeParse(
      req.body
    );
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const test = await trainingFitnessTestService.reportResult(
        activeUserId(req),
        testId.data,
        validation.data
      );
      return res.status(200).json(test);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error reporting fitness test ${req.params.testId} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/fitness-tests/{testId}:
 *   delete:
 *     summary: Delete a fitness test
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       204:
 *         description: Deleted.
 *       404:
 *         description: Test not found.
 */
router.delete(
  '/fitness-tests/:testId',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const testId = uuidSchema.safeParse(req.params.testId);
    if (!testId.success) {
      return invalidRequest(res, testId.error.issues);
    }
    try {
      await trainingFitnessTestService.deleteTest(
        activeUserId(req),
        testId.data
      );
      return res.status(204).send();
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error deleting fitness test ${req.params.testId} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/ai/adjust:
 *   post:
 *     summary: Ask the AI to revise the remaining sessions in a window
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Revised sessions for user review; nothing is persisted until confirm.
 *       403:
 *         description: AI disabled or private network forbidden.
 *       404:
 *         description: Plan not found or no AI service configured.
 *       502:
 *         description: AI provider error or unusable response.
 */
router.post(
  '/ai/adjust',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const validation = trainingPlanAdjustRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const isAdmin = await resolveIsAdmin(req.user, req.authenticatedUserId);
      const result = await adjustTrainingPlan(
        req.authenticatedUserId || activeUserId(req),
        activeUserId(req),
        validation.data,
        isAdmin
      );
      return res.status(200).json(result);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error adjusting a training plan for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Plan-scoped paths.
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /training-plans/{id}/sessions/{sessionId}/skip:
 *   post:
 *     summary: Skip a planned session with a reason
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The skipped session.
 *       404:
 *         description: Plan or session not found.
 */
router.post(
  '/:id/sessions/:sessionId/skip',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const ids = z
      .object({ id: uuidSchema, sessionId: uuidSchema })
      .safeParse(req.params);
    if (!ids.success) {
      return invalidRequest(res, ids.error.issues);
    }
    const validation = trainingSessionSkipRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const session = await trainingPlanService.skipSession(
        activeUserId(req),
        ids.data.id,
        ids.data.sessionId,
        validation.data.reason
      );
      return res.status(200).json(session);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error skipping session ${req.params.sessionId} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/sessions/{sessionId}/report-execution:
 *   post:
 *     summary: Log how a planned session went (done / partial + score)
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 */
router.post(
  '/:id/sessions/:sessionId/report-execution',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const ids = z
      .object({ id: uuidSchema, sessionId: uuidSchema })
      .safeParse(req.params);
    if (!ids.success) {
      return invalidRequest(res, ids.error.issues);
    }
    const validation =
      trainingSessionReportExecutionRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const isAdmin = await resolveIsAdmin(req.user, req.authenticatedUserId);
      const result = await trainingSessionExecutionService.reportExecution(
        req.authenticatedUserId || activeUserId(req),
        activeUserId(req),
        ids.data.id,
        ids.data.sessionId,
        validation.data,
        isAdmin
      );
      return res.status(200).json(result);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error reporting execution for session ${req.params.sessionId} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/sessions/{sessionId}/ai-review:
 *   post:
 *     summary: Ask the AI to review a session execution
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 */
router.post(
  '/:id/sessions/:sessionId/ai-review',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const ids = z
      .object({ id: uuidSchema, sessionId: uuidSchema })
      .safeParse(req.params);
    if (!ids.success) {
      return invalidRequest(res, ids.error.issues);
    }
    const validation =
      trainingSessionAiReviewRequestSchema.safeParse(req.body ?? {});
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const isAdmin = await resolveIsAdmin(req.user, req.authenticatedUserId);
      const result = await trainingSessionExecutionService.generateAiReview(
        req.authenticatedUserId || activeUserId(req),
        activeUserId(req),
        ids.data.id,
        ids.data.sessionId,
        validation.data,
        isAdmin
      );
      return res.status(200).json(result);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error reviewing session ${req.params.sessionId} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/coach/sessions:
 *   post:
 *     summary: Open a coach conversation for a plan
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The new coach session and any opening brief.
 *       404:
 *         description: Plan not found.
 */
router.post(
  '/:id/coach/sessions',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const planId = uuidSchema.safeParse(req.params.id);
    if (!planId.success) {
      return invalidRequest(res, planId.error.issues);
    }
    const validation = trainingCoachCreateSessionRequestSchema.safeParse(
      req.body ?? {}
    );
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const created = await trainingCoachService.createSession(
        activeUserId(req),
        planId.data,
        validation.data
      );
      return res.status(201).json(created);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error creating a coach session for plan ${req.params.id}, user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/coach/sessions:
 *   get:
 *     summary: List coach conversations for a plan
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Coach sessions, newest first.
 *       404:
 *         description: Plan not found.
 */
router.get(
  '/:id/coach/sessions',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const planId = uuidSchema.safeParse(req.params.id);
    if (!planId.success) {
      return invalidRequest(res, planId.error.issues);
    }
    try {
      const sessions = await trainingCoachService.listSessions(
        activeUserId(req),
        planId.data
      );
      return res.status(200).json({ sessions });
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error listing coach sessions for plan ${req.params.id}, user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/coach/sessions/{sessionId}:
 *   get:
 *     summary: Read a coach conversation with its messages and summary
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The session, its transcript, and its summary when closed.
 *       404:
 *         description: Session not found.
 */
router.get(
  '/:id/coach/sessions/:sessionId',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const ids = z
      .object({ id: uuidSchema, sessionId: uuidSchema })
      .safeParse(req.params);
    if (!ids.success) {
      return invalidRequest(res, ids.error.issues);
    }
    try {
      const detail = await trainingCoachService.getSessionDetail(
        activeUserId(req),
        ids.data.id,
        ids.data.sessionId
      );
      return res.status(200).json(detail);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error loading coach session ${req.params.sessionId} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/coach/sessions/{sessionId}/messages:
 *   post:
 *     summary: Send a message to the coach and get its reply
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The stored user message and the coach reply.
 *       403:
 *         description: AI disabled or private network forbidden.
 *       404:
 *         description: Session not found or no AI service configured.
 *       502:
 *         description: AI provider error or unusable response.
 */
router.post(
  '/:id/coach/sessions/:sessionId/messages',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const ids = z
      .object({ id: uuidSchema, sessionId: uuidSchema })
      .safeParse(req.params);
    if (!ids.success) {
      return invalidRequest(res, ids.error.issues);
    }
    const validation = trainingCoachSendMessageRequestSchema.safeParse(
      req.body
    );
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const isAdmin = await resolveIsAdmin(req.user, req.authenticatedUserId);
      const result = await trainingCoachService.sendMessage(
        req.authenticatedUserId || activeUserId(req),
        activeUserId(req),
        ids.data.id,
        ids.data.sessionId,
        validation.data,
        isAdmin
      );
      return res.status(200).json(result);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error sending a coach message in session ${req.params.sessionId} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/coach/sessions/{sessionId}/close:
 *   post:
 *     summary: Close a coach conversation and store its summary
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The closed session and its summary.
 *       404:
 *         description: Session not found.
 */
router.post(
  '/:id/coach/sessions/:sessionId/close',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const ids = z
      .object({ id: uuidSchema, sessionId: uuidSchema })
      .safeParse(req.params);
    if (!ids.success) {
      return invalidRequest(res, ids.error.issues);
    }
    const body = z
      .object({ service_config_id: uuidSchema.optional() })
      .safeParse(req.body ?? {});
    if (!body.success) {
      return invalidRequest(res, body.error.issues);
    }
    try {
      const isAdmin = await resolveIsAdmin(req.user, req.authenticatedUserId);
      const result = await trainingCoachService.closeSession(
        req.authenticatedUserId || activeUserId(req),
        activeUserId(req),
        ids.data.id,
        ids.data.sessionId,
        body.data.service_config_id,
        isAdmin
      );
      return res.status(200).json(result);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error closing coach session ${req.params.sessionId} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/coach/memories:
 *   get:
 *     summary: List the durable facts the coach remembers for a plan
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Coach memories, most recently updated first.
 *       404:
 *         description: Plan not found.
 */
router.get(
  '/:id/coach/memories',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const planId = uuidSchema.safeParse(req.params.id);
    if (!planId.success) {
      return invalidRequest(res, planId.error.issues);
    }
    try {
      const memories = await trainingCoachService.listMemories(
        activeUserId(req),
        planId.data
      );
      return res.status(200).json({ memories });
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error listing coach memories for plan ${req.params.id}, user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/coach/memories:
 *   post:
 *     summary: Add or replace one coach memory
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The stored memory.
 *       404:
 *         description: Plan not found.
 */
router.post(
  '/:id/coach/memories',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const planId = uuidSchema.safeParse(req.params.id);
    if (!planId.success) {
      return invalidRequest(res, planId.error.issues);
    }
    const validation = trainingCoachMemoryUpsertSchema.safeParse(req.body);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const memory = await trainingCoachService.upsertMemory(
        activeUserId(req),
        planId.data,
        validation.data
      );
      return res.status(200).json(memory);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error storing a coach memory for plan ${req.params.id}, user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/coach/memories:
 *   delete:
 *     summary: Forget one coach memory by key
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       204:
 *         description: Deleted.
 *       404:
 *         description: Plan or memory not found.
 */
router.delete(
  '/:id/coach/memories',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const planId = uuidSchema.safeParse(req.params.id);
    if (!planId.success) {
      return invalidRequest(res, planId.error.issues);
    }
    const query = memoryDeleteQuerySchema.safeParse(req.query);
    if (!query.success) {
      return invalidRequest(res, query.error.issues);
    }
    try {
      await trainingCoachService.deleteMemory(
        activeUserId(req),
        planId.data,
        query.data.memory_key
      );
      return res.status(204).send();
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error deleting a coach memory for plan ${req.params.id}, user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

export default router;
