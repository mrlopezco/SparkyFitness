import { z } from "zod";

export const ghdHistoryImportWeeksIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.ghd_history_import_weeks"),
  }),
);

export const ghdHistoryImportWeekStatusSchema = z.enum([
  "pending",
  "complete",
  "empty",
  "failed",
]);

export const ghdHistoryImportWeeksSchema = z.object({
  id: ghdHistoryImportWeeksIdSchema,
  job_id: z.string().uuid(),
  user_id: z.string().uuid(),
  week_start: z.coerce.date(),
  week_end: z.coerce.date(),
  status: ghdHistoryImportWeekStatusSchema,
  extract_ok: z.boolean().nullable(),
  project_ok: z.boolean().nullable(),
  error: z.string().nullable(),
  updated_at: z.coerce.date(),
});

export const ghdHistoryImportWeeksInitializerSchema = z.object({
  id: ghdHistoryImportWeeksIdSchema.optional(),
  job_id: z.string().uuid(),
  user_id: z.string().uuid(),
  week_start: z.coerce.date(),
  week_end: z.coerce.date(),
  status: ghdHistoryImportWeekStatusSchema.optional(),
  extract_ok: z.boolean().optional().nullable(),
  project_ok: z.boolean().optional().nullable(),
  error: z.string().optional().nullable(),
  updated_at: z.coerce.date().optional(),
});

export const ghdHistoryImportWeeksMutatorSchema = z.object({
  id: ghdHistoryImportWeeksIdSchema.optional(),
  job_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  week_start: z.coerce.date().optional(),
  week_end: z.coerce.date().optional(),
  status: ghdHistoryImportWeekStatusSchema.optional(),
  extract_ok: z.boolean().optional().nullable(),
  project_ok: z.boolean().optional().nullable(),
  error: z.string().optional().nullable(),
  updated_at: z.coerce.date().optional(),
});

export type GhdHistoryImportWeekStatus = z.infer<
  typeof ghdHistoryImportWeekStatusSchema
>;
export type GhdHistoryImportWeeks = z.infer<typeof ghdHistoryImportWeeksSchema>;
export type GhdHistoryImportWeeksInitializer = z.infer<
  typeof ghdHistoryImportWeeksInitializerSchema
>;
export type GhdHistoryImportWeeksMutator = z.infer<
  typeof ghdHistoryImportWeeksMutatorSchema
>;
