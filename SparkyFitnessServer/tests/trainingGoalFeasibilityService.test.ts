import { describe, expect, it } from 'vitest';
import { computeFeasibilityFlags } from '../services/trainingGoalFeasibilityService.js';

describe('computeFeasibilityFlags', () => {
  it('flags aggressive race target vs prediction', () => {
    const flags = computeFeasibilityFlags({
      goals: [
        {
          id: 'g1',
          plan_id: 'p1',
          type: 'race',
          title: 'Sub-20 5K',
          target_date: '2026-12-01',
          race_distance_meters: 5000,
          race_target_seconds: 18 * 60,
          weight_target_kg: null,
          weight_delta_kg: null,
          notes: null,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        },
      ],
      snapshot: {
        as_of_date: '2026-09-01',
        window_days: 42,
        running_science: {
          race_prediction_5k_seconds: 25 * 60,
          race_prediction_10k_seconds: null,
          race_prediction_half_marathon_seconds: null,
          race_prediction_marathon_seconds: null,
          estimated_easy_pace_min_per_km: 6,
          estimated_tempo_pace_min_per_km: 5.5,
          estimated_threshold_pace_min_per_km: 5.2,
        },
      },
      startDate: '2026-09-01',
      targetDate: '2026-12-01',
    });
    expect(flags.some((f) => f.includes('substantially faster'))).toBe(true);
  });

  it('flags missing running history', () => {
    const flags = computeFeasibilityFlags({
      goals: [],
      snapshot: { as_of_date: '2026-09-01', window_days: 42 },
      startDate: '2026-09-01',
      targetDate: '2026-10-01',
    });
    expect(flags.some((f) => f.includes('No running logged'))).toBe(true);
  });
});
