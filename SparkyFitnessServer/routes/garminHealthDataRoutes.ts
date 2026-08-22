import express from 'express';
import {
  ghdHistoryImportStartRequestSchema,
} from '@workspace/shared';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import { log } from '../config/logging.js';
import ghdMicroserviceClient, {
  GhdMicroserviceError,
} from '../integrations/garminHealthData/ghdMicroserviceClient.js';
import garminHealthDataService from '../services/garminHealthDataService.js';
import ghdHistoryImportService from '../services/ghdHistoryImportService.js';
import ghdCoverageRepository from '../models/ghdCoverageRepository.js';

const router = express.Router();
router.use(express.json());

function sidecarErrorStatus(error: unknown): number {
  if (error instanceof GhdMicroserviceError) {
    if (error.status >= 400 && error.status < 600) return error.status;
  }
  return 500;
}

function sidecarErrorBody(error: unknown): Record<string, unknown> {
  if (error instanceof GhdMicroserviceError) {
    if (error.detail && typeof error.detail === 'object') {
      return error.detail as Record<string, unknown>;
    }
    return { error: error.message, detail: error.detail };
  }
  return {
    error: error instanceof Error ? error.message : String(error),
  };
}

/**
 * @swagger
 * /integrations/garmin-health-data/auth/login:
 *   post:
 *     summary: Link Garmin Health Data via GHD sidecar login
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 */
router.post(
  '/auth/login',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const email = typeof req.body?.email === 'string' ? req.body.email : '';
      const password =
        typeof req.body?.password === 'string' ? req.body.password : '';
      if (!email || !password) {
        return res
          .status(400)
          .json({ error: 'Email and password are required.' });
      }

      const result = await ghdMicroserviceClient.login(userId, email, password);
      log('info', `[garminHealthDataRoutes] login response for ${userId}:`, result);

      if (
        result &&
        typeof result === 'object' &&
        'needs_mfa' in result &&
        (result as { needs_mfa?: boolean }).needs_mfa === true
      ) {
        const mfaId =
          typeof (result as { mfa_id?: unknown }).mfa_id === 'string'
            ? (result as { mfa_id: string }).mfa_id
            : null;
        return res.status(200).json({
          status: 'needs_mfa',
          mfa_id: mfaId,
          needs_mfa: true,
        });
      }

      if (
        result &&
        typeof result === 'object' &&
        'ok' in result &&
        (result as { ok?: boolean }).ok === true
      ) {
        const provider = await garminHealthDataService.ensureGhdProviderLinked(
          userId,
          email
        );
        return res.status(200).json({ status: 'success', ok: true, provider });
      }

      return res.status(200).json(result);
    } catch (error: unknown) {
      if (error instanceof GhdMicroserviceError) {
        return res.status(sidecarErrorStatus(error)).json(sidecarErrorBody(error));
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /integrations/garmin-health-data/auth/resume_login:
 *   post:
 *     summary: Resume GHD login after MFA
 *     tags: [External Integrations]
 */
router.post(
  '/auth/resume_login',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const mfaId =
        typeof req.body?.mfa_id === 'string' ? req.body.mfa_id : '';
      const mfaCode =
        typeof req.body?.mfa_code === 'string' ? req.body.mfa_code : '';
      const email =
        typeof req.body?.email === 'string' ? req.body.email : null;
      if (!mfaId || !mfaCode) {
        return res
          .status(400)
          .json({ error: 'mfa_id and mfa_code are required.' });
      }

      const result = await ghdMicroserviceClient.resumeLogin(
        userId,
        mfaId,
        mfaCode
      );
      if (
        result &&
        typeof result === 'object' &&
        'ok' in result &&
        (result as { ok?: boolean }).ok === true
      ) {
        const provider = await garminHealthDataService.ensureGhdProviderLinked(
          userId,
          email
        );
        return res.status(200).json({ status: 'success', ok: true, provider });
      }
      return res.status(200).json(result);
    } catch (error: unknown) {
      if (error instanceof GhdMicroserviceError) {
        return res.status(sidecarErrorStatus(error)).json(sidecarErrorBody(error));
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /integrations/garmin-health-data/auth/status:
 *   post:
 *     summary: Check whether GHD sidecar has linked tokens for this user
 *     tags: [External Integrations]
 */
router.post(
  '/auth/status',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const result = await ghdMicroserviceClient.authStatus(userId);
      const linked = Boolean(result.linked);
      return res.status(200).json({
        linked,
        isLinked: linked,
        lastUpdated: null,
        tokenExpiresAt: null,
      });
    } catch (error: unknown) {
      if (error instanceof GhdMicroserviceError) {
        return res.status(sidecarErrorStatus(error)).json(sidecarErrorBody(error));
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /integrations/garmin-health-data/auth/unlink:
 *   post:
 *     summary: Deactivate GHD provider and clear sidecar tokens
 *     tags: [External Integrations]
 */
router.post(
  '/auth/unlink',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      await garminHealthDataService.unlinkGhdProvider(userId);
      return res.status(200).json({ status: 'success' });
    } catch (error: unknown) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /integrations/garmin-health-data/sync:
 *   post:
 *     summary: Manual GHD extract + projection sync
 *     tags: [External Integrations]
 */
router.post(
  '/sync',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const startDate =
        typeof req.body?.startDate === 'string'
          ? req.body.startDate
          : typeof req.body?.start_date === 'string'
            ? req.body.start_date
            : null;
      const endDate =
        typeof req.body?.endDate === 'string'
          ? req.body.endDate
          : typeof req.body?.end_date === 'string'
            ? req.body.end_date
            : null;
      const result = await garminHealthDataService.syncGarminHealthData(
        userId,
        'manual',
        startDate,
        endDate
      );
      const status = result.status === 'success' ? 200 : 500;
      return res.status(status).json(result);
    } catch (error: unknown) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /integrations/garmin-health-data/history-import:
 *   get:
 *     summary: Current GHD history import job status
 *   post:
 *     summary: Start a GHD history import from start_date through today
 */
router.get(
  '/history-import',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const status = await ghdHistoryImportService.getJobStatus(userId);
      return res.status(200).json(status);
    } catch (error: unknown) {
      next(error);
    }
  }
);

router.post(
  '/history-import',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const parsed = ghdHistoryImportStartRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid request',
          details: parsed.error.flatten(),
        });
      }
      const result = await ghdHistoryImportService.startJob(
        userId,
        parsed.data.start_date
      );
      return res.status(201).json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('already exists') ||
        message.includes('No active') ||
        message.includes('start_date')
      ) {
        return res.status(400).json({ error: message });
      }
      next(error);
    }
  }
);

router.post(
  '/history-import/cancel',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const result = await ghdHistoryImportService.cancelJob(userId);
      return res.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  }
);

router.post(
  '/history-import/pause',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const result = await ghdHistoryImportService.pauseJob(userId);
      return res.status(200).json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Cannot pause')) {
        return res.status(400).json({ error: message });
      }
      next(error);
    }
  }
);

router.post(
  '/history-import/resume',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const result = await ghdHistoryImportService.resumeJob(userId);
      return res.status(200).json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Cannot resume')) {
        return res.status(400).json({ error: message });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /integrations/garmin-health-data/coverage:
 *   get:
 *     summary: High-level imported data coverage for Garmin Health Data
 *     tags: [External Integrations]
 */
router.get(
  '/coverage',
  authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const coverage = await ghdCoverageRepository.getGhdCoverage(userId);
      return res.status(200).json(coverage);
    } catch (error: unknown) {
      next(error);
    }
  }
);

export default router;
