import { describe, expect, it } from 'vitest';
import { buildPlanHealthAdjustNotes } from '../services/trainingPlanHealthService.js';
import type { TrainingPlanHealth } from '@workspace/shared';

describe('buildPlanHealthAdjustNotes', () => {
  it('joins summary lines for adjust user_notes', () => {
    const health: TrainingPlanHealth = {
      plan_id: 'p1',
      as_of_date: '2026-09-07',
      days_to_target: 30,
      last_7_days: {
        planned_run_km: 40,
        completed_run_km: 20,
        quality_planned: 2,
        quality_completed: 1,
        unmatched_planned: 2,
        avg_execution_score: 4,
        injury_skips: 0,
        schedule_skips: 0,
      },
      readiness_summary: null,
      acwr: 1.4,
      fitness_test_stale: true,
      summary_lines: ['Line one.', 'Line two.'],
    };
    expect(buildPlanHealthAdjustNotes(health)).toBe('Line one. Line two.');
  });
});
