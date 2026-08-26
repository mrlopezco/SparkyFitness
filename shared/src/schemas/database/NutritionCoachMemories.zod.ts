import { z } from "zod";

export const nutritionCoachMemoriesIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.nutrition_coach_memories"),
  }),
);

const userIdSchema = z.any();

export const nutritionCoachMemoriesSchema = z.object({
  id: nutritionCoachMemoriesIdSchema,
  user_id: userIdSchema,
  memory_key: z.string(),
  memory_value: z.string(),
  source: z.string().nullable(),
  created_at: z.date().nullable(),
  updated_at: z.date().nullable(),
});

export type NutritionCoachMemories = z.infer<typeof nutritionCoachMemoriesSchema>;
