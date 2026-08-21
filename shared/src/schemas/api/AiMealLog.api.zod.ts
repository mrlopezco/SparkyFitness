import { z } from "zod";
import { isDayString } from "../../utils/timezone.ts";

const dayStringSchema = z.string().refine((value) => isDayString(value), {
  message: "Must be a YYYY-MM-DD calendar day string",
});

export const aiMealLogParsedItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
});

export const aiMealLogParseResponseSchema = z.object({
  items: z.array(aiMealLogParsedItemSchema).min(1),
});

export const aiMealLogNutrientsSchema = z.object({
  calories: z.number().nullable(),
  protein: z.number().nullable(),
  carbs: z.number().nullable(),
  fat: z.number().nullable(),
  saturated_fat: z.number().nullable().optional(),
  polyunsaturated_fat: z.number().nullable().optional(),
  monounsaturated_fat: z.number().nullable().optional(),
  trans_fat: z.number().nullable().optional(),
  cholesterol: z.number().nullable().optional(),
  sodium: z.number().nullable().optional(),
  potassium: z.number().nullable().optional(),
  dietary_fiber: z.number().nullable().optional(),
  sugars: z.number().nullable().optional(),
  vitamin_a: z.number().nullable().optional(),
  vitamin_c: z.number().nullable().optional(),
  calcium: z.number().nullable().optional(),
  iron: z.number().nullable().optional(),
});

export const aiMealLogProposedItemSchema = z.object({
  client_id: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().nullable().optional(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  source: z.string().min(1),
  food_id: z.string().uuid().nullable().optional(),
  variant_id: z.string().uuid().nullable().optional(),
  provider_type: z.string().nullable().optional(),
  provider_external_id: z.string().nullable().optional(),
  serving_size: z.number().nullable().optional(),
  serving_unit: z.string().nullable().optional(),
  nutrients: aiMealLogNutrientsSchema,
  warning: z.string().nullable().optional(),
  /** Other provider hits the user can switch to in the review UI. */
  alternatives: z
    .array(
      z.object({
        name: z.string().min(1),
        brand: z.string().nullable().optional(),
        source: z.string().min(1),
        food_id: z.string().uuid().nullable().optional(),
        variant_id: z.string().uuid().nullable().optional(),
        provider_type: z.string().nullable().optional(),
        provider_external_id: z.string().nullable().optional(),
        serving_size: z.number().nullable().optional(),
        serving_unit: z.string().nullable().optional(),
        nutrients: aiMealLogNutrientsSchema,
      })
    )
    .optional(),
});

export const aiMealLogAnalyzeRequestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  meal_type: z.string().min(1).optional(),
  meal_type_id: z.string().uuid().optional(),
  entry_date: dayStringSchema,
  service_config_id: z.string().uuid().optional(),
});

export const aiMealLogAnalyzeResponseSchema = z.object({
  items: z.array(aiMealLogProposedItemSchema),
});

export const aiMealLogConfirmRequestSchema = z.object({
  meal_type: z.string().min(1).optional(),
  meal_type_id: z.string().uuid().optional(),
  entry_date: dayStringSchema,
  entry_time: z.string().nullable().optional(),
  items: z.array(aiMealLogProposedItemSchema).min(1),
});

export const aiMealLogConfirmResponseSchema = z.object({
  created_count: z.number().int().nonnegative(),
  entry_ids: z.array(z.string().uuid()),
});

export const aiMealLogErrorCodeSchema = z.enum([
  "invalid_request",
  "no_ai_service",
  "ai_disabled",
  "private_network_forbidden",
  "provider_error",
  "parse_error",
  "meal_type_not_found",
  "confirm_failed",
]);

export type AiMealLogParsedItem = z.infer<typeof aiMealLogParsedItemSchema>;
export type AiMealLogParseResponse = z.infer<typeof aiMealLogParseResponseSchema>;
export type AiMealLogNutrients = z.infer<typeof aiMealLogNutrientsSchema>;
export type AiMealLogProposedItem = z.infer<typeof aiMealLogProposedItemSchema>;
export type AiMealLogAnalyzeRequest = z.infer<
  typeof aiMealLogAnalyzeRequestSchema
>;
export type AiMealLogAnalyzeResponse = z.infer<
  typeof aiMealLogAnalyzeResponseSchema
>;
export type AiMealLogConfirmRequest = z.infer<
  typeof aiMealLogConfirmRequestSchema
>;
export type AiMealLogConfirmResponse = z.infer<
  typeof aiMealLogConfirmResponseSchema
>;
export type AiMealLogErrorCode = z.infer<typeof aiMealLogErrorCodeSchema>;
