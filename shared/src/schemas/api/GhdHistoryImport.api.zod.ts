import { z } from "zod";
import { isDayString } from "../../utils/timezone.ts";
import { ghdHistoryImportJobStatusSchema } from "../database/GhdHistoryImportJobs.zod.ts";

const dayStringSchema = z.string().refine((value) => isDayString(value), {
  message: "Must be a YYYY-MM-DD calendar day string",
});

export const ghdHistoryImportStartRequestSchema = z.object({
  start_date: dayStringSchema,
});

export const ghdHistoryImportFailedWeekSchema = z.object({
  week_start: dayStringSchema,
  week_end: dayStringSchema,
  error: z.string().nullable(),
});

export const ghdHistoryImportCoverageSchema = z.object({
  weeks_total: z.number().int().nonnegative(),
  weeks_completed: z.number().int().nonnegative(),
  weeks_empty: z.number().int().nonnegative(),
  weeks_failed: z.number().int().nonnegative(),
  weeks_pending: z.number().int().nonnegative(),
  failed_weeks: z.array(ghdHistoryImportFailedWeekSchema),
});

export const ghdHistoryImportJobStatusResponseSchema = z.object({
  job_id: z.string().uuid().nullable(),
  status: ghdHistoryImportJobStatusSchema.nullable(),
  range_start: dayStringSchema.nullable(),
  range_end: dayStringSchema.nullable(),
  cursor_day: dayStringSchema.nullable(),
  last_error: z.string().nullable(),
  started_at: z.iso.datetime().nullable(),
  finished_at: z.iso.datetime().nullable(),
  updated_at: z.iso.datetime().nullable(),
  coverage: ghdHistoryImportCoverageSchema.nullable(),
});

export const ghdHistoryImportStartResponseSchema =
  ghdHistoryImportJobStatusResponseSchema.extend({
    job_id: z.string().uuid(),
    status: ghdHistoryImportJobStatusSchema,
  });

export const ghdHistoryImportCancelResponseSchema =
  ghdHistoryImportJobStatusResponseSchema;

export const ghdHistoryImportPauseResponseSchema =
  ghdHistoryImportJobStatusResponseSchema;

export const ghdHistoryImportResumeResponseSchema =
  ghdHistoryImportJobStatusResponseSchema;

export type GhdHistoryImportStartRequest = z.infer<
  typeof ghdHistoryImportStartRequestSchema
>;
export type GhdHistoryImportFailedWeek = z.infer<
  typeof ghdHistoryImportFailedWeekSchema
>;
export type GhdHistoryImportCoverage = z.infer<
  typeof ghdHistoryImportCoverageSchema
>;
export type GhdHistoryImportJobStatusResponse = z.infer<
  typeof ghdHistoryImportJobStatusResponseSchema
>;
export type GhdHistoryImportStartResponse = z.infer<
  typeof ghdHistoryImportStartResponseSchema
>;
export type GhdHistoryImportCancelResponse = z.infer<
  typeof ghdHistoryImportCancelResponseSchema
>;
export type GhdHistoryImportPauseResponse = z.infer<
  typeof ghdHistoryImportPauseResponseSchema
>;
export type GhdHistoryImportResumeResponse = z.infer<
  typeof ghdHistoryImportResumeResponseSchema
>;
