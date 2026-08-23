import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TrainingFitnessTestCreateRequest,
  TrainingFitnessTestReportRequest,
} from '@workspace/shared';
import { trainingPlanKeys } from '@/api/keys/training';
import {
  createFitnessTest,
  deleteFitnessTest,
  listFitnessTests,
  reportFitnessTest,
} from '@/api/Training/trainingPlanApi';

interface ReportFitnessTestVariables {
  testId: string;
  payload: TrainingFitnessTestReportRequest;
}

export function useFitnessTests(planId: string | undefined) {
  return useQuery({
    queryKey: trainingPlanKeys.fitnessTestList(planId),
    queryFn: () => listFitnessTests(planId),
    enabled: !!planId,
    meta: {
      errorTitle: 'Could not load fitness tests',
      errorMessage: 'Failed to fetch your scheduled fitness tests.',
    },
  });
}

export function useCreateFitnessTestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TrainingFitnessTestCreateRequest) =>
      createFitnessTest(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.fitnessTests(),
      });
    },
    meta: {
      errorTitle: 'Could not schedule test',
      errorMessage: 'Failed to schedule the fitness test.',
      successMessage: 'Fitness test scheduled.',
    },
  });
}

export function useReportFitnessTestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ testId, payload }: ReportFitnessTestVariables) =>
      reportFitnessTest(testId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.fitnessTests(),
      });
      // A reported test changes the derived paces the snapshot exposes.
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.snapshots(),
      });
    },
    meta: {
      errorTitle: 'Could not save results',
      errorMessage: 'Failed to save the fitness test results.',
      successMessage: 'Fitness test results saved.',
    },
  });
}

export function useDeleteFitnessTestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (testId: string) => deleteFitnessTest(testId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.fitnessTests(),
      });
    },
    meta: {
      errorTitle: 'Could not delete test',
      errorMessage: 'Failed to delete the fitness test.',
      successMessage: 'Fitness test deleted.',
    },
  });
}
