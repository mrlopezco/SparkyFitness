import { z } from "zod";

export const trainingPlanPlannerSessionsIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.training_plan_planner_sessions"),
  }),
);

const userIdSchema = z.any();

export const trainingPlanPlannerSessionsSchema = z.object({
  id: trainingPlanPlannerSessionsIdSchema,
  plan_id: z.string(),
  user_id: userIdSchema,
  mode: z.string(),
  status: z.string(),
  summary: z.string().nullable(),
  adjust_from: z.string().nullable(),
  adjust_to: z.string().nullable(),
  created_at: z.date().nullable(),
  updated_at: z.date().nullable(),
  confirmed_at: z.date().nullable(),
  cancelled_at: z.date().nullable(),
});

export type TrainingPlanPlannerSessions = z.infer<
  typeof trainingPlanPlannerSessionsSchema
>;
