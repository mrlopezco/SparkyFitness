import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import modulePreferenceService, {
  UnknownModuleError,
} from '../services/modulePreferenceService.js';
import modulePreferenceRoutes from '../routes/modulePreferenceRoutes.js';

vi.mock('../services/modulePreferenceService.js', () => ({
  default: {
    getEffectiveModules: vi.fn(),
    updateModules: vi.fn(),
  },
  UnknownModuleError: class UnknownModuleError extends Error {
    constructor(moduleIds: string[]) {
      super(`Unknown module id(s): ${moduleIds.join(', ')}`);
      this.name = 'UnknownModuleError';
    }
  },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
    next();
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/module-preferences', modulePreferenceRoutes);
app.use(
  (
    err: Error & { status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    res.status(err.status || 500).json({ error: err.message });
  }
);

const service = modulePreferenceService as unknown as {
  getEffectiveModules: ReturnType<typeof vi.fn>;
  updateModules: ReturnType<typeof vi.fn>;
};

describe('Module Preference Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/module-preferences', () => {
    it('returns the effective module map', async () => {
      const modules = {
        exercises: true,
        medications: false,
        training_plan: false,
      };
      service.getEffectiveModules.mockResolvedValue(modules);

      const res = await request(app).get('/api/module-preferences');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({ modules });
      expect(service.getEffectiveModules).toHaveBeenCalledWith('test-user-id');
    });
  });

  describe('PUT /api/module-preferences', () => {
    it('updates modules and returns the effective map', async () => {
      const modules = {
        exercises: false,
        medications: false,
        training_plan: false,
      };
      service.updateModules.mockResolvedValue(modules);

      const res = await request(app)
        .put('/api/module-preferences')
        .send({ modules: { exercises: false, medications: false } });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({ modules });
      expect(service.updateModules).toHaveBeenCalledWith('test-user-id', {
        exercises: false,
        medications: false,
      });
    });

    it('returns 400 for unknown module ids in the request body', async () => {
      const res = await request(app)
        .put('/api/module-preferences')
        .send({ modules: { bogus: true } });

      expect(res.statusCode).toEqual(400);
      expect(service.updateModules).not.toHaveBeenCalled();
    });

    it('returns 400 when the service rejects unknown modules', async () => {
      service.updateModules.mockRejectedValue(
        new UnknownModuleError(['bogus'])
      );

      const res = await request(app)
        .put('/api/module-preferences')
        .send({ modules: { exercises: false } });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toMatch(/Unknown module/);
    });
  });
});
