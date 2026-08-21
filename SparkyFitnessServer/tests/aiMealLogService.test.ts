import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeMealLogText,
  confirmMealLogItems,
  NoAiServiceError,
  AiMealLogDisabledError,
  MealTypeNotFoundError,
} from '../services/aiMealLogService.js';

vi.mock('../models/chatRepository.js', () => ({
  default: {
    getActiveAiServiceSetting: vi.fn(),
    getAiServiceSettingForBackend: vi.fn(),
  },
}));
vi.mock('../models/globalSettingsRepository.js', () => ({
  default: {
    isUserAiConfigAllowed: vi.fn(),
  },
}));
vi.mock('../models/mealType.js', () => ({
  default: {
    getMealTypeById: vi.fn(),
    getAllMealTypes: vi.fn(),
  },
}));
vi.mock('../models/foodRepository.js', () => ({
  default: {
    getFoodVariantsByFoodId: vi.fn(),
  },
}));
vi.mock('../services/foodNutritionLookupService.js', () => ({
  lookupFoodNutrition: vi.fn(),
}));
vi.mock('../services/foodCoreService.js', () => ({
  default: {
    createFood: vi.fn(),
  },
}));
vi.mock('../services/foodEntryService.js', () => ({
  default: {
    createFoodEntry: vi.fn(),
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../ai/providerDispatch.js', () => ({
  dispatchAiRequest: vi.fn(),
}));
vi.mock('../utils/outboundUrlPolicy.js', () => ({
  deriveAiNetworkPolicy: vi.fn(() => ({ allowPrivateNetwork: false })),
}));
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'PARSE PROMPT'),
}));

import chatRepository from '../models/chatRepository.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import mealTypeRepository from '../models/mealType.js';
import { lookupFoodNutrition } from '../services/foodNutritionLookupService.js';
import foodCoreService from '../services/foodCoreService.js';
import foodEntryService from '../services/foodEntryService.js';
import { dispatchAiRequest } from '../ai/providerDispatch.js';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const MEAL_TYPE_ID = '22222222-2222-2222-2222-222222222222';
const FOOD_ID = '33333333-3333-3333-3333-333333333333';
const VARIANT_ID = '44444444-4444-4444-4444-444444444444';
const ENTRY_ID = '55555555-5555-5555-5555-555555555555';

describe('aiMealLogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(globalSettingsRepository.isUserAiConfigAllowed).mockResolvedValue(
      true
    );
    vi.mocked(chatRepository.getActiveAiServiceSetting).mockResolvedValue({
      id: 'setting-1',
    } as never);
    vi.mocked(chatRepository.getAiServiceSettingForBackend).mockResolvedValue({
      id: 'setting-1',
      service_type: 'google',
      model_name: 'gemini-2.5-flash',
      api_key: 'test-key',
      custom_url: null,
      timeout: null,
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when AI config is disabled globally', async () => {
    vi.mocked(globalSettingsRepository.isUserAiConfigAllowed).mockResolvedValue(
      false
    );
    await expect(
      analyzeMealLogText(USER_ID, USER_ID, {
        text: 'chicken',
        entry_date: '2026-08-20',
        meal_type: 'lunch',
      })
    ).rejects.toBeInstanceOf(AiMealLogDisabledError);
  });

  it('throws when no AI service is configured', async () => {
    vi.mocked(chatRepository.getActiveAiServiceSetting).mockResolvedValue(
      null as never
    );
    await expect(
      analyzeMealLogText(USER_ID, USER_ID, {
        text: 'chicken',
        entry_date: '2026-08-20',
        meal_type: 'lunch',
      })
    ).rejects.toBeInstanceOf(NoAiServiceError);
  });

  it('parses text, looks up nutrition, and returns proposed items', async () => {
    vi.mocked(dispatchAiRequest).mockResolvedValue({
      ok: true,
      text: '',
      json: {
        items: [{ name: 'grilled chicken', quantity: 200, unit: 'g' }],
      },
    });
    vi.mocked(lookupFoodNutrition).mockResolvedValue({
      source: 'internal',
      food: {
        id: FOOD_ID,
        name: 'Grilled Chicken',
        brand: null,
        default_variant: {
          id: VARIANT_ID,
          serving_size: 100,
          serving_unit: 'g',
          calories: 165,
          protein: 31,
          carbs: 0,
          fat: 3.6,
          is_default: true,
        },
        variants: [],
      },
    });

    const result = await analyzeMealLogText(USER_ID, USER_ID, {
      text: 'I ate 200g grilled chicken',
      entry_date: '2026-08-20',
      meal_type: 'lunch',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Grilled Chicken');
    expect(result.items[0].source).toBe('internal');
    expect(result.items[0].food_id).toBe(FOOD_ID);
    expect(result.items[0].nutrients.calories).toBe(165);
    expect(lookupFoodNutrition).toHaveBeenCalledWith(
      USER_ID,
      'grilled chicken'
    );
  });

  it('confirms internal items via createFoodEntry', async () => {
    vi.mocked(mealTypeRepository.getMealTypeById).mockResolvedValue({
      id: MEAL_TYPE_ID,
      name: 'Lunch',
    } as never);
    vi.mocked(foodEntryService.createFoodEntry).mockResolvedValue({
      id: ENTRY_ID,
    } as never);

    const result = await confirmMealLogItems(USER_ID, USER_ID, {
      meal_type_id: MEAL_TYPE_ID,
      entry_date: '2026-08-20',
      items: [
        {
          client_id: 'c1',
          name: 'Grilled Chicken',
          quantity: 200,
          unit: 'g',
          source: 'internal',
          food_id: FOOD_ID,
          variant_id: VARIANT_ID,
          nutrients: {
            calories: 330,
            protein: 62,
            carbs: 0,
            fat: 7,
          },
        },
      ],
    });

    expect(result.created_count).toBe(1);
    expect(result.entry_ids).toEqual([ENTRY_ID]);
    expect(foodEntryService.createFoodEntry).toHaveBeenCalled();
  });

  it('creates food then entry for ai_estimate items', async () => {
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: MEAL_TYPE_ID, name: 'lunch', user_id: null },
    ] as never);
    vi.mocked(foodCoreService.createFood).mockResolvedValue({
      id: FOOD_ID,
      default_variant: {
        id: VARIANT_ID,
        serving_size: 1,
        serving_unit: 'serving',
        calories: 120,
      },
    } as never);
    vi.mocked(foodEntryService.createFoodEntry).mockResolvedValue({
      id: ENTRY_ID,
    } as never);

    const result = await confirmMealLogItems(USER_ID, USER_ID, {
      meal_type: 'lunch',
      entry_date: '2026-08-20',
      items: [
        {
          client_id: 'c2',
          name: 'Homemade smoothie',
          quantity: 1,
          unit: 'serving',
          source: 'ai_estimate',
          nutrients: {
            calories: 120,
            protein: 5,
            carbs: 20,
            fat: 2,
          },
        },
      ],
    });

    expect(result.created_count).toBe(1);
    expect(foodCoreService.createFood).toHaveBeenCalled();
    expect(foodEntryService.createFoodEntry).toHaveBeenCalled();
  });

  it('throws when meal type cannot be resolved on confirm', async () => {
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue(
      [] as never
    );
    await expect(
      confirmMealLogItems(USER_ID, USER_ID, {
        meal_type: 'brunch',
        entry_date: '2026-08-20',
        items: [
          {
            client_id: 'c3',
            name: 'Eggs',
            quantity: 2,
            unit: 'large',
            source: 'ai_estimate',
            nutrients: { calories: 140, protein: 12, carbs: 1, fat: 10 },
          },
        ],
      })
    ).rejects.toBeInstanceOf(MealTypeNotFoundError);
  });
});
