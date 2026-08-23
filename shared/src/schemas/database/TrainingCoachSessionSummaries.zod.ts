import { z } from "zod";

export const trainingCoachSessionSummariesIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.training_coach_session_summaries"),
  }),
);

export const trainingCoachSessionSummariesSchema = z.object({
  id: trainingCoachSessionSummariesIdSchema,
  session_id: z.string(),
  summary: z.string(),
  token_estimate: z.number().nullable(),
  created_at: z.date().nullable(),
  updated_at: z.date().nullable(),
});

export const trainingCoachSessionSummariesInitializerSchema = z.object({
  id: trainingCoachSessionSummariesIdSchema.optional(),
  session_id: z.string(),
  summary: z.string(),
  token_estimate: z.number().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export const trainingCoachSessionSummariesMutatorSchema = z.object({
  id: trainingCoachSessionSummariesIdSchema.optional(),
  session_id: z.string().optional(),
  summary: z.string().optional(),
  token_estimate: z.number().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export type TrainingCoachSessionSummaries = z.infer<
  typeof trainingCoachSessionSummariesSchema
>;
export type TrainingCoachSessionSummariesInitializer = z.infer<
  typeof trainingCoachSessionSummariesInitializerSchema
>;
export type TrainingCoachSessionSummariesMutator = z.infer<
  typeof trainingCoachSessionSummariesMutatorSchema
>;
