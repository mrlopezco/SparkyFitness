import { z } from "zod";

export const ghdHistoryImportJobsIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.ghd_history_import_jobs"),
  }),
);

export const ghdHistoryImportJobStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export const ghdHistoryImportJobsSchema = z.object({
  id: ghdHistoryImportJobsIdSchema,
  user_id: z.string().uuid(),
  provider_id: z.string().uuid().nullable(),
  status: ghdHistoryImportJobStatusSchema,
  range_start: z.coerce.date(),
  range_end: z.coerce.date(),
  cursor_day: z.coerce.date(),
  weeks_total: z.number().int(),
  weeks_completed: z.number().int(),
  weeks_empty: z.number().int(),
  weeks_failed: z.number().int(),
  last_error: z.string().nullable(),
  started_at: z.coerce.date().nullable(),
  finished_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const ghdHistoryImportJobsInitializerSchema = z.object({
  id: ghdHistoryImportJobsIdSchema.optional(),
  user_id: z.string().uuid(),
  provider_id: z.string().uuid().optional().nullable(),
  status: ghdHistoryImportJobStatusSchema.optional(),
  range_start: z.coerce.date(),
  range_end: z.coerce.date(),
  cursor_day: z.coerce.date(),
  weeks_total: z.number().int().optional(),
  weeks_completed: z.number().int().optional(),
  weeks_empty: z.number().int().optional(),
  weeks_failed: z.number().int().optional(),
  last_error: z.string().optional().nullable(),
  started_at: z.coerce.date().optional().nullable(),
  finished_at: z.coerce.date().optional().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const ghdHistoryImportJobsMutatorSchema = z.object({
  id: ghdHistoryImportJobsIdSchema.optional(),
  user_id: z.string().uuid().optional(),
  provider_id: z.string().uuid().optional().nullable(),
  status: ghdHistoryImportJobStatusSchema.optional(),
  range_start: z.coerce.date().optional(),
  range_end: z.coerce.date().optional(),
  cursor_day: z.coerce.date().optional(),
  weeks_total: z.number().int().optional(),
  weeks_completed: z.number().int().optional(),
  weeks_empty: z.number().int().optional(),
  weeks_failed: z.number().int().optional(),
  last_error: z.string().optional().nullable(),
  started_at: z.coerce.date().optional().nullable(),
  finished_at: z.coerce.date().optional().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type GhdHistoryImportJobStatus = z.infer<
  typeof ghdHistoryImportJobStatusSchema
>;
export type GhdHistoryImportJobs = z.infer<typeof ghdHistoryImportJobsSchema>;
export type GhdHistoryImportJobsInitializer = z.infer<
  typeof ghdHistoryImportJobsInitializerSchema
>;
export type GhdHistoryImportJobsMutator = z.infer<
  typeof ghdHistoryImportJobsMutatorSchema
>;
