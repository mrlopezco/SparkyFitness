import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

vi.mock('../services/garminHealthData/ghdConstants.js', () => ({
  GHD_SOURCE_PROVIDER: 'garmin_health_data',
}));

import { getClient } from '../db/poolManager.js';
import { getGhdCoverage } from '../models/ghdCoverageRepository.js';

describe('getGhdCoverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates category spans and sync metadata', async () => {
    const query = vi.fn();
    const release = vi.fn();
    vi.mocked(getClient).mockResolvedValue({
      query,
      release,
    } as never);

    // daily, sleep, activities, samples, body, sample_metrics, last_sync, history
    query
      .mockResolvedValueOnce({
        rows: [
          {
            row_count: 10,
            earliest_date: '2026-01-01',
            latest_date: '2026-08-01',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            row_count: 8,
            earliest_date: '2026-02-01',
            latest_date: '2026-08-01',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            row_count: 3,
            earliest_date: '2026-07-01',
            latest_date: '2026-07-15',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            row_count: 20,
            earliest_date: '2026-07-01',
            latest_date: '2026-08-01',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ row_count: 0, earliest_date: null, latest_date: null }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            metric: 'heart_rate',
            row_count: 12,
            earliest_date: '2026-07-01',
            latest_date: '2026-08-01',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            status: 'success',
            start_date: '2026-08-18',
            end_date: '2026-08-21',
            finished_at: new Date('2026-08-21T12:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            status: 'completed',
            range_start: '2025-08-21',
            range_end: '2026-08-21',
            weeks_completed: 52,
            weeks_total: 52,
          },
        ],
      });

    const coverage = await getGhdCoverage('user-1');

    expect(coverage.source).toBe('garmin_health_data');
    expect(coverage.categories.find((c) => c.key === 'daily_health')).toEqual({
      key: 'daily_health',
      row_count: 10,
      earliest_date: '2026-01-01',
      latest_date: '2026-08-01',
    });
    expect(coverage.sample_metrics).toHaveLength(1);
    expect(coverage.last_sync?.status).toBe('success');
    expect(coverage.history_import?.weeks_completed).toBe(52);
    expect(release).toHaveBeenCalled();
  });
});
