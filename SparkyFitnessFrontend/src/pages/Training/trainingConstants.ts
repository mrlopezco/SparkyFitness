import {
  trainingCommitmentIntensitySchema,
  trainingFitnessTestTypeSchema,
  trainingGoalTypeSchema,
  trainingSessionTypeSchema,
  trainingSportFocusSchema,
  type TrainingFitnessTestStatus,
  type TrainingFitnessTestType,
  type TrainingGoalType,
  type TrainingSessionStatus,
  type TrainingSessionType,
  type TrainingSportFocus,
} from '@workspace/shared';

export const SESSION_TYPES: readonly TrainingSessionType[] =
  trainingSessionTypeSchema.options;
export const SPORT_FOCUS_OPTIONS: readonly TrainingSportFocus[] =
  trainingSportFocusSchema.options;
export const GOAL_TYPES: readonly TrainingGoalType[] =
  trainingGoalTypeSchema.options;
export const COMMITMENT_INTENSITIES: readonly string[] =
  trainingCommitmentIntensitySchema.options;

export const SESSION_TYPE_LABELS: Record<TrainingSessionType, string> = {
  easy_run: 'Easy run',
  intervals: 'Intervals',
  tempo: 'Tempo',
  long_run: 'Long run',
  rest: 'Rest',
  strength: 'Strength',
  cross_train: 'Cross-train',
  race: 'Race',
  other: 'Other',
};

export const SESSION_STATUS_LABELS: Record<TrainingSessionStatus, string> = {
  planned: 'Planned',
  completed: 'Completed',
  skipped: 'Skipped',
  moved: 'Moved',
  partial: 'Partial',
};

/** Day-cell fills for future / today sessions, keyed by workout type. */
export const SESSION_TYPE_COLORS: Record<TrainingSessionType, string> = {
  easy_run: '#22c55e',
  intervals: '#ef4444',
  tempo: '#f97316',
  long_run: '#8b5cf6',
  rest: '#94a3b8',
  strength: '#0ea5e9',
  cross_train: '#14b8a6',
  race: '#e11d48',
  other: '#64748b',
};

export const GOAL_TYPE_LABELS: Record<TrainingGoalType, string> = {
  race: 'Race',
  body_weight: 'Body weight',
  volume: 'Volume',
  habit: 'Habit',
  custom: 'Custom',
};

export const SPORT_FOCUS_LABELS: Record<TrainingSportFocus, string> = {
  running: 'Running',
  cycling: 'Cycling',
  mixed: 'Mixed',
  other: 'Other',
};

/** Day-cell fills for past sessions, keyed by execution status. */
export const SESSION_STATUS_COLORS: Record<TrainingSessionStatus, string> = {
  completed: '#10b981',
  partial: '#f59e0b',
  planned: '#64748b',
  skipped: '#ef4444',
  moved: '#94a3b8',
};

export const COMMITMENT_DOT_COLOR = '#8b5cf6';

export const FITNESS_TEST_TYPES: readonly TrainingFitnessTestType[] =
  trainingFitnessTestTypeSchema.options;

export const FITNESS_TEST_TYPE_LABELS: Record<TrainingFitnessTestType, string> =
  {
    '5k_time_trial': '5K time trial',
    '10k_time_trial': '10K time trial',
    cooper_12min: 'Cooper 12-minute test',
    mile_effort: 'Mile effort',
    easy_aerobic_check: 'Easy aerobic check',
    custom: 'Custom',
  };

export const FITNESS_TEST_STATUS_LABELS: Record<
  TrainingFitnessTestStatus,
  string
> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
};

/** Renders a decimal min/km pace (5.5) as the m:ss athletes actually read. */
export function formatPaceMinPerKm(pace: number | null | undefined): string {
  if (pace === null || pace === undefined || !Number.isFinite(pace)) return '—';
  const totalSeconds = Math.round(pace * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Renders a race prediction in seconds as h:mm:ss, dropping an empty hour. */
export function formatDurationSeconds(
  totalSeconds: number | null | undefined
): string {
  if (
    totalSeconds === null ||
    totalSeconds === undefined ||
    !Number.isFinite(totalSeconds)
  ) {
    return '—';
  }
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  const paddedSeconds = String(seconds).padStart(2, '0');
  if (hours === 0) return `${minutes}:${paddedSeconds}`;
  return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
}
