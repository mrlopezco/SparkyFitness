import { z } from "zod";

export const ghdSyncRunsIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.ghd_sync_runs"),
  }),
);

export const ghdSyncRunsSchema = z.object({
  id: ghdSyncRunsIdSchema,
  user_id: z.string().uuid(),
  provider_id: z.string().uuid().nullable(),
  started_at: z.coerce.date(),
  finished_at: z.coerce.date().nullable(),
  status: z.string(),
  start_date: z.coerce.date().nullable(),
  end_date: z.coerce.date().nullable(),
  error_summary: z.string().nullable(),
  stats: z.record(z.string(), z.unknown()),
});

export const ghdSyncRunsInitializerSchema = z.object({
  id: ghdSyncRunsIdSchema.optional(),
  user_id: z.string().uuid(),
  provider_id: z.string().uuid().optional().nullable(),
  started_at: z.coerce.date().optional(),
  finished_at: z.coerce.date().optional().nullable(),
  status: z.string().optional(),
  start_date: z.coerce.date().optional().nullable(),
  end_date: z.coerce.date().optional().nullable(),
  error_summary: z.string().optional().nullable(),
  stats: z.record(z.string(), z.unknown()).optional(),
});

export const ghdSyncRunsMutatorSchema = z.object({
  id: ghdSyncRunsIdSchema.optional(),
  user_id: z.string().uuid().optional(),
  provider_id: z.string().uuid().optional().nullable(),
  started_at: z.coerce.date().optional(),
  finished_at: z.coerce.date().optional().nullable(),
  status: z.string().optional(),
  start_date: z.coerce.date().optional().nullable(),
  end_date: z.coerce.date().optional().nullable(),
  error_summary: z.string().optional().nullable(),
  stats: z.record(z.string(), z.unknown()).optional(),
});

export type GhdSyncRuns = z.infer<typeof ghdSyncRunsSchema>;
export type GhdSyncRunsInitializer = z.infer<typeof ghdSyncRunsInitializerSchema>;
export type GhdSyncRunsMutator = z.infer<typeof ghdSyncRunsMutatorSchema>;
