import { z } from "zod";

export const trainingPlanPlannerMessagesIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.training_plan_planner_messages"),
  }),
);

export const trainingPlanPlannerMessagesSchema = z.object({
  id: trainingPlanPlannerMessagesIdSchema,
  session_id: z.string(),
  role: z.string(),
  content: z.string(),
  created_at: z.date().nullable(),
});

export type TrainingPlanPlannerMessages = z.infer<
  typeof trainingPlanPlannerMessagesSchema
>;
