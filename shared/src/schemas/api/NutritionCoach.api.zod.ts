import { z } from "zod";
import { isDayString } from "../../utils/timezone.ts";

const dayStringSchema = z.string().refine((value) => isDayString(value), {
  message: "Must be a YYYY-MM-DD calendar day string",
});

export const nutritionCoachSessionStatusSchema = z.enum(["open", "closed"]);

export const nutritionCoachMetricsAtCloseSchema = z.object({
  as_of_date: dayStringSchema,
  logging_days_per_week_90d: z.number().nonnegative(),
  avg_calories_90d: z.number().nonnegative(),
  avg_protein_g_90d: z.number().nonnegative(),
  late_night_calorie_share_90d: z.number().nullable().optional(),
  training_day_avg_protein_g: z.number().nullable().optional(),
  rest_day_avg_protein_g: z.number().nullable().optional(),
});

export const nutritionCoachLoggingCoverageSchema = z.object({
  days_logged_365: z.number().int().nonnegative(),
  days_logged_90: z.number().int().nonnegative(),
  days_logged_28: z.number().int().nonnegative(),
  window_days_365: z.number().int().positive(),
  first_logged_date: dayStringSchema.nullable(),
  last_logged_date: dayStringSchema.nullable(),
});

export const nutritionCoachMonthlyRollupSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  days_logged: z.number().int().nonnegative(),
  avg_calories: z.number().nonnegative(),
  avg_protein_g: z.number().nonnegative(),
  avg_carbs_g: z.number().nonnegative(),
  avg_fat_g: z.number().nonnegative(),
});

export const nutritionCoachWeeklyRollupSchema = z.object({
  week_start: dayStringSchema,
  days_logged: z.number().int().nonnegative(),
  avg_calories: z.number().nonnegative(),
  avg_protein_g: z.number().nonnegative(),
});

export const nutritionCoachMealStructureRowSchema = z.object({
  meal_type: z.string(),
  avg_calories_per_logged_day: z.number().nonnegative(),
  avg_protein_g_per_logged_day: z.number().nonnegative(),
});

export const nutritionCoachTimeBucketRowSchema = z.object({
  bucket: z.enum(["morning", "afternoon", "evening", "late_night", "unknown"]),
  calorie_share_pct: z.number().nonnegative(),
});

/** How diary rows supply timing (clock vs meal slot vs neither). */
export const nutritionCoachTimingCoverageSchema = z.object({
  entry_count_90d: z.number().int().nonnegative(),
  calorie_share_with_clock_time_pct: z.number().nonnegative(),
  calorie_share_inferred_from_meal_slot_pct: z.number().nonnegative(),
  calorie_share_untagged_pct: z.number().nonnegative(),
});

export const nutritionCoachTopFoodSchema = z.object({
  name: z.string(),
  log_count: z.number().int().nonnegative(),
  avg_calories_per_log: z.number().nonnegative(),
});

export const nutritionCoachSportSummarySchema = z.object({
  sport: z.string(),
  session_count: z.number().int().nonnegative(),
  total_minutes: z.number().nonnegative(),
});

export const nutritionCoachActivitySummarySchema = z.object({
  window_days: z.number().int().positive(),
  by_sport: z.array(nutritionCoachSportSummarySchema),
});

export const nutritionCoachTrainingDayVsRestSchema = z.object({
  window_days: z.number().int().positive(),
  training_day_count: z.number().int().nonnegative(),
  rest_day_count: z.number().int().nonnegative(),
  training_day_avg_calories: z.number().nullable(),
  rest_day_avg_calories: z.number().nullable(),
  training_day_avg_protein_g: z.number().nullable(),
  rest_day_avg_protein_g: z.number().nullable(),
});

export const nutritionCoachActivePlanSnippetSchema = z.object({
  plan_id: z.string().uuid(),
  name: z.string(),
  sport_focus: z.string().nullable().optional(),
  start_date: dayStringSchema,
  target_date: dayStringSchema.nullable().optional(),
  goals: z.array(
    z.object({
      type: z.string(),
      title: z.string(),
      target_date: dayStringSchema.nullable().optional(),
    }),
  ),
  upcoming_sessions: z.array(
    z.object({
      scheduled_date: dayStringSchema,
      session_type: z.string(),
      status: z.string(),
    }),
  ),
});

export const nutritionCoachGoalsAndTargetsSchema = z.object({
  calories: z.number().nullable().optional(),
  protein_g: z.number().nullable().optional(),
  carbs_g: z.number().nullable().optional(),
  fat_g: z.number().nullable().optional(),
  goal_date: dayStringSchema.nullable().optional(),
});

export const nutritionCoachProgressDeltaSchema = z.object({
  baseline_session_id: z.string().uuid().nullable(),
  baseline_closed_at: z.string().nullable(),
  days_since_last_check_in: z.number().int().nonnegative().nullable(),
  deltas: z.object({
    logging_days_per_week_90d: z.number().nullable(),
    avg_protein_g_90d: z.number().nullable(),
    avg_calories_90d: z.number().nullable(),
    training_day_avg_protein_g: z.number().nullable(),
    rest_day_avg_protein_g: z.number().nullable(),
  }),
  coach_commitments_since_baseline: z.array(
    z.object({
      memory_key: z.string(),
      memory_value: z.string(),
      updated_at: z.string(),
    }),
  ),
});

export const nutritionCoachContextPayloadSchema = z.object({
  as_of_date: dayStringSchema,
  logging_coverage: nutritionCoachLoggingCoverageSchema,
  long_term_monthly: z.array(nutritionCoachMonthlyRollupSchema),
  recent_weekly: z.array(nutritionCoachWeeklyRollupSchema),
  meal_structure: z.array(nutritionCoachMealStructureRowSchema),
  entry_time_buckets: z.array(nutritionCoachTimeBucketRowSchema),
  timing_coverage: nutritionCoachTimingCoverageSchema,
  top_foods: z.array(nutritionCoachTopFoodSchema),
  activity_42d: nutritionCoachActivitySummarySchema,
  activity_90d: nutritionCoachActivitySummarySchema,
  training_day_vs_rest: nutritionCoachTrainingDayVsRestSchema,
  active_plan_snippet: nutritionCoachActivePlanSnippetSchema.nullable().optional(),
  goals_and_targets: nutritionCoachGoalsAndTargetsSchema.nullable().optional(),
  notes: z.array(z.string()).optional(),
});

export const nutritionCoachContextSnapshotSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  plan_id: z.string().uuid().nullable(),
  as_of_date: dayStringSchema,
  payload: nutritionCoachContextPayloadSchema,
  token_estimate: z.number().int().nonnegative().nullable(),
  created_at: z.string(),
});

export const nutritionCoachSessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  plan_id: z.string().uuid().nullable(),
  status: nutritionCoachSessionStatusSchema,
  title: z.string().nullable(),
  metrics_at_close: nutritionCoachMetricsAtCloseSchema.nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
});

export const nutritionCoachMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
]);

export const nutritionCoachMessageSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  role: nutritionCoachMessageRoleSchema,
  content: z.string(),
  parts: z.unknown().nullable().optional(),
  created_at: z.string(),
});

export const nutritionCoachSessionSummarySchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  summary: z.string(),
  token_estimate: z.number().int().nonnegative().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const nutritionCoachMemorySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  memory_key: z.string(),
  memory_value: z.string(),
  source: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const nutritionCoachCreateSessionRequestSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  plan_id: z.string().uuid().optional(),
});

export const nutritionCoachSendMessageRequestSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  service_config_id: z.string().uuid().optional(),
});

export const nutritionCoachSendMessageResponseSchema = z.object({
  user_message: nutritionCoachMessageSchema,
  assistant_message: nutritionCoachMessageSchema,
  memories_added: z.number().int().nonnegative().optional(),
});

export const nutritionCoachMemoryUpsertSchema = z.object({
  memory_key: z.string().trim().min(1).max(120),
  memory_value: z.string().trim().min(1).max(2000),
  source: z.enum(["user", "coach", "system"]).optional(),
});

export const nutritionCoachSessionDetailSchema = z.object({
  session: nutritionCoachSessionSchema,
  messages: z.array(nutritionCoachMessageSchema),
  summary: nutritionCoachSessionSummarySchema.nullable().optional(),
});

export type NutritionCoachMetricsAtClose = z.infer<
  typeof nutritionCoachMetricsAtCloseSchema
>;
export type NutritionCoachContextPayload = z.infer<
  typeof nutritionCoachContextPayloadSchema
>;
export type NutritionCoachContextSnapshot = z.infer<
  typeof nutritionCoachContextSnapshotSchema
>;
export type NutritionCoachSession = z.infer<typeof nutritionCoachSessionSchema>;
export type NutritionCoachMessage = z.infer<typeof nutritionCoachMessageSchema>;
export type NutritionCoachSessionSummary = z.infer<
  typeof nutritionCoachSessionSummarySchema
>;
export type NutritionCoachMemory = z.infer<typeof nutritionCoachMemorySchema>;
export type NutritionCoachCreateSessionRequest = z.infer<
  typeof nutritionCoachCreateSessionRequestSchema
>;
export type NutritionCoachSendMessageRequest = z.infer<
  typeof nutritionCoachSendMessageRequestSchema
>;
export type NutritionCoachSendMessageResponse = z.infer<
  typeof nutritionCoachSendMessageResponseSchema
>;
export type NutritionCoachMemoryUpsert = z.infer<
  typeof nutritionCoachMemoryUpsertSchema
>;
export type NutritionCoachSessionDetail = z.infer<
  typeof nutritionCoachSessionDetailSchema
>;
export type NutritionCoachProgressDelta = z.infer<
  typeof nutritionCoachProgressDeltaSchema
>;
