import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { addDays } from '@workspace/shared';
import {
  fetchRecentStandardMeasurements,
  getMostRecentMeasurement,
} from '@/api/CheckIn/checkInService';
import type { WeightPoint } from '@/utils/weightTrend';

const LOOKBACK_DAYS = 180;
const RECENT_LIMIT = 5;

/** Query keys local to this fork feature (avoid editing upstream diary keys). */
export const recentWeightKeys = {
  all: ['diary', 'recentWeights'] as const,
  byDate: (endDate: string, userId: string | undefined) =>
    [...recentWeightKeys.all, endDate, userId ?? 'self'] as const,
};

export interface RecentWeightsResult {
  /** Newest first (for display). */
  recentDesc: WeightPoint[];
  /** Oldest → newest among the same points (for trend eval). */
  recentAsc: WeightPoint[];
  current: WeightPoint | null;
}

async function loadRecentWeights(
  endDate: string
): Promise<RecentWeightsResult> {
  const startDate = addDays(endDate, -LOOKBACK_DAYS);
  const rows = await fetchRecentStandardMeasurements(startDate, endDate);

  const withWeight = rows
    .filter(
      (row): row is typeof row & { weight: number; entry_date: string } =>
        row.weight != null &&
        Number.isFinite(Number(row.weight)) &&
        typeof row.entry_date === 'string'
    )
    .map((row) => ({
      entry_date: row.entry_date.substring(0, 10),
      weightKg: Number(row.weight),
    }))
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date));

  let recentDesc = withWeight.slice(0, RECENT_LIMIT);

  if (recentDesc.length === 0) {
    const fallback = await getMostRecentMeasurement('weight');
    if (fallback?.weight != null && Number.isFinite(Number(fallback.weight))) {
      recentDesc = [
        {
          entry_date: endDate,
          weightKg: Number(fallback.weight),
        },
      ];
    }
  }

  const recentAsc = [...recentDesc].reverse();
  return {
    recentDesc,
    recentAsc,
    current: recentDesc[0] ?? null,
  };
}

export function useRecentWeights(
  selectedDate: string,
  userId: string | undefined
) {
  const { t } = useTranslation();

  return useQuery({
    queryKey: recentWeightKeys.byDate(selectedDate, userId),
    queryFn: () => loadRecentWeights(selectedDate),
    enabled: !!selectedDate && !!userId,
    meta: {
      errorMessage: t(
        'diary.weightTrendLoadError',
        'Failed to load recent weight measurements.'
      ),
    },
  });
}
