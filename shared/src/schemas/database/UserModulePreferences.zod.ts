import { z } from "zod";

export const userModulePreferencesSchema = z.object({
  user_id: z.string().uuid(),
  modules: z.record(z.string(), z.boolean()),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const userModulePreferencesInitializerSchema = z.object({
  user_id: z.string().uuid(),
  modules: z.record(z.string(), z.boolean()).optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const userModulePreferencesMutatorSchema = z.object({
  user_id: z.string().uuid().optional(),
  modules: z.record(z.string(), z.boolean()).optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type UserModulePreferences = z.infer<typeof userModulePreferencesSchema>;
export type UserModulePreferencesInitializer = z.infer<
  typeof userModulePreferencesInitializerSchema
>;
export type UserModulePreferencesMutator = z.infer<
  typeof userModulePreferencesMutatorSchema
>;
