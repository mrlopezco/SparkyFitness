import { useQuery } from '@tanstack/react-query';
import type {
  WearableCoverageResponse,
  WearableCoverageSource,
} from '@workspace/shared';
import { fetchWearableCoverage } from '@/api/Integrations/wearableCoverageApi';
import { wearableCoverageKeys } from '@/api/keys/integrations';

export const useWearableCoverage = (
  source: WearableCoverageSource,
  enabled: boolean
) => {
  return useQuery<WearableCoverageResponse>({
    queryKey: wearableCoverageKeys.bySource(source),
    queryFn: () => fetchWearableCoverage(source),
    enabled,
    staleTime: 30_000,
  });
};
