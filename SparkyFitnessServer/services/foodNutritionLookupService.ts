import { log } from '../config/logging.js';
import { VALID_PROVIDER_TYPES } from '../constants/foodProviders.js';
import externalProviderRepository from '../models/externalProviderRepository.js';
import foodRepository from '../models/foodRepository.js';
import {
  searchProviderFoods,
  type ProviderType,
} from './externalFoodSearchService.js';
import preferenceService from './preferenceService.js';

const FOOD_PROVIDER_TYPES = [...VALID_PROVIDER_TYPES];
const NAME_RESOLUTION_WINDOW = 500;

export interface NutritionLookupVariant {
  id?: string;
  serving_size?: number | string | null;
  serving_unit?: string | null;
  calories?: number | string | null;
  energy?: number | string | null;
  protein?: number | string | null;
  carbs?: number | string | null;
  fat?: number | string | null;
  saturated_fat?: number | string | null;
  polyunsaturated_fat?: number | string | null;
  monounsaturated_fat?: number | string | null;
  trans_fat?: number | string | null;
  cholesterol?: number | string | null;
  sodium?: number | string | null;
  potassium?: number | string | null;
  dietary_fiber?: number | string | null;
  sugars?: number | string | null;
  vitamin_a?: number | string | null;
  vitamin_c?: number | string | null;
  calcium?: number | string | null;
  iron?: number | string | null;
  glycemic_index?: string | null;
  is_default?: boolean;
}

export interface NutritionLookupFood {
  id?: string;
  name: string;
  brand?: string | null;
  provider_external_id?: string | null;
  image_url?: string | null;
  image_source_url?: string | null;
  default_variant?: NutritionLookupVariant | null;
  variants?: NutritionLookupVariant[];
  calories?: number | string | null;
  protein?: number | string | null;
  carbs?: number | string | null;
  fat?: number | string | null;
  saturated_fat?: number | string | null;
  polyunsaturated_fat?: number | string | null;
  monounsaturated_fat?: number | string | null;
  trans_fat?: number | string | null;
  cholesterol?: number | string | null;
  sodium?: number | string | null;
  potassium?: number | string | null;
  dietary_fiber?: number | string | null;
  sugars?: number | string | null;
  vitamin_a?: number | string | null;
  vitamin_c?: number | string | null;
  calcium?: number | string | null;
  iron?: number | string | null;
  serving_size?: number | string | null;
  serving_unit?: string | null;
}

export interface NutritionLookupResult {
  source: string;
  food: NutritionLookupFood | null;
  alternatives?: NutritionLookupFood[];
}

/**
 * Re-ranks external provider matches so generic/whole foods win over branded
 * products, and weak token overlaps (e.g. "Kinder" → "Nido Kinder" formula)
 * lose to better coverage.
 */
const QUERY_STOP_WORDS = new Set([
  'with',
  'and',
  'or',
  'the',
  'a',
  'an',
  'of',
  'in',
  'to',
  'for',
  'from',
  'on',
]);

const JUNK_NAME_PATTERNS = [
  /mcdonald/i,
  /burger\s*king/i,
  /wendy'?s/i,
  /taco\s*bell/i,
  /kfc/i,
  /subway/i,
  /starbucks/i,
  /restaurant/i,
  /toddler/i,
  /infant/i,
  /\bformula\b/i,
  /baby\s*food/i,
  /pediatric/i,
];

function tokenizeFoodQuery(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !QUERY_STOP_WORDS.has(token));
}

function tokenMatches(queryToken: string, candidateToken: string): boolean {
  return (
    candidateToken === queryToken ||
    candidateToken.startsWith(queryToken) ||
    queryToken.startsWith(candidateToken)
  );
}

/** Higher is better. Exported for meal-log weak-match rejection. */
export function providerMatchScore(
  food: NutritionLookupFood,
  query: string
): number {
  const q = query.trim().toLowerCase();
  const qStem = q.replace(/s$/, '');
  const qTokens = tokenizeFoodQuery(q);
  const name = String(food?.name ?? '').toLowerCase();
  const brand = String(food?.brand ?? '').trim();
  const branded = Boolean(brand);
  const haystack = `${name} ${brand.toLowerCase()}`;
  const nameTokens = tokenizeFoodQuery(haystack);
  const firstSegment = name.split(',')[0].trim();

  const matchedTokens = qTokens.filter((qt) =>
    nameTokens.some((nt) => tokenMatches(qt, nt))
  );
  const coverage = qTokens.length > 0 ? matchedTokens.length / qTokens.length : 0;

  let score = coverage * 100;

  if (!branded) score += 40;
  else score -= 15;

  if (firstSegment === q || firstSegment === qStem) score += 30;
  else if (firstSegment.startsWith(qStem) || qStem.startsWith(firstSegment)) {
    score += 12;
  } else if (name.includes(q)) {
    score += 5;
  }

  if (coverage >= 1) score += 25;
  else if (coverage < 0.5) score -= 50;
  else if (coverage < 0.75) score -= 20;

  for (const pattern of JUNK_NAME_PATTERNS) {
    if (pattern.test(name) || pattern.test(brand)) {
      score -= 90;
      break;
    }
  }

  const extraTokens = Math.max(0, nameTokens.length - matchedTokens.length);
  if (extraTokens > 3) {
    score -= (extraTokens - 3) * 4;
  }

  // Prefer compact descriptions when coverage is otherwise equal.
  score -= Math.min(nameTokens.length, 16) * 0.4;

  return score;
}

/** Reject provider hits that barely overlap the user's query. */
export const MIN_ACCEPTABLE_PROVIDER_MATCH_SCORE = 55;

export function rankProviderMatches(
  foods: NutritionLookupFood[],
  query: string
): NutritionLookupFood[] {
  return foods
    .map((f, i) => ({ f, i, s: providerMatchScore(f, query) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.f);
}

async function searchInternalExact(
  userId: string,
  foodName: string
): Promise<NutritionLookupFood[]> {
  const rows = await foodRepository.getFoodsWithPagination(
    foodName,
    null,
    userId,
    NAME_RESOLUTION_WINDOW,
    0,
    null
  );
  return rows.filter(
    (r: { name: string }) =>
      String(r.name).toLowerCase() === foodName.toLowerCase()
  ) as NutritionLookupFood[];
}

async function searchInternalBroad(
  userId: string,
  foodName: string
): Promise<NutritionLookupFood[]> {
  const rows = await foodRepository.getFoodsWithPagination(
    foodName,
    null,
    userId,
    20,
    0,
    null
  );
  return rows as NutritionLookupFood[];
}

/**
 * Cascade lookup for food nutrition: internal DB, then the user's active
 * configured external providers (sort_order first), then free OpenFoodFacts.
 * `source: 'ai_estimate'` with a null food signals the AI-estimation fallback.
 */
export async function lookupFoodNutrition(
  userId: string,
  foodName: string,
  providerType?: string
): Promise<NutritionLookupResult> {
  if (!providerType || providerType === 'internal') {
    const internalExact = await searchInternalExact(userId, foodName);
    if (internalExact.length > 0) {
      return {
        source: 'internal',
        food: internalExact[0],
        alternatives: internalExact.slice(1),
      };
    }
    const internalBroad = await searchInternalBroad(userId, foodName);
    if (internalBroad.length > 0) {
      return {
        source: 'internal',
        food: internalBroad[0],
        alternatives: internalBroad.slice(1),
      };
    }
    if (providerType === 'internal') {
      return { source: 'internal', food: null };
    }
  }

  let targetProviders: {
    id?: string;
    provider_type: string;
    provider_name: string;
  }[] = [];

  if (providerType) {
    if (providerType === 'openfoodfacts') {
      targetProviders.push({
        provider_type: 'openfoodfacts',
        provider_name: 'OpenFoodFacts',
      });
    } else {
      const rows = await externalProviderRepository.getActiveProvidersByTypes(
        userId,
        [providerType]
      );
      if (rows.length > 0) {
        targetProviders.push(rows[0]);
      } else {
        targetProviders.push({
          provider_type: providerType,
          provider_name: providerType,
        });
      }
    }
  } else {
    targetProviders =
      await externalProviderRepository.getActiveProvidersByTypes(
        userId,
        FOOD_PROVIDER_TYPES
      );
    if (!targetProviders.some((p) => p.provider_type === 'openfoodfacts')) {
      targetProviders.push({
        provider_type: 'openfoodfacts',
        provider_name: 'OpenFoodFacts',
      });
    }
    const defaultProviderId = (
      await preferenceService.getUserPreferences(userId, userId)
    )?.default_food_data_provider_id;
    if (defaultProviderId) {
      const defaultIndex = targetProviders.findIndex(
        (p) => p.id === defaultProviderId
      );
      if (defaultIndex > 0) {
        const [preferred] = targetProviders.splice(defaultIndex, 1);
        targetProviders.unshift(preferred);
      }
    }
  }

  for (const provider of targetProviders) {
    try {
      log(
        'debug',
        `[FoodNutritionLookup] cascade querying provider: ${provider.provider_name} (${provider.provider_type})`
      );
      const result = await searchProviderFoods(
        userId,
        provider.provider_type as ProviderType,
        foodName,
        { providerId: provider.id }
      );
      if (result.foods.length > 0) {
        const ranked = rankProviderMatches(
          result.foods as NutritionLookupFood[],
          foodName
        );
        // Drop junk / weak token overlaps (e.g. McDonald's salad for
        // "grilled chicken", toddler formula for "Kinder Bueno").
        const acceptable = ranked.filter(
          (food) =>
            providerMatchScore(food, foodName) >=
            MIN_ACCEPTABLE_PROVIDER_MATCH_SCORE
        );
        if (acceptable.length === 0) {
          log(
            'debug',
            `[FoodNutritionLookup] provider ${provider.provider_name} had ${ranked.length} hit(s) but none scored >= ${MIN_ACCEPTABLE_PROVIDER_MATCH_SCORE} for "${foodName}"`
          );
          continue;
        }
        return {
          source: provider.provider_type,
          food: acceptable[0],
          alternatives: acceptable.slice(1, 8),
        };
      }
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : String(error);
      log(
        'warn',
        `[FoodNutritionLookup] provider ${provider.provider_name} failed: ${detail.slice(0, 300)}`
      );
    }
  }

  return { source: 'ai_estimate', food: null };
}
