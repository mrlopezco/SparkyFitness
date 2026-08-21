import { z } from "zod";

export const trainingAthleteSnapshotsIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.training_athlete_snapshots"),
  }),
);

const userIdSchema = z.any();

export const trainingAthleteSnapshotsSchema = z.object({
  id: trainingAthleteSnapshotsIdSchema,
  user_id: userIdSchema,
  plan_id: z.string().nullable(),
  as_of_date: z.date(),
  payload: z.unknown(),
  token_estimate: z.number().nullable(),
  created_at: z.date().nullable(),
});

export const trainingAthleteSnapshotsInitializerSchema = z.object({
  id: trainingAthleteSnapshotsIdSchema.optional(),
  user_id: userIdSchema,
  plan_id: z.string().optional().nullable(),
  as_of_date: z.date(),
  payload: z.unknown(),
  token_estimate: z.number().optional().nullable(),
  created_at: z.date().optional().nullable(),
});

export const trainingAthleteSnapshotsMutatorSchema = z.object({
  id: trainingAthleteSnapshotsIdSchema.optional(),
  user_id: userIdSchema.optional(),
  plan_id: z.string().optional().nullable(),
  as_of_date: z.date().optional(),
  payload: z.unknown().optional(),
  token_estimate: z.number().optional().nullable(),
  created_at: z.date().optional().nullable(),
});

export type TrainingAthleteSnapshots = z.infer<
  typeof trainingAthleteSnapshotsSchema
>;
export type TrainingAthleteSnapshotsInitializer = z.infer<
  typeof trainingAthleteSnapshotsInitializerSchema
>;
export type TrainingAthleteSnapshotsMutator = z.infer<
  typeof trainingAthleteSnapshotsMutatorSchema
>;
