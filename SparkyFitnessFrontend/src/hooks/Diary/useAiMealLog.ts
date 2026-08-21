import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AiMealLogAnalyzeRequest,
  AiMealLogConfirmRequest,
} from '@workspace/shared';
import {
  analyzeAiMealLog,
  confirmAiMealLog,
} from '@/api/AiMealLog/aiMealLogApi';
import { foodEntryKeys } from '@/api/keys/diary';

export const useAnalyzeAiMealLogMutation = () => {
  return useMutation({
    mutationFn: (payload: AiMealLogAnalyzeRequest) => analyzeAiMealLog(payload),
    meta: {
      errorTitle: 'AI meal analysis failed',
      errorMessage: 'Could not parse your meal text. Try again or rephrase.',
    },
  });
};

export const useConfirmAiMealLogMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AiMealLogConfirmRequest) => confirmAiMealLog(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: foodEntryKeys.all });
    },
    meta: {
      errorTitle: 'Could not log meal',
      errorMessage: 'Failed to save the reviewed food entries.',
      successMessage: 'Meal logged successfully.',
    },
  });
};
