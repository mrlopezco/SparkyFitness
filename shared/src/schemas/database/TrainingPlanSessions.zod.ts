import { z } from "zod";

export const trainingPlanSessionsIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.training_plan_sessions"),
  }),
);

const userIdSchema = z.any();

export const trainingPlanSessionsSchema = z.object({
  id: trainingPlanSessionsIdSchema,
  plan_id: z.string(),
  user_id: userIdSchema,
  scheduled_date: z.date(),
  session_type: z.string(),
  status: z.string(),
  prescription: z.unknown(),
  sort_order: z.number().nullable(),
  created_at: z.date().nullable(),
  updated_at: z.date().nullable(),
});

export const trainingPlanSessionsInitializerSchema = z.object({
  id: trainingPlanSessionsIdSchema.optional(),
  plan_id: z.string(),
  user_id: userIdSchema,
  scheduled_date: z.date(),
  session_type: z.string(),
  status: z.string().optional(),
  prescription: z.unknown().optional(),
  sort_order: z.number().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export const trainingPlanSessionsMutatorSchema = z.object({
  id: trainingPlanSessionsIdSchema.optional(),
  plan_id: z.string().optional(),
  user_id: userIdSchema.optional(),
  scheduled_date: z.date().optional(),
  session_type: z.string().optional(),
  status: z.string().optional(),
  prescription: z.unknown().optional(),
  sort_order: z.number().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export type TrainingPlanSessions = z.infer<typeof trainingPlanSessionsSchema>;
export type TrainingPlanSessionsInitializer = z.infer<
  typeof trainingPlanSessionsInitializerSchema
>;
export type TrainingPlanSessionsMutator = z.infer<
  typeof trainingPlanSessionsMutatorSchema
>;
