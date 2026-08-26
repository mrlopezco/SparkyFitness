import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NutritionCoachCreateSessionRequest,
  NutritionCoachMemoryUpsert,
  NutritionCoachSendMessageRequest,
} from '@workspace/shared';
import { trainingPlanKeys } from '@/api/keys/training';
import {
  closeNutritionCoachSession,
  createNutritionCoachSession,
  deleteNutritionCoachMemory,
  getNutritionCoachSession,
  listNutritionCoachMemories,
  listNutritionCoachSessions,
  sendNutritionCoachMessage,
  upsertNutritionCoachMemory,
} from '@/api/Training/nutritionCoachApi';

export function useNutritionCoachSessions() {
  return useQuery({
    queryKey: trainingPlanKeys.nutritionCoachSessions(),
    queryFn: listNutritionCoachSessions,
    meta: {
      errorTitle: 'Could not load nutrition coach',
      errorMessage: 'Failed to fetch your nutrition check-ins.',
    },
  });
}

export function useNutritionCoachSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: trainingPlanKeys.nutritionCoachSession(sessionId ?? 'none'),
    queryFn: () => getNutritionCoachSession(sessionId as string),
    enabled: !!sessionId,
    meta: {
      errorTitle: 'Could not load check-in',
      errorMessage: 'Failed to fetch this nutrition conversation.',
    },
  });
}

export function useNutritionCoachMemories() {
  return useQuery({
    queryKey: trainingPlanKeys.nutritionCoachMemories(),
    queryFn: listNutritionCoachMemories,
    meta: {
      errorTitle: 'Could not load nutrition memories',
      errorMessage: 'Failed to fetch what the nutrition coach remembers.',
    },
  });
}

export function useCreateNutritionCoachSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: NutritionCoachCreateSessionRequest) =>
      createNutritionCoachSession(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.nutritionCoachSessions(),
      });
    },
    meta: {
      errorTitle: 'Could not start check-in',
      errorMessage: 'Failed to open a new nutrition coach conversation.',
    },
  });
}

export function useSendNutritionCoachMessageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      payload,
    }: {
      sessionId: string;
      payload: NutritionCoachSendMessageRequest;
    }) => sendNutritionCoachMessage(sessionId, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.nutritionCoachSession(variables.sessionId),
      });
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.nutritionCoachMemories(),
      });
    },
    meta: {
      errorTitle: 'Message failed',
      errorMessage: 'The nutrition coach could not respond.',
    },
  });
}

export function useCloseNutritionCoachSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      serviceConfigId,
    }: {
      sessionId: string;
      serviceConfigId?: string;
    }) => closeNutritionCoachSession(sessionId, serviceConfigId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.nutritionCoachSessions(),
      });
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.nutritionCoachSession(variables.sessionId),
      });
    },
    meta: {
      successMessage: 'Check-in closed and summarized.',
      errorTitle: 'Could not close check-in',
      errorMessage: 'Failed to save the session summary.',
    },
  });
}

export function useUpsertNutritionCoachMemoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: NutritionCoachMemoryUpsert) =>
      upsertNutritionCoachMemory(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.nutritionCoachMemories(),
      });
    },
    meta: {
      errorTitle: 'Could not save memory',
      errorMessage: 'Failed to update nutrition coach memory.',
    },
  });
}

export function useDeleteNutritionCoachMemoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memoryId: string) => deleteNutritionCoachMemory(memoryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.nutritionCoachMemories(),
      });
    },
    meta: {
      errorTitle: 'Could not delete memory',
      errorMessage: 'Failed to remove this memory.',
    },
  });
}
