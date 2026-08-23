import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Eye, RefreshCw } from 'lucide-react';
import type {
  TrainingAthleteSnapshot,
  TrainingPlanDetail,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  GOAL_TYPE_LABELS,
  SESSION_STATUS_LABELS,
  SPORT_FOCUS_LABELS,
  formatPaceMinPerKm,
} from '../trainingConstants';
import AthleteSnapshotDialog from './AthleteSnapshotDialog';

interface ActivePlanDetailsCardProps {
  plan: TrainingPlanDetail | null | undefined;
  snapshot: TrainingAthleteSnapshot | null | undefined;
  today: string;
  snapshotRefreshing: boolean;
  onRefreshSnapshot: () => void;
  onOpenPlanTab: () => void;
}

export default function ActivePlanDetailsCard({
  plan,
  snapshot,
  today,
  snapshotRefreshing,
  onRefreshSnapshot,
  onOpenPlanTab,
}: ActivePlanDetailsCardProps) {
  const { t } = useTranslation();
  const [snapshotOpen, setSnapshotOpen] = useState(false);

  if (!plan) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('training.activePlan.title', 'Active plan details')}
          </CardTitle>
          <CardDescription>
            {t(
              'training.activePlan.noneDescription',
              'Activate one plan to see its window, snapshot, and high-level KPIs here.'
            )}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const sessions = plan.sessions;
  const planned = sessions.filter((s) => s.status === 'planned').length;
  const completed = sessions.filter((s) => s.status === 'completed').length;
  const partial = sessions.filter((s) => s.status === 'partial').length;
  const skipped = sessions.filter((s) => s.status === 'skipped').length;
  const remaining = sessions.filter(
    (s) =>
      (s.status === 'planned' || s.status === 'partial') &&
      s.scheduled_date >= today
  ).length;

  const running = snapshot?.payload.running;
  const science = snapshot?.payload.running_science;
  const perKm = t('training.science.perKm', ' /km');

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('training.activePlan.title', 'Active plan details')}
          </CardTitle>
          <CardDescription className="mt-1.5">
            {plan.name} · {plan.start_date} → {plan.target_date}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {t(`training.planStatus.${plan.status}`, plan.status)}
          </Badge>
          <Badge variant="secondary">
            {t(
              `training.sportFocus.${plan.sport_focus}`,
              SPORT_FOCUS_LABELS[plan.sport_focus]
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label={t('training.activePlan.kpi.sessions', 'Sessions')}
            value={String(sessions.length)}
          />
          <Kpi
            label={t(
              'training.activePlan.kpi.completed',
              SESSION_STATUS_LABELS.completed
            )}
            value={String(completed)}
          />
          <Kpi
            label={t('training.activePlan.kpi.remaining', 'Upcoming')}
            value={String(remaining)}
          />
          <Kpi
            label={t('training.activePlan.kpi.missed', 'Partial / skipped')}
            value={`${partial} / ${skipped}`}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <div>
            <p className="text-sm font-semibold">
              {t('training.snapshot.title', 'Athlete snapshot')}
            </p>
            <p className="text-sm text-muted-foreground">
              {snapshot
                ? t(
                    'training.snapshot.summary',
                    'As of {{date}} · {{sessions}} sessions · {{distance}} km',
                    {
                      date: snapshot.as_of_date,
                      sessions: running?.session_count ?? 0,
                      distance: running?.total_distance_km ?? 0,
                    }
                  )
                : t(
                    'training.snapshot.none',
                    'No snapshot yet. Build one so the coach can see your recent load.'
                  )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!snapshot}
              onClick={() => setSnapshotOpen(true)}
            >
              <Eye className="mr-2 h-4 w-4" />
              {t('training.snapshot.view', 'View snapshot')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={snapshotRefreshing}
              onClick={onRefreshSnapshot}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('training.snapshot.refresh', 'Refresh snapshot')}
            </Button>
          </div>
        </div>

        <AthleteSnapshotDialog
          snapshot={snapshot}
          open={snapshotOpen}
          onOpenChange={setSnapshotOpen}
        />

        {science && (
          <div className="grid gap-2 sm:grid-cols-3">
            <Kpi
              label={t('training.science.easyPace', 'Easy pace')}
              value={`${formatPaceMinPerKm(science.estimated_easy_pace_min_per_km)}${perKm}`}
            />
            <Kpi
              label={t('training.science.tempoPace', 'Tempo pace')}
              value={`${formatPaceMinPerKm(science.estimated_tempo_pace_min_per_km)}${perKm}`}
            />
            <Kpi
              label={t('training.science.thresholdPace', 'Threshold pace')}
              value={`${formatPaceMinPerKm(science.estimated_threshold_pace_min_per_km)}${perKm}`}
            />
          </div>
        )}

        {(plan.goals.length > 0 || planned > 0) && (
          <div className="space-y-2">
            {plan.goals.slice(0, 3).map((goal) => (
              <div
                key={goal.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="font-medium">{goal.title}</span>
                <span className="text-muted-foreground">
                  {t(
                    `training.goalType.${goal.type}`,
                    GOAL_TYPE_LABELS[goal.type]
                  )}
                  {goal.target_date ? ` · ${goal.target_date}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" onClick={onOpenPlanTab}>
          <CalendarDays className="mr-2 h-4 w-4" />
          {t('training.activePlan.openPlan', 'Open training plan')}
        </Button>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold leading-none">{value}</p>
    </div>
  );
}
