import {
  cancelGhdHistoryImport,
  fetchGhdHistoryImport,
  pauseGhdHistoryImport,
  resumeGhdHistoryImport,
  startGhdHistoryImport,
} from '@/api/Integrations/garminHealthDataApi';
import { ghdKeys } from '@/api/keys/integrations';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  GhdHistoryImportJobStatus,
  GhdHistoryImportJobStatusResponse,
  GhdHistoryImportStartRequest,
} from '@workspace/shared';
import { useTranslation } from 'react-i18next';

const ACTIVE_STATUSES: ReadonlySet<GhdHistoryImportJobStatus> = new Set([
  'pending',
  'running',
]);

const isActivelyImporting = (
  data: GhdHistoryImportJobStatusResponse | undefined
): boolean => {
  if (!data?.status) return false;
  return ACTIVE_STATUSES.has(data.status);
};

export const useGhdHistoryImport = (enabled = true) => {
  return useQuery<GhdHistoryImportJobStatusResponse>({
    queryKey: ghdKeys.historyImport,
    queryFn: fetchGhdHistoryImport,
    enabled,
    refetchInterval: (query) =>
      isActivelyImporting(query.state.data) ? 5000 : false,
  });
};

export const useStartGhdHistoryImportMutation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: GhdHistoryImportStartRequest) =>
      startGhdHistoryImport(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(ghdKeys.historyImport, data);
    },
    meta: {
      successMessage: t(
        'integrations.ghdHistoryImportStartSuccess',
        'History gap fill started. This can take a while for multi-year ranges.'
      ),
      errorMessage: t(
        'integrations.ghdHistoryImportStartError',
        'Failed to start history gap fill.'
      ),
    },
  });
};

export const useCancelGhdHistoryImportMutation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelGhdHistoryImport,
    onSuccess: (data) => {
      queryClient.setQueryData(ghdKeys.historyImport, data);
    },
    meta: {
      successMessage: t(
        'integrations.ghdHistoryImportCancelSuccess',
        'History import cancelled.'
      ),
      errorMessage: t(
        'integrations.ghdHistoryImportCancelError',
        'Failed to cancel history import.'
      ),
    },
  });
};

export const usePauseGhdHistoryImportMutation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: pauseGhdHistoryImport,
    onSuccess: (data) => {
      queryClient.setQueryData(ghdKeys.historyImport, data);
    },
    meta: {
      successMessage: t(
        'integrations.ghdHistoryImportPauseSuccess',
        'History import paused.'
      ),
      errorMessage: t(
        'integrations.ghdHistoryImportPauseError',
        'Failed to pause history import.'
      ),
    },
  });
};

export const useResumeGhdHistoryImportMutation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resumeGhdHistoryImport,
    onSuccess: (data) => {
      queryClient.setQueryData(ghdKeys.historyImport, data);
    },
    meta: {
      successMessage: t(
        'integrations.ghdHistoryImportResumeSuccess',
        'History import resumed.'
      ),
      errorMessage: t(
        'integrations.ghdHistoryImportResumeError',
        'Failed to resume history import.'
      ),
    },
  });
};
