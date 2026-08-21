import { z } from "zod";

export const trainingFitnessTestsIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.training_fitness_tests"),
  }),
);

const userIdSchema = z.any();

export const trainingFitnessTestsSchema = z.object({
  id: trainingFitnessTestsIdSchema,
  plan_id: z.string().nullable(),
  user_id: userIdSchema,
  test_type: z.string(),
  title: z.string(),
  scheduled_date: z.date(),
  status: z.string(),
  prescription: z.unknown(),
  result: z.unknown().nullable(),
  source: z.string(),
  due_interval_days: z.number().nullable(),
  notes: z.string().nullable(),
  created_at: z.date().nullable(),
  updated_at: z.date().nullable(),
  completed_at: z.date().nullable(),
});

export const trainingFitnessTestsInitializerSchema = z.object({
  id: trainingFitnessTestsIdSchema.optional(),
  plan_id: z.string().optional().nullable(),
  user_id: userIdSchema,
  test_type: z.string(),
  title: z.string(),
  scheduled_date: z.date(),
  status: z.string().optional(),
  prescription: z.unknown().optional(),
  result: z.unknown().optional().nullable(),
  source: z.string().optional(),
  due_interval_days: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
  completed_at: z.date().optional().nullable(),
});

export const trainingFitnessTestsMutatorSchema = z.object({
  id: trainingFitnessTestsIdSchema.optional(),
  plan_id: z.string().optional().nullable(),
  user_id: userIdSchema.optional(),
  test_type: z.string().optional(),
  title: z.string().optional(),
  scheduled_date: z.date().optional(),
  status: z.string().optional(),
  prescription: z.unknown().optional(),
  result: z.unknown().optional().nullable(),
  source: z.string().optional(),
  due_interval_days: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
  completed_at: z.date().optional().nullable(),
});

export type TrainingFitnessTests = z.infer<typeof trainingFitnessTestsSchema>;
export type TrainingFitnessTestsInitializer = z.infer<
  typeof trainingFitnessTestsInitializerSchema
>;
export type TrainingFitnessTestsMutator = z.infer<
  typeof trainingFitnessTestsMutatorSchema
>;
