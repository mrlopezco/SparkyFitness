import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'user-1';
    req.authenticatedUserId = 'user-1';
    req.user = { id: 'user-1' };
    next();
  },
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default:
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) =>
      next(),
}));

vi.mock('../utils/adminCheck.js', () => ({
  resolveIsAdmin: vi.fn(async () => false),
}));

vi.mock('../services/aiMealLogService.js', () => ({
  analyzeMealLogText: vi.fn(),
  confirmMealLogItems: vi.fn(),
  NoAiServiceError: class NoAiServiceError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'NoAiServiceError';
    }
  },
  AiMealLogDisabledError: class AiMealLogDisabledError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'AiMealLogDisabledError';
    }
  },
  ProviderResponseError: class ProviderResponseError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ProviderResponseError';
    }
  },
  PrivateNetworkAiUrlError: class PrivateNetworkAiUrlError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PrivateNetworkAiUrlError';
    }
  },
  MealTypeNotFoundError: class MealTypeNotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'MealTypeNotFoundError';
    }
  },
  ConfirmFailedError: class ConfirmFailedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ConfirmFailedError';
    }
  },
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import aiMealLogRoutes from '../routes/aiMealLogRoutes.js';
import {
  analyzeMealLogText,
  confirmMealLogItems,
  NoAiServiceError,
} from '../services/aiMealLogService.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/ai', aiMealLogRoutes);
  return app;
}

describe('AI meal log routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /ai/meal-log/analyze returns 400 for invalid body', async () => {
    const res = await request(buildApp()).post('/ai/meal-log/analyze').send({
      text: '',
      entry_date: 'not-a-date',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_request');
  });

  it('POST /ai/meal-log/analyze returns proposed items', async () => {
    vi.mocked(analyzeMealLogText).mockResolvedValue({
      items: [
        {
          client_id: 'c1',
          name: 'Broccoli',
          quantity: 100,
          unit: 'g',
          source: 'usda',
          nutrients: { calories: 34, protein: 2.8, carbs: 7, fat: 0.4 },
        },
      ],
    });

    const res = await request(buildApp()).post('/ai/meal-log/analyze').send({
      text: '100g broccoli',
      entry_date: '2026-08-20',
      meal_type: 'dinner',
    });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(analyzeMealLogText).toHaveBeenCalled();
  });

  it('POST /ai/meal-log/analyze maps missing AI service to 404', async () => {
    vi.mocked(analyzeMealLogText).mockRejectedValue(new NoAiServiceError());
    const res = await request(buildApp()).post('/ai/meal-log/analyze').send({
      text: 'apple',
      entry_date: '2026-08-20',
      meal_type: 'snack',
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('no_ai_service');
  });

  it('POST /ai/meal-log/confirm returns created entry ids', async () => {
    vi.mocked(confirmMealLogItems).mockResolvedValue({
      created_count: 1,
      entry_ids: ['55555555-5555-5555-5555-555555555555'],
    });

    const res = await request(buildApp())
      .post('/ai/meal-log/confirm')
      .send({
        meal_type: 'lunch',
        entry_date: '2026-08-20',
        items: [
          {
            client_id: 'c1',
            name: 'Rice',
            quantity: 150,
            unit: 'g',
            source: 'ai_estimate',
            nutrients: { calories: 200, protein: 4, carbs: 45, fat: 0.5 },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.created_count).toBe(1);
    expect(confirmMealLogItems).toHaveBeenCalled();
  });
});
