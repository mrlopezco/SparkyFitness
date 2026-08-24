import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { todayInZone, type TrainingPlanProposeResponse } from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Card, CardContent } from '@/components/ui/card';
import {
  useTrainingCalendar,
  useTrainingPlanDetail,
} from '@/hooks/Training/useTrainingPlans';
import PlanPlannerPanel from './PlanPlannerPanel';
import PlanProposalPanel from './PlanProposalPanel';
import TrainingCalendarView from './TrainingCalendarView';
import TrainingWorkoutList from './TrainingWorkoutList';

interface TrainingPlanWorkspaceProps {
  planId: string | undefined;
  proposal: TrainingPlanProposeResponse | null;
  plannerSessionId: string | null;
  onOpenAiChats: () => void;
  onProposal: (
    proposal: TrainingPlanProposeResponse | null,
    plannerSessionId?: string | null
  ) => void;
}

export default function TrainingPlanWorkspace({
  planId,
  proposal,
  plannerSessionId,
  onOpenAiChats,
  onProposal,
}: TrainingPlanWorkspaceProps) {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const today = todayInZone(timezone);

  const [highlightedDate, setHighlightedDate] = useState(today);
  const [scrollToDate, setScrollToDate] = useState<string | null>(null);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const { data: planDetail } = useTrainingPlanDetail(planId);
  const startDate = planDetail?.start_date ?? today;
  const endDate = planDetail?.target_date ?? today;

  const { data: calendar, isLoading: calendarLoading } = useTrainingCalendar({
    startDate,
    endDate,
    planId,
    enabled: !!planId,
  });

  const sessions = useMemo(
    () => (calendar?.days ?? []).flatMap((day) => day.sessions),
    [calendar]
  );

  const handleCalendarDateChange = (date: string) => {
    setHighlightedDate(date);
    setScrollToDate(date);
    const first = sessions.find((session) => session.scheduled_date === date);
    if (first) setOpenSessionId(first.id);
  };

  if (!planId) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-center text-sm italic text-muted-foreground">
            {t(
              'training.workspace.selectPlan',
              'Select or create a plan first.'
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PlanPlannerPanel planId={planId} onOpenAiChats={onOpenAiChats} />

      {proposal && (
        <PlanProposalPanel
          key={`${proposal.plan_id}-${proposal.summary.slice(0, 40)}`}
          proposal={proposal}
          replaceExisting
          plannerSessionId={plannerSessionId ?? undefined}
          onReject={() => onProposal(null, null)}
          onConfirmed={() => onProposal(null, null)}
        />
      )}

      <div className="space-y-6">
        <TrainingCalendarView
          planId={planId}
          selectedDate={highlightedDate}
          onSelectedDateChange={handleCalendarDateChange}
          showDayDetail={false}
        />
        <TrainingWorkoutList
          planId={planId}
          sessions={sessions}
          isLoading={calendarLoading}
          highlightedDate={highlightedDate}
          onHighlightedDateChange={setHighlightedDate}
          scrollToDate={scrollToDate}
          openSessionId={openSessionId}
          onOpenSessionIdChange={setOpenSessionId}
        />
      </div>
    </div>
  );
}
