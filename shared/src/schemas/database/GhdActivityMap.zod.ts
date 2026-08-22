import { z } from "zod";

export const ghdActivityMapSchema = z.object({
  user_id: z.string().uuid(),
  garmin_activity_id: z.string().min(1),
  exercise_entry_id: z.string().uuid().nullable(),
  last_projected_at: z.coerce.date().nullable(),
});

export const ghdActivityMapInitializerSchema = z.object({
  user_id: z.string().uuid(),
  garmin_activity_id: z.string().min(1),
  exercise_entry_id: z.string().uuid().optional().nullable(),
  last_projected_at: z.coerce.date().optional().nullable(),
});

export const ghdActivityMapMutatorSchema = z.object({
  user_id: z.string().uuid().optional(),
  garmin_activity_id: z.string().min(1).optional(),
  exercise_entry_id: z.string().uuid().optional().nullable(),
  last_projected_at: z.coerce.date().optional().nullable(),
});

export type GhdActivityMap = z.infer<typeof ghdActivityMapSchema>;
export type GhdActivityMapInitializer = z.infer<
  typeof ghdActivityMapInitializerSchema
>;
export type GhdActivityMapMutator = z.infer<typeof ghdActivityMapMutatorSchema>;
