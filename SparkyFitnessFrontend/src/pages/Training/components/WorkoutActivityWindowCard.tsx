import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatMinutesToHHMM } from '@/utils/timeFormatters';
import type { WorkoutWindowActivityItem } from '@/utils/workoutWindowDisplay';
import { useWorkoutActivityWindow } from '@/hooks/Training/useWorkoutActivityWindow';
import {
  SESSION_STATUS_LABELS,
} from '../trainingConstants';

const MISSING = '—';

interface WorkoutActivityWindowCardProps {
  /** Override active plan (Training overview passes the selected plan). */
  planId?: string;
  onOpenPlanTab?: (date?: string) => void;
  /** When false, skip data fetching (e.g. hidden widget). */
  enabled?: boolean;
}

function formatColumnDate(date: string, locale: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

interface MetricProps {
  label: string;
  value: string;
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

interface ActivityMiniCardProps {
  item: WorkoutWindowActivityItem;
  formatDistance: (km: number) => string;
  formatCalories: (kcal: number) => string;
  onClick?: () => void;
}

function ActivityMiniCard({
  item,
  formatDistance,
  formatCalories,
  onClick,
}: ActivityMiniCardProps) {
  const { t } = useTranslation();

  const distanceValue =
    item.distanceKm != null && item.distanceKm > 0
      ? formatDistance(item.distanceKm)
      : MISSING;
  const timeValue =
    item.durationMinutes != null && item.durationMinutes > 0
      ? formatMinutesToHHMM(item.durationMinutes)
      : MISSING;
  const caloriesValue =
    item.caloriesKcal != null && item.caloriesKcal > 0
      ? formatCalories(item.caloriesKcal)
      : MISSING;
  const avgHrValue =
    item.avgHeartRate != null && item.avgHeartRate > 0
      ? `${Math.round(item.avgHeartRate)} bpm`
      : MISSING;
  const maxHrValue =
    item.maxHeartRate != null && item.maxHeartRate > 0
      ? `${Math.round(item.maxHeartRate)} bpm`
      : MISSING;

  const Wrapper = onClick ? 'button' : 'div';
  const isPlanned = item.kind === 'planned';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={
        onClick
          ? 'w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          : `w-full rounded-md border p-3 ${isPlanned ? 'border-dashed' : ''}`
      }
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.name}</p>
          {item.paceSubtitle ? (
            <p className="truncate text-xs text-muted-foreground">
              {item.paceSubtitle}
            </p>
          ) : null}
          {item.heartRateZone ? (
            <p className="text-xs text-muted-foreground">
              {t('diary.widgets.workoutWindow.targetZone', 'Target')}:{' '}
              {item.heartRateZone}
            </p>
          ) : null}
        </div>
        {isPlanned && item.plannedStatus ? (
          <Badge variant="outline" className="shrink-0">
            {t(
              `training.sessionStatus.${item.plannedStatus}`,
              SESSION_STATUS_LABELS[item.plannedStatus] ?? item.plannedStatus
            )}
          </Badge>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Metric
          label={t('diary.widgets.workoutWindow.distance', 'Distance')}
          value={distanceValue}
        />
        <Metric
          label={t('diary.widgets.workoutWindow.time', 'Time')}
          value={timeValue}
        />
        <Metric
          label={t('diary.widgets.workoutWindow.calories', 'Calories')}
          value={caloriesValue}
        />
        <Metric
          label={t('diary.widgets.workoutWindow.hrAvg', 'HR avg')}
          value={avgHrValue}
        />
        <Metric
          label={t('diary.widgets.workoutWindow.hrMax', 'HR max')}
          value={maxHrValue}
        />
      </div>
    </Wrapper>
  );
}

interface WorkoutWindowColumnProps {
  label: string;
  date: string;
  locale: string;
  items: WorkoutWindowActivityItem[];
  emptyMessage: string;
  formatDistance: (km: number) => string;
  formatCalories: (kcal: number) => string;
  onItemClick?: (item: WorkoutWindowActivityItem) => void;
  footer?: ReactNode;
}

function WorkoutWindowColumn({
  label,
  date,
  locale,
  items,
  emptyMessage,
  formatDistance,
  formatCalories,
  onItemClick,
  footer,
}: WorkoutWindowColumnProps) {
  return (
    <div className="flex min-w-0 flex-col p-4 md:p-5">
      <div className="mb-3 border-b border-border pb-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-sm font-medium">{formatColumnDate(date, locale)}</p>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm italic text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <ActivityMiniCard
              key={item.id}
              item={item}
              formatDistance={formatDistance}
              formatCalories={formatCalories}
              onClick={
                onItemClick ? () => onItemClick(item) : undefined
              }
            />
          ))}
        </div>
      )}
      {footer}
    </div>
  );
}

export default function WorkoutActivityWindowCard({
  planId,
  onOpenPlanTab,
  enabled = true,
}: WorkoutActivityWindowCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    energyUnit,
    convertEnergy,
    getEnergyUnitString,
    distanceUnit,
    convertDistance,
  } = usePreferences();

  const {
    yesterday,
    today,
    tomorrow,
    yesterdayItems,
    todayItems,
    tomorrowItems,
    isLoading,
    hasTrainingModule,
    activePlanId,
  } = useWorkoutActivityWindow({ planId, enabled });

  const formatDistance = (km: number) =>
    `${convertDistance(km, 'km', distanceUnit).toFixed(2)} ${distanceUnit}`;

  const formatCalories = (kcal: number) =>
    `${Math.round(convertEnergy(kcal, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)}`;

  const handleTomorrowClick = () => {
    if (onOpenPlanTab) {
      onOpenPlanTab(tomorrow);
      return;
    }
    navigate('/training');
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">
          {t('diary.widgets.workoutWindow.title', 'Workout window')}
        </CardTitle>
        <CardDescription>
          {t(
            'diary.widgets.workoutWindow.description',
            'Logged activity and tomorrow’s plan.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            {t('diary.widgets.workoutWindow.loading', 'Loading workouts…')}
          </p>
        ) : (
          <div className="grid grid-cols-1 divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
            <WorkoutWindowColumn
              label={t('diary.widgets.workoutWindow.yesterday', 'Yesterday')}
              date={yesterday}
              locale={i18n.language}
              items={yesterdayItems}
              emptyMessage={t(
                'diary.widgets.workoutWindow.noActivity',
                'No activity logged'
              )}
              formatDistance={formatDistance}
              formatCalories={formatCalories}
            />
            <WorkoutWindowColumn
              label={t('diary.widgets.workoutWindow.today', 'Today')}
              date={today}
              locale={i18n.language}
              items={todayItems}
              emptyMessage={t(
                'diary.widgets.workoutWindow.noActivity',
                'No activity logged'
              )}
              formatDistance={formatDistance}
              formatCalories={formatCalories}
            />
            <WorkoutWindowColumn
              label={t(
                'diary.widgets.workoutWindow.tomorrowPlanned',
                'Tomorrow (planned)'
              )}
              date={tomorrow}
              locale={i18n.language}
              items={tomorrowItems}
              emptyMessage={
                !hasTrainingModule
                  ? t(
                      'diary.widgets.workoutWindow.trainingModuleOff',
                      'Enable Training plan in Settings to see planned workouts.'
                    )
                  : !activePlanId
                    ? t(
                        'diary.widgets.workoutWindow.noActivePlan',
                        'No active training plan.'
                      )
                    : t(
                        'diary.widgets.workoutWindow.noSessionPlanned',
                        'No session planned'
                      )
              }
              formatDistance={formatDistance}
              formatCalories={formatCalories}
              onItemClick={
                hasTrainingModule && activePlanId
                  ? () => handleTomorrowClick()
                  : undefined
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
