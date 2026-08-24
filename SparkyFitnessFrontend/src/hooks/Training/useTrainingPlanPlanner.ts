import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TrainingPlanPlannerCreateSessionRequest,
  TrainingPlanPlannerDraftSessionRequest,
  TrainingPlanPlannerMode,
  TrainingPlanPlannerSendMessageRequest,
} from '@workspace/shared';
import { trainingPlanKeys } from '@/api/keys/training';
import {
  cancelTrainingPlannerSession,
  createTrainingPlannerSession,
  draftTrainingPlannerSession,
  fetchTrainingPlannerSessions,
  sendTrainingPlannerMessage,
} from '@/api/Training/trainingPlanApi';

export function usePlannerChangeHistory(planId: string | undefined) {
  return useQuery({
    queryKey: trainingPlanKeys.plannerHistory(planId ?? 'none'),
    queryFn: () => fetchTrainingPlannerSessions(planId!, { status: 'confirmed' }),
    enabled: Boolean(planId),
  });
}

export function useCreatePlannerSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      planId,
      payload,
    }: {
      planId: string;
      payload: TrainingPlanPlannerCreateSessionRequest;
    }) => createTrainingPlannerSession(planId, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.plannerSessions(variables.planId),
      });
    },
  });
}

export function useSendPlannerMessageMutation() {
  return useMutation({
    mutationFn: ({
      planId,
      sessionId,
      payload,
    }: {
      planId: string;
      sessionId: string;
      payload: TrainingPlanPlannerSendMessageRequest;
    }) => sendTrainingPlannerMessage(planId, sessionId, payload),
  });
}

export function useDraftPlannerSessionMutation() {
  return useMutation({
    mutationFn: ({
      planId,
      sessionId,
      payload,
    }: {
      planId: string;
      sessionId: string;
      payload?: TrainingPlanPlannerDraftSessionRequest;
    }) => draftTrainingPlannerSession(planId, sessionId, payload ?? {}),
    meta: {
      errorTitle: 'Draft failed',
      errorMessage:
        'The planner could not draft sessions from this conversation. Try again.',
    },
  });
}

export function useCancelPlannerSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      planId,
      sessionId,
    }: {
      planId: string;
      sessionId: string;
    }) => cancelTrainingPlannerSession(planId, sessionId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.plannerSessions(variables.planId),
      });
    },
  });
}

export type { TrainingPlanPlannerMode };
