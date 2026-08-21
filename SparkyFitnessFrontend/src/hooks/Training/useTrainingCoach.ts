import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TrainingCoachCreateSessionRequest,
  TrainingCoachMemoryUpsert,
  TrainingCoachSendMessageRequest,
} from '@workspace/shared';
import { trainingPlanKeys } from '@/api/keys/training';
import {
  closeCoachSession,
  createCoachSession,
  deleteCoachMemory,
  getCoachSession,
  listCoachMemories,
  listCoachSessions,
  sendCoachMessage,
  upsertCoachMemory,
} from '@/api/Training/trainingPlanApi';

interface CreateCoachSessionVariables {
  planId: string;
  payload: TrainingCoachCreateSessionRequest;
}

interface CoachSessionVariables {
  planId: string;
  sessionId: string;
}

interface SendCoachMessageVariables extends CoachSessionVariables {
  payload: TrainingCoachSendMessageRequest;
}

interface UpsertCoachMemoryVariables {
  planId: string;
  payload: TrainingCoachMemoryUpsert;
}

interface DeleteCoachMemoryVariables {
  planId: string;
  memoryId: string;
}

export function useCoachSessions(planId: string | undefined) {
  return useQuery({
    queryKey: trainingPlanKeys.coachSessions(planId ?? 'none'),
    queryFn: () => listCoachSessions(planId as string),
    enabled: !!planId,
    meta: {
      errorTitle: 'Could not load coach chats',
      errorMessage: 'Failed to fetch your coach conversations.',
    },
  });
}

export function useCoachSession(
  planId: string | undefined,
  sessionId: string | undefined
) {
  return useQuery({
    queryKey: trainingPlanKeys.coachSession(
      planId ?? 'none',
      sessionId ?? 'none'
    ),
    queryFn: () => getCoachSession(planId as string, sessionId as string),
    enabled: !!planId && !!sessionId,
    meta: {
      errorTitle: 'Could not load coach chat',
      errorMessage: 'Failed to fetch this conversation.',
    },
  });
}

export function useCoachMemories(planId: string | undefined) {
  return useQuery({
    queryKey: trainingPlanKeys.coachMemories(planId ?? 'none'),
    queryFn: () => listCoachMemories(planId as string),
    enabled: !!planId,
    meta: {
      errorTitle: 'Could not load coach memories',
      errorMessage: 'Failed to fetch what the coach remembers.',
    },
  });
}

export function useCreateCoachSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, payload }: CreateCoachSessionVariables) =>
      createCoachSession(planId, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.coachSessions(variables.planId),
      });
    },
    meta: {
      errorTitle: 'Could not start chat',
      errorMessage: 'Failed to open a new coach conversation.',
    },
  });
}

export function useSendCoachMessageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, sessionId, payload }: SendCoachMessageVariables) =>
      sendCoachMessage(planId, sessionId, payload),
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.coachSession(
          variables.planId,
          variables.sessionId
        ),
      });
      // The coach can write memories or schedule tests as a side effect of a
      // reply, so refresh those lists only when it reports having done so.
      if (data.memories_added) {
        void queryClient.invalidateQueries({
          queryKey: trainingPlanKeys.coachMemories(variables.planId),
        });
      }
      if (data.scheduled_fitness_test_ids?.length) {
        void queryClient.invalidateQueries({
          queryKey: trainingPlanKeys.fitnessTests(),
        });
      }
    },
    meta: {
      errorTitle: 'Coach did not reply',
      errorMessage: 'Failed to send your message to the coach.',
    },
  });
}

export function useCloseCoachSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, sessionId }: CoachSessionVariables) =>
      closeCoachSession(planId, sessionId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.coachSessions(variables.planId),
      });
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.coachMemories(variables.planId),
      });
    },
    meta: {
      errorTitle: 'Could not close chat',
      errorMessage: 'Failed to close this coach conversation.',
      successMessage: 'Coach chat closed and summarised.',
    },
  });
}

export function useUpsertCoachMemoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, payload }: UpsertCoachMemoryVariables) =>
      upsertCoachMemory(planId, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.coachMemories(variables.planId),
      });
    },
    meta: {
      errorTitle: 'Could not save memory',
      errorMessage: 'Failed to save this coach memory.',
      successMessage: 'Coach memory saved.',
    },
  });
}

export function useDeleteCoachMemoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, memoryId }: DeleteCoachMemoryVariables) =>
      deleteCoachMemory(planId, memoryId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.coachMemories(variables.planId),
      });
    },
    meta: {
      errorTitle: 'Could not delete memory',
      errorMessage: 'Failed to delete this coach memory.',
      successMessage: 'Coach memory deleted.',
    },
  });
}
