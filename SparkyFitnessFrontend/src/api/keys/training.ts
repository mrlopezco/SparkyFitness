export const trainingPlanKeys = {
  all: ['trainingPlans'] as const,
  lists: () => [...trainingPlanKeys.all, 'list'] as const,
  details: () => [...trainingPlanKeys.all, 'detail'] as const,
  detail: (planId: string) => [...trainingPlanKeys.details(), planId] as const,
  calendars: () => [...trainingPlanKeys.all, 'calendar'] as const,
  calendar: (startDate: string, endDate: string, planId?: string) =>
    [...trainingPlanKeys.calendars(), { startDate, endDate, planId }] as const,
  snapshots: () => [...trainingPlanKeys.all, 'snapshot'] as const,
  latestSnapshot: (planId: string) =>
    [...trainingPlanKeys.snapshots(), planId, 'latest'] as const,
  coach: () => [...trainingPlanKeys.all, 'coach'] as const,
  coachSessions: (planId: string) =>
    [...trainingPlanKeys.coach(), planId, 'sessions'] as const,
  coachSession: (planId: string, sessionId: string) =>
    [...trainingPlanKeys.coachSessions(planId), sessionId] as const,
  coachMemories: (planId: string) =>
    [...trainingPlanKeys.coach(), planId, 'memories'] as const,
  fitnessTests: () => [...trainingPlanKeys.all, 'fitnessTests'] as const,
  fitnessTestList: (planId?: string) =>
    [...trainingPlanKeys.fitnessTests(), planId ?? 'all'] as const,
  planner: () => [...trainingPlanKeys.all, 'planner'] as const,
  plannerSessions: (planId: string) =>
    [...trainingPlanKeys.planner(), planId, 'sessions'] as const,
  plannerHistory: (planId: string) =>
    [...trainingPlanKeys.plannerSessions(planId), 'confirmed'] as const,
  nutritionCoach: () => [...trainingPlanKeys.all, 'nutritionCoach'] as const,
  nutritionCoachSessions: () =>
    [...trainingPlanKeys.nutritionCoach(), 'sessions'] as const,
  nutritionCoachSession: (sessionId: string) =>
    [...trainingPlanKeys.nutritionCoachSessions(), sessionId] as const,
  nutritionCoachMemories: () =>
    [...trainingPlanKeys.nutritionCoach(), 'memories'] as const,
};
