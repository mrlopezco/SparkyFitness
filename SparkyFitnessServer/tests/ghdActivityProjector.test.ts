import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const release = vi.fn();
const getClient = vi.fn().mockResolvedValue({ query, release });
const getOrCreateGarminExercise = vi.fn().mockResolvedValue({
  id: 'ex-1',
  name: 'running',
});
const createExerciseEntry = vi.fn().mockResolvedValue({
  entry: { id: 'entry-1' },
});
const createActivityDetail = vi.fn().mockResolvedValue({});
const bulkInsertLaps = vi.fn().mockResolvedValue([]);
const bulkInsertGps = vi.fn().mockResolvedValue([]);

vi.mock('../db/poolManager.js', () => ({
  getClient: (...args: unknown[]) => getClient(...args),
}));

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

vi.mock('../services/garmin/garminExerciseMapper.js', () => ({
  getOrCreateGarminExercise: (...args: unknown[]) =>
    getOrCreateGarminExercise(...args),
}));

vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    _createExerciseEntryWithClient: (...args: unknown[]) =>
      createExerciseEntry(...args),
  },
}));

vi.mock('../models/activityDetailsRepository.js', () => ({
  default: {
    _createActivityDetailWithClient: (...args: unknown[]) =>
      createActivityDetail(...args),
  },
}));

vi.mock('../models/workoutTelemetryRepository.js', () => ({
  _bulkInsertExerciseEntryLapsWithClient: (...args: unknown[]) =>
    bulkInsertLaps(...args),
  _bulkInsertExerciseEntryGpsPointsWithClient: (...args: unknown[]) =>
    bulkInsertGps(...args),
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { projectActivitiesFromProjection } from '../services/garminHealthData/ghdActivityProjector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    path.join(__dirname, 'fixtures/ghdTrainingProjection.json'),
    'utf8'
  )
) as unknown;

beforeEach(() => {
  query.mockReset();
  release.mockClear();
  getClient.mockClear();
  getOrCreateGarminExercise.mockClear();
  createExerciseEntry.mockClear();
  createActivityDetail.mockClear();
  bulkInsertLaps.mockClear();
  bulkInsertGps.mockClear();

  // BEGIN / map miss / entry miss / map upsert / COMMIT
  query
    .mockResolvedValueOnce({ rows: [] }) // BEGIN
    .mockResolvedValueOnce({ rows: [] }) // ghd_activity_map miss
    .mockResolvedValueOnce({ rows: [] }) // exercise_entries miss
    .mockResolvedValueOnce({ rows: [] }) // map upsert
    .mockResolvedValueOnce({ rows: [] }); // COMMIT
});

describe('projectActivitiesFromProjection', () => {
  it('creates an exercise entry with GHD source and writes laps/GPS/map', async () => {
    // Re-wire query for BEGIN then checks then upsert then COMMIT
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }
      if (sql.includes('ghd_activity_map') && sql.includes('SELECT')) {
        return { rows: [] };
      }
      if (sql.includes('exercise_entries') && sql.includes('SELECT')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO ghd_activity_map')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const stats = await projectActivitiesFromProjection(
      'user-1',
      'user-1',
      fixture
    );

    expect(stats.created).toBe(1);
    expect(stats.skipped).toBe(0);
    expect(stats.errors).toEqual([]);

    expect(createExerciseEntry).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({
        source_id: '24055640269',
        entry_date: '2026-08-20',
        calories_burned: 480,
      }),
      'user-1',
      'garmin_health_data'
    );

    expect(createActivityDetail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider_name: 'garmin_health_data',
        exercise_entry_id: 'entry-1',
      })
    );

    expect(bulkInsertLaps).toHaveBeenCalled();
    expect(bulkInsertGps).toHaveBeenCalled();
  });

  it('skips when ghd_activity_map already has the activity', async () => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }
      if (sql.includes('ghd_activity_map') && sql.includes('SELECT')) {
        return { rows: [{ '?column?': 1 }] };
      }
      return { rows: [] };
    });

    const stats = await projectActivitiesFromProjection(
      'user-1',
      'user-1',
      fixture
    );

    expect(stats.created).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(createExerciseEntry).not.toHaveBeenCalled();
  });

  it('skips when classic garmin already imported the same source_id', async () => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }
      if (sql.includes('ghd_activity_map') && sql.includes('SELECT')) {
        return { rows: [] };
      }
      if (sql.includes('exercise_entries') && sql.includes('SELECT')) {
        return { rows: [{ '?column?': 1 }] };
      }
      return { rows: [] };
    });

    const stats = await projectActivitiesFromProjection(
      'user-1',
      'user-1',
      fixture
    );

    expect(stats.created).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(createExerciseEntry).not.toHaveBeenCalled();
  });
});
