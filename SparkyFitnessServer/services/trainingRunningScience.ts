import type { TrainingAthleteSnapshotPayload } from '@workspace/shared';

/**
 * Pure running-science helpers: turn watch-published race predictions into the
 * training paces a plan can actually prescribe. Everything here is a function
 * of its inputs so the formulas can be tuned against tests rather than a
 * database or a provider.
 */

export interface RacePredictionSeconds {
  race_prediction_5k_seconds?: number | null;
  race_prediction_10k_seconds?: number | null;
  race_prediction_half_marathon_seconds?: number | null;
  race_prediction_marathon_seconds?: number | null;
}

export type DerivedPaces = NonNullable<
  TrainingAthleteSnapshotPayload['running_science']
>;

const FIVE_K_KM = 5;
const TEN_K_KM = 10;
const HALF_MARATHON_KM = 21.0975;

/**
 * Riegel's endurance exponent: `T2 = T1 * (D2 / D1) ^ 1.06`. It is the standard
 * way to move a known race time to another distance, and 1.06 is the value
 * Riegel fitted for trained runners.
 */
const RIEGEL_EXPONENT = 1.06;

/**
 * Percentages of 5K race pace, from the classic Daniels/Jack-style zones:
 * - easy is a deliberately wide 115-130%; 125% sits mid-range and keeps easy
 *   days genuinely easy, which is the whole point of the zone
 * - tempo (steady marathon-to-threshold effort) is 106-108%; 107% is the midpoint
 * Threshold is anchored to 10K pace instead (100-103%), because a 10K is run
 * very close to lactate threshold; 101.5% is the midpoint of that band. That
 * puts threshold slightly quicker than tempo, which is the intent: tempo is
 * the sustainable steady effort, threshold is the harder ceiling above it.
 */
const EASY_FACTOR_OF_5K = 1.25;
const TEMPO_FACTOR_OF_5K = 1.07;
const THRESHOLD_FACTOR_OF_10K = 1.015;

/**
 * A prediction outside this range is a bad sync, not a runner: a sub-8-minute
 * 5K is superhuman and a 2-hour one is a walk that would poison every derived
 * pace. Bounds are in seconds per kilometer.
 */
const MIN_PLAUSIBLE_PACE_SEC_PER_KM = 130;
const MAX_PLAUSIBLE_PACE_SEC_PER_KM = 900;

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isUsable(seconds: number | null | undefined): seconds is number {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0;
}

/** Pace in minutes per kilometer, or null when the inputs are unusable. */
export function paceMinPerKm(
  seconds: number | null | undefined,
  distanceKm: number
): number | null {
  if (!isUsable(seconds) || distanceKm <= 0) return null;
  const secondsPerKm = seconds / distanceKm;
  if (
    secondsPerKm < MIN_PLAUSIBLE_PACE_SEC_PER_KM ||
    secondsPerKm > MAX_PLAUSIBLE_PACE_SEC_PER_KM
  ) {
    return null;
  }
  return round(secondsPerKm / 60);
}

/** Riegel-projects a known race time onto another distance, in seconds. */
export function riegelPredict(
  knownSeconds: number | null | undefined,
  knownKm: number,
  targetKm: number
): number | null {
  if (!isUsable(knownSeconds) || knownKm <= 0 || targetKm <= 0) return null;
  return knownSeconds * (targetKm / knownKm) ** RIEGEL_EXPONENT;
}

/** `4.85` -> `"4:51"`. For prompts and UI copy, never for arithmetic. */
export function formatPaceMinPerKm(minPerKm: number | null): string | null {
  if (minPerKm === null || !Number.isFinite(minPerKm) || minPerKm <= 0) {
    return null;
  }
  const totalSeconds = Math.round(minPerKm * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Derives easy / tempo / threshold paces from whichever race predictions are
 * available. A missing 5K or 10K is Riegel-projected from the next closest
 * distance, so a runner whose watch only publishes a half-marathon prediction
 * still gets usable paces. Returns nulls rather than guesses when nothing
 * plausible is available.
 */
export function derivePacesFromRacePredictions(
  predictions: RacePredictionSeconds
): DerivedPaces {
  const fiveK = isUsable(predictions.race_prediction_5k_seconds)
    ? predictions.race_prediction_5k_seconds
    : null;
  const tenK = isUsable(predictions.race_prediction_10k_seconds)
    ? predictions.race_prediction_10k_seconds
    : null;
  const half = isUsable(predictions.race_prediction_half_marathon_seconds)
    ? predictions.race_prediction_half_marathon_seconds
    : null;
  const marathon = isUsable(predictions.race_prediction_marathon_seconds)
    ? predictions.race_prediction_marathon_seconds
    : null;

  const effectiveFiveK =
    fiveK ??
    riegelPredict(tenK, TEN_K_KM, FIVE_K_KM) ??
    riegelPredict(half, HALF_MARATHON_KM, FIVE_K_KM);

  const effectiveTenK =
    tenK ??
    riegelPredict(fiveK, FIVE_K_KM, TEN_K_KM) ??
    riegelPredict(half, HALF_MARATHON_KM, TEN_K_KM);

  const fiveKPace = paceMinPerKm(effectiveFiveK, FIVE_K_KM);
  const tenKPace = paceMinPerKm(effectiveTenK, TEN_K_KM);

  return {
    race_prediction_5k_seconds: fiveK === null ? null : Math.round(fiveK),
    race_prediction_10k_seconds: tenK === null ? null : Math.round(tenK),
    race_prediction_half_marathon_seconds:
      half === null ? null : Math.round(half),
    race_prediction_marathon_seconds:
      marathon === null ? null : Math.round(marathon),
    estimated_easy_pace_min_per_km:
      fiveKPace === null ? null : round(fiveKPace * EASY_FACTOR_OF_5K),
    estimated_tempo_pace_min_per_km:
      fiveKPace === null ? null : round(fiveKPace * TEMPO_FACTOR_OF_5K),
    estimated_threshold_pace_min_per_km:
      tenKPace === null ? null : round(tenKPace * THRESHOLD_FACTOR_OF_10K),
  };
}

/** True when at least one derived pace came out, i.e. worth sending to the AI. */
export function hasUsablePaces(paces: DerivedPaces): boolean {
  return (
    paces.estimated_easy_pace_min_per_km !== null ||
    paces.estimated_tempo_pace_min_per_km !== null ||
    paces.estimated_threshold_pace_min_per_km !== null
  );
}

export default {
  derivePacesFromRacePredictions,
  hasUsablePaces,
  paceMinPerKm,
  riegelPredict,
  formatPaceMinPerKm,
};
