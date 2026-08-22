import { describe, expect, it } from 'vitest';
import { buildSnapshotPayload } from '../services/trainingAthleteSnapshotService.js';
import type {
  ReadinessAggregate,
  SleepAggregate,
} from '../models/trainingPlanRepository.js';

const emptyReadiness = (): ReadinessAggregate => ({
  avg_training_readiness: null,
  latest_training_readiness: null,
  avg_acute_load: null,
  avg_chronic_load: null,
  latest_acwr: null,
  avg_recovery_time_hours: null,
  latest_rhr: null,
  avg_rhr: null,
  avg_body_battery_low: null,
  avg_body_battery_high: null,
  avg_stress: null,
  latest_overnight_hrv: null,
  avg_overnight_hrv: null,
  latest_vo2_max: null,
  lactate_threshold_bpm: null,
  lactate_threshold_speed_mps: null,
  readiness_trend: [],
});

describe('buildSnapshotPayload (phase 3b enrichment)', () => {
  it('maps readiness, sleep, trend, and marathon prediction into a compact payload', () => {
    const readiness: ReadinessAggregate = {
      ...emptyReadiness(),
      avg_training_readiness: 72.4,
      latest_training_readiness: 68,
      avg_acute_load: 310,
      avg_chronic_load: 280.2,
      latest_acwr: 1.12,
      avg_recovery_time_hours: 18.5,
      latest_rhr: 48,
      avg_rhr: 49.2,
      avg_body_battery_low: 22,
      avg_body_battery_high: 88,
      avg_stress: 31,
      latest_overnight_hrv: 55,
      avg_overnight_hrv: 52.6,
      latest_vo2_max: 52.1,
      lactate_threshold_bpm: 168,
      lactate_threshold_speed_mps: 3.85,
      readiness_trend: [
        {
          date: '2026-08-19',
          training_readiness: 70,
          body_battery_lowest: 25,
        },
        {
          date: '2026-08-20',
          training_readiness: 68,
          body_battery_lowest: 22,
        },
      ],
    };

    const sleep: SleepAggregate = {
      nights_logged: 5,
      avg_sleep_score: 81.3,
      avg_hours_asleep: 7.25,
      avg_deep_hours: 1.4,
    };

    const payload = buildSnapshotPayload({
      asOfDate: '2026-08-21',
      windowDays: 42,
      activities: [],
      weights: [],
      readiness,
      sleep,
      racePredictions: {
        race_prediction_5k_seconds: 1200,
        race_prediction_10k_seconds: 2500,
        race_prediction_half_marathon_seconds: 5400,
        race_prediction_marathon_seconds: 11400,
      },
    });

    expect(payload.readiness).toEqual({
      avg_training_readiness: 72.4,
      latest_training_readiness: 68,
      avg_acute_load: 310,
      avg_chronic_load: 280.2,
      latest_acwr: 1.12,
      avg_recovery_time_hours: 18.5,
      latest_rhr: 48,
      avg_rhr: 49.2,
      avg_body_battery_low: 22,
      avg_body_battery_high: 88,
      avg_stress: 31,
      latest_overnight_hrv: 55,
      avg_overnight_hrv: 52.6,
      latest_vo2_max: 52.1,
      lactate_threshold_bpm: 168,
      lactate_threshold_speed_mps: 3.85,
    });

    expect(payload.sleep).toEqual({
      nights_logged: 5,
      avg_sleep_score: 81.3,
      avg_hours_asleep: 7.25,
      avg_deep_hours: 1.4,
    });

    expect(payload.readiness_trend).toEqual([
      {
        date: '2026-08-19',
        training_readiness: 70,
        body_battery_lowest: 25,
      },
      {
        date: '2026-08-20',
        training_readiness: 68,
        body_battery_lowest: 22,
      },
    ]);

    expect(payload.running_science?.race_prediction_marathon_seconds).toBe(
      11400
    );
    expect(payload.notes).toEqual(
      expect.arrayContaining([
        'No running logged in the last 42 days.',
        'No weight check-ins in the window; weight goals are unguided.',
      ])
    );
    expect(payload.notes?.some((note) => note.includes('ACWR'))).toBe(false);
    expect(payload.notes?.some((note) => note.includes('sleep'))).toBe(false);
  });

  it('notes missing sleep and ACWR when readiness exists without those signals', () => {
    const readiness: ReadinessAggregate = {
      ...emptyReadiness(),
      avg_training_readiness: 60,
      avg_acute_load: 200,
      latest_acwr: null,
    };

    const payload = buildSnapshotPayload({
      asOfDate: '2026-08-21',
      windowDays: 14,
      activities: [],
      weights: [],
      readiness,
      sleep: {
        nights_logged: 0,
        avg_sleep_score: null,
        avg_hours_asleep: null,
        avg_deep_hours: null,
      },
    });

    expect(payload.readiness?.avg_training_readiness).toBe(60);
    expect(payload.sleep).toBeUndefined();
    expect(payload.notes).toEqual(
      expect.arrayContaining([
        'ACWR is missing; treat acute/chronic load as soft signals only.',
        'No sleep nights logged in the window; recovery advice is unanchored to sleep.',
      ])
    );
  });
});
