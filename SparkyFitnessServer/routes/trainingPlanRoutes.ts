import express from 'express';
import { z } from 'zod';
import {
  trainingAdherenceMatchRequestSchema,
  trainingCalendarQuerySchema,
  trainingCommitmentPayloadSchema,
  trainingGoalPayloadSchema,
  trainingPlanConfirmRequestSchema,
  trainingPlanCreateRequestSchema,
  trainingPlanImportRequestSchema,
  trainingPlanProposeRequestSchema,
  trainingPlanUpdateRequestSchema,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import { resolveIsAdmin } from '../utils/adminCheck.js';
import trainingPlanService from '../services/trainingPlanService.js';
import { proposeTrainingPlan } from '../services/trainingPlanAiService.js';
import trainingAdherenceService from '../services/trainingAdherenceService.js';
import {
  activeUserId,
  invalidRequest,
  respondWithDomainError,
} from './trainingRouteHelpers.js';

const router = express.Router();

const planIdSchema = z.string().uuid();

const replaceGoalsRequestSchema = z.object({
  goals: z.array(trainingGoalPayloadSchema),
});

const replaceCommitmentsRequestSchema = z.object({
  commitments: z.array(trainingCommitmentPayloadSchema),
});

/**
 * @swagger
 * /training-plans:
 *   get:
 *     summary: List the user's training plans
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Training plans, newest start date first.
 */
router.get(
  '/',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const plans = await trainingPlanService.listPlans(activeUserId(req));
      return res.status(200).json({ plans });
    } catch (error) {
      log(
        'error',
        `Unexpected error listing training plans for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/import:
 *   post:
 *     summary: Import a training plan from a versioned JSON document
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The imported plan detail.
 *       400:
 *         description: Invalid document.
 */
router.post(
  '/import',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const validation = trainingPlanImportRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const result = await trainingPlanService.importPlan(
        activeUserId(req),
        validation.data
      );
      return res.status(201).json(result);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error importing a training plan for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/calendar:
 *   get:
 *     summary: Planned sessions and fixed commitments for a date range
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: One entry per calendar day in the range.
 *       400:
 *         description: Invalid or oversized date range.
 */
router.get(
  '/calendar',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const validation = trainingCalendarQuerySchema.safeParse(req.query);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const calendar = await trainingPlanService.getCalendar(
        activeUserId(req),
        validation.data
      );
      return res.status(200).json(calendar);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error building the training calendar for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans:
 *   post:
 *     summary: Create a training plan with its goals and commitments
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The created plan with its children.
 *       400:
 *         description: Invalid request body.
 */
router.post(
  '/',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const validation = trainingPlanCreateRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const plan = await trainingPlanService.createPlan(
        activeUserId(req),
        validation.data
      );
      return res.status(201).json(plan);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error creating a training plan for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/ai/propose:
 *   post:
 *     summary: Ask the configured AI provider for a training block
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Proposed sessions for user review; nothing is persisted.
 *       403:
 *         description: AI disabled or private network forbidden.
 *       404:
 *         description: Plan not found or no AI service configured.
 *       502:
 *         description: AI provider error or unusable response.
 */
router.post(
  '/ai/propose',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const validation = trainingPlanProposeRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const isAdmin = await resolveIsAdmin(req.user, req.authenticatedUserId);
      const result = await proposeTrainingPlan(
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
        `Unexpected error proposing a training plan for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/ai/confirm:
 *   post:
 *     summary: Persist the reviewed AI-proposed sessions
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Created session ids.
 *       404:
 *         description: Plan not found.
 *       502:
 *         description: One or more sessions could not be saved.
 */
router.post(
  '/ai/confirm',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const validation = trainingPlanConfirmRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const result = await trainingPlanService.confirmPlan(
        activeUserId(req),
        validation.data
      );
      return res.status(200).json(result);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error confirming a training plan for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/adherence/match:
 *   post:
 *     summary: Score logged activities against planned sessions in a date range
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Counts of completed, partial, and unmatched sessions.
 *       400:
 *         description: Invalid date range.
 */
router.post(
  '/adherence/match',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const validation = trainingAdherenceMatchRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const result = await trainingAdherenceService.matchForUser(
        activeUserId(req),
        validation.data.start_date,
        validation.data.end_date,
        validation.data.plan_id
      );
      return res.status(200).json(result);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error matching training adherence for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}:
 *   get:
 *     summary: Get one training plan with goals, commitments, and sessions
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The plan detail.
 *       404:
 *         description: Plan not found.
 */
router.get(
  '/:id',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const planId = planIdSchema.safeParse(req.params.id);
    if (!planId.success) {
      return invalidRequest(res, planId.error.issues);
    }
    try {
      const plan = await trainingPlanService.getPlanDetail(
        activeUserId(req),
        planId.data
      );
      return res.status(200).json(plan);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error loading training plan ${req.params.id} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/export:
 *   get:
 *     summary: Export a training plan as versioned JSON
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 */
router.get(
  '/:id/export',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const planId = planIdSchema.safeParse(req.params.id);
    if (!planId.success) {
      return invalidRequest(res, planId.error.issues);
    }
    try {
      const document = await trainingPlanService.exportPlan(
        activeUserId(req),
        planId.data
      );
      return res.status(200).json(document);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error exporting training plan ${req.params.id} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}:
 *   patch:
 *     summary: Update a training plan's metadata or status
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The updated plan.
 *       404:
 *         description: Plan not found.
 */
router.patch(
  '/:id',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const planId = planIdSchema.safeParse(req.params.id);
    if (!planId.success) {
      return invalidRequest(res, planId.error.issues);
    }
    const validation = trainingPlanUpdateRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const plan = await trainingPlanService.updatePlan(
        activeUserId(req),
        planId.data,
        validation.data
      );
      return res.status(200).json(plan);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error updating training plan ${req.params.id} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}:
 *   delete:
 *     summary: Delete a training plan and everything under it
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       204:
 *         description: Deleted.
 *       404:
 *         description: Plan not found.
 */
router.delete(
  '/:id',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const planId = planIdSchema.safeParse(req.params.id);
    if (!planId.success) {
      return invalidRequest(res, planId.error.issues);
    }
    try {
      await trainingPlanService.deletePlan(activeUserId(req), planId.data);
      return res.status(204).send();
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error deleting training plan ${req.params.id} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/goals:
 *   post:
 *     summary: Replace every goal on a plan
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The stored goals.
 *       404:
 *         description: Plan not found.
 */
router.post(
  '/:id/goals',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const planId = planIdSchema.safeParse(req.params.id);
    if (!planId.success) {
      return invalidRequest(res, planId.error.issues);
    }
    const validation = replaceGoalsRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const goals = await trainingPlanService.replaceGoals(
        activeUserId(req),
        planId.data,
        validation.data.goals
      );
      return res.status(200).json({ goals });
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error replacing goals on training plan ${req.params.id} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/commitments:
 *   post:
 *     summary: Replace every fixed commitment on a plan
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The stored commitments.
 *       404:
 *         description: Plan not found.
 */
router.post(
  '/:id/commitments',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const planId = planIdSchema.safeParse(req.params.id);
    if (!planId.success) {
      return invalidRequest(res, planId.error.issues);
    }
    const validation = replaceCommitmentsRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return invalidRequest(res, validation.error.issues);
    }
    try {
      const commitments = await trainingPlanService.replaceCommitments(
        activeUserId(req),
        planId.data,
        validation.data.commitments
      );
      return res.status(200).json({ commitments });
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error replacing commitments on training plan ${req.params.id} for user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/snapshots:
 *   post:
 *     summary: Rebuild the athlete snapshot the AI planner reads
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The stored snapshot.
 *       404:
 *         description: Plan not found.
 */
router.post(
  '/:id/snapshots',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const planId = planIdSchema.safeParse(req.params.id);
    if (!planId.success) {
      return invalidRequest(res, planId.error.issues);
    }
    try {
      const snapshot = await trainingPlanService.rebuildSnapshot(
        activeUserId(req),
        planId.data
      );
      return res.status(201).json(snapshot);
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error rebuilding the athlete snapshot for plan ${req.params.id}, user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /training-plans/{id}/snapshots/latest:
 *   get:
 *     summary: Read the most recent athlete snapshot for a plan
 *     tags: [TrainingPlans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The latest snapshot, or null when none has been built.
 *       404:
 *         description: Plan not found.
 */
router.get(
  '/:id/snapshots/latest',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    const planId = planIdSchema.safeParse(req.params.id);
    if (!planId.success) {
      return invalidRequest(res, planId.error.issues);
    }
    try {
      const snapshot = await trainingPlanService.getLatestSnapshot(
        activeUserId(req),
        planId.data
      );
      return res.status(200).json({ snapshot });
    } catch (error) {
      const handled = respondWithDomainError(res, error);
      if (handled) return handled;
      log(
        'error',
        `Unexpected error loading the athlete snapshot for plan ${req.params.id}, user ${req.userId}:`,
        error
      );
      next(error);
    }
  }
);

export default router;
