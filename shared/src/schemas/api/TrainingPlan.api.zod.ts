import { z } from "zod";
import { isDayString } from "../../utils/timezone.ts";

const dayStringSchema = z.string().refine((value) => isDayString(value), {
  message: "Must be a YYYY-MM-DD calendar day string",
});

export const trainingPlanStatusSchema = z.enum([
  "draft",
  "active",
  "completed",
  "archived",
]);

export const trainingSportFocusSchema = z.enum([
  "running",
  "cycling",
  "mixed",
  "other",
]);

export const trainingGoalTypeSchema = z.enum([
  "race",
  "body_weight",
  "volume",
  "habit",
  "custom",
]);

export const trainingCommitmentIntensitySchema = z.enum([
  "low",
  "moderate",
  "high",
]);

export const trainingSessionTypeSchema = z.enum([
  "easy_run",
  "intervals",
  "tempo",
  "long_run",
  "rest",
  "strength",
  "cross_train",
  "race",
  "other",
]);

export const trainingSessionStatusSchema = z.enum([
  "planned",
  "completed",
  "skipped",
  "moved",
  "partial",
]);

export const trainingSessionPrescriptionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  distance_km: z.number().nonnegative().nullable().optional(),
  duration_minutes: z.number().nonnegative().nullable().optional(),
  pace_target: z.string().max(80).nullable().optional(),
  /** Easy / tempo / threshold / interval paces derived from race predictions (min/km). */
  pace_easy_min_per_km: z.number().positive().nullable().optional(),
  pace_tempo_min_per_km: z.number().positive().nullable().optional(),
  pace_threshold_min_per_km: z.number().positive().nullable().optional(),
  heart_rate_zone: z.string().max(40).nullable().optional(),
  /** How to execute: HR zones, paces, or strength sets/reps. */
  instructions: z.string().max(4000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** Optional link to an existing workout preset for strength days. */
  workout_preset_id: z.string().uuid().nullable().optional(),
});

export type TrainingSessionPrescription = z.infer<
  typeof trainingSessionPrescriptionSchema
>;

export const trainingGoalPayloadSchema = z.object({
  type: trainingGoalTypeSchema,
  title: z.string().min(1).max(200),
  target_date: dayStringSchema.nullable().optional(),
  /** Race distance in meters (e.g. 10000 for 10K). */
  race_distance_meters: z.number().positive().nullable().optional(),
  /** Target finish time in seconds. */
  race_target_seconds: z.number().positive().nullable().optional(),
  /** Absolute target weight in kg, or omit if using delta. */
  weight_target_kg: z.number().positive().nullable().optional(),
  /** Signed delta from baseline (e.g. -5 to lose 5 kg). */
  weight_delta_kg: z.number().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

export const trainingCommitmentPayloadSchema = z.object({
  title: z.string().min(1).max(200),
  activity_type: z.string().min(1).max(80),
  intensity: trainingCommitmentIntensitySchema.default("moderate"),
  /** One-off date; mutually exclusive with recurrence_rule for MVP. */
  date: dayStringSchema.nullable().optional(),
  /** RRULE or simple weekday list e.g. "BYDAY=TU,TH". */
  recurrence_rule: z.string().max(500).nullable().optional(),
  start_time: z.string().max(16).nullable().optional(),
  duration_minutes: z.number().int().positive().nullable().optional(),
  blocks_training: z.boolean().default(true),
  notes: z.string().max(2000).nullable().optional(),
});

export const trainingPlanSessionPayloadSchema = z.object({
  scheduled_date: dayStringSchema,
  session_type: trainingSessionTypeSchema,
  status: trainingSessionStatusSchema.default("planned"),
  prescription: trainingSessionPrescriptionSchema.default({}),
  sort_order: z.number().int().nonnegative().optional(),
});

export const trainingPlanCreateRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  sport_focus: trainingSportFocusSchema.default("running"),
  start_date: dayStringSchema,
  target_date: dayStringSchema,
  notes: z.string().max(4000).nullable().optional(),
  goals: z.array(trainingGoalPayloadSchema).default([]),
  commitments: z.array(trainingCommitmentPayloadSchema).default([]),
});

export const trainingPlanUpdateRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  sport_focus: trainingSportFocusSchema.optional(),
  start_date: dayStringSchema.optional(),
  target_date: dayStringSchema.optional(),
  status: trainingPlanStatusSchema.optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export const trainingGoalSchema = trainingGoalPayloadSchema.extend({
  id: z.string().uuid(),
  plan_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const trainingCommitmentSchema = trainingCommitmentPayloadSchema.extend({
  id: z.string().uuid(),
  plan_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const trainingPlanSessionSchema = trainingPlanSessionPayloadSchema.extend(
  {
    id: z.string().uuid(),
    plan_id: z.string().uuid(),
    skip_reason: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  },
);

export const trainingSessionCompletionSchema = z.object({
  id: z.string().uuid(),
  plan_session_id: z.string().uuid(),
  exercise_entry_id: z.string().uuid().nullable(),
  adherence_score: z.number().min(0).max(1).nullable(),
  /** Athlete self-score 0–10; separate from auto Garmin adherence_score. */
  athlete_execution_score: z.number().int().min(0).max(10).nullable().optional(),
  matched_by: z.enum(["auto", "manual", "ai"]).nullable(),
  notes: z.string().nullable(),
  skip_reason: z.string().nullable().optional(),
  ai_review: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const trainingSessionSkipRequestSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export const trainingSessionReportExecutionRequestSchema = z.object({
  status: z.enum(["completed", "partial"]),
  execution_score: z.number().int().min(0).max(10).optional(),
  notes: z.string().max(4000).nullable().optional(),
  request_ai_review: z.boolean().default(false),
  service_config_id: z.string().uuid().optional(),
});

export const trainingSessionReportExecutionResponseSchema = z.object({
  session: trainingPlanSessionSchema,
  completion: trainingSessionCompletionSchema,
});

export const trainingSessionAiReviewRequestSchema = z.object({
  service_config_id: z.string().uuid().optional(),
});

export const trainingSessionAiReviewResponseSchema = z.object({
  completion: trainingSessionCompletionSchema,
  ai_review: z.string(),
});

export const trainingPlanSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  sport_focus: trainingSportFocusSchema,
  start_date: dayStringSchema,
  target_date: dayStringSchema,
  status: trainingPlanStatusSchema,
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const trainingPlanDetailSchema = trainingPlanSchema.extend({
  goals: z.array(trainingGoalSchema),
  commitments: z.array(trainingCommitmentSchema),
  sessions: z.array(trainingPlanSessionSchema).optional(),
});

export const trainingAthleteSnapshotPayloadSchema = z.object({
  as_of_date: dayStringSchema,
  window_days: z.number().int().positive(),
  running: z
    .object({
      session_count: z.number().int().nonnegative(),
      total_distance_km: z.number().nonnegative(),
      total_duration_minutes: z.number().nonnegative(),
      avg_distance_km: z.number().nullable(),
      recent_long_run_km: z.number().nullable(),
    })
    .optional(),
  sports_breakdown: z
    .array(
      z.object({
        activity_key: z.string(),
        session_count: z.number().int().nonnegative(),
        total_duration_minutes: z.number().nonnegative(),
      }),
    )
    .optional(),
  weight: z
    .object({
      latest_kg: z.number().nullable(),
      latest_date: dayStringSchema.nullable(),
      delta_kg: z.number().nullable(),
      series: z
        .array(
          z.object({
            date: dayStringSchema,
            kg: z.number(),
          }),
        )
        .optional(),
    })
    .optional(),
  readiness: z
    .object({
      avg_training_readiness: z.number().nullable(),
      avg_acute_load: z.number().nullable(),
      latest_vo2_max: z.number().nullable(),
      lactate_threshold_bpm: z.number().nullable().optional(),
      lactate_threshold_speed_mps: z.number().nullable().optional(),
    })
    .optional(),
  /** Race predictions + derived training paces (phase 3 running science). */
  running_science: z
    .object({
      race_prediction_5k_seconds: z.number().nullable(),
      race_prediction_10k_seconds: z.number().nullable(),
      race_prediction_half_marathon_seconds: z.number().nullable(),
      estimated_easy_pace_min_per_km: z.number().nullable(),
      estimated_tempo_pace_min_per_km: z.number().nullable(),
      estimated_threshold_pace_min_per_km: z.number().nullable(),
    })
    .optional(),
  recent_fitness_tests: z
    .array(
      z.object({
        id: z.string().uuid(),
        test_type: z.string(),
        title: z.string(),
        scheduled_date: dayStringSchema,
        status: z.string(),
        result_summary: z.string().nullable().optional(),
      }),
    )
    .optional(),
  notes: z.array(z.string()).optional(),
});

export const trainingAthleteSnapshotSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  plan_id: z.string().uuid().nullable(),
  as_of_date: dayStringSchema,
  payload: trainingAthleteSnapshotPayloadSchema,
  token_estimate: z.number().int().nonnegative().nullable(),
  created_at: z.string(),
});

export const trainingPlanProposeRequestSchema = z.object({
  plan_id: z.string().uuid(),
  service_config_id: z.string().uuid().optional(),
  /** Optional free-text guidance for the planner. */
  user_notes: z.string().max(4000).optional(),
  /** Replace existing planned sessions on confirm when true. */
  replace_existing: z.boolean().default(true),
});

export const trainingPlanProposedSessionSchema = z.object({
  client_id: z.string().min(1),
  scheduled_date: dayStringSchema,
  session_type: trainingSessionTypeSchema,
  prescription: trainingSessionPrescriptionSchema,
});

/** Fitness-test types (also used by propose/confirm payloads above the full test schemas). */
export const trainingFitnessTestTypeSchema = z.enum([
  "5k_time_trial",
  "10k_time_trial",
  "cooper_12min",
  "mile_effort",
  "easy_aerobic_check",
  "custom",
]);

export const trainingFitnessTestPrescriptionSchema = z.object({
  distance_km: z.number().positive().nullable().optional(),
  duration_minutes: z.number().positive().nullable().optional(),
  target_effort: z.string().max(120).nullable().optional(),
  instructions: z.string().max(4000).nullable().optional(),
});

export const trainingPlanProposedFitnessTestSchema = z.object({
  client_id: z.string().min(1),
  test_type: trainingFitnessTestTypeSchema,
  title: z.string().min(1).max(200),
  scheduled_date: dayStringSchema,
  prescription: trainingFitnessTestPrescriptionSchema.default({}),
  due_interval_days: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const trainingPlanProposeResponseSchema = z.object({
  plan_id: z.string().uuid(),
  summary: z.string(),
  weekly_volume_notes: z.string().nullable().optional(),
  sessions: z.array(trainingPlanProposedSessionSchema).min(1),
  /** Optional fitness tests to schedule when the athlete confirms the proposal. */
  fitness_tests: z.array(trainingPlanProposedFitnessTestSchema).optional(),
  warnings: z.array(z.string()).optional(),
});

export const trainingPlanConfirmRequestSchema = z.object({
  plan_id: z.string().uuid(),
  replace_existing: z.boolean().default(true),
  sessions: z.array(trainingPlanProposedSessionSchema).min(1),
  fitness_tests: z.array(trainingPlanProposedFitnessTestSchema).optional(),
  activate: z.boolean().default(true),
});

export const trainingPlanConfirmResponseSchema = z.object({
  plan_id: z.string().uuid(),
  created_count: z.number().int().nonnegative(),
  session_ids: z.array(z.string().uuid()),
  fitness_test_ids: z.array(z.string().uuid()).optional(),
});

export const trainingPlanErrorCodeSchema = z.enum([
  "invalid_request",
  "not_found",
  "no_ai_service",
  "ai_disabled",
  "private_network_forbidden",
  "provider_error",
  "parse_error",
  "confirm_failed",
]);

export const trainingAdherenceMatchRequestSchema = z.object({
  plan_id: z.string().uuid().optional(),
  start_date: dayStringSchema,
  end_date: dayStringSchema,
});

export const trainingAdherenceMatchResponseSchema = z.object({
  matched: z.number().int().nonnegative(),
  partial: z.number().int().nonnegative(),
  unmatched_sessions: z.number().int().nonnegative(),
});

export const trainingCalendarQuerySchema = z.object({
  plan_id: z.string().uuid().optional(),
  start_date: dayStringSchema,
  end_date: dayStringSchema,
});

export const trainingCalendarDaySchema = z.object({
  date: dayStringSchema,
  sessions: z.array(
    trainingPlanSessionSchema.extend({
      completion: trainingSessionCompletionSchema.nullable().optional(),
    }),
  ),
  commitments: z.array(trainingCommitmentSchema),
});

export const trainingCalendarResponseSchema = z.object({
  days: z.array(trainingCalendarDaySchema),
});

export type TrainingPlanStatus = z.infer<typeof trainingPlanStatusSchema>;
export type TrainingSportFocus = z.infer<typeof trainingSportFocusSchema>;
export type TrainingGoalType = z.infer<typeof trainingGoalTypeSchema>;
export type TrainingSessionType = z.infer<typeof trainingSessionTypeSchema>;
export type TrainingSessionStatus = z.infer<typeof trainingSessionStatusSchema>;
export type TrainingGoalPayload = z.infer<typeof trainingGoalPayloadSchema>;
export type TrainingCommitmentPayload = z.infer<
  typeof trainingCommitmentPayloadSchema
>;
export type TrainingPlanSessionPayload = z.infer<
  typeof trainingPlanSessionPayloadSchema
>;
export type TrainingPlanCreateRequest = z.infer<
  typeof trainingPlanCreateRequestSchema
>;
export type TrainingPlanUpdateRequest = z.infer<
  typeof trainingPlanUpdateRequestSchema
>;
export type TrainingGoal = z.infer<typeof trainingGoalSchema>;
export type TrainingCommitment = z.infer<typeof trainingCommitmentSchema>;
export type TrainingPlanSession = z.infer<typeof trainingPlanSessionSchema>;
export type TrainingSessionCompletion = z.infer<
  typeof trainingSessionCompletionSchema
>;
export type TrainingPlan = z.infer<typeof trainingPlanSchema>;
export type TrainingPlanDetail = z.infer<typeof trainingPlanDetailSchema>;
export type TrainingAthleteSnapshotPayload = z.infer<
  typeof trainingAthleteSnapshotPayloadSchema
>;
export type TrainingAthleteSnapshot = z.infer<
  typeof trainingAthleteSnapshotSchema
>;
export type TrainingPlanProposeRequest = z.infer<
  typeof trainingPlanProposeRequestSchema
>;
export type TrainingPlanProposedSession = z.infer<
  typeof trainingPlanProposedSessionSchema
>;
export type TrainingPlanProposeResponse = z.infer<
  typeof trainingPlanProposeResponseSchema
>;
export type TrainingPlanProposedFitnessTest = z.infer<
  typeof trainingPlanProposedFitnessTestSchema
>;
export type TrainingPlanConfirmRequest = z.infer<
  typeof trainingPlanConfirmRequestSchema
>;
export type TrainingPlanConfirmResponse = z.infer<
  typeof trainingPlanConfirmResponseSchema
>;
export type TrainingPlanErrorCode = z.infer<typeof trainingPlanErrorCodeSchema>;
export type TrainingAdherenceMatchRequest = z.infer<
  typeof trainingAdherenceMatchRequestSchema
>;
export type TrainingAdherenceMatchResponse = z.infer<
  typeof trainingAdherenceMatchResponseSchema
>;
export type TrainingCalendarQuery = z.infer<typeof trainingCalendarQuerySchema>;
export type TrainingCalendarDay = z.infer<typeof trainingCalendarDaySchema>;
export type TrainingCalendarResponse = z.infer<
  typeof trainingCalendarResponseSchema
>;
export type TrainingCommitmentIntensity = z.infer<
  typeof trainingCommitmentIntensitySchema
>;

// --- Phase 2: Coach ---

export const trainingCoachSessionStatusSchema = z.enum(["open", "closed"]);

export const trainingCoachSessionSchema = z.object({
  id: z.string().uuid(),
  plan_id: z.string().uuid(),
  user_id: z.string().uuid(),
  status: trainingCoachSessionStatusSchema,
  title: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
});

export const trainingCoachMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
]);

export const trainingCoachMessageSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  role: trainingCoachMessageRoleSchema,
  content: z.string(),
  parts: z.unknown().nullable().optional(),
  created_at: z.string(),
});

export const trainingCoachSessionSummarySchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  summary: z.string(),
  token_estimate: z.number().int().nonnegative().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const trainingCoachMemorySchema = z.object({
  id: z.string().uuid(),
  plan_id: z.string().uuid().nullable(),
  user_id: z.string().uuid(),
  memory_key: z.string(),
  memory_value: z.string(),
  source: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const trainingCoachCreateSessionRequestSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  /** Optional pre-seeded system brief (e.g. weekly check-in). */
  opening_brief: z.string().max(4000).optional(),
});

export const trainingCoachSendMessageRequestSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  service_config_id: z.string().uuid().optional(),
});

export const trainingCoachSendMessageResponseSchema = z.object({
  user_message: trainingCoachMessageSchema,
  assistant_message: trainingCoachMessageSchema,
  /** Soft side-effects the coach suggested; applied only when present. */
  scheduled_fitness_test_ids: z.array(z.string().uuid()).optional(),
  memories_added: z.number().int().nonnegative().optional(),
  /**
   * Plan proposal from propose_plan_adjustment / propose_full_plan.
   * Not persisted until the athlete confirms via /ai/confirm.
   */
  plan_proposal: trainingPlanProposeResponseSchema.optional(),
});

export const trainingCoachMemoryUpsertSchema = z.object({
  memory_key: z.string().trim().min(1).max(120),
  memory_value: z.string().trim().min(1).max(2000),
  source: z.string().max(40).nullable().optional(),
});

export const trainingPlanAdjustRequestSchema = z.object({
  plan_id: z.string().uuid(),
  service_config_id: z.string().uuid().optional(),
  user_notes: z.string().max(4000).optional(),
  /** Limit adjustment to this inclusive date window when set. */
  from_date: dayStringSchema.optional(),
  to_date: dayStringSchema.optional(),
  replace_existing: z.boolean().default(true),
});

// --- Fitness snapshots (periodic fitness tests) ---

export const trainingFitnessTestStatusSchema = z.enum([
  "scheduled",
  "completed",
  "skipped",
  "cancelled",
]);

export const trainingFitnessTestResultSchema = z.object({
  distance_km: z.number().nonnegative().nullable().optional(),
  duration_seconds: z.number().nonnegative().nullable().optional(),
  avg_heart_rate: z.number().nonnegative().nullable().optional(),
  max_heart_rate: z.number().nonnegative().nullable().optional(),
  perceived_effort: z.number().min(1).max(10).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  exercise_entry_id: z.string().uuid().nullable().optional(),
});

export const trainingFitnessTestSchema = z.object({
  id: z.string().uuid(),
  plan_id: z.string().uuid().nullable(),
  user_id: z.string().uuid(),
  test_type: trainingFitnessTestTypeSchema,
  title: z.string(),
  scheduled_date: dayStringSchema,
  status: trainingFitnessTestStatusSchema,
  prescription: trainingFitnessTestPrescriptionSchema,
  result: trainingFitnessTestResultSchema.nullable(),
  source: z.enum(["coach", "system", "user"]),
  due_interval_days: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
});

export const trainingFitnessTestCreateRequestSchema = z.object({
  plan_id: z.string().uuid().nullable().optional(),
  test_type: trainingFitnessTestTypeSchema,
  title: z.string().min(1).max(200),
  scheduled_date: dayStringSchema,
  prescription: trainingFitnessTestPrescriptionSchema.default({}),
  source: z.enum(["coach", "system", "user"]).default("user"),
  due_interval_days: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const trainingFitnessTestReportRequestSchema = z.object({
  result: trainingFitnessTestResultSchema,
  status: z.enum(["completed", "skipped"]).default("completed"),
  notes: z.string().max(2000).nullable().optional(),
});

/** Versioned JSON document for plan export / re-import. */
export const TRAINING_PLAN_EXPORT_SCHEMA_VERSION = 1 as const;

export const trainingPlanExportDocumentSchema = z.object({
  schema_version: z.literal(1),
  exported_at: z.string().optional(),
  plan: trainingPlanSchema.omit({
    id: true,
    user_id: true,
    created_at: true,
    updated_at: true,
  }).extend({
    id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  }),
  goals: z.array(
    trainingGoalPayloadSchema.extend({
      id: z.string().uuid().optional(),
      plan_id: z.string().uuid().optional(),
      created_at: z.string().optional(),
    }),
  ),
  commitments: z.array(
    trainingCommitmentPayloadSchema.extend({
      id: z.string().uuid().optional(),
      plan_id: z.string().uuid().optional(),
      created_at: z.string().optional(),
    }),
  ),
  sessions: z.array(
    trainingPlanSessionPayloadSchema.extend({
      id: z.string().uuid().optional(),
      plan_id: z.string().uuid().optional(),
      skip_reason: z.string().nullable().optional(),
      created_at: z.string().optional(),
      updated_at: z.string().optional(),
    }),
  ),
});

export const trainingPlanImportRequestSchema = z.object({
  document: trainingPlanExportDocumentSchema,
  /** When set, replace this plan's goals/commitments/sessions instead of creating a new plan. */
  replace_plan_id: z.string().uuid().optional(),
  /** Activate the plan after import. */
  activate: z.boolean().default(false),
});

export const trainingPlanImportResponseSchema = z.object({
  plan: trainingPlanDetailSchema,
});

export type TrainingSessionSkipRequest = z.infer<
  typeof trainingSessionSkipRequestSchema
>;
export type TrainingSessionReportExecutionRequest = z.infer<
  typeof trainingSessionReportExecutionRequestSchema
>;
export type TrainingSessionReportExecutionResponse = z.infer<
  typeof trainingSessionReportExecutionResponseSchema
>;
export type TrainingSessionAiReviewRequest = z.infer<
  typeof trainingSessionAiReviewRequestSchema
>;
export type TrainingSessionAiReviewResponse = z.infer<
  typeof trainingSessionAiReviewResponseSchema
>;
export type TrainingPlanExportDocument = z.infer<
  typeof trainingPlanExportDocumentSchema
>;
export type TrainingPlanImportRequest = z.infer<
  typeof trainingPlanImportRequestSchema
>;
export type TrainingPlanImportResponse = z.infer<
  typeof trainingPlanImportResponseSchema
>;
export type TrainingCoachSession = z.infer<typeof trainingCoachSessionSchema>;
export type TrainingCoachMessage = z.infer<typeof trainingCoachMessageSchema>;
export type TrainingCoachSessionSummary = z.infer<
  typeof trainingCoachSessionSummarySchema
>;
export type TrainingCoachMemory = z.infer<typeof trainingCoachMemorySchema>;
export type TrainingCoachCreateSessionRequest = z.infer<
  typeof trainingCoachCreateSessionRequestSchema
>;
export type TrainingCoachSendMessageRequest = z.infer<
  typeof trainingCoachSendMessageRequestSchema
>;
export type TrainingCoachSendMessageResponse = z.infer<
  typeof trainingCoachSendMessageResponseSchema
>;
export type TrainingCoachMemoryUpsert = z.infer<
  typeof trainingCoachMemoryUpsertSchema
>;
export type TrainingPlanAdjustRequest = z.infer<
  typeof trainingPlanAdjustRequestSchema
>;
export type TrainingFitnessTestType = z.infer<
  typeof trainingFitnessTestTypeSchema
>;
export type TrainingFitnessTestStatus = z.infer<
  typeof trainingFitnessTestStatusSchema
>;
export type TrainingFitnessTestPrescription = z.infer<
  typeof trainingFitnessTestPrescriptionSchema
>;
export type TrainingFitnessTestResult = z.infer<
  typeof trainingFitnessTestResultSchema
>;
export type TrainingFitnessTest = z.infer<typeof trainingFitnessTestSchema>;
export type TrainingFitnessTestCreateRequest = z.infer<
  typeof trainingFitnessTestCreateRequestSchema
>;
export type TrainingFitnessTestReportRequest = z.infer<
  typeof trainingFitnessTestReportRequestSchema
>;
