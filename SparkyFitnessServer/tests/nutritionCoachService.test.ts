import { describe, expect, it } from 'vitest';
import {
  computeProgressSinceLastCheckIn,
  metricsFromPayload,
} from '../services/nutritionCoachContextService.js';
import { parseNutritionCoachTurn } from '../services/nutritionCoachService.js';
import type { NutritionCoachContextPayload } from '@workspace/shared';

const samplePayload: NutritionCoachContextPayload = {
  as_of_date: '2026-08-26',
  logging_coverage: {
    days_logged_365: 120,
    days_logged_90: 60,
    days_logged_28: 20,
    window_days_365: 365,
    first_logged_date: '2025-01-01',
    last_logged_date: '2026-08-25',
  },
  long_term_monthly: [],
  recent_weekly: [
    {
      week_start: '2026-08-18',
      days_logged: 5,
      avg_calories: 2200,
      avg_protein_g: 90,
    },
  ],
  meal_structure: [],
  entry_time_buckets: [{ bucket: 'late_night', calorie_share_pct: 12 }],
  top_foods: [],
  activity_42d: { window_days: 42, by_sport: [] },
  activity_90d: { window_days: 90, by_sport: [] },
  training_day_vs_rest: {
    window_days: 90,
    training_day_count: 10,
    rest_day_count: 20,
    training_day_avg_calories: 2400,
    rest_day_avg_calories: 2000,
    training_day_avg_protein_g: 100,
    rest_day_avg_protein_g: 80,
  },
};

describe('nutritionCoachContextService', () => {
  it('derives close metrics from payload', () => {
    const metrics = metricsFromPayload(samplePayload);
    expect(metrics.as_of_date).toBe('2026-08-26');
    expect(metrics.avg_calories_90d).toBe(2200);
    expect(metrics.late_night_calorie_share_90d).toBe(12);
    expect(metrics.training_day_avg_protein_g).toBe(100);
  });

  it('computes progress deltas against a baseline', () => {
    const baseline = metricsFromPayload(samplePayload);
    const current = {
      ...baseline,
      avg_protein_g_90d: 95,
      logging_days_per_week_90d: 6,
    };
    const progress = computeProgressSinceLastCheckIn(
      baseline,
      '11111111-1111-1111-1111-111111111111',
      '2026-08-19T12:00:00.000Z',
      current,
      [
        {
          memory_key: 'protein_after_runs',
          memory_value: 'Eat within 2h of long runs',
          updated_at: '2026-08-20T00:00:00.000Z',
        },
      ]
    );
    expect(progress.deltas.avg_protein_g_90d).toBe(5);
    expect(progress.coach_commitments_since_baseline).toHaveLength(1);
    expect(progress.days_since_last_check_in).toBe(7);
  });
});

describe('parseNutritionCoachTurn', () => {
  it('parses reply and caps memories', () => {
    const turn = parseNutritionCoachTurn({
      reply: 'Your logging is solid.',
      memories: [
        {
          memory_key: 'vegetarian',
          memory_value: 'Does not eat meat',
        },
      ],
    });
    expect(turn?.reply).toContain('logging');
    expect(turn?.memories).toHaveLength(1);
  });

  it('rejects missing reply', () => {
    expect(parseNutritionCoachTurn({ memories: [] })).toBeNull();
  });
});
