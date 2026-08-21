import { z } from "zod";

export const trainingGoalsIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.training_goals"),
  }),
);

const userIdSchema = z.any();

export const trainingGoalsSchema = z.object({
  id: trainingGoalsIdSchema,
  plan_id: z.string(),
  user_id: userIdSchema,
  goal_type: z.string(),
  title: z.string(),
  target_date: z.date().nullable(),
  race_distance_meters: z.number().nullable(),
  race_target_seconds: z.number().nullable(),
  weight_target_kg: z.number().nullable(),
  weight_delta_kg: z.number().nullable(),
  notes: z.string().nullable(),
  sort_order: z.number().nullable(),
  created_at: z.date().nullable(),
  updated_at: z.date().nullable(),
});

export const trainingGoalsInitializerSchema = z.object({
  id: trainingGoalsIdSchema.optional(),
  plan_id: z.string(),
  user_id: userIdSchema,
  goal_type: z.string(),
  title: z.string(),
  target_date: z.date().optional().nullable(),
  race_distance_meters: z.number().optional().nullable(),
  race_target_seconds: z.number().optional().nullable(),
  weight_target_kg: z.number().optional().nullable(),
  weight_delta_kg: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  sort_order: z.number().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export const trainingGoalsMutatorSchema = z.object({
  id: trainingGoalsIdSchema.optional(),
  plan_id: z.string().optional(),
  user_id: userIdSchema.optional(),
  goal_type: z.string().optional(),
  title: z.string().optional(),
  target_date: z.date().optional().nullable(),
  race_distance_meters: z.number().optional().nullable(),
  race_target_seconds: z.number().optional().nullable(),
  weight_target_kg: z.number().optional().nullable(),
  weight_delta_kg: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  sort_order: z.number().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export type TrainingGoals = z.infer<typeof trainingGoalsSchema>;
export type TrainingGoalsInitializer = z.infer<
  typeof trainingGoalsInitializerSchema
>;
export type TrainingGoalsMutator = z.infer<typeof trainingGoalsMutatorSchema>;
