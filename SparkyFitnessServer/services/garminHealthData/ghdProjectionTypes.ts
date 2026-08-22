/**
 * Zod schemas for SparkyFitnessGhd /projection/training JSON.
 * Empty top-level arrays are omitted by the sidecar; all collections optional.
 */

import { z } from 'zod';

const nullableNumber = z.number().nullable().optional();
const nullableString = z.string().nullable().optional();

export const ghdDailyMetricSchema = z.object({
  date: z.string(),
  steps: nullableNumber,
  active_calories: nullableNumber,
  bmr_calories: nullableNumber,
  total_calories: nullableNumber,
  floors_ascended: nullableNumber,
  floors_descended: nullableNumber,
  moderate_intensity_minutes: nullableNumber,
  vigorous_intensity_minutes: nullableNumber,
  resting_heart_rate: nullableNumber,
  avg_stress: nullableNumber,
  max_stress: nullableNumber,
  body_battery_high: nullableNumber,
  body_battery_low: nullableNumber,
  body_battery_charged: nullableNumber,
  body_battery_drained: nullableNumber,
  vo2_max: nullableNumber,
  training_readiness_score: nullableNumber,
  acute_training_load: nullableNumber,
  chronic_training_load: nullableNumber,
  acwr: nullableNumber,
  recovery_time_minutes: nullableNumber,
});

export const ghdSleepStageSchema = z.object({
  stage_type: z.string(),
  start_time: nullableString,
  end_time: nullableString,
  duration_in_seconds: nullableNumber,
});

export const ghdSleepEntrySchema = z.object({
  entry_date: z.string(),
  bedtime: nullableString,
  wake_time: nullableString,
  duration_in_seconds: nullableNumber,
  time_asleep_in_seconds: nullableNumber,
  sleep_score: nullableNumber,
  deep_sleep_seconds: nullableNumber,
  light_sleep_seconds: nullableNumber,
  rem_sleep_seconds: nullableNumber,
  awake_sleep_seconds: nullableNumber,
  avg_overnight_hrv: nullableNumber,
  resting_heart_rate: nullableNumber,
  average_spo2_value: nullableNumber,
  stages: z.array(ghdSleepStageSchema).optional(),
});

export const ghdGpsPointSchema = z.object({
  t: nullableString,
  lat: nullableNumber,
  lon: nullableNumber,
  alt: nullableNumber,
  speed: nullableNumber,
  hr: nullableNumber,
  cad: nullableNumber,
});

export const ghdActivityLapSchema = z
  .object({
    lap_index: z.number().optional(),
  })
  .passthrough();

export const ghdActivitySchema = z.object({
  activity_id: z.string(),
  name: z.string().optional().default(''),
  activity_type: z.string().optional().default(''),
  start_time: nullableString,
  duration_minutes: nullableNumber,
  distance_km: nullableNumber,
  calories: nullableNumber,
  avg_heart_rate: nullableNumber,
  max_heart_rate: nullableNumber,
  steps: nullableNumber,
  laps: z.array(ghdActivityLapSchema).optional().default([]),
  gps_points: z.array(ghdGpsPointSchema).optional().default([]),
  detail_data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const ghdBodyCompositionSchema = z.object({
  date: nullableString,
  weight_kg: nullableNumber,
  bmi: nullableNumber,
  body_fat_percentage: nullableNumber,
  muscle_mass_kg: nullableNumber,
  bone_mass_kg: nullableNumber,
  body_water_percentage: nullableNumber,
});

export const ghdSampleDaySchema = z.object({
  date: z.string(),
  points: z.array(z.record(z.string(), z.unknown())),
});

export const ghdSamplesSchema = z.object({
  heart_rate: z.array(ghdSampleDaySchema).optional(),
  stress: z.array(ghdSampleDaySchema).optional(),
  body_battery: z.array(ghdSampleDaySchema).optional(),
  hrv: z.array(ghdSampleDaySchema).optional(),
  respiration: z.array(ghdSampleDaySchema).optional(),
  spo2: z.array(ghdSampleDaySchema).optional(),
});

export const ghdTrainingProjectionSchema = z.object({
  daily_metrics: z.array(ghdDailyMetricSchema).optional(),
  sleep: z.array(ghdSleepEntrySchema).optional(),
  activities: z.array(ghdActivitySchema).optional(),
  body_composition: z.array(ghdBodyCompositionSchema).optional(),
  samples: ghdSamplesSchema.optional(),
});

export type GhdDailyMetric = z.infer<typeof ghdDailyMetricSchema>;
export type GhdSleepEntry = z.infer<typeof ghdSleepEntrySchema>;
export type GhdActivity = z.infer<typeof ghdActivitySchema>;
export type GhdBodyComposition = z.infer<typeof ghdBodyCompositionSchema>;
export type GhdTrainingProjection = z.infer<typeof ghdTrainingProjectionSchema>;

export function parseTrainingProjection(payload: unknown): GhdTrainingProjection {
  if (
    payload === null ||
    payload === undefined ||
    (typeof payload === 'object' && Object.keys(payload as object).length === 0)
  ) {
    return {};
  }
  return ghdTrainingProjectionSchema.parse(payload);
}
