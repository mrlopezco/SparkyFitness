import { addDays } from '@workspace/shared';
import type { TrainingAthleteSnapshotPayload } from '@workspace/shared';
import foodMisc from '../models/foodMisc.js';

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

export default { buildNutritionSnapshotBlock };
