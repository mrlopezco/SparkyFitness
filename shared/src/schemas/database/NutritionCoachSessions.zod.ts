import { z } from "zod";

export const nutritionCoachSessionsIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.nutrition_coach_sessions"),
  }),
);

const userIdSchema = z.any();

export const nutritionCoachSessionsSchema = z.object({
  id: nutritionCoachSessionsIdSchema,
  user_id: userIdSchema,
  plan_id: z.string().nullable(),
  status: z.string(),
  title: z.string().nullable(),
  metrics_at_close: z.unknown().nullable(),
  created_at: z.date().nullable(),
  updated_at: z.date().nullable(),
  closed_at: z.date().nullable(),
});

export type NutritionCoachSessions = z.infer<typeof nutritionCoachSessionsSchema>;
