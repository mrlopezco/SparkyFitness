import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareDays,
  trainingPlanOutlineResponseSchema,
  type TrainingPlanOutlineResponse,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type JsonSchemaNode,
} from '../ai/providerDispatch.js';
import {
  dispatchErrorToThrow,
  loadProviderConfig,
  ProviderResponseError,
} from './trainingAiSupport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTLINE_PROMPT = readFileSync(
  join(__dirname, '../prompts/training-plan-outline.md'),
  'utf8'
);

const OUTLINE_WEEK_THEMES = [
  'base',
  'build',
  'peak',
  'taper',
  'recovery',
] as const;

const OUTLINE_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'weeks'],
  properties: {
    summary: { type: 'string' },
    weeks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'week_index',
          'start_date',
          'end_date',
          'theme',
        ],
        properties: {
          week_index: { type: 'integer' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          theme: { type: 'string', enum: [...OUTLINE_WEEK_THEMES] },
          target_weekly_km_min: { type: 'number' },
          target_weekly_km_max: { type: 'number' },
          quality_sessions_per_week: { type: 'integer' },
          long_run_km_cap: { type: 'number' },
          notes: { type: 'string' },
        },
      },
    },
    fitness_test_dates: {
      type: 'array',
      items: { type: 'string' },
    },
    taper_start_date: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } },
  },
};

/** Weeks whose date range overlaps a chunk [chunkStart, chunkEnd]. */
export function outlineWeeksForChunk(
  outline: TrainingPlanOutlineResponse,
  chunkStart: string,
  chunkEnd: string
): TrainingPlanOutlineResponse['weeks'] {
  return outline.weeks.filter(
    (week) =>
      compareDays(week.end_date, chunkStart) >= 0 &&
      compareDays(week.start_date, chunkEnd) <= 0
  );
}

export async function requestTrainingPlanOutline(
  authenticatedUserId: string,
  planContextJson: string,
  serviceConfigId: string | undefined,
  actorIsAdmin: boolean
): Promise<TrainingPlanOutlineResponse> {
  const { provider, networkPolicy } = await loadProviderConfig(
    authenticatedUserId,
    serviceConfigId,
    actorIsAdmin
  );

  const result = await dispatchAiRequest({
    provider,
    networkPolicy,
    prompt: `${OUTLINE_PROMPT}\n\nPLAN_CONTEXT:\n${planContextJson}`,
    jsonSchema: OUTLINE_SCHEMA,
    schemaName: 'training_plan_outline',
    parseJson: true,
    temperature: 0.2,
  });

  if (!result.ok) {
    log(
      result.category === 'refused' || result.category === 'no_content'
        ? 'warn'
        : 'error',
      `Training plan outline: ${provider.service_type} failed for user ${authenticatedUserId} (${result.category}): ${result.detail}`
    );
    throw dispatchErrorToThrow(result.category, result.detail);
  }

  const parsed = trainingPlanOutlineResponseSchema.safeParse(result.json);
  if (!parsed.success) {
    log(
      'warn',
      `Training plan outline validation failed for user ${authenticatedUserId}: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`
    );
    throw new ProviderResponseError(
      'AI returned a plan outline that failed validation.'
    );
  }

  return parsed.data;
}

export default {
  requestTrainingPlanOutline,
  outlineWeeksForChunk,
};
