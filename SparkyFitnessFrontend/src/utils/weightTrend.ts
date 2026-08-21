import {
  getGoalModeAdjustment,
  isGainGoalMode,
} from '@workspace/shared';

export type WeightTrendStatus =
  | 'on_track'
  | 'off_track'
  | 'neutral'
  | 'insufficient_data';

export interface WeightPoint {
  entry_date: string;
  weightKg: number;
}

export interface WeightTrendResult {
  status: WeightTrendStatus;
  /** Newest minus oldest among the evaluated points (kg). */
  deltaKg: number | null;
  /** Current weight minus target (kg); negative means below target. */
  gapToTargetKg: number | null;
}

/** Absolute delta (kg) treated as "flat" for maintain / noise. */
export const FLAT_DELTA_KG = 0.2;

/**
 * Evaluate whether recent weight movement matches the user's goal.
 *
 * `points` should be ordered oldest → newest (at least one entry).
 * Direction comes from Goal Mode; optional target weight refines the verdict.
 */
export function evaluateWeightTrend(
  points: WeightPoint[],
  goalMode: string,
  customPercentage: number = 0,
  targetWeightKg: number | null = null
): WeightTrendResult {
  if (points.length === 0) {
    return {
      status: 'insufficient_data',
      deltaKg: null,
      gapToTargetKg: null,
    };
  }

  const newest = points[points.length - 1]!;
  const gapToTargetKg =
    targetWeightKg != null && Number.isFinite(targetWeightKg)
      ? newest.weightKg - targetWeightKg
      : null;

  if (points.length < 2) {
    return {
      status: 'insufficient_data',
      deltaKg: null,
      gapToTargetKg,
    };
  }

  const oldest = points[0]!;
  const deltaKg = newest.weightKg - oldest.weightKg;
  const adjustment = getGoalModeAdjustment(goalMode, customPercentage);
  const wantGain = isGainGoalMode(goalMode, customPercentage);
  const isMaintain = adjustment === 0;
  const isFlat = Math.abs(deltaKg) < FLAT_DELTA_KG;

  if (isMaintain) {
    if (gapToTargetKg != null) {
      const olderGap = oldest.weightKg - targetWeightKg!;
      const gapImproved = Math.abs(gapToTargetKg) < Math.abs(olderGap) - 1e-9;
      const gapWorsened = Math.abs(gapToTargetKg) > Math.abs(olderGap) + 1e-9;
      if (gapImproved) {
        return { status: 'on_track', deltaKg, gapToTargetKg };
      }
      if (gapWorsened && !isFlat) {
        return { status: 'off_track', deltaKg, gapToTargetKg };
      }
    }
    return {
      status: 'neutral',
      deltaKg,
      gapToTargetKg,
    };
  }

  // Directional goals: sign of delta should match desired direction.
  let directionOk: boolean;
  if (wantGain) {
    directionOk = deltaKg > FLAT_DELTA_KG || (isFlat && gapToTargetKg == null);
  } else {
    directionOk = deltaKg < -FLAT_DELTA_KG || (isFlat && gapToTargetKg == null);
  }

  // Flat without a clear move: neutral unless target says we are drifting away.
  if (isFlat) {
    if (gapToTargetKg != null) {
      const olderGap = oldest.weightKg - targetWeightKg!;
      const gapWorsened = Math.abs(gapToTargetKg) > Math.abs(olderGap) + 1e-9;
      if (gapWorsened) {
        return { status: 'off_track', deltaKg, gapToTargetKg };
      }
    }
    return { status: 'neutral', deltaKg, gapToTargetKg };
  }

  if (gapToTargetKg != null) {
    const olderGap = oldest.weightKg - targetWeightKg!;
    const gapImproved = Math.abs(gapToTargetKg) <= Math.abs(olderGap) + 1e-9;
    if (directionOk && gapImproved) {
      return { status: 'on_track', deltaKg, gapToTargetKg };
    }
    if (!directionOk || !gapImproved) {
      return { status: 'off_track', deltaKg, gapToTargetKg };
    }
  }

  return {
    status: directionOk ? 'on_track' : 'off_track',
    deltaKg,
    gapToTargetKg,
  };
}
