import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Scale, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useProfileQuery } from '@/hooks/Settings/useProfile';
import { useRecentWeights } from '@/hooks/Diary/useRecentWeights';
import { evaluateWeightTrend, FLAT_DELTA_KG } from '@/utils/weightTrend';
import { formatWeight } from '@/utils/numberFormatting';
import { cn } from '@/lib/utils';

interface WeightTrendCardProps {
  selectedDate: string;
}

function parseTargetKg(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatSignedDelta(
  deltaKg: number,
  weightUnit: string
): string {
  const formatted = formatWeight(Math.abs(deltaKg), weightUnit);
  if (deltaKg > 0) return `+${formatted}`;
  if (deltaKg < 0) return `-${formatted}`;
  return formatted;
}

const WeightTrendCard = ({ selectedDate }: WeightTrendCardProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const userId = activeUserId || user?.id;
  const {
    weightUnit,
    goalMode,
    goalModeCustomPercentage,
    formatDateInUserTimezone,
  } = usePreferences();
  const { data: profile } = useProfileQuery(userId);
  const { data, isLoading, isError } = useRecentWeights(selectedDate, userId);

  const targetWeightKg = parseTargetKg(profile?.target_weight);
  const trend = evaluateWeightTrend(
    data?.recentAsc ?? [],
    goalMode,
    goalModeCustomPercentage,
    targetWeightKg
  );

  const statusStyles: Record<string, string> = {
    on_track: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    off_track: 'bg-red-500/15 text-red-700 dark:text-red-400',
    neutral: 'bg-muted text-muted-foreground',
    insufficient_data: 'bg-muted text-muted-foreground',
  };

  const statusLabel: Record<string, string> = {
    on_track: t('diary.weightTrendOnTrack', 'On track'),
    off_track: t('diary.weightTrendOffTrack', 'Off track'),
    neutral: t('diary.weightTrendNeutral', 'Stable'),
    insufficient_data: t('diary.weightTrendNeedMore', 'Need more data'),
  };

  const DeltaIcon =
    trend.deltaKg == null || Math.abs(trend.deltaKg) < FLAT_DELTA_KG
      ? Minus
      : trend.deltaKg < 0
        ? TrendingDown
        : TrendingUp;

  if (!user) {
    return null;
  }

  const currentDisplay =
    data?.current != null
      ? formatWeight(data.current.weightKg, weightUnit)
      : null;

  const gapDisplay =
    trend.gapToTargetKg != null
      ? formatWeight(Math.abs(trend.gapToTargetKg), weightUnit)
      : null;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center text-base dark:text-slate-300">
          <Scale className="mr-2 h-4 w-4" />
          {t('diary.weightTrend', 'Weight')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 p-3 dark:text-slate-300">
        {isLoading && (
          <p className="text-sm text-muted-foreground">
            {t('diary.weightTrendLoading', 'Loading weight…')}
          </p>
        )}

        {isError && (
          <p className="text-sm text-destructive">
            {t(
              'diary.weightTrendLoadError',
              'Failed to load recent weight measurements.'
            )}
          </p>
        )}

        {!isLoading && !isError && !data?.current && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <p>
              {t(
                'diary.weightTrendEmpty',
                'No weight logged yet. Add a check-in to start tracking.'
              )}
            </p>
            <Link
              to="/checkin"
              className="text-primary underline-offset-4 hover:underline"
            >
              {t('diary.weightTrendGoCheckIn', 'Go to Check-In')}
            </Link>
          </div>
        )}

        {!isLoading && !isError && data?.current && (
          <>
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums">
                {currentDisplay}
              </div>
            </div>

            <div
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium',
                statusStyles[trend.status]
              )}
            >
              <DeltaIcon className="h-4 w-4 shrink-0" />
              <span>{statusLabel[trend.status]}</span>
              {trend.deltaKg != null && (
                <span className="tabular-nums opacity-80">
                  ({formatSignedDelta(trend.deltaKg, weightUnit)})
                </span>
              )}
            </div>

            {gapDisplay != null && trend.gapToTargetKg != null && (
              <p className="text-center text-xs text-muted-foreground">
                {trend.gapToTargetKg === 0
                  ? t('diary.weightTrendAtTarget', 'At target weight')
                  : trend.gapToTargetKg > 0
                    ? t('diary.weightTrendAboveTarget', {
                        defaultValue: '{{amount}} above target',
                        amount: gapDisplay,
                      })
                    : t('diary.weightTrendBelowTarget', {
                        defaultValue: '{{amount}} below target',
                        amount: gapDisplay,
                      })}
              </p>
            )}

            <div className="mt-auto space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {t('diary.weightTrendRecent', 'Last measurements')}
              </p>
              <ul className="space-y-1">
                {data.recentDesc.map((point) => (
                  <li
                    key={`${point.entry_date}-${point.weightKg}`}
                    className="flex items-center justify-between text-sm tabular-nums"
                  >
                    <span className="text-muted-foreground">
                      {formatDateInUserTimezone(point.entry_date, 'MMM d')}
                    </span>
                    <span className="font-medium">
                      {formatWeight(point.weightKg, weightUnit)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WeightTrendCard;
