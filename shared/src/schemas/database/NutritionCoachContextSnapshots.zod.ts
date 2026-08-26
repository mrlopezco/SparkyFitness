import { z } from "zod";

export const nutritionCoachContextSnapshotsIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.nutrition_coach_context_snapshots"),
  }),
);

const userIdSchema = z.any();

export const nutritionCoachContextSnapshotsSchema = z.object({
  id: nutritionCoachContextSnapshotsIdSchema,
  user_id: userIdSchema,
  plan_id: z.string().nullable(),
  as_of_date: z.string(),
  payload: z.unknown(),
  token_estimate: z.number().nullable(),
  created_at: z.date().nullable(),
});

export type NutritionCoachContextSnapshots = z.infer<
  typeof nutritionCoachContextSnapshotsSchema
>;
