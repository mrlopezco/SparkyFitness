import { z } from "zod";
import {
  FORK_MODULE_IDS,
  isKnownForkModuleId,
} from "../../constants/forkModules.ts";

const forkModuleIdSchema = z.enum(FORK_MODULE_IDS);

export const modulePreferencesResponseSchema = z.object({
  modules: z.record(forkModuleIdSchema, z.boolean()),
});

export const updateModulePreferencesRequestSchema = z.object({
  modules: z
    .record(z.string(), z.boolean())
    .refine((map) => Object.keys(map).every(isKnownForkModuleId), {
      message: "Unknown module id in modules map",
    }),
});

export type ModulePreferencesResponse = z.infer<
  typeof modulePreferencesResponseSchema
>;
export type UpdateModulePreferencesRequest = z.infer<
  typeof updateModulePreferencesRequestSchema
>;
