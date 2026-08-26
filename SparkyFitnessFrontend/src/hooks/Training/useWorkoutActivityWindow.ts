import { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, todayInZone } from '@workspace/shared';
import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useExerciseEntries } from '@/hooks/Exercises/useExerciseEntries';
import {
  useTrainingCalendar,
  useTrainingPlans,
} from '@/hooks/Training/useTrainingPlans';
import { useEffectiveModules } from '@/hooks/Settings/useModulePreferences';
import {
  exerciseSessionsToWorkoutWindowItems,
  plannedSessionsToWorkoutWindowItems,
  type WorkoutWindowActivityItem,
} from '@/utils/workoutWindowDisplay';

export interface WorkoutActivityWindowData {
  today: string;
  yesterday: string;
  tomorrow: string;
  yesterdayItems: WorkoutWindowActivityItem[];
  todayItems: WorkoutWindowActivityItem[];
  tomorrowItems: WorkoutWindowActivityItem[];
  isLoading: boolean;
  hasTrainingModule: boolean;
  activePlanId: string | undefined;
}

export function useWorkoutActivityWindow(
  options: {
    /** When set, calendar queries use this plan instead of the active plan. */
    planId?: string;
    enabled?: boolean;
  } = {}
): WorkoutActivityWindowData {
  const { enabled = true } = options;
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const modules = useEffectiveModules();
  const hasTrainingModule = modules.training_plan;

  const today = todayInZone(timezone);
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const userId = activeUserId || user?.id;

  const { data: plans = [] } = useTrainingPlans();

  const activePlanId = useMemo(() => {
    if (options.planId) return options.planId;
    return plans.find((plan) => plan.status === 'active')?.id;
  }, [options.planId, plans]);

  const {
    data: yesterdaySessions,
    isLoading: loadingYesterday,
  } = useExerciseEntries(yesterday, userId);
  const { data: todaySessions, isLoading: loadingToday } = useExerciseEntries(
    today,
    userId
  );

  const calendarEnabled =
    enabled && hasTrainingModule && !!activePlanId && !!userId;

  const { data: tomorrowCalendar, isLoading: loadingTomorrow } =
    useTrainingCalendar({
      startDate: tomorrow,
      endDate: tomorrow,
      planId: activePlanId,
      enabled: calendarEnabled,
    });

  const sessionTypeLabel = useCallback(
    (sessionType: string) =>
      t(`training.sessionType.${sessionType}`, sessionType),
    [t]
  );

  const yesterdayItems = useMemo(
    () => exerciseSessionsToWorkoutWindowItems(yesterdaySessions),
    [yesterdaySessions]
  );
  const todayItems = useMemo(
    () => exerciseSessionsToWorkoutWindowItems(todaySessions),
    [todaySessions]
  );
  const tomorrowItems = useMemo(() => {
    const day = tomorrowCalendar?.days.find((d) => d.date === tomorrow);
    const sessions = day?.sessions ?? [];
    return plannedSessionsToWorkoutWindowItems(sessions, sessionTypeLabel);
  }, [tomorrowCalendar?.days, tomorrow, sessionTypeLabel]);

  const isLoading =
    enabled &&
    (loadingYesterday ||
      loadingToday ||
      (calendarEnabled && loadingTomorrow));

  return {
    today,
    yesterday,
    tomorrow,
    yesterdayItems,
    todayItems,
    tomorrowItems,
    isLoading,
    hasTrainingModule,
    activePlanId,
  };
}
