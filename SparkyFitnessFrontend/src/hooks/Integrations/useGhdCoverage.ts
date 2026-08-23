import { useWearableCoverage } from './useWearableCoverage';

/** @deprecated Prefer useWearableCoverage('garmin_health_data', enabled) */
export const useGhdCoverage = (enabled: boolean) =>
  useWearableCoverage('garmin_health_data', enabled);
