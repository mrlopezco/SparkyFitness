import { describe, expect, it } from 'vitest';
import {
  MIN_ACCEPTABLE_PROVIDER_MATCH_SCORE,
  providerMatchScore,
  rankProviderMatches,
  type NutritionLookupFood,
} from '../services/foodNutritionLookupService.js';

function food(
  name: string,
  brand?: string | null,
  id?: string
): NutritionLookupFood {
  return {
    name,
    brand: brand ?? null,
    provider_external_id: id ?? name,
  };
}

describe('providerMatchScore / rankProviderMatches', () => {
  it('ranks whole banana ahead of a branded snack named BANANA', () => {
    const ranked = rankProviderMatches(
      [
        food('BANANA', "BETTER'N PEANUT BUTTER", 'branded'),
        food('Banana, raw', null, 'whole'),
      ],
      'banana'
    );
    expect(ranked[0].provider_external_id).toBe('whole');
  });

  it('prefers plain grilled chicken over a McDonald\'s salad that mentions grilled chicken', () => {
    const ranked = rankProviderMatches(
      [
        food(
          "McDONALD'S, Bacon Ranch Salad with Grilled Chicken",
          "McDONALD'S",
          'mcd'
        ),
        food(
          'Chicken, broiler or fryers, breast, skinless, boneless, meat only, grilled',
          null,
          'chicken'
        ),
      ],
      'grilled chicken'
    );
    expect(ranked[0].provider_external_id).toBe('chicken');
    expect(
      providerMatchScore(ranked[0], 'grilled chicken')
    ).toBeGreaterThanOrEqual(MIN_ACCEPTABLE_PROVIDER_MATCH_SCORE);
    expect(
      providerMatchScore(
        food(
          "McDONALD'S, Bacon Ranch Salad with Grilled Chicken",
          "McDONALD'S"
        ),
        'grilled chicken'
      )
    ).toBeLessThan(MIN_ACCEPTABLE_PROVIDER_MATCH_SCORE);
  });

  it('rejects Nido Kinder toddler formula for a Kinder Bueno bar query', () => {
    const nido = food('Toddler formula, Nido Kinder', 'Nestle', 'nido');
    expect(providerMatchScore(nido, 'kinder bueno chocolate bar')).toBeLessThan(
      MIN_ACCEPTABLE_PROVIDER_MATCH_SCORE
    );
    expect(providerMatchScore(nido, 'Kinder Bueno')).toBeLessThan(
      MIN_ACCEPTABLE_PROVIDER_MATCH_SCORE
    );
  });

  it('accepts a real Kinder Bueno-style product when present', () => {
    const bueno = food('Kinder Bueno Chocolate Bar', 'Kinder', 'bueno');
    expect(
      providerMatchScore(bueno, 'kinder bueno chocolate bar')
    ).toBeGreaterThanOrEqual(MIN_ACCEPTABLE_PROVIDER_MATCH_SCORE);
  });
});
