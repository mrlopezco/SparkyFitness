import { z } from "zod";

export const trainingCoachMessagesIdSchema = z.string().and(
  z.object({
    __brand: z.literal("public.training_coach_messages"),
  }),
);

export const trainingCoachMessagesSchema = z.object({
  id: trainingCoachMessagesIdSchema,
  session_id: z.string(),
  role: z.string(),
  content: z.string(),
  parts: z.unknown().nullable(),
  created_at: z.date().nullable(),
});

export const trainingCoachMessagesInitializerSchema = z.object({
  id: trainingCoachMessagesIdSchema.optional(),
  session_id: z.string(),
  role: z.string(),
  content: z.string(),
  parts: z.unknown().optional().nullable(),
  created_at: z.date().optional().nullable(),
});

export const trainingCoachMessagesMutatorSchema = z.object({
  id: trainingCoachMessagesIdSchema.optional(),
  session_id: z.string().optional(),
  role: z.string().optional(),
  content: z.string().optional(),
  parts: z.unknown().optional().nullable(),
  created_at: z.date().optional().nullable(),
});

export type TrainingCoachMessages = z.infer<typeof trainingCoachMessagesSchema>;
export type TrainingCoachMessagesInitializer = z.infer<
  typeof trainingCoachMessagesInitializerSchema
>;
export type TrainingCoachMessagesMutator = z.infer<
  typeof trainingCoachMessagesMutatorSchema
>;
