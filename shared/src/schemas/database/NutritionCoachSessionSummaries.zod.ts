import { z } from "zod";

export const nutritionCoachSessionSummariesIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.nutrition_coach_session_summaries"),
  }),
);

export const nutritionCoachSessionSummariesSchema = z.object({
  id: nutritionCoachSessionSummariesIdSchema,
  session_id: z.string(),
  summary: z.string(),
  token_estimate: z.number().nullable(),
  created_at: z.date().nullable(),
  updated_at: z.date().nullable(),
});

export type NutritionCoachSessionSummaries = z.infer<
  typeof nutritionCoachSessionSummariesSchema
>;
