import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertDailyHealthMetrics = vi.fn().mockResolvedValue({});
const upsertSamplesByDay = vi.fn().mockResolvedValue(1);
const deleteSleepEntriesByEntrySourceAndDate = vi.fn().mockResolvedValue(undefined);
const processSleepEntry = vi.fn().mockResolvedValue({});
const processHealthData = vi.fn().mockResolvedValue({});

vi.mock('../models/genericHealthRepository.js', () => ({
  upsertDailyHealthMetrics: (...args: unknown[]) =>
    upsertDailyHealthMetrics(...args),
}));

vi.mock('../services/healthMetricSampleWriter.js', () => ({
  upsertSamplesByDay: (...args: unknown[]) => upsertSamplesByDay(...args),
}));

vi.mock('../models/sleepRepository.js', () => ({
  default: {
    deleteSleepEntriesByEntrySourceAndDate: (
      ...args: unknown[]
    ) => deleteSleepEntriesByEntrySourceAndDate(...args),
  },
}));

vi.mock('../services/measurementService.js', () => ({
  default: {
    processSleepEntry: (...args: unknown[]) => processSleepEntry(...args),
    processHealthData: (...args: unknown[]) => processHealthData(...args),
  },
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { projectHealthFromProjection } from '../services/garminHealthData/ghdHealthProjector.js';
import { parseTrainingProjection } from '../services/garminHealthData/ghdProjectionTypes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    path.join(__dirname, 'fixtures/ghdTrainingProjection.json'),
    'utf8'
  )
) as unknown;

beforeEach(() => {
  upsertDailyHealthMetrics.mockClear();
  upsertSamplesByDay.mockClear();
  deleteSleepEntriesByEntrySourceAndDate.mockClear();
  processSleepEntry.mockClear();
  processHealthData.mockClear();
});

describe('ghdProjectionTypes', () => {
  it('parses the sidecar training projection fixture', () => {
    const parsed = parseTrainingProjection(fixture);
    expect(parsed.daily_metrics).toHaveLength(1);
    expect(parsed.activities?.[0]?.activity_id).toBe('24055640269');
    expect(parsed.samples?.heart_rate?.[0]?.points).toHaveLength(2);
  });

  it('accepts an empty projection object', () => {
    expect(parseTrainingProjection({})).toEqual({});
  });
});

describe('projectHealthFromProjection', () => {
  it('upserts daily metrics, sleep, samples, and body composition', async () => {
    const stats = await projectHealthFromProjection(
      'user-1',
      'user-1',
      fixture,
      '2026-08-20',
      '2026-08-20'
    );

    expect(stats.daily_metrics).toBe(1);
    expect(stats.sleep).toBe(1);
    expect(stats.samples).toBe(6);
    expect(stats.body_composition).toBeGreaterThan(0);
    expect(stats.errors).toEqual([]);

    expect(upsertDailyHealthMetrics).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({
        entry_date: '2026-08-20',
        source_provider: 'garmin_health_data',
        total_steps: 8421,
        active_calories: 512,
        total_distance_meters: 7200,
        recovery_time_hours: 3,
        acwr_ratio: 1.17,
      })
    );

    expect(deleteSleepEntriesByEntrySourceAndDate).toHaveBeenCalledWith(
      'user-1',
      'garmin_health_data',
      '2026-08-20',
      '2026-08-20'
    );
    expect(processSleepEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({
        entry_date: '2026-08-20',
        source: 'garmin_health_data',
        avg_overnight_hrv: 46,
        resting_heart_rate: 50,
        average_spo2_value: 96,
        stage_events: expect.arrayContaining([
          expect.objectContaining({ stage_type: 'deep' }),
        ]),
      })
    );

    expect(upsertSamplesByDay).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      'heart_rate',
      'garmin_health_data',
      expect.arrayContaining([
        expect.objectContaining({ bpm: 120, entry_date: '2026-08-20' }),
      ])
    );

    expect(processHealthData).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'weight',
          value: 72.4,
          source: 'garmin_health_data',
        }),
      ]),
      'user-1',
      'user-1'
    );
  });
});
