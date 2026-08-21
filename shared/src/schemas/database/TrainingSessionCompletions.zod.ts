import { z } from "zod";

export const trainingSessionCompletionsIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.training_session_completions"),
  }),
);

export const trainingSessionCompletionsSchema = z.object({
  id: trainingSessionCompletionsIdSchema,
  plan_session_id: z.string(),
  exercise_entry_id: z.string().nullable(),
  adherence_score: z.number().nullable(),
  athlete_execution_score: z.number().nullable().optional(),
  matched_by: z.string().nullable(),
  notes: z.string().nullable(),
  ai_review: z.string().nullable(),
  created_at: z.date().nullable(),
  updated_at: z.date().nullable(),
});

export const trainingSessionCompletionsInitializerSchema = z.object({
  id: trainingSessionCompletionsIdSchema.optional(),
  plan_session_id: z.string(),
  exercise_entry_id: z.string().optional().nullable(),
  adherence_score: z.number().optional().nullable(),
  athlete_execution_score: z.number().optional().nullable(),
  matched_by: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  ai_review: z.string().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export const trainingSessionCompletionsMutatorSchema = z.object({
  id: trainingSessionCompletionsIdSchema.optional(),
  plan_session_id: z.string().optional(),
  exercise_entry_id: z.string().optional().nullable(),
  adherence_score: z.number().optional().nullable(),
  athlete_execution_score: z.number().optional().nullable(),
  matched_by: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  ai_review: z.string().optional().nullable(),
  created_at: z.date().optional().nullable(),
  updated_at: z.date().optional().nullable(),
});

export type TrainingSessionCompletions = z.infer<
  typeof trainingSessionCompletionsSchema
>;
export type TrainingSessionCompletionsInitializer = z.infer<
  typeof trainingSessionCompletionsInitializerSchema
>;
export type TrainingSessionCompletionsMutator = z.infer<
  typeof trainingSessionCompletionsMutatorSchema
>;
