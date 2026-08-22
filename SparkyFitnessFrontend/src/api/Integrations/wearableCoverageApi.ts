import type {
  WearableCoverageResponse,
  WearableCoverageSource,
} from '@workspace/shared';
import { apiCall } from '@/api/api';

const COVERAGE_PATH: Record<WearableCoverageSource, string> = {
  garmin_health_data: '/integrations/garmin-health-data/coverage',
  garmin: '/integrations/garmin/coverage',
};

export const fetchWearableCoverage = async (
  source: WearableCoverageSource
): Promise<WearableCoverageResponse> => {
  return apiCall(COVERAGE_PATH[source], {
    method: 'GET',
  });
};
