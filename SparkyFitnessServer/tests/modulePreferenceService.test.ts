import { beforeEach, describe, expect, it, vi } from 'vitest';
import modulePreferenceService, {
  UnknownModuleError,
} from '../services/modulePreferenceService.js';
import modulePreferenceRepository from '../models/modulePreferenceRepository.js';

vi.mock('../models/modulePreferenceRepository.js', () => ({
  default: {
    getModulePreferences: vi.fn(),
    upsertModulePreferences: vi.fn(),
  },
}));

const repo = modulePreferenceRepository as unknown as {
  getModulePreferences: ReturnType<typeof vi.fn>;
  upsertModulePreferences: ReturnType<typeof vi.fn>;
};

describe('modulePreferenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEffectiveModules', () => {
    it('returns registry defaults when no row exists', async () => {
      repo.getModulePreferences.mockResolvedValue(null);

      const result =
        await modulePreferenceService.getEffectiveModules('user-1');

      expect(result).toEqual({
        exercises: true,
        medications: true,
        training_plan: false,
      });
    });

    it('merges stored overrides over defaults', async () => {
      repo.getModulePreferences.mockResolvedValue({
        user_id: 'user-1',
        modules: { exercises: false, medications: false },
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result =
        await modulePreferenceService.getEffectiveModules('user-1');

      expect(result).toEqual({
        exercises: false,
        medications: false,
        training_plan: false,
      });
    });
  });

  describe('updateModules', () => {
    it('rejects unknown module ids', async () => {
      await expect(
        modulePreferenceService.updateModules('user-1', {
          not_a_module: true,
        })
      ).rejects.toBeInstanceOf(UnknownModuleError);
      expect(repo.upsertModulePreferences).not.toHaveBeenCalled();
    });

    it('merges partial updates and returns effective map', async () => {
      repo.getModulePreferences.mockResolvedValue({
        user_id: 'user-1',
        modules: { exercises: false },
        created_at: new Date(),
        updated_at: new Date(),
      });
      repo.upsertModulePreferences.mockResolvedValue({
        user_id: 'user-1',
        modules: { exercises: false, medications: false },
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await modulePreferenceService.updateModules('user-1', {
        medications: false,
      });

      expect(repo.upsertModulePreferences).toHaveBeenCalledWith('user-1', {
        exercises: false,
        medications: false,
      });
      expect(result).toEqual({
        exercises: false,
        medications: false,
        training_plan: false,
      });
    });
  });
});
