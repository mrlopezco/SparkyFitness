import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FORK_MODULE_DEFAULTS,
  resolveForkModuleMap,
  type ForkModuleId,
} from '@workspace/shared';
import { preferencesKeys } from '@/api/keys/settings';
import {
  getModulePreferences,
  updateModulePreferences,
} from '@/api/Settings/modulePreferences';

export function useModulePreferences() {
  return useQuery({
    queryKey: preferencesKeys.modules(),
    queryFn: getModulePreferences,
    staleTime: 60_000,
    select: (data) => resolveForkModuleMap(data.modules),
  });
}

/** Effective modules with safe defaults while loading / on error. */
export function useEffectiveModules(): Record<ForkModuleId, boolean> {
  const { data } = useModulePreferences();
  return data ?? FORK_MODULE_DEFAULTS;
}

export function useUpdateModulePreferencesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateModulePreferences,
    onSuccess: (data) => {
      queryClient.setQueryData(preferencesKeys.modules(), data);
    },
    meta: {
      errorTitle: 'Failed to update modules',
      errorMessage: 'Could not save module visibility settings.',
      successMessage: 'Module visibility updated.',
    },
  });
}
