import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Pause, Play, X } from 'lucide-react';
import type { GhdHistoryImportJobStatusResponse } from '@workspace/shared';
import {
  useCancelGhdHistoryImportMutation,
  usePauseGhdHistoryImportMutation,
  useResumeGhdHistoryImportMutation,
} from '@/hooks/Integrations/useGhdHistoryImport';

interface GhdHistoryImportProgressProps {
  job: GhdHistoryImportJobStatusResponse;
}

const GhdHistoryImportProgress = ({ job }: GhdHistoryImportProgressProps) => {
  const { t } = useTranslation();
  const { mutate: cancelImport, isPending: cancelPending } =
    useCancelGhdHistoryImportMutation();
  const { mutate: pauseImport, isPending: pausePending } =
    usePauseGhdHistoryImportMutation();
  const { mutate: resumeImport, isPending: resumePending } =
    useResumeGhdHistoryImportMutation();

  const coverage = job.coverage;
  const weeksTotal = coverage?.weeks_total ?? 0;
  const weeksCompleted = coverage?.weeks_completed ?? 0;
  const weeksFailed = coverage?.weeks_failed ?? 0;
  const weeksEmpty = coverage?.weeks_empty ?? 0;
  const weeksPending = coverage?.weeks_pending ?? 0;
  const done = weeksCompleted + weeksFailed + weeksEmpty;
  const percent =
    weeksTotal > 0 ? Math.min(100, Math.round((done / weeksTotal) * 100)) : 0;

  const status = job.status;
  const isActive = status === 'pending' || status === 'running';
  const isPaused = status === 'paused';
  const isTerminal =
    status === 'completed' || status === 'failed' || status === 'cancelled';
  const actionPending = cancelPending || pausePending || resumePending;

  if (!status) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 mt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {t('integrations.ghdHistoryImport.progressTitle', 'History gap fill')}
          <span className="ml-2 text-xs font-normal text-muted-foreground capitalize">
            {status}
          </span>
        </p>
        <div className="flex items-center gap-1">
          {isActive && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => pauseImport()}
              disabled={actionPending}
              title={t('integrations.ghdHistoryImport.pause', 'Pause')}
            >
              <Pause className="h-3.5 w-3.5" />
            </Button>
          )}
          {isPaused && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => resumeImport()}
              disabled={actionPending}
              title={t('integrations.ghdHistoryImport.resume', 'Resume')}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
          {(isActive || isPaused) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => cancelImport()}
              disabled={actionPending}
              title={t('integrations.ghdHistoryImport.cancel', 'Cancel')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {(isActive || isPaused || isTerminal) && weeksTotal > 0 && (
        <>
          <Progress value={percent} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {t(
              'integrations.ghdHistoryImport.weeksSummary',
              '{{completed}} completed · {{failed}} failed · {{pending}} pending of {{total}} weeks',
              {
                completed: weeksCompleted,
                failed: weeksFailed,
                pending: weeksPending,
                total: weeksTotal,
              }
            )}
          </p>
        </>
      )}

      {job.range_start && job.range_end && (
        <p className="text-xs text-muted-foreground">
          {t(
            'integrations.ghdHistoryImport.range',
            'Range: {{start}} → {{end}}',
            { start: job.range_start, end: job.range_end }
          )}
        </p>
      )}

      {job.last_error && (
        <p className="text-xs text-destructive">{job.last_error}</p>
      )}

      {status === 'completed' && (
        <p className="text-xs text-muted-foreground">
          {t(
            'integrations.ghdHistoryImport.completedHint',
            'Gap fill finished. Set sync frequency to daily so Training stays up to date.'
          )}
        </p>
      )}
    </div>
  );
};

export default GhdHistoryImportProgress;
