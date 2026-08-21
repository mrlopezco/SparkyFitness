import { z } from "zod";

export const trainingCoachMemoriesIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.training_coach_memories"),
  }),
);

const userIdSchema = z.any();

export const trainingCoachMemoriesSchema = z.object({
  id: trainingCoachMemoriesIdSchema,
  plan_id: z.string().nullable(),
  user_id: userIdSchema,
  memory_key: z.string(),
  memory_value: z.string(),
  source: z.string().nullable(),
  created_at: z.date().nullable(),
  updated_at: z.date().nullable(),
});

export const trainingCoachMemoriesInitializerSchema = z.object({
  id: trainingCoachMemoriesIdSchema.optional(),
  plan_id: z.string().optional().nullable(),
  user_id: userIdSchema,
  memory_key: z.string(),
  memory_value: z.string(),
  source: z.string().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export const trainingCoachMemoriesMutatorSchema = z.object({
  id: trainingCoachMemoriesIdSchema.optional(),
  plan_id: z.string().optional().nullable(),
  user_id: userIdSchema.optional(),
  memory_key: z.string().optional(),
  memory_value: z.string().optional(),
  source: z.string().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export type TrainingCoachMemories = z.infer<typeof trainingCoachMemoriesSchema>;
export type TrainingCoachMemoriesInitializer = z.infer<
  typeof trainingCoachMemoriesInitializerSchema
>;
export type TrainingCoachMemoriesMutator = z.infer<
  typeof trainingCoachMemoriesMutatorSchema
>;
