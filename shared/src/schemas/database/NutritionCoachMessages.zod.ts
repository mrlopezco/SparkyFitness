import { z } from "zod";

export const nutritionCoachMessagesIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.nutrition_coach_messages"),
  }),
);

export const nutritionCoachMessagesSchema = z.object({
  id: nutritionCoachMessagesIdSchema,
  session_id: z.string(),
  role: z.string(),
  content: z.string(),
  parts: z.unknown().nullable(),
  created_at: z.date().nullable(),
});

export type NutritionCoachMessages = z.infer<typeof nutritionCoachMessagesSchema>;
