import { z } from "zod";

export const trainingCommitmentsIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.training_commitments"),
  }),
);

const userIdSchema = z.any();

export const trainingCommitmentsSchema = z.object({
  id: trainingCommitmentsIdSchema,
  plan_id: z.string(),
  user_id: userIdSchema,
  title: z.string(),
  activity_type: z.string(),
  intensity: z.string(),
  commitment_date: z.date().nullable(),
  recurrence_rule: z.string().nullable(),
  start_time: z.string().nullable(),
  duration_minutes: z.number().nullable(),
  blocks_training: z.boolean(),
  notes: z.string().nullable(),
  created_at: z.date().nullable(),
  updated_at: z.date().nullable(),
});

export const trainingCommitmentsInitializerSchema = z.object({
  id: trainingCommitmentsIdSchema.optional(),
  plan_id: z.string(),
  user_id: userIdSchema,
  title: z.string(),
  activity_type: z.string(),
  intensity: z.string().optional(),
  commitment_date: z.date().optional().nullable(),
  recurrence_rule: z.string().optional().nullable(),
  start_time: z.string().optional().nullable(),
  duration_minutes: z.number().optional().nullable(),
  blocks_training: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export const trainingCommitmentsMutatorSchema = z.object({
  id: trainingCommitmentsIdSchema.optional(),
  plan_id: z.string().optional(),
  user_id: userIdSchema.optional(),
  title: z.string().optional(),
  activity_type: z.string().optional(),
  intensity: z.string().optional(),
  commitment_date: z.date().optional().nullable(),
  recurrence_rule: z.string().optional().nullable(),
  start_time: z.string().optional().nullable(),
  duration_minutes: z.number().optional().nullable(),
  blocks_training: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export type TrainingCommitments = z.infer<typeof trainingCommitmentsSchema>;
export type TrainingCommitmentsInitializer = z.infer<
  typeof trainingCommitmentsInitializerSchema
>;
export type TrainingCommitmentsMutator = z.infer<
  typeof trainingCommitmentsMutatorSchema
>;
