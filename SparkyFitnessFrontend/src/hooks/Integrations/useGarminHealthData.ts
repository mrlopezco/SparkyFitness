import {
  fetchGarminHealthDataStatus,
  GhdLoginPayload,
  GhdMfaPayload,
  GhdStatusResponse,
  isGhdLoginSuccess,
  isGhdMfaRequired,
  loginGarminHealthData,
  resolveGhdMfaId,
  resumeGarminHealthDataLogin,
  syncGarminHealthData,
  unlinkGarminHealthData,
} from '@/api/Integrations/garminHealthDataApi';
import { ghdKeys } from '@/api/keys/integrations';
import { externalProviderKeys } from '@/api/keys/settings';
import { useDiaryInvalidation } from '@/hooks/useInvalidateKeys';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export { resolveGhdMfaId, isGhdLoginSuccess, isGhdMfaRequired };

interface SyncVariables {
  startDate?: string;
  endDate?: string;
}

export const useGarminHealthDataStatus = (enabled = true) => {
  return useQuery<GhdStatusResponse>({
    queryKey: ghdKeys.status,
    queryFn: fetchGarminHealthDataStatus,
    enabled,
  });
};

export const useLoginGarminHealthDataMutation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: GhdLoginPayload) => loginGarminHealthData(payload),
    onSuccess: (result) => {
      if (!isGhdLoginSuccess(result)) {
        return;
      }
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: externalProviderKeys.lists(),
        }),
        queryClient.invalidateQueries({ queryKey: ghdKeys.all }),
      ]);
    },
    meta: {
      errorMessage: t(
        'integrations.ghdLoginError',
        'Failed to connect to Garmin Health Data.'
      ),
      successMessage: (data: unknown) => {
        const ok =
          data &&
          typeof data === 'object' &&
          isGhdLoginSuccess(data as { status?: string; ok?: boolean });
        return ok
          ? t(
              'integrations.ghdLoginSuccess',
              'Garmin Health Data connected successfully.'
            )
          : '';
      },
    },
  });
};

export const useResumeGarminHealthDataLoginMutation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: GhdMfaPayload) =>
      resumeGarminHealthDataLogin(payload),
    onSuccess: () => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: externalProviderKeys.lists(),
        }),
        queryClient.invalidateQueries({ queryKey: ghdKeys.all }),
      ]);
    },
    meta: {
      successMessage: t(
        'integrations.ghdMfaSuccess',
        'Garmin Health Data linked successfully!'
      ),
      errorMessage: t(
        'integrations.ghdMfaError',
        'Failed to submit MFA code. Please try again.'
      ),
    },
  });
};

export const useDisconnectGarminHealthDataMutation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (
        !confirm(
          t(
            'integrations.ghdDisconnectConfirm',
            'Are you sure you want to disconnect Garmin Health Data? This will revoke access and delete associated tokens.'
          )
        )
      ) {
        return;
      }
      await unlinkGarminHealthData();
    },
    onSuccess: () => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: externalProviderKeys.lists(),
        }),
        queryClient.invalidateQueries({ queryKey: ghdKeys.all }),
      ]);
    },
    meta: {
      errorMessage: t(
        'integrations.ghdDisconnectError',
        'Failed to disconnect Garmin Health Data.'
      ),
    },
  });
};

export const useManualSyncGarminHealthDataMutation = () => {
  const { t } = useTranslation();
  const invalidateSyncData = useDiaryInvalidation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ startDate, endDate }: SyncVariables) =>
      syncGarminHealthData(startDate, endDate),
    onSuccess: () => {
      invalidateSyncData();
      queryClient.invalidateQueries({ queryKey: ghdKeys.all });
      queryClient.invalidateQueries({ queryKey: ghdKeys.coverage });
    },
    meta: {
      successMessage: t(
        'integrations.ghdSyncSuccess',
        'Garmin Health Data sync started.'
      ),
      errorMessage: t(
        'integrations.ghdSyncError',
        'Failed to start Garmin Health Data sync.'
      ),
    },
  });
};
