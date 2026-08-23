import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { todayInZone, type TrainingPlanProposeResponse } from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useAdjustTrainingPlanMutation,
  useProposeTrainingPlanMutation,
  useTrainingCalendar,
  useTrainingPlanDetail,
} from '@/hooks/Training/useTrainingPlans';
import AdjustPlanButton from './AdjustPlanButton';
import PlanProposalPanel from './PlanProposalPanel';
import TrainingCalendarView from './TrainingCalendarView';
import TrainingWorkoutList from './TrainingWorkoutList';

interface TrainingPlanWorkspaceProps {
  planId: string | undefined;
  coachNotes: string;
  onCoachNotesChange: (value: string) => void;
  proposal: TrainingPlanProposeResponse | null;
  onProposal: (proposal: TrainingPlanProposeResponse | null) => void;
}

export default function TrainingPlanWorkspace({
  planId,
  coachNotes,
  onCoachNotesChange,
  proposal,
  onProposal,
}: TrainingPlanWorkspaceProps) {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const today = todayInZone(timezone);
  const proposeMutation = useProposeTrainingPlanMutation();
  const adjustMutation = useAdjustTrainingPlanMutation();

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

  const handleGenerate = async () => {
    if (!planId) return;
    const response = await proposeMutation.mutateAsync({
      plan_id: planId,
      user_notes: coachNotes.trim() || undefined,
      replace_existing: true,
    });
    onProposal(response);
  };

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
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('training.workspace.actionsTitle', 'Plan with AI')}
          </CardTitle>
          <CardDescription>
            {t(
              'training.workspace.actionsDescription',
              'Generate fills every day from the plan start date through the target date. Confirm before anything is saved.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="training-workspace-notes">
              {t('training.coach.notes', 'Notes for the coach')}
            </Label>
            <Textarea
              id="training-workspace-notes"
              rows={2}
              value={coachNotes}
              placeholder={t(
                'training.coach.notesPlaceholder',
                'e.g. keep long runs on Sunday, no doubles, knee is sensitive to speed work'
              )}
              onChange={(event) => onCoachNotesChange(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={proposeMutation.isPending || adjustMutation.isPending}
              onClick={handleGenerate}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {proposeMutation.isPending
                ? t('training.coach.generating', 'Drafting plan…')
                : t('training.coach.generate', 'Generate plan')}
            </Button>
            <AdjustPlanButton
              planId={planId}
              userNotes={coachNotes}
              onProposal={onProposal}
            />
          </div>
        </CardContent>
      </Card>

      {proposal && (
        <PlanProposalPanel
          key={`${proposal.plan_id}-${proposal.summary.slice(0, 40)}`}
          proposal={proposal}
          replaceExisting
          onReject={() => onProposal(null)}
          onConfirmed={() => onProposal(null)}
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
