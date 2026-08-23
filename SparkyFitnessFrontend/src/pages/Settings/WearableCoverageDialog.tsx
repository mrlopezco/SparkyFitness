import { useTranslation } from 'react-i18next';
import type {
  WearableCoverageCategory,
  WearableCoverageCategoryKey,
  WearableCoverageResponse,
  WearableCoverageSource,
} from '@workspace/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useWearableCoverage } from '@/hooks/Integrations/useWearableCoverage';

interface WearableCoverageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  source: WearableCoverageSource;
}

const CATEGORY_LABELS: Record<
  WearableCoverageCategoryKey,
  { key: string; fallback: string }
> = {
  daily_health: {
    key: 'integrations.ghdCoverage.dailyHealth',
    fallback: 'Daily health metrics',
  },
  sleep: {
    key: 'integrations.ghdCoverage.sleep',
    fallback: 'Sleep sessions',
  },
  activities: {
    key: 'integrations.ghdCoverage.activities',
    fallback: 'Activities',
  },
  intraday_samples: {
    key: 'integrations.ghdCoverage.intradaySamples',
    fallback: 'Intraday samples',
  },
  body_composition: {
    key: 'integrations.ghdCoverage.bodyComposition',
    fallback: 'Body composition',
  },
  nutrition: {
    key: 'integrations.ghdCoverage.nutrition',
    fallback: 'Nutrition (food entries)',
  },
};

function formatDateSpan(
  category: Pick<
    WearableCoverageCategory,
    'row_count' | 'earliest_date' | 'latest_date'
  >,
  emptyLabel: string
): string {
  if (category.row_count === 0 || !category.earliest_date) {
    return emptyLabel;
  }
  if (
    !category.latest_date ||
    category.earliest_date === category.latest_date
  ) {
    return category.earliest_date;
  }
  return `${category.earliest_date} → ${category.latest_date}`;
}

function CoverageBody({ data }: { data: WearableCoverageResponse }) {
  const { t } = useTranslation();
  const emptyLabel = t('integrations.ghdCoverage.noneYet', 'None yet');

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {data.categories.map((category) => {
          const label = CATEGORY_LABELS[category.key];
          return (
            <li
              key={category.key}
              className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{t(label.key, label.fallback)}</p>
                <p className="text-muted-foreground">
                  {formatDateSpan(category, emptyLabel)}
                </p>
              </div>
              <p className="shrink-0 tabular-nums text-muted-foreground">
                {t('integrations.ghdCoverage.rowCount', '{{count}} rows', {
                  count: category.row_count,
                })}
              </p>
            </li>
          );
        })}
      </ul>

      {data.sample_metrics.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">
            {t(
              'integrations.ghdCoverage.sampleBreakdown',
              'Intraday sample types'
            )}
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {data.sample_metrics.map((metric) => (
              <li
                key={metric.metric}
                className="flex justify-between gap-2"
              >
                <span className="capitalize">
                  {metric.metric.replaceAll('_', ' ')}
                </span>
                <span className="tabular-nums">
                  {metric.row_count}
                  {metric.earliest_date
                    ? ` · ${formatDateSpan(
                        {
                          row_count: metric.row_count,
                          earliest_date: metric.earliest_date,
                          latest_date: metric.latest_date,
                        },
                        emptyLabel
                      )}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.last_sync && (
        <p className="text-xs text-muted-foreground">
          {t(
            'integrations.ghdCoverage.lastSync',
            'Last sync run: {{status}}{{range}}',
            {
              status: data.last_sync.status,
              range:
                data.last_sync.start_date && data.last_sync.end_date
                  ? ` (${data.last_sync.start_date} → ${data.last_sync.end_date})`
                  : data.last_sync.finished_at
                    ? ` (${data.last_sync.finished_at})`
                    : '',
            }
          )}
        </p>
      )}

      {data.history_import && (
        <p className="text-xs text-muted-foreground">
          {t(
            'integrations.ghdCoverage.historyImport',
            'History gap fill: {{status}} — {{completed}}/{{total}} weeks{{range}}',
            {
              status: data.history_import.status,
              completed: data.history_import.weeks_completed,
              total: data.history_import.weeks_total,
              range:
                data.history_import.range_start &&
                data.history_import.range_end
                  ? ` (${data.history_import.range_start} → ${data.history_import.range_end})`
                  : '',
            }
          )}
        </p>
      )}
    </div>
  );
}

const WearableCoverageDialog = ({
  isOpen,
  onClose,
  source,
}: WearableCoverageDialogProps) => {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch, isFetching } =
    useWearableCoverage(source, isOpen);

  const isGhd = source === 'garmin_health_data';

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isGhd
              ? t(
                  'integrations.ghdCoverage.title',
                  'Garmin Health Data coverage'
                )
              : t(
                  'integrations.garminCoverage.title',
                  'Garmin Connect coverage'
                )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'integrations.ghdCoverage.description',
              'High-level view of what this provider has imported into Sparky, with date ranges. Not every individual reading.'
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading || (isFetching && !data) ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : t(
                  'integrations.ghdCoverage.loadError',
                  'Could not load coverage.'
                )}
          </p>
        ) : data ? (
          <CoverageBody data={data} />
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            className="text-sm text-primary hover:underline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {t('integrations.ghdCoverage.refresh', 'Refresh')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WearableCoverageDialog;
