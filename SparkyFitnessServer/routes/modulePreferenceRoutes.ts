import express from 'express';
import { updateModulePreferencesRequestSchema } from '@workspace/shared';
import { authenticate } from '../middleware/authMiddleware.js';
import modulePreferenceService, {
  UnknownModuleError,
} from '../services/modulePreferenceService.js';
import { log } from '../config/logging.js';

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Preferences
 *   description: User preference and display settings.
 */
/**
 * @swagger
 * /module-preferences:
 *   get:
 *     summary: Get effective fork module visibility map
 *     tags: [Preferences]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Map of known module ids to enabled booleans (defaults merged).
 *       401:
 *         description: Unauthorized.
 */
router.get('/', async (req, res, next) => {
  try {
    const modules = await modulePreferenceService.getEffectiveModules(
      req.userId!
    );
    res.json({ modules });
  } catch (error) {
    log('error', 'GET /module-preferences failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /module-preferences:
 *   put:
 *     summary: Update fork module visibility toggles
 *     tags: [Preferences]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [modules]
 *             properties:
 *               modules:
 *                 type: object
 *                 additionalProperties:
 *                   type: boolean
 *     responses:
 *       200:
 *         description: Updated effective module map.
 *       400:
 *         description: Invalid body or unknown module id.
 *       401:
 *         description: Unauthorized.
 */
router.put('/', async (req, res, next) => {
  try {
    const parsed = updateModulePreferencesRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const modules = await modulePreferenceService.updateModules(
      req.userId!,
      parsed.data.modules
    );
    res.json({ modules });
  } catch (error) {
    if (error instanceof UnknownModuleError) {
      res.status(400).json({ error: error.message });
      return;
    }
    log('error', 'PUT /module-preferences failed:', error);
    next(error);
  }
});

export default router;
