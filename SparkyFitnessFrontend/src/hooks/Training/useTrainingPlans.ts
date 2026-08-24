import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TrainingAdherenceMatchRequest,
  TrainingAthleteSnapshotPayload,
  TrainingCommitmentPayload,
  TrainingGoalPayload,
  TrainingPlanAdjustRequest,
  TrainingPlanConfirmRequest,
  TrainingPlanCreateRequest,
  TrainingPlanImportRequest,
  TrainingPlanProposeRequest,
  TrainingPlanUpdateRequest,
  TrainingSessionReportExecutionRequest,
} from '@workspace/shared';
import { trainingPlanKeys } from '@/api/keys/training';
import {
  adjustTrainingPlan,
  confirmTrainingPlan,
  createAthleteSnapshot,
  createTrainingPlan,
  deleteTrainingPlan,
  exportTrainingPlan,
  fetchTrainingPlanFeasibility,
  fetchTrainingPlanHealth,
  getLatestAthleteSnapshot,
  getTrainingCalendar,
  getTrainingPlan,
  importTrainingPlan,
  listTrainingPlans,
  matchTrainingAdherence,
  proposeTrainingPlan,
  reportTrainingSessionExecution,
  saveTrainingCommitments,
  saveTrainingGoals,
  skipTrainingSession,
  updateTrainingPlan,
} from '@/api/Training/trainingPlanApi';

interface TrainingCalendarParams {
  startDate: string;
  endDate: string;
  planId?: string;
  enabled?: boolean;
}

interface UpdateTrainingPlanVariables {
  planId: string;
  payload: TrainingPlanUpdateRequest;
}

interface SaveTrainingGoalsVariables {
  planId: string;
  goals: TrainingGoalPayload[];
}

interface SaveTrainingCommitmentsVariables {
  planId: string;
  commitments: TrainingCommitmentPayload[];
}

interface CreateAthleteSnapshotVariables {
  planId: string;
  payload: TrainingAthleteSnapshotPayload;
}

interface SkipTrainingSessionVariables {
  planId: string;
  sessionId: string;
  reason: string;
}

interface ReportTrainingSessionExecutionVariables {
  planId: string;
  sessionId: string;
  payload: TrainingSessionReportExecutionRequest;
}

export function useTrainingPlans() {
  return useQuery({
    queryKey: trainingPlanKeys.lists(),
    queryFn: listTrainingPlans,
    staleTime: 30_000,
    meta: {
      errorTitle: 'Could not load training plans',
      errorMessage: 'Failed to fetch your training plans.',
    },
  });
}

export function useTrainingPlanDetail(planId: string | undefined) {
  return useQuery({
    queryKey: trainingPlanKeys.detail(planId ?? 'none'),
    queryFn: () => getTrainingPlan(planId as string),
    enabled: !!planId,
    meta: {
      errorTitle: 'Could not load plan',
      errorMessage: 'Failed to fetch the training plan details.',
    },
  });
}

export function useTrainingCalendar({
  startDate,
  endDate,
  planId,
  enabled = true,
}: TrainingCalendarParams) {
  return useQuery({
    queryKey: trainingPlanKeys.calendar(startDate, endDate, planId),
    queryFn: () =>
      getTrainingCalendar({
        start_date: startDate,
        end_date: endDate,
        plan_id: planId,
      }),
    enabled,
    meta: {
      errorTitle: 'Could not load training calendar',
      errorMessage: 'Failed to fetch planned sessions for this month.',
    },
  });
}

export function useLatestAthleteSnapshot(planId: string | undefined) {
  return useQuery({
    queryKey: trainingPlanKeys.latestSnapshot(planId ?? 'none'),
    queryFn: () => getLatestAthleteSnapshot(planId as string),
    enabled: !!planId,
    meta: {
      errorTitle: 'Could not load athlete snapshot',
      errorMessage: 'Failed to fetch your latest training snapshot.',
    },
  });
}

export function useCreateTrainingPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TrainingPlanCreateRequest) =>
      createTrainingPlan(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingPlanKeys.all });
    },
    meta: {
      errorTitle: 'Could not create plan',
      errorMessage: 'Failed to create the training plan.',
      successMessage: 'Training plan created.',
    },
  });
}

export function useUpdateTrainingPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, payload }: UpdateTrainingPlanVariables) =>
      updateTrainingPlan(planId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingPlanKeys.all });
    },
    meta: {
      errorTitle: 'Could not update plan',
      errorMessage: 'Failed to save the training plan changes.',
      successMessage: 'Training plan updated.',
    },
  });
}

export function useDeleteTrainingPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => deleteTrainingPlan(planId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingPlanKeys.all });
    },
    meta: {
      errorTitle: 'Could not delete plan',
      errorMessage: 'Failed to delete the training plan.',
      successMessage: 'Training plan deleted.',
    },
  });
}

export function useSaveTrainingGoalsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, goals }: SaveTrainingGoalsVariables) =>
      saveTrainingGoals(planId, goals),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.detail(variables.planId),
      });
    },
    meta: {
      errorTitle: 'Could not save goals',
      errorMessage: 'Failed to save the plan goals.',
      successMessage: 'Goals saved.',
    },
  });
}

export function useSaveTrainingCommitmentsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, commitments }: SaveTrainingCommitmentsVariables) =>
      saveTrainingCommitments(planId, commitments),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.detail(variables.planId),
      });
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.calendars(),
      });
    },
    meta: {
      errorTitle: 'Could not save commitments',
      errorMessage: 'Failed to save the plan commitments.',
      successMessage: 'Commitments saved.',
    },
  });
}

export function useProposeTrainingPlanMutation() {
  return useMutation({
    mutationFn: (payload: TrainingPlanProposeRequest) =>
      proposeTrainingPlan(payload),
    meta: {
      errorTitle: 'Plan generation failed',
      errorMessage: 'The AI coach could not draft a plan. Try again.',
    },
  });
}

export function useAdjustTrainingPlanMutation() {
  return useMutation({
    mutationFn: (payload: TrainingPlanAdjustRequest) =>
      adjustTrainingPlan(payload),
    meta: {
      errorTitle: 'Adjustment failed',
      errorMessage: 'The AI coach could not suggest an adjustment. Try again.',
    },
  });
}

export function useConfirmTrainingPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TrainingPlanConfirmRequest) =>
      confirmTrainingPlan(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingPlanKeys.all });
    },
    meta: {
      errorTitle: 'Could not save plan',
      errorMessage: 'Failed to save the reviewed sessions.',
      successMessage: 'Training plan saved.',
    },
  });
}

export function useCreateAthleteSnapshotMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, payload }: CreateAthleteSnapshotVariables) =>
      createAthleteSnapshot(planId, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.latestSnapshot(variables.planId),
      });
    },
    meta: {
      errorTitle: 'Could not refresh snapshot',
      errorMessage: 'Failed to build a new athlete snapshot.',
      successMessage: 'Athlete snapshot refreshed.',
    },
  });
}

export function useSkipTrainingSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, sessionId, reason }: SkipTrainingSessionVariables) =>
      skipTrainingSession(planId, sessionId, { reason }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.calendars(),
      });
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.detail(variables.planId),
      });
    },
    meta: {
      errorTitle: 'Could not skip session',
      errorMessage: 'Failed to mark this session as skipped.',
      successMessage: 'Session marked as skipped.',
    },
  });
}

export function useReportTrainingSessionExecutionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      planId,
      sessionId,
      payload,
    }: ReportTrainingSessionExecutionVariables) =>
      reportTrainingSessionExecution(planId, sessionId, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.calendars(),
      });
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.detail(variables.planId),
      });
    },
    meta: {
      errorTitle: 'Could not log execution',
      errorMessage: 'Failed to save how this workout went.',
      successMessage: 'Workout execution saved.',
    },
  });
}

export function useExportTrainingPlanMutation() {
  return useMutation({
    mutationFn: (planId: string) => exportTrainingPlan(planId),
    meta: {
      errorTitle: 'Could not export plan',
      errorMessage: 'Failed to export the training plan JSON.',
    },
  });
}

export function useImportTrainingPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TrainingPlanImportRequest) =>
      importTrainingPlan(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingPlanKeys.all });
    },
    meta: {
      errorTitle: 'Could not import plan',
      errorMessage: 'Failed to import the training plan JSON.',
      successMessage: 'Training plan imported.',
    },
  });
}

export function useMatchTrainingAdherenceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TrainingAdherenceMatchRequest) =>
      matchTrainingAdherence(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.calendars(),
      });
    },
    meta: {
      errorTitle: 'Could not match activities',
      errorMessage: 'Failed to match logged activities to planned sessions.',
      successMessage: 'Adherence updated.',
    },
  });
}

export function useTrainingPlanFeasibility(planId: string | undefined) {
  return useQuery({
    queryKey: [...trainingPlanKeys.detail(planId ?? 'none'), 'feasibility'],
    queryFn: () => fetchTrainingPlanFeasibility(planId!),
    enabled: Boolean(planId),
  });
}

export function useTrainingPlanHealth(planId: string | undefined) {
  return useQuery({
    queryKey: [...trainingPlanKeys.detail(planId ?? 'none'), 'planHealth'],
    queryFn: () => fetchTrainingPlanHealth(planId!),
    enabled: Boolean(planId),
  });
}
