import { z } from "zod";

export const trainingPlansIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.training_plans"),
  }),
);

const userIdSchema = z.any();

export const trainingPlansSchema = z.object({
  id: trainingPlansIdSchema,
  user_id: userIdSchema,
  name: z.string(),
  description: z.string().nullable(),
  sport_focus: z.string(),
  start_date: z.date(),
  target_date: z.date(),
  status: z.string(),
  notes: z.string().nullable(),
  created_at: z.date().nullable(),
  updated_at: z.date().nullable(),
});

export const trainingPlansInitializerSchema = z.object({
  id: trainingPlansIdSchema.optional(),
  user_id: userIdSchema,
  name: z.string(),
  description: z.string().optional().nullable(),
  sport_focus: z.string().optional(),
  start_date: z.date(),
  target_date: z.date(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export const trainingPlansMutatorSchema = z.object({
  id: trainingPlansIdSchema.optional(),
  user_id: userIdSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  sport_focus: z.string().optional(),
  start_date: z.date().optional(),
  target_date: z.date().optional(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export type TrainingPlans = z.infer<typeof trainingPlansSchema>;
export type TrainingPlansInitializer = z.infer<
  typeof trainingPlansInitializerSchema
>;
export type TrainingPlansMutator = z.infer<typeof trainingPlansMutatorSchema>;
