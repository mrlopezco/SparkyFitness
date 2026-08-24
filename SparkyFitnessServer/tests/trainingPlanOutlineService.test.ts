import { describe, expect, it } from 'vitest';
import { outlineWeeksForChunk } from '../services/trainingPlanOutlineService.js';
import type { TrainingPlanOutlineResponse } from '@workspace/shared';

const sampleOutline: TrainingPlanOutlineResponse = {
  summary: 'Build toward race.',
  weeks: [
    {
      week_index: 1,
      start_date: '2026-09-01',
      end_date: '2026-09-07',
      theme: 'base',
      target_weekly_km_min: 20,
      target_weekly_km_max: 28,
    },
    {
      week_index: 2,
      start_date: '2026-09-08',
      end_date: '2026-09-14',
      theme: 'build',
      target_weekly_km_min: 28,
      target_weekly_km_max: 35,
    },
    {
      week_index: 3,
      start_date: '2026-09-15',
      end_date: '2026-09-21',
      theme: 'build',
      target_weekly_km_min: 32,
      target_weekly_km_max: 40,
    },
  ],
};

describe('outlineWeeksForChunk', () => {
  it('returns weeks overlapping the chunk window', () => {
    const weeks = outlineWeeksForChunk(
      sampleOutline,
      '2026-09-01',
      '2026-09-14'
    );
    expect(weeks).toHaveLength(2);
    expect(weeks.map((w) => w.week_index)).toEqual([1, 2]);
  });

  it('returns a single week for a chunk inside one week', () => {
    const weeks = outlineWeeksForChunk(
      sampleOutline,
      '2026-09-10',
      '2026-09-12'
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0]?.week_index).toBe(2);
  });

  it('returns empty when chunk is outside outline weeks', () => {
    const weeks = outlineWeeksForChunk(
      sampleOutline,
      '2026-10-01',
      '2026-10-07'
    );
    expect(weeks).toHaveLength(0);
  });
});

describe('buildProposeChunks integration', () => {
  it('covers full plan day count across chunks', async () => {
    const { buildProposeChunks } = await import(
      '../services/trainingPlanAiService.js'
    );
    const { daysBetween } = await import('@workspace/shared');
    const chunks = buildProposeChunks('2026-09-01', '2026-11-30', 28);
    let totalDays = 0;
    for (const chunk of chunks) {
      totalDays += daysBetween(chunk.start, chunk.end) + 1;
    }
    expect(totalDays).toBe(daysBetween('2026-09-01', '2026-11-30') + 1);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
