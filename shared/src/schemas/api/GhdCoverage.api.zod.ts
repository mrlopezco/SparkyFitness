import { z } from "zod";
import { isDayString } from "../../utils/timezone.ts";

const dayStringSchema = z.string().refine((value) => isDayString(value), {
  message: "Must be a YYYY-MM-DD calendar day string",
});

export const wearableCoverageSourceSchema = z.enum([
  "garmin_health_data",
  "garmin",
]);

export const wearableCoverageCategoryKeySchema = z.enum([
  "daily_health",
  "sleep",
  "activities",
  "intraday_samples",
  "body_composition",
  "nutrition",
]);

export const wearableCoverageCategorySchema = z.object({
  key: wearableCoverageCategoryKeySchema,
  row_count: z.number().int().nonnegative(),
  earliest_date: dayStringSchema.nullable(),
  latest_date: dayStringSchema.nullable(),
});

export const wearableCoverageSampleMetricSchema = z.object({
  metric: z.string().min(1),
  row_count: z.number().int().nonnegative(),
  earliest_date: dayStringSchema.nullable(),
  latest_date: dayStringSchema.nullable(),
});

export const wearableCoverageLastSyncSchema = z.object({
  status: z.string(),
  start_date: dayStringSchema.nullable(),
  end_date: dayStringSchema.nullable(),
  finished_at: z.string().nullable(),
});

export const wearableCoverageHistoryImportSchema = z.object({
  status: z.string(),
  range_start: dayStringSchema.nullable(),
  range_end: dayStringSchema.nullable(),
  weeks_completed: z.number().int().nonnegative(),
  weeks_total: z.number().int().nonnegative(),
});

export const wearableCoverageResponseSchema = z.object({
  source: wearableCoverageSourceSchema,
  categories: z.array(wearableCoverageCategorySchema),
  sample_metrics: z.array(wearableCoverageSampleMetricSchema),
  last_sync: wearableCoverageLastSyncSchema.nullable(),
  history_import: wearableCoverageHistoryImportSchema.nullable(),
});

/** @deprecated Prefer wearableCoverage* names; kept for existing GHD imports. */
export const ghdCoverageCategoryKeySchema = wearableCoverageCategoryKeySchema;
export const ghdCoverageCategorySchema = wearableCoverageCategorySchema;
export const ghdCoverageSampleMetricSchema = wearableCoverageSampleMetricSchema;
export const ghdCoverageLastSyncSchema = wearableCoverageLastSyncSchema;
export const ghdCoverageHistoryImportSchema =
  wearableCoverageHistoryImportSchema;
export const ghdCoverageResponseSchema = wearableCoverageResponseSchema;

export type WearableCoverageSource = z.infer<
  typeof wearableCoverageSourceSchema
>;
export type WearableCoverageCategoryKey = z.infer<
  typeof wearableCoverageCategoryKeySchema
>;
export type WearableCoverageCategory = z.infer<
  typeof wearableCoverageCategorySchema
>;
export type WearableCoverageSampleMetric = z.infer<
  typeof wearableCoverageSampleMetricSchema
>;
export type WearableCoverageLastSync = z.infer<
  typeof wearableCoverageLastSyncSchema
>;
export type WearableCoverageHistoryImport = z.infer<
  typeof wearableCoverageHistoryImportSchema
>;
export type WearableCoverageResponse = z.infer<
  typeof wearableCoverageResponseSchema
>;

export type GhdCoverageCategoryKey = WearableCoverageCategoryKey;
export type GhdCoverageCategory = WearableCoverageCategory;
export type GhdCoverageSampleMetric = WearableCoverageSampleMetric;
export type GhdCoverageLastSync = WearableCoverageLastSync;
export type GhdCoverageHistoryImport = WearableCoverageHistoryImport;
export type GhdCoverageResponse = WearableCoverageResponse;
