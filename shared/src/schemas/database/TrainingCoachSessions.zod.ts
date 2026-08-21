import { z } from "zod";

export const trainingCoachSessionsIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.training_coach_sessions"),
  }),
);

const userIdSchema = z.any();

export const trainingCoachSessionsSchema = z.object({
  id: trainingCoachSessionsIdSchema,
  plan_id: z.string(),
  user_id: userIdSchema,
  status: z.string(),
  title: z.string().nullable(),
  created_at: z.date().nullable(),
  updated_at: z.date().nullable(),
  closed_at: z.date().nullable(),
});

export const trainingCoachSessionsInitializerSchema = z.object({
  id: trainingCoachSessionsIdSchema.optional(),
  plan_id: z.string(),
  user_id: userIdSchema,
  status: z.string().optional(),
  title: z.string().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
  closed_at: z.date().optional().nullable(),
});

export const trainingCoachSessionsMutatorSchema = z.object({
  id: trainingCoachSessionsIdSchema.optional(),
  plan_id: z.string().optional(),
  user_id: userIdSchema.optional(),
  status: z.string().optional(),
  title: z.string().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
  closed_at: z.date().optional().nullable(),
});

export type TrainingCoachSessions = z.infer<typeof trainingCoachSessionsSchema>;
export type TrainingCoachSessionsInitializer = z.infer<
  typeof trainingCoachSessionsInitializerSchema
>;
export type TrainingCoachSessionsMutator = z.infer<
  typeof trainingCoachSessionsMutatorSchema
>;
