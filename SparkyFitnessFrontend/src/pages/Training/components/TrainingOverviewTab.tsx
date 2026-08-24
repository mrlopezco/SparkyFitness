import type {
  TrainingAthleteSnapshot,
  TrainingPlanDetail,
} from '@workspace/shared';
import ActivePlanDetailsCard from './ActivePlanDetailsCard';
import UpcomingWeekPanel from './UpcomingWeekPanel';
import {
  useCreateAthleteSnapshotMutation,
  useTrainingPlanFeasibility,
  useTrainingPlanHealth,
} from '@/hooks/Training/useTrainingPlans';

interface TrainingOverviewTabProps {
  activePlanId: string | undefined;
  plan: TrainingPlanDetail | null | undefined;
  snapshot: TrainingAthleteSnapshot | null | undefined;
  today: string;
  onOpenPlanTab: (date?: string) => void;
}

const SNAPSHOT_WINDOW_DAYS = 28;

export default function TrainingOverviewTab({
  activePlanId,
  plan,
  snapshot,
  today,
  onOpenPlanTab,
}: TrainingOverviewTabProps) {
  const snapshotMutation = useCreateAthleteSnapshotMutation();
  const { data: feasibility } = useTrainingPlanFeasibility(activePlanId);
  const { data: planHealth } = useTrainingPlanHealth(activePlanId);

  return (
    <div className="space-y-6">
      {feasibility?.flags.length ? (
        <ul className="list-disc space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 pl-8 text-sm text-amber-800 dark:text-amber-200">
          {feasibility.flags.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      ) : null}

      <ActivePlanDetailsCard
        plan={plan}
        snapshot={snapshot}
        today={today}
        snapshotRefreshing={snapshotMutation.isPending}
        onRefreshSnapshot={() => {
          if (!activePlanId) return;
          snapshotMutation.mutate({
            planId: activePlanId,
            payload: {
              as_of_date: today,
              window_days: SNAPSHOT_WINDOW_DAYS,
            },
          });
        }}
        onOpenPlanTab={() => onOpenPlanTab()}
      />

      <UpcomingWeekPanel
        planId={activePlanId}
        today={today}
        onOpenPlanTab={onOpenPlanTab}
        planHealthSummary={planHealth?.summary_lines}
      />
    </div>
  );
}
