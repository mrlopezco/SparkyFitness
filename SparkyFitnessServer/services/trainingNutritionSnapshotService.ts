import type { NutritionCoachContextPayload } from '@workspace/shared';
import nutritionCoachRepository from '../models/nutritionCoachRepository.js';
import foodMisc from '../models/foodMisc.js';
import { addDays } from '@workspace/shared';
import type { TrainingAthleteSnapshotPayload } from '@workspace/shared';

export interface NutritionSnapshotInputs {
  userId: string;
  startDate: string;
  endDate: string;
  latestWeightKg: number | null | undefined;
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function dayList(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export async function buildNutritionSnapshotBlock(
  inputs: NutritionSnapshotInputs
): Promise<
  NonNullable<TrainingAthleteSnapshotPayload['nutrition']> | undefined
> {
  const dates = dayList(inputs.startDate, inputs.endDate);
  if (dates.length === 0) return undefined;

  const rows = await foodMisc.getDailyNutritionSummariesByDates(
    inputs.userId,
    dates
  );

  let daysWithFood = 0;
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;

  for (const row of rows) {
    const cal = Number(row.total_calories ?? 0);
    if (cal <= 0) continue;
    daysWithFood += 1;
    calories += cal;
    protein += Number(row.total_protein ?? 0);
    carbs += Number(row.total_carbs ?? 0);
    fat += Number(row.total_fat ?? 0);
  }

  if (daysWithFood === 0) return undefined;

  const avgCalories = calories / daysWithFood;
  const avgProtein = protein / daysWithFood;
  const avgCarbs = carbs / daysWithFood;
  const avgFat = fat / daysWithFood;
  const weight = inputs.latestWeightKg;
  const proteinGPerKg =
    weight != null && weight > 0 ? avgProtein / weight : null;

  return {
    days_logged: daysWithFood,
    window_days: dates.length,
    avg_calories: round(avgCalories),
    avg_protein_g: round(avgProtein),
    avg_carbs_g: round(avgCarbs),
    avg_fat_g: round(avgFat),
    protein_g_per_kg:
      proteinGPerKg != null ? round(proteinGPerKg, 2) : null,
  };
}

export interface NutritionDiaryAnalytics {
  meal_structure: NonNullable<
    NutritionCoachContextPayload['meal_structure']
  >;
  entry_time_buckets: NonNullable<
    NutritionCoachContextPayload['entry_time_buckets']
  >;
  timing_coverage: NutritionCoachContextPayload['timing_coverage'];
}

/** Meal slots, day-part buckets, and timing coverage for a date window. */
export async function buildNutritionDiaryAnalytics(
  userId: string,
  startDate: string,
  endDate: string
): Promise<NutritionDiaryAnalytics> {
  const [meal_structure, entry_time_buckets, timingRow] = await Promise.all([
    nutritionCoachRepository.getMealStructureAggregates(
      userId,
      startDate,
      endDate
    ),
    nutritionCoachRepository.getEntryTimeBucketShares(
      userId,
      startDate,
      endDate
    ),
    nutritionCoachRepository.getTimingCoverage(userId, startDate, endDate),
  ]);

  return {
    meal_structure,
    entry_time_buckets: entry_time_buckets.map((row) => ({
      bucket: row.bucket as NutritionDiaryAnalytics['entry_time_buckets'][number]['bucket'],
      calorie_share_pct: row.calorie_share_pct,
    })),
    timing_coverage: {
      entry_count_90d: timingRow.entry_count,
      calorie_share_with_clock_time_pct:
        timingRow.calorie_share_with_clock_time_pct,
      calorie_share_inferred_from_meal_slot_pct:
        timingRow.calorie_share_inferred_from_meal_slot_pct,
      calorie_share_untagged_pct: timingRow.calorie_share_untagged_pct,
    },
  };
}

/**
 * Macro rollup plus meal/timing analytics for athlete snapshot and nutrition coach.
 */
export async function buildAthleteNutritionBlock(
  inputs: NutritionSnapshotInputs
): Promise<
  NonNullable<TrainingAthleteSnapshotPayload['nutrition']> | undefined
> {
  const base = await buildNutritionSnapshotBlock(inputs);
  if (!base) return undefined;

  const analytics = await buildNutritionDiaryAnalytics(
    inputs.userId,
    inputs.startDate,
    inputs.endDate
  );

  return {
    ...base,
    meal_structure: analytics.meal_structure,
    entry_time_buckets: analytics.entry_time_buckets,
    timing_coverage: {
      entry_count: analytics.timing_coverage.entry_count_90d,
      calorie_share_with_clock_time_pct:
        analytics.timing_coverage.calorie_share_with_clock_time_pct,
      calorie_share_inferred_from_meal_slot_pct:
        analytics.timing_coverage.calorie_share_inferred_from_meal_slot_pct,
      calorie_share_untagged_pct:
        analytics.timing_coverage.calorie_share_untagged_pct,
    },
  };
}

export default {
  buildNutritionSnapshotBlock,
  buildNutritionDiaryAnalytics,
  buildAthleteNutritionBlock,
};
