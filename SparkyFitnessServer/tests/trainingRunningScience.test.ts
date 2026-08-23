import { describe, expect, it } from 'vitest';
import {
  derivePacesFromRacePredictions,
  formatPaceMinPerKm,
  hasUsablePaces,
  paceMinPerKm,
  riegelPredict,
} from '../services/trainingRunningScience.js';

/** A 20:00 5K and a 41:40 10K: round numbers that make the factors checkable. */
const TWENTY_MINUTE_5K = 1200;
const FORTY_ONE_FORTY_10K = 2500;

describe('paceMinPerKm', () => {
  it('converts a race time to minutes per kilometer', () => {
    expect(paceMinPerKm(TWENTY_MINUTE_5K, 5)).toBe(4);
    expect(paceMinPerKm(FORTY_ONE_FORTY_10K, 10)).toBe(4.17);
  });

  it('rejects a pace no human runs', () => {
    // 12 s/km would be a 1-minute 5K.
    expect(paceMinPerKm(60, 5)).toBeNull();
    // 20 min/km is a slow walk, not a race prediction.
    expect(paceMinPerKm(6000, 5)).toBeNull();
  });

  it('rejects missing, zero, and negative inputs', () => {
    expect(paceMinPerKm(null, 5)).toBeNull();
    expect(paceMinPerKm(undefined, 5)).toBeNull();
    expect(paceMinPerKm(0, 5)).toBeNull();
    expect(paceMinPerKm(-1200, 5)).toBeNull();
    expect(paceMinPerKm(TWENTY_MINUTE_5K, 0)).toBeNull();
  });
});

describe('riegelPredict', () => {
  it('projects a 10K time down to a 5K slightly faster than half', () => {
    const fiveK = riegelPredict(FORTY_ONE_FORTY_10K, 10, 5);
    expect(fiveK).not.toBeNull();
    // Half of 41:40 is 20:50; the endurance exponent makes the 5K faster.
    expect(fiveK as number).toBeLessThan(FORTY_ONE_FORTY_10K / 2);
    expect(fiveK as number).toBeCloseTo(1199.3, 0);
  });

  it('projects a 5K time up to a 10K slower than double', () => {
    const tenK = riegelPredict(TWENTY_MINUTE_5K, 5, 10);
    expect(tenK as number).toBeGreaterThan(TWENTY_MINUTE_5K * 2);
  });

  it('returns null for unusable inputs', () => {
    expect(riegelPredict(null, 10, 5)).toBeNull();
    expect(riegelPredict(FORTY_ONE_FORTY_10K, 0, 5)).toBeNull();
    expect(riegelPredict(FORTY_ONE_FORTY_10K, 10, 0)).toBeNull();
  });
});

describe('derivePacesFromRacePredictions', () => {
  it('derives easy, tempo, and threshold paces from 5K and 10K predictions', () => {
    const paces = derivePacesFromRacePredictions({
      race_prediction_5k_seconds: TWENTY_MINUTE_5K,
      race_prediction_10k_seconds: FORTY_ONE_FORTY_10K,
    });

    expect(paces.estimated_easy_pace_min_per_km).toBe(5);
    expect(paces.estimated_tempo_pace_min_per_km).toBe(4.28);
    expect(paces.estimated_threshold_pace_min_per_km).toBe(4.23);
  });

  it('keeps the zones ordered: easy slowest, then tempo, then threshold', () => {
    const paces = derivePacesFromRacePredictions({
      race_prediction_5k_seconds: TWENTY_MINUTE_5K,
      race_prediction_10k_seconds: FORTY_ONE_FORTY_10K,
    });

    const easy = paces.estimated_easy_pace_min_per_km as number;
    const tempo = paces.estimated_tempo_pace_min_per_km as number;
    const threshold = paces.estimated_threshold_pace_min_per_km as number;
    // Minutes per kilometer, so a bigger number is a slower run.
    expect(easy).toBeGreaterThan(tempo);
    expect(tempo).toBeGreaterThan(threshold);
    // Threshold effort still has to sit outside 5K race pace.
    expect(threshold).toBeGreaterThan(4);
  });

  it('echoes back only the predictions the watch actually published', () => {
    const paces = derivePacesFromRacePredictions({
      race_prediction_10k_seconds: FORTY_ONE_FORTY_10K,
      race_prediction_marathon_seconds: 11400,
    });

    expect(paces.race_prediction_5k_seconds).toBeNull();
    expect(paces.race_prediction_10k_seconds).toBe(FORTY_ONE_FORTY_10K);
    expect(paces.race_prediction_half_marathon_seconds).toBeNull();
    expect(paces.race_prediction_marathon_seconds).toBe(11400);
  });

  it('fills a missing 5K by projecting from the 10K', () => {
    const paces = derivePacesFromRacePredictions({
      race_prediction_10k_seconds: FORTY_ONE_FORTY_10K,
    });

    expect(paces.estimated_easy_pace_min_per_km).toBe(5);
    expect(paces.estimated_tempo_pace_min_per_km).toBe(4.28);
  });

  it('works from a half marathon prediction alone', () => {
    const paces = derivePacesFromRacePredictions({
      race_prediction_half_marathon_seconds: 5700,
    });

    expect(hasUsablePaces(paces)).toBe(true);
    expect(paces.estimated_easy_pace_min_per_km).not.toBeNull();
    expect(paces.estimated_threshold_pace_min_per_km).not.toBeNull();
  });

  it('returns no paces when nothing plausible is available', () => {
    const empty = derivePacesFromRacePredictions({});
    expect(hasUsablePaces(empty)).toBe(false);

    const nonsense = derivePacesFromRacePredictions({
      race_prediction_5k_seconds: 30,
    });
    expect(hasUsablePaces(nonsense)).toBe(false);
  });
});

describe('formatPaceMinPerKm', () => {
  it('renders decimal minutes as mm:ss', () => {
    expect(formatPaceMinPerKm(4)).toBe('4:00');
    expect(formatPaceMinPerKm(4.28)).toBe('4:17');
    expect(formatPaceMinPerKm(5.5)).toBe('5:30');
  });

  it('returns null for a pace it cannot render', () => {
    expect(formatPaceMinPerKm(null)).toBeNull();
    expect(formatPaceMinPerKm(0)).toBeNull();
    expect(formatPaceMinPerKm(Number.NaN)).toBeNull();
  });
});
