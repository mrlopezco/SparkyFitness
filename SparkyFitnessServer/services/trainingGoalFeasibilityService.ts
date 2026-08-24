import {
  daysBetween,
  type TrainingAthleteSnapshotPayload,
  type TrainingGoal,
  type TrainingPlanOutlineResponse,
} from '@workspace/shared';
import { riegelPredict } from './trainingRunningScience.js';

const FIVE_K_M = 5000;
const TEN_K_M = 10000;
const HALF_M = 21_097.5;
const MARATHON_M = 42_195;

/** Faster than prediction by more than this fraction is flagged as aggressive. */
const RACE_GOAL_AGGRESSIVE_RATIO = 0.92;

/** Weekly weight change beyond this (kg/week) is flagged. */
const MAX_SAFE_WEIGHT_LOSS_KG_PER_WEEK = 0.75;
const MAX_SAFE_WEIGHT_GAIN_KG_PER_WEEK = 0.35;

function metersToKm(meters: number): number {
  return meters / 1000;
}

function predictedRaceSeconds(
  science: TrainingAthleteSnapshotPayload['running_science'],
  distanceMeters: number
): number | null {
  if (!science) return null;
  const distanceKm = metersToKm(distanceMeters);
  const fiveK = science.race_prediction_5k_seconds;
  const tenK = science.race_prediction_10k_seconds;
  const half = science.race_prediction_half_marathon_seconds;
  const marathon = science.race_prediction_marathon_seconds;

  if (distanceMeters <= FIVE_K_M + 500 && fiveK) return fiveK;
  if (distanceMeters <= TEN_K_M + 500 && tenK) return tenK;
  if (distanceMeters <= HALF_M * 1000 * 1.05 && half) return half;
  if (marathon) return marathon;

  if (fiveK) return riegelPredict(fiveK, metersToKm(FIVE_K_M), distanceKm);
  if (tenK) return riegelPredict(tenK, metersToKm(TEN_K_M), distanceKm);
  if (half) return riegelPredict(half, HALF_M, distanceKm);
  if (marathon) return riegelPredict(marathon, metersToKm(MARATHON_M), distanceKm);
  return null;
}

export interface FeasibilityInputs {
  goals: readonly TrainingGoal[];
  snapshot: TrainingAthleteSnapshotPayload | null | undefined;
  startDate: string;
  targetDate: string;
  outline?: TrainingPlanOutlineResponse | null;
}

/**
 * Deterministic flags for prompts and UI — not medical advice.
 */
export function computeFeasibilityFlags(
  inputs: FeasibilityInputs
): string[] {
  const flags: string[] = [];
  const { goals, snapshot, startDate, targetDate, outline } = inputs;
  const science = snapshot?.running_science;
  const planDays = Math.max(1, daysBetween(startDate, targetDate) + 1);
  const planWeeks = planDays / 7;

  for (const goal of goals) {
    if (
      goal.type === 'race' &&
      goal.race_target_seconds &&
      goal.race_distance_meters
    ) {
      const predicted = predictedRaceSeconds(
        science,
        goal.race_distance_meters
      );
      if (predicted === null) {
        flags.push(
          `Race goal "${goal.title}" has no anchored prediction; schedule a fitness test before trusting race pace.`
        );
      } else if (
        goal.race_target_seconds <
        predicted * RACE_GOAL_AGGRESSIVE_RATIO
      ) {
        flags.push(
          `Race goal "${goal.title}" target time is substantially faster than current predicted fitness.`
        );
      }
    }

    if (goal.type === 'body_weight') {
      const delta = goal.weight_delta_kg;
      if (delta !== null && delta !== undefined && planWeeks > 0) {
        const kgPerWeek = delta / planWeeks;
        if (kgPerWeek < -MAX_SAFE_WEIGHT_LOSS_KG_PER_WEEK) {
          flags.push(
            `Weight goal "${goal.title}" implies losing more than ~${MAX_SAFE_WEIGHT_LOSS_KG_PER_WEEK} kg/week for this plan length.`
          );
        }
        if (kgPerWeek > MAX_SAFE_WEIGHT_GAIN_KG_PER_WEEK) {
          flags.push(
            `Weight goal "${goal.title}" implies gaining weight faster than typical for this plan length.`
          );
        }
      }
      if (!snapshot?.weight?.latest_kg) {
        flags.push(
          `Weight goal "${goal.title}" has no recent weight check-ins to track progress.`
        );
      }
    }
  }

  if (snapshot && (!snapshot.running || snapshot.running.session_count === 0)) {
    flags.push(
      'No running logged in the snapshot window; initial volume should stay conservative.'
    );
  }

  if (outline && outline.weeks.length >= 2) {
    for (let i = 1; i < outline.weeks.length; i += 1) {
      const prev = outline.weeks[i - 1]!;
      const curr = outline.weeks[i]!;
      const prevMax = prev.target_weekly_km_max;
      const currMax = curr.target_weekly_km_max;
      if (
        prevMax != null &&
        currMax != null &&
        prevMax > 0 &&
        currMax > prevMax * 1.15
      ) {
        flags.push(
          `Outline week ${curr.week_index} jumps weekly km more than ~15% from week ${prev.week_index}.`
        );
      }
    }
  }

  return flags;
}

export default { computeFeasibilityFlags };
