import {
  exerciseSessionToWorkoutWindowItem,
  exerciseSessionsToWorkoutWindowItems,
  plannedSessionToWorkoutWindowItem,
} from '@/utils/workoutWindowDisplay';
import type {
  ExerciseEntryResponse,
  IndividualSessionResponse,
  PresetSessionResponse,
  TrainingPlanSession,
} from '@workspace/shared';

const baseEntry = (
  overrides: Partial<ExerciseEntryResponse> = {}
): ExerciseEntryResponse =>
  ({
    id: 'entry-1',
    exercise_id: 1,
    entry_date: '2026-08-25',
    duration_minutes: 45,
    calories_burned: 400,
    distance: 8.5,
    avg_heart_rate: 140,
    max_heart_rate: 165,
    sets: [],
    exercise_snapshot: { name: 'Run', modality: 'duration', category: 'cardio' },
    activity_details: [],
    ...overrides,
  }) as ExerciseEntryResponse;

describe('workoutWindowDisplay', () => {
  it('maps individual sessions with name and metrics', () => {
    const session: IndividualSessionResponse = {
      ...baseEntry(),
      type: 'individual',
      name: 'Morning Run',
    };
    const item = exerciseSessionToWorkoutWindowItem(session);
    expect(item.kind).toBe('logged');
    expect(item.name).toBe('Morning Run');
    expect(item.distanceKm).toBe(8.5);
    expect(item.durationMinutes).toBe(45);
    expect(item.caloriesKcal).toBe(400);
    expect(item.avgHeartRate).toBe(140);
    expect(item.maxHeartRate).toBe(165);
  });

  it('aggregates preset session metrics from child exercises', () => {
    const session: PresetSessionResponse = {
      type: 'preset',
      id: 'preset-1',
      entry_date: '2026-08-25',
      workout_preset_id: 1,
      name: 'Leg day',
      description: null,
      notes: null,
      source: 'manual',
      total_duration_minutes: 60,
      exercises: [
        baseEntry({
          id: 'a',
          distance: 0,
          duration_minutes: 30,
          calories_burned: 200,
          avg_heart_rate: 120,
          max_heart_rate: 150,
        }),
        baseEntry({
          id: 'b',
          distance: 2,
          duration_minutes: 30,
          calories_burned: 100,
          avg_heart_rate: 140,
          max_heart_rate: 170,
        }),
      ],
      activity_details: [],
    };
    const item = exerciseSessionToWorkoutWindowItem(session);
    expect(item.name).toBe('Leg day');
    expect(item.distanceKm).toBe(2);
    expect(item.durationMinutes).toBe(60);
    expect(item.caloriesKcal).toBe(300);
    expect(item.avgHeartRate).toBe(130);
    expect(item.maxHeartRate).toBe(170);
  });

  it('returns empty list for undefined sessions', () => {
    expect(exerciseSessionsToWorkoutWindowItems(undefined)).toEqual([]);
  });

  it('maps planned training sessions without logged HR or calories', () => {
    const session = {
      id: 'sess-1',
      plan_id: 'plan-1',
      scheduled_date: '2026-08-27',
      session_type: 'tempo',
      status: 'planned',
      prescription: {
        title: 'Tempo 8k',
        distance_km: 8,
        duration_minutes: 45,
        heart_rate_zone: 'Zone 3',
        pace_target: '4:30 /km',
      },
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    } as TrainingPlanSession;

    const item = plannedSessionToWorkoutWindowItem(session, 'Tempo');
    expect(item.kind).toBe('planned');
    expect(item.name).toBe('Tempo 8k');
    expect(item.distanceKm).toBe(8);
    expect(item.durationMinutes).toBe(45);
    expect(item.caloriesKcal).toBeNull();
    expect(item.avgHeartRate).toBeNull();
    expect(item.maxHeartRate).toBeNull();
    expect(item.heartRateZone).toBe('Zone 3');
    expect(item.paceSubtitle).toBe('4:30 /km');
  });
});
