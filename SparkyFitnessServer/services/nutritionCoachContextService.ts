import {
  addDays,
  classifyActivitySport,
  daysBetween,
  todayInZone,
  type ActivitySport,
  type NutritionCoachContextPayload,
  type NutritionCoachMetricsAtClose,
  type NutritionCoachProgressDelta,
} from '@workspace/shared';
import reportRepository from '../models/reportRepository.js';
import goalRepository from '../models/goalRepository.js';
import nutritionCoachRepository from '../models/nutritionCoachRepository.js';
import trainingPlanRepository from '../models/trainingPlanRepository.js';
import { buildNutritionDiaryAnalytics } from './trainingNutritionSnapshotService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

export const LONG_TERM_DAYS = 365;
export const RECENT_WEEKLY_WEEKS = 12;
export const MEAL_STRUCTURE_DAYS = 90;
export const ACTIVITY_WINDOW_42 = 42;
export const ACTIVITY_WINDOW_90 = 90;
export const TRAINING_DAY_MIN_MINUTES = 45;

const SIGNIFICANT_SPORTS = new Set<ActivitySport>([
  'running',
  'cycling',
  'swimming',
  'strength',
  'hiking',
  'walking',
]);

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

interface DailyNutritionRow {
  entry_date: string | Date;
  calories?: unknown;
  protein?: unknown;
  carbs?: unknown;
  fat?: unknown;
}

function countDaysWithCalories(
  rows: readonly DailyNutritionRow[],
  minCalories = 1
): number {
  return rows.filter((row) => toNumber(row.calories) >= minCalories).length;
}

function monthKey(day: string): string {
  return day.slice(0, 7);
}

function weekStartMonday(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  const dow = date.getUTCDay();
  const offset = dow === 0 ? 6 : dow - 1;
  return addDays(day, -offset);
}

function buildMonthlyRollups(
  rows: readonly DailyNutritionRow[]
): NutritionCoachContextPayload['long_term_monthly'] {
  const byMonth = new Map<
    string,
    {
      days: Set<string>;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }
  >();

  for (const row of rows) {
    const cal = toNumber(row.calories);
    if (cal <= 0) continue;
    const key = monthKey(String(row.entry_date));
    const bucket = byMonth.get(key) ?? {
      days: new Set<string>(),
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    };
    bucket.days.add(String(row.entry_date));
    bucket.calories += cal;
    bucket.protein += toNumber(row.protein);
    bucket.carbs += toNumber(row.carbs);
    bucket.fat += toNumber(row.fat);
    byMonth.set(key, bucket);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, bucket]) => {
      const daysLogged = bucket.days.size;
      return {
        month,
        days_logged: daysLogged,
        avg_calories: daysLogged ? round(bucket.calories / daysLogged) : 0,
        avg_protein_g: daysLogged ? round(bucket.protein / daysLogged) : 0,
        avg_carbs_g: daysLogged ? round(bucket.carbs / daysLogged) : 0,
        avg_fat_g: daysLogged ? round(bucket.fat / daysLogged) : 0,
      };
    });
}

function buildWeeklyRollups(
  rows: readonly DailyNutritionRow[]
): NutritionCoachContextPayload['recent_weekly'] {
  const byWeek = new Map<
    string,
    { days: Set<string>; calories: number; protein: number }
  >();

  for (const row of rows) {
    const cal = toNumber(row.calories);
    if (cal <= 0) continue;
    const week = weekStartMonday(String(row.entry_date));
    const bucket = byWeek.get(week) ?? {
      days: new Set<string>(),
      calories: 0,
      protein: 0,
    };
    bucket.days.add(String(row.entry_date));
    bucket.calories += cal;
    bucket.protein += toNumber(row.protein);
    byWeek.set(week, bucket);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-RECENT_WEEKLY_WEEKS)
    .map(([week_start, bucket]) => {
      const daysLogged = bucket.days.size;
      return {
        week_start,
        days_logged: daysLogged,
        avg_calories: daysLogged ? round(bucket.calories / daysLogged) : 0,
        avg_protein_g: daysLogged ? round(bucket.protein / daysLogged) : 0,
      };
    });
}

function buildActivitySummary(
  userId: string,
  startDate: string,
  endDate: string,
  windowDays: number
): Promise<NutritionCoachContextPayload['activity_42d']> {
  return trainingPlanRepository
    .listActivityEntries(userId, startDate, endDate)
    .then((activities) => {
      const bySport = new Map<
        ActivitySport,
        { sessions: number; minutes: number }
      >();
      for (const entry of activities) {
        const sport = classifyActivitySport({
          exerciseName: entry.exercise_name,
          category: entry.category,
          notes: entry.notes,
          providerName: entry.provider_name,
          detailData: entry.detail_data,
          exerciseSourceId: entry.exercise_source_id,
        }).sport;
        const bucket = bySport.get(sport) ?? { sessions: 0, minutes: 0 };
        bucket.sessions += 1;
        bucket.minutes += entry.duration_minutes ?? 0;
        bySport.set(sport, bucket);
      }
      return {
        window_days: windowDays,
        by_sport: [...bySport.entries()]
          .map(([sport, stats]) => ({
            sport,
            session_count: stats.sessions,
            total_minutes: round(stats.minutes),
          }))
          .sort((a, b) => b.total_minutes - a.total_minutes),
      };
    });
}

function isTrainingDay(
  day: string,
  activityByDay: Map<string, number>,
  sportMinutesByDay: Map<string, Map<ActivitySport, number>>
): boolean {
  const totalMinutes = activityByDay.get(day) ?? 0;
  if (totalMinutes >= TRAINING_DAY_MIN_MINUTES) return true;
  const sports = sportMinutesByDay.get(day);
  if (!sports) return false;
  for (const [sport, minutes] of sports) {
    if (SIGNIFICANT_SPORTS.has(sport) && minutes >= 20) return true;
  }
  return false;
}

function buildTrainingDayVsRest(
  dailyRows: readonly DailyNutritionRow[],
  activityByDay: Map<string, number>,
  sportMinutesByDay: Map<string, Map<ActivitySport, number>>,
  windowDays: number
): NutritionCoachContextPayload['training_day_vs_rest'] {
  let trainingCal = 0;
  let trainingProtein = 0;
  let trainingDays = 0;
  let restCal = 0;
  let restProtein = 0;
  let restDays = 0;

  for (const row of dailyRows) {
    const cal = toNumber(row.calories);
    if (cal <= 0) continue;
    const day = String(row.entry_date);
    const protein = toNumber(row.protein);
    if (isTrainingDay(day, activityByDay, sportMinutesByDay)) {
      trainingCal += cal;
      trainingProtein += protein;
      trainingDays += 1;
    } else {
      restCal += cal;
      restProtein += protein;
      restDays += 1;
    }
  }

  return {
    window_days: windowDays,
    training_day_count: trainingDays,
    rest_day_count: restDays,
    training_day_avg_calories: trainingDays
      ? round(trainingCal / trainingDays)
      : null,
    rest_day_avg_calories: restDays ? round(restCal / restDays) : null,
    training_day_avg_protein_g: trainingDays
      ? round(trainingProtein / trainingDays)
      : null,
    rest_day_avg_protein_g: restDays ? round(restProtein / restDays) : null,
  };
}

function activityMaps(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{
  activityByDay: Map<string, number>;
  sportMinutesByDay: Map<string, Map<ActivitySport, number>>;
}> {
  return trainingPlanRepository
    .listActivityEntries(userId, startDate, endDate)
    .then((activities) => {
      const activityByDay = new Map<string, number>();
      const sportMinutesByDay = new Map<string, Map<ActivitySport, number>>();
      for (const entry of activities) {
        const day = entry.entry_date;
        const minutes = entry.duration_minutes ?? 0;
        activityByDay.set(day, (activityByDay.get(day) ?? 0) + minutes);
        const sport = classifyActivitySport({
          exerciseName: entry.exercise_name,
          category: entry.category,
          notes: entry.notes,
          providerName: entry.provider_name,
          detailData: entry.detail_data,
          exerciseSourceId: entry.exercise_source_id,
        }).sport;
        const daySports =
          sportMinutesByDay.get(day) ?? new Map<ActivitySport, number>();
        daySports.set(sport, (daySports.get(sport) ?? 0) + minutes);
        sportMinutesByDay.set(day, daySports);
      }
      return { activityByDay, sportMinutesByDay };
    });
}

async function buildActivePlanSnippet(
  userId: string,
  planId: string | null,
  today: string
): Promise<NutritionCoachContextPayload['active_plan_snippet']> {
  if (!planId) return undefined;
  const plan = await trainingPlanRepository.getPlanById(userId, planId);
  if (!plan || plan.status !== 'active') return undefined;

  const lookaheadEnd = addDays(today, 14);
  const [goals, upcoming] = await Promise.all([
    trainingPlanRepository.listGoals(userId, planId),
    trainingPlanRepository.listSessionsInRange(
      userId,
      today,
      lookaheadEnd,
      planId
    ),
  ]);

  return {
    plan_id: planId,
    name: plan.name,
    sport_focus: plan.sport_focus ?? undefined,
    start_date: plan.start_date,
    target_date: plan.target_date ?? undefined,
    goals: goals.map((goal) => ({
      type: goal.type,
      title: goal.title,
      target_date: goal.target_date ?? undefined,
    })),
    upcoming_sessions: upcoming.map((session) => ({
      scheduled_date: session.scheduled_date,
      session_type: session.session_type,
      status: session.status,
    })),
  };
}

export function metricsFromPayload(
  payload: NutritionCoachContextPayload
): NutritionCoachMetricsAtClose {
  const weekly = payload.recent_weekly;
  const weeksWithLogs = weekly.filter((w) => w.days_logged > 0);
  const loggingDaysPerWeek =
    weeksWithLogs.length > 0
      ? round(
          weeksWithLogs.reduce((sum, w) => sum + w.days_logged, 0) /
            weeksWithLogs.length,
          2
        )
      : 0;
  const last90Weeks = weekly.slice(-13);
  const avgCal =
    last90Weeks.length > 0
      ? round(
          last90Weeks.reduce((sum, w) => sum + w.avg_calories, 0) /
            last90Weeks.length
        )
      : 0;
  const avgProtein =
    last90Weeks.length > 0
      ? round(
          last90Weeks.reduce((sum, w) => sum + w.avg_protein_g, 0) /
            last90Weeks.length
        )
      : 0;
  const lateBucket = payload.entry_time_buckets.find(
    (b) => b.bucket === 'late_night'
  );

  return {
    as_of_date: payload.as_of_date,
    logging_days_per_week_90d: loggingDaysPerWeek,
    avg_calories_90d: avgCal,
    avg_protein_g_90d: avgProtein,
    late_night_calorie_share_90d: lateBucket?.calorie_share_pct ?? null,
    training_day_avg_protein_g:
      payload.training_day_vs_rest.training_day_avg_protein_g,
    rest_day_avg_protein_g:
      payload.training_day_vs_rest.rest_day_avg_protein_g,
  };
}

export function computeProgressSinceLastCheckIn(
  baseline: NutritionCoachMetricsAtClose | null | undefined,
  baselineSessionId: string | null,
  baselineClosedAt: string | null,
  current: NutritionCoachMetricsAtClose,
  commitments: readonly {
    memory_key: string;
    memory_value: string;
    updated_at: string;
  }[]
): NutritionCoachProgressDelta {
  const daysSince =
    baselineClosedAt != null
      ? Math.max(
          0,
          daysBetween(baselineClosedAt.slice(0, 10), current.as_of_date)
        )
      : null;

  if (!baseline) {
    return {
      baseline_session_id: baselineSessionId,
      baseline_closed_at: baselineClosedAt,
      days_since_last_check_in: daysSince,
      deltas: {
        logging_days_per_week_90d: null,
        avg_protein_g_90d: null,
        avg_calories_90d: null,
        training_day_avg_protein_g: null,
        rest_day_avg_protein_g: null,
      },
      coach_commitments_since_baseline: commitments.map((m) => ({
        memory_key: m.memory_key,
        memory_value: m.memory_value,
        updated_at: m.updated_at,
      })),
    };
  }

  return {
    baseline_session_id: baselineSessionId,
    baseline_closed_at: baselineClosedAt,
    days_since_last_check_in: daysSince,
    deltas: {
      logging_days_per_week_90d: round(
        current.logging_days_per_week_90d - baseline.logging_days_per_week_90d,
        2
      ),
      avg_protein_g_90d: round(
        current.avg_protein_g_90d - baseline.avg_protein_g_90d,
        1
      ),
      avg_calories_90d: round(
        current.avg_calories_90d - baseline.avg_calories_90d,
        1
      ),
      training_day_avg_protein_g:
        current.training_day_avg_protein_g != null &&
        baseline.training_day_avg_protein_g != null
          ? round(
              current.training_day_avg_protein_g -
                baseline.training_day_avg_protein_g,
              1
            )
          : null,
      rest_day_avg_protein_g:
        current.rest_day_avg_protein_g != null &&
        baseline.rest_day_avg_protein_g != null
          ? round(
              current.rest_day_avg_protein_g - baseline.rest_day_avg_protein_g,
              1
            )
          : null,
    },
    coach_commitments_since_baseline: commitments.map((m) => ({
      memory_key: m.memory_key,
      memory_value: m.memory_value,
      updated_at: m.updated_at,
    })),
  };
}

export async function buildContextPayload(
  userId: string,
  planId: string | null
): Promise<NutritionCoachContextPayload> {
  const tz = await loadUserTimezone(userId);
  const asOfDate = todayInZone(tz);
  const longStart = addDays(asOfDate, -(LONG_TERM_DAYS - 1));
  const mealStart = addDays(asOfDate, -(MEAL_STRUCTURE_DAYS - 1));
  const act42Start = addDays(asOfDate, -(ACTIVITY_WINDOW_42 - 1));
  const act90Start = addDays(asOfDate, -(ACTIVITY_WINDOW_90 - 1));

  const [
    longRows,
    mealRows,
    topFoods,
    diaryAnalytics,
    activity42,
    activity90,
    activityMaps90,
    goalsRow,
    activePlan,
  ] = await Promise.all([
    reportRepository.getDailyNutritionTotalsRange(
      userId,
      longStart,
      asOfDate
    ) as Promise<DailyNutritionRow[]>,
    reportRepository.getDailyNutritionTotalsRange(
      userId,
      mealStart,
      asOfDate
    ) as Promise<DailyNutritionRow[]>,
    nutritionCoachRepository.getTopFoodsByFrequency(
      userId,
      mealStart,
      asOfDate
    ),
    buildNutritionDiaryAnalytics(userId, mealStart, asOfDate),
    buildActivitySummary(userId, act42Start, asOfDate, ACTIVITY_WINDOW_42),
    buildActivitySummary(userId, act90Start, asOfDate, ACTIVITY_WINDOW_90),
    activityMaps(userId, mealStart, asOfDate),
    goalRepository.getGoalByDate(userId, asOfDate),
    buildActivePlanSnippet(userId, planId, asOfDate),
  ]);

  const days28Start = addDays(asOfDate, -27);
  const days90Start = addDays(asOfDate, -89);
  const loggedDates = longRows
    .filter((row) => toNumber(row.calories) > 0)
    .map((row) => String(row.entry_date));

  const logging_coverage: NutritionCoachContextPayload['logging_coverage'] = {
    days_logged_365: countDaysWithCalories(longRows),
    days_logged_90: countDaysWithCalories(
      longRows.filter((row) => String(row.entry_date) >= days90Start)
    ),
    days_logged_28: countDaysWithCalories(
      longRows.filter((row) => String(row.entry_date) >= days28Start)
    ),
    window_days_365: LONG_TERM_DAYS,
    first_logged_date: loggedDates[0] ?? null,
    last_logged_date: loggedDates.length
      ? loggedDates[loggedDates.length - 1]
      : null,
  };

  const { meal_structure: mealStructure, entry_time_buckets: timeBuckets, timing_coverage: timingCoverage } =
    diaryAnalytics;

  const notes: string[] = [];
  if (logging_coverage.days_logged_365 < 30) {
    notes.push(
      'Food diary coverage is thin over the last year; keep critique tentative and ask the athlete to log more consistently.'
    );
  }
  if (
    timingCoverage.calorie_share_inferred_from_meal_slot_pct >= 40 &&
    timingCoverage.calorie_share_with_clock_time_pct < 20
  ) {
    notes.push(
      'Most logged calories use meal slot (Breakfast/Lunch/etc.) without clock time; use meal_structure and entry_time_buckets (meal-slot inferred) for timing critique — do not ask the athlete to add clock times unless they want finer detail.'
    );
  }
  if (timingCoverage.calorie_share_untagged_pct >= 25) {
    notes.push(
      'A large share of calories lack both clock time and meal slot; suggest picking a meal type when logging.'
    );
  }

  const training_day_vs_rest = buildTrainingDayVsRest(
    mealRows,
    activityMaps90.activityByDay,
    activityMaps90.sportMinutesByDay,
    MEAL_STRUCTURE_DAYS
  );

  const goals_and_targets = goalsRow
    ? {
        calories: goalsRow.calories != null ? Number(goalsRow.calories) : null,
        protein_g: goalsRow.protein != null ? Number(goalsRow.protein) : null,
        carbs_g: goalsRow.carbs != null ? Number(goalsRow.carbs) : null,
        fat_g: goalsRow.fat != null ? Number(goalsRow.fat) : null,
        goal_date: asOfDate,
      }
    : undefined;

  return {
    as_of_date: asOfDate,
    logging_coverage,
    long_term_monthly: buildMonthlyRollups(longRows),
    recent_weekly: buildWeeklyRollups(longRows),
    meal_structure: mealStructure,
    entry_time_buckets: timeBuckets,
    timing_coverage: timingCoverage,
    top_foods: topFoods,
    activity_42d: activity42,
    activity_90d: activity90,
    training_day_vs_rest,
    ...(activePlan ? { active_plan_snippet: activePlan } : {}),
    ...(goals_and_targets ? { goals_and_targets } : {}),
    ...(notes.length ? { notes } : {}),
  };
}

export function estimateContextTokens(
  payload: NutritionCoachContextPayload
): number {
  return Math.ceil(JSON.stringify(payload).length / 4);
}

const SNAPSHOT_STALE_MS = 24 * 60 * 60 * 1000;

export async function ensureFreshContextSnapshot(
  userId: string,
  planId: string | null
): Promise<NutritionCoachContextPayload> {
  const latest = await nutritionCoachRepository.getLatestContextSnapshot(userId);
  const now = Date.now();
  if (
    latest &&
    latest.as_of_date &&
    now - new Date(latest.created_at).getTime() < SNAPSHOT_STALE_MS
  ) {
    return latest.payload;
  }

  const payload = await buildContextPayload(userId, planId);
  await nutritionCoachRepository.insertContextSnapshot(
    userId,
    planId,
    payload.as_of_date,
    payload,
    estimateContextTokens(payload)
  );
  return payload;
}

export default {
  buildContextPayload,
  ensureFreshContextSnapshot,
  metricsFromPayload,
  computeProgressSinceLastCheckIn,
  estimateContextTokens,
};
