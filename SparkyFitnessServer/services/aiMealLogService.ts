import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  aiMealLogParseResponseSchema,
  type AiMealLogAnalyzeRequest,
  type AiMealLogAnalyzeResponse,
  type AiMealLogConfirmRequest,
  type AiMealLogConfirmResponse,
  type AiMealLogNutrients,
  type AiMealLogProposedItem,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type DispatchErrorCategory,
  type JsonSchemaNode,
  type ProviderConfig,
} from '../ai/providerDispatch.js';
import { deriveAiNetworkPolicy } from '../utils/outboundUrlPolicy.js';
import {
  normalizeServingUnit,
  reconcileEntryUnitToVariant,
} from '../utils/foodUtils.js';
import chatRepository from '../models/chatRepository.js';
import foodRepository from '../models/foodRepository.js';
import mealTypeRepository from '../models/mealType.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import foodCoreService from './foodCoreService.js';
import foodEntryService from './foodEntryService.js';
import {
  lookupFoodNutrition,
  type NutritionLookupFood,
  type NutritionLookupVariant,
} from './foodNutritionLookupService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PARSE_PROMPT = readFileSync(
  join(__dirname, '../prompts/ai-meal-log-parse.md'),
  'utf8'
);

const IMPLAUSIBLE_SERVING_UNITS = new Set(['mg', 'mcg', 'µg', 'ug']);

export class NoAiServiceError extends Error {
  constructor(message = 'No AI service configured for this user.') {
    super(message);
    this.name = 'NoAiServiceError';
  }
}

export class AiMealLogDisabledError extends Error {
  constructor(message = 'AI features are disabled for this user.') {
    super(message);
    this.name = 'AiMealLogDisabledError';
  }
}

export class ProviderResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderResponseError';
  }
}

export class PrivateNetworkAiUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivateNetworkAiUrlError';
  }
}

export class MealTypeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MealTypeNotFoundError';
  }
}

export class ConfirmFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfirmFailedError';
  }
}

const DISPATCH_ERROR_TO_THROW = {
  api_key_missing: () => new NoAiServiceError(),
  custom_url_missing: () => new NoAiServiceError(),
  unsupported_provider: (d: string) => new ProviderResponseError(d),
  unsupported_media: (d: string) => new ProviderResponseError(d),
  private_network_forbidden: (d: string) => new PrivateNetworkAiUrlError(d),
  timeout: (d: string) => new ProviderResponseError(d),
  upstream_error: (d: string) => new ProviderResponseError(d),
  refused: (d: string) => new ProviderResponseError(d),
  truncated: (d: string) => new ProviderResponseError(d),
  no_content: (d: string) => new ProviderResponseError(d),
  parse_error: (d: string) => new ProviderResponseError(d),
} satisfies Record<DispatchErrorCategory, (detail: string) => Error>;

const PARSE_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'quantity', 'unit'],
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
        },
      },
    },
  },
};

const ESTIMATE_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'calories', 'protein', 'carbs', 'fat'],
        properties: {
          name: { type: 'string' },
          calories: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
          dietary_fiber: { type: 'number' },
          sugars: { type: 'number' },
          sodium: { type: 'number' },
        },
      },
    },
  },
};

function toNutrientNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function pickBestVariant(
  food: NutritionLookupFood
): NutritionLookupVariant | null {
  const variants: NutritionLookupVariant[] = (
    food.variants?.length ? food.variants : [food.default_variant]
  ).filter((v): v is NutritionLookupVariant => Boolean(v));
  if (variants.length === 0) return food.default_variant ?? null;
  const isPlausible = (v: NutritionLookupVariant) =>
    Number(v.serving_size) > 0 &&
    !IMPLAUSIBLE_SERVING_UNITS.has(String(v.serving_unit || '').toLowerCase());
  const pool = variants.filter(isPlausible);
  const chosen = pool.length > 0 ? pool : variants;
  return chosen.find((v) => v.is_default) ?? chosen[0];
}

function nutrientsFromVariant(
  variant: NutritionLookupVariant | null | undefined,
  food?: NutritionLookupFood | null
): AiMealLogNutrients {
  const src = variant ?? food;
  return {
    calories: toNutrientNumber(src?.calories ?? variant?.energy) ?? 0,
    protein: toNutrientNumber(src?.protein) ?? 0,
    carbs: toNutrientNumber(src?.carbs) ?? 0,
    fat: toNutrientNumber(src?.fat) ?? 0,
    saturated_fat: toNutrientNumber(src?.saturated_fat),
    polyunsaturated_fat: toNutrientNumber(src?.polyunsaturated_fat),
    monounsaturated_fat: toNutrientNumber(src?.monounsaturated_fat),
    trans_fat: toNutrientNumber(src?.trans_fat),
    cholesterol: toNutrientNumber(src?.cholesterol),
    sodium: toNutrientNumber(src?.sodium),
    potassium: toNutrientNumber(src?.potassium),
    dietary_fiber: toNutrientNumber(src?.dietary_fiber),
    sugars: toNutrientNumber(src?.sugars),
    vitamin_a: toNutrientNumber(src?.vitamin_a),
    vitamin_c: toNutrientNumber(src?.vitamin_c),
    calcium: toNutrientNumber(src?.calcium),
    iron: toNutrientNumber(src?.iron),
  };
}

function emptyNutrients(): AiMealLogNutrients {
  return {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  };
}

interface ResolvedMealType {
  id: string;
  name: string;
}

async function resolveMealType(
  userId: string,
  mealTypeId?: string,
  mealType?: string
): Promise<ResolvedMealType | null> {
  if (mealTypeId) {
    const resolved = await mealTypeRepository.getMealTypeById(
      mealTypeId,
      userId
    );
    return resolved ? { id: resolved.id, name: resolved.name } : null;
  }
  if (!mealType) {
    return null;
  }
  const mealTypes = await mealTypeRepository.getAllMealTypes(userId);
  const normalizedName = mealType.trim().toLowerCase();
  const resolved = mealTypes.find(
    (type: { id: string; name: string; user_id: string | null }) =>
      type.user_id === null && type.name.trim().toLowerCase() === normalizedName
  );
  return resolved ? { id: resolved.id, name: resolved.name } : null;
}

async function loadProviderConfig(
  userId: string,
  serviceConfigId: string | undefined,
  actorIsAdmin: boolean
): Promise<{
  provider: ProviderConfig;
  networkPolicy: ReturnType<typeof deriveAiNetworkPolicy>;
}> {
  const userAiConfigAllowed =
    await globalSettingsRepository.isUserAiConfigAllowed();
  if (!userAiConfigAllowed) {
    throw new AiMealLogDisabledError();
  }

  let settingId = serviceConfigId;
  if (!settingId) {
    const active = await chatRepository.getActiveAiServiceSetting(userId);
    if (!active) {
      throw new NoAiServiceError();
    }
    settingId = active.id;
  }

  if (!settingId) {
    throw new NoAiServiceError();
  }

  const aiService = await chatRepository.getAiServiceSettingForBackend(
    settingId,
    userId
  );
  if (!aiService) {
    throw new NoAiServiceError();
  }

  return {
    provider: {
      service_type: aiService.service_type,
      api_key: aiService.api_key ?? undefined,
      model_name: aiService.model_name ?? undefined,
      custom_url: aiService.custom_url ?? undefined,
      timeout: aiService.timeout ?? undefined,
    },
    networkPolicy: deriveAiNetworkPolicy(aiService, actorIsAdmin),
  };
}

async function estimateNutrientsForItems(
  provider: ProviderConfig,
  networkPolicy: ReturnType<typeof deriveAiNetworkPolicy>,
  userId: string,
  items: { name: string; quantity: number; unit: string }[]
): Promise<Map<string, AiMealLogNutrients>> {
  const resultMap = new Map<string, AiMealLogNutrients>();
  if (items.length === 0) {
    return resultMap;
  }

  const list = items
    .map(
      (item, index) =>
        `${index + 1}. ${item.quantity} ${item.unit} of ${item.name}`
    )
    .join('\n');

  const result = await dispatchAiRequest({
    provider,
    networkPolicy,
    prompt: [
      'Estimate nutrition for foods with no database match.',
      'Return JSON only: { "items": [ { "name", "calories", "protein", "carbs", "fat", "dietary_fiber?", "sugars?", "sodium?" } ] }',
      'Values are for the stated quantity/unit. Use typical USDA-like estimates.',
      '',
      list,
    ].join('\n'),
    jsonSchema: ESTIMATE_SCHEMA,
    schemaName: 'ai_meal_log_estimate',
    parseJson: true,
    temperature: 0,
  });

  if (!result.ok) {
    log(
      'warn',
      `AI meal log estimate failed for user ${userId} (${result.category}): ${result.detail}`
    );
    return resultMap;
  }

  const parsed = result.json as {
    items?: {
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      dietary_fiber?: number;
      sugars?: number;
      sodium?: number;
    }[];
  };

  for (const item of parsed.items ?? []) {
    resultMap.set(item.name.trim().toLowerCase(), {
      calories: toNutrientNumber(item.calories) ?? 0,
      protein: toNutrientNumber(item.protein) ?? 0,
      carbs: toNutrientNumber(item.carbs) ?? 0,
      fat: toNutrientNumber(item.fat) ?? 0,
      dietary_fiber: toNutrientNumber(item.dietary_fiber),
      sugars: toNutrientNumber(item.sugars),
      sodium: toNutrientNumber(item.sodium),
    });
  }
  return resultMap;
}

function foodToProposedFields(
  food: NutritionLookupFood,
  source: string,
  quantity: number,
  unit: string
): Omit<
  AiMealLogProposedItem,
  'client_id' | 'quantity' | 'unit' | 'warning' | 'alternatives'
> {
  const variant = pickBestVariant(food);
  const isInternal = source === 'internal' && Boolean(food.id);
  return {
    name: food.name,
    brand: food.brand ?? null,
    source,
    food_id: isInternal ? (food.id ?? null) : null,
    variant_id: isInternal ? (variant?.id ?? null) : null,
    provider_type: isInternal ? null : source,
    provider_external_id: isInternal
      ? null
      : (food.provider_external_id ?? null),
    serving_size: toNutrientNumber(variant?.serving_size ?? food.serving_size),
    serving_unit: variant?.serving_unit ?? food.serving_unit ?? unit,
    nutrients: nutrientsFromVariant(variant, food),
  };
}

function buildProposedFromLookup(
  clientId: string,
  name: string,
  quantity: number,
  unit: string,
  source: string,
  food: NutritionLookupFood | null,
  estimate?: AiMealLogNutrients,
  alternatives: NutritionLookupFood[] = []
): AiMealLogProposedItem {
  if (!food || source === 'ai_estimate') {
    return {
      client_id: clientId,
      name,
      brand: null,
      quantity,
      unit,
      source: 'ai_estimate',
      food_id: null,
      variant_id: null,
      provider_type: null,
      provider_external_id: null,
      serving_size: quantity,
      serving_unit: unit,
      nutrients: estimate ?? emptyNutrients(),
      warning:
        'No food database match — nutrients are AI-estimated. Review before logging.',
      alternatives: undefined,
    };
  }

  const primary = foodToProposedFields(food, source, quantity, unit);
  return {
    client_id: clientId,
    quantity,
    unit,
    warning: null,
    ...primary,
    alternatives: alternatives.slice(0, 6).map((alt) =>
      foodToProposedFields(alt, source, quantity, unit)
    ),
  };
}

export async function analyzeMealLogText(
  authenticatedUserId: string,
  actingUserId: string,
  request: AiMealLogAnalyzeRequest,
  actorIsAdmin = false
): Promise<AiMealLogAnalyzeResponse> {
  const { provider, networkPolicy } = await loadProviderConfig(
    authenticatedUserId,
    request.service_config_id,
    actorIsAdmin
  );

  const parseResult = await dispatchAiRequest({
    provider,
    networkPolicy,
    prompt: `${PARSE_PROMPT}\n\nUSER_MEAL_TEXT:\n${request.text}`,
    jsonSchema: PARSE_SCHEMA,
    schemaName: 'ai_meal_log_parse',
    parseJson: true,
    temperature: 0,
  });

  if (!parseResult.ok) {
    log(
      parseResult.category === 'refused' ||
        parseResult.category === 'no_content'
        ? 'warn'
        : 'error',
      `AI meal log parse: ${provider.service_type} failed for user ${authenticatedUserId} (${parseResult.category}): ${parseResult.detail}`
    );
    throw DISPATCH_ERROR_TO_THROW[parseResult.category](parseResult.detail);
  }

  const parsed = aiMealLogParseResponseSchema.safeParse(parseResult.json);
  if (!parsed.success || parsed.data.items.length === 0) {
    throw new ProviderResponseError(
      'AI could not extract any food items from the text.'
    );
  }

  const lookups = await Promise.all(
    parsed.data.items.map(async (item) => ({
      item,
      lookup: await lookupFoodNutrition(actingUserId, item.name),
    }))
  );

  const needsEstimate = lookups
    .filter(({ lookup }) => lookup.source === 'ai_estimate' || !lookup.food)
    .map(({ item }) => item);

  const estimates = await estimateNutrientsForItems(
    provider,
    networkPolicy,
    authenticatedUserId,
    needsEstimate
  );

  const items = lookups.map(({ item, lookup }) => {
    const estimate = estimates.get(item.name.trim().toLowerCase());
    return buildProposedFromLookup(
      randomUUID(),
      item.name,
      item.quantity,
      item.unit,
      lookup.source,
      lookup.food,
      estimate,
      lookup.alternatives ?? []
    );
  });

  return { items };
}

async function confirmInternalItem(
  authenticatedUserId: string,
  actingUserId: string,
  item: AiMealLogProposedItem,
  mealType: ResolvedMealType,
  entryDate: string,
  entryTime: string | null | undefined
): Promise<string> {
  if (!item.food_id) {
    throw new ConfirmFailedError(`Missing food_id for "${item.name}".`);
  }

  const variantId = item.variant_id ?? undefined;
  let chosenVariant: NutritionLookupVariant | null = null;

  if (variantId) {
    const variants =
      ((await foodRepository.getFoodVariantsByFoodId(
        item.food_id,
        actingUserId
      )) as NutritionLookupVariant[] | null) ?? [];
    chosenVariant = variants.find((v) => v.id === variantId) ?? null;
  }

  const logged = reconcileEntryUnitToVariant(item.quantity, item.unit, {
    serving_size: toNutrientNumber(chosenVariant?.serving_size),
    serving_unit: chosenVariant?.serving_unit ?? null,
  });

  const entry = await foodEntryService.createFoodEntry(
    authenticatedUserId,
    actingUserId,
    {
      user_id: actingUserId,
      food_id: item.food_id,
      variant_id: variantId,
      entry_date: entryDate,
      quantity: logged.quantity,
      unit: logged.unit,
      meal_type_id: mealType.id,
      meal_type: mealType.name,
      entry_time: entryTime ?? null,
      calories: item.nutrients.calories ?? undefined,
      protein: item.nutrients.protein ?? undefined,
      carbs: item.nutrients.carbs ?? undefined,
      fat: item.nutrients.fat ?? undefined,
      saturated_fat: item.nutrients.saturated_fat ?? undefined,
      polyunsaturated_fat: item.nutrients.polyunsaturated_fat ?? undefined,
      monounsaturated_fat: item.nutrients.monounsaturated_fat ?? undefined,
      trans_fat: item.nutrients.trans_fat ?? undefined,
      cholesterol: item.nutrients.cholesterol ?? undefined,
      sodium: item.nutrients.sodium ?? undefined,
      potassium: item.nutrients.potassium ?? undefined,
      dietary_fiber: item.nutrients.dietary_fiber ?? undefined,
      sugars: item.nutrients.sugars ?? undefined,
      vitamin_a: item.nutrients.vitamin_a ?? undefined,
      vitamin_c: item.nutrients.vitamin_c ?? undefined,
      calcium: item.nutrients.calcium ?? undefined,
      iron: item.nutrients.iron ?? undefined,
    }
  );

  return entry.id as string;
}

async function confirmExternalOrEstimateItem(
  authenticatedUserId: string,
  actingUserId: string,
  item: AiMealLogProposedItem,
  mealType: ResolvedMealType,
  entryDate: string,
  entryTime: string | null | undefined
): Promise<string> {
  const isEstimate = item.source === 'ai_estimate';

  let foodMatch: NutritionLookupFood | null = null;
  let providerSource = item.provider_type ?? item.source;

  if (!isEstimate && item.provider_type) {
    const lookup = await lookupFoodNutrition(
      actingUserId,
      item.name,
      item.provider_type
    );
    if (lookup.food) {
      const candidates = [lookup.food, ...(lookup.alternatives ?? [])];
      foodMatch =
        (item.provider_external_id &&
          candidates.find(
            (c) =>
              String(c.provider_external_id ?? '') ===
              String(item.provider_external_id)
          )) ||
        lookup.food;
      providerSource = lookup.source;
    }
  }

  const variant = foodMatch ? pickBestVariant(foodMatch) : null;
  const servingSize =
    toNutrientNumber(variant?.serving_size) ??
    item.serving_size ??
    item.quantity;
  const servingUnit =
    variant?.serving_unit ?? item.serving_unit ?? item.unit ?? 'g';

  const food = await foodCoreService.createFood(actingUserId, {
    user_id: actingUserId,
    name: foodMatch?.name || item.name,
    brand: foodMatch?.brand || item.brand || null,
    serving_size: servingSize ?? 100,
    serving_unit: servingUnit,
    calories: item.nutrients.calories ?? 0,
    protein: item.nutrients.protein ?? 0,
    carbs: item.nutrients.carbs ?? 0,
    fat: item.nutrients.fat ?? 0,
    saturated_fat: item.nutrients.saturated_fat ?? null,
    polyunsaturated_fat: item.nutrients.polyunsaturated_fat ?? null,
    monounsaturated_fat: item.nutrients.monounsaturated_fat ?? null,
    trans_fat: item.nutrients.trans_fat ?? null,
    cholesterol: item.nutrients.cholesterol ?? null,
    sodium: item.nutrients.sodium ?? null,
    potassium: item.nutrients.potassium ?? null,
    dietary_fiber: item.nutrients.dietary_fiber ?? null,
    sugars: item.nutrients.sugars ?? null,
    vitamin_a: item.nutrients.vitamin_a ?? null,
    vitamin_c: item.nutrients.vitamin_c ?? null,
    calcium: item.nutrients.calcium ?? null,
    iron: item.nutrients.iron ?? null,
    source: isEstimate ? 'ai_estimate' : 'imported',
    provider_type: isEstimate ? null : providerSource,
    provider_external_id: isEstimate
      ? null
      : (foodMatch?.provider_external_id ?? item.provider_external_id ?? null),
    image_url: foodMatch?.image_url ?? null,
    image_source_url: foodMatch?.image_source_url ?? null,
  });

  const dv = food.default_variant;
  const variantId = dv?.id as string | undefined;
  let chosenVariant: NutritionLookupVariant | null = dv ?? null;

  if (item.unit && foodMatch?.variants?.length) {
    const normalizedReqUnit = normalizeServingUnit(item.unit);
    const matched = foodMatch.variants.find(
      (v) =>
        normalizeServingUnit(String(v.serving_unit ?? '')) === normalizedReqUnit
    );
    if (matched && dv) {
      // Keep default variant id; unit reconciliation handles quantity.
      chosenVariant = matched;
    }
  }

  const logged = reconcileEntryUnitToVariant(item.quantity, item.unit, {
    serving_size: toNutrientNumber(chosenVariant?.serving_size),
    serving_unit: chosenVariant?.serving_unit ?? null,
  });

  const entry = await foodEntryService.createFoodEntry(
    authenticatedUserId,
    actingUserId,
    {
      user_id: actingUserId,
      food_id: food.id,
      variant_id: variantId,
      entry_date: entryDate,
      quantity: logged.quantity,
      unit: logged.unit,
      meal_type_id: mealType.id,
      meal_type: mealType.name,
      entry_time: entryTime ?? null,
    }
  );

  return entry.id as string;
}

export async function confirmMealLogItems(
  authenticatedUserId: string,
  actingUserId: string,
  request: AiMealLogConfirmRequest
): Promise<AiMealLogConfirmResponse> {
  const mealType = await resolveMealType(
    actingUserId,
    request.meal_type_id,
    request.meal_type
  );
  if (!mealType) {
    throw new MealTypeNotFoundError(
      `Meal type "${request.meal_type_id ?? request.meal_type}" was not found.`
    );
  }

  const entryIds: string[] = [];

  for (const item of request.items) {
    const isInternal = item.source === 'internal' && Boolean(item.food_id);
    const id = isInternal
      ? await confirmInternalItem(
          authenticatedUserId,
          actingUserId,
          item,
          mealType,
          request.entry_date,
          request.entry_time
        )
      : await confirmExternalOrEstimateItem(
          authenticatedUserId,
          actingUserId,
          item,
          mealType,
          request.entry_date,
          request.entry_time
        );
    entryIds.push(id);
  }

  return {
    created_count: entryIds.length,
    entry_ids: entryIds,
  };
}
