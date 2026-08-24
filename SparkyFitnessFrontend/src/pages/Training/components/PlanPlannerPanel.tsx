import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus } from 'lucide-react';
import type {
  TrainingPlanPlannerMode,
  TrainingPlanPlannerSessionDetail,
  TrainingPlanProposeResponse,
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
  useCreatePlannerSessionMutation,
  usePlannerChangeHistory,
} from '@/hooks/Training/useTrainingPlanPlanner';
import PlanPlannerDialog from './PlanPlannerDialog';

interface PlanPlannerPanelProps {
  planId: string;
  onProposal: (
    proposal: TrainingPlanProposeResponse,
    plannerSessionId: string
  ) => void;
}

export default function PlanPlannerPanel({
  planId,
  onProposal,
}: PlanPlannerPanelProps) {
  const { t } = useTranslation();
  const { data: history = [], isLoading: historyLoading } =
    usePlannerChangeHistory(planId);
  const createSessionMutation = useCreatePlannerSessionMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [sessionDetail, setSessionDetail] =
    useState<TrainingPlanPlannerSessionDetail | null>(null);

  const startConversation = async (mode: TrainingPlanPlannerMode) => {
    const detail = await createSessionMutation.mutateAsync({
      planId,
      payload: { mode },
    });
    setSessionDetail(detail);
    setDialogOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('training.planner.title', 'Plan with AI')}
          </CardTitle>
          <CardDescription>
            {t(
              'training.planner.descriptionHistory',
              'Past calendar changes are summarized below. Start a new conversation to generate or adjust the plan; confirmed changes are remembered for future planning.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={createSessionMutation.isPending}
              onClick={() => void startConversation('generate')}
            >
              <MessageSquarePlus className="mr-2 h-4 w-4" />
              {t(
                'training.planner.startGenerate',
                'New conversation — generate plan'
              )}
            </Button>
            <Button
              variant="outline"
              disabled={createSessionMutation.isPending}
              onClick={() => void startConversation('adjust')}
            >
              <MessageSquarePlus className="mr-2 h-4 w-4" />
              {t(
                'training.planner.startAdjust',
                'New conversation — change plan'
              )}
            </Button>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              {t('training.planner.historyTitle', 'Plan change history')}
            </h3>
            {historyLoading && (
              <p className="text-sm text-muted-foreground">
                {t('training.planner.historyLoading', 'Loading history…')}
              </p>
            )}
            {!historyLoading && history.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t(
                  'training.planner.historyEmpty',
                  'No confirmed plan changes yet. After you accept a drafted proposal, a summary appears here.'
                )}
              </p>
            )}
            {history.map((entry) => (
              <div
                key={entry.id}
                className="rounded-md border p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {entry.mode === 'generate'
                      ? t('training.planner.modeGenerate', 'Generate plan')
                      : t('training.planner.modeAdjust', 'Change plan')}
                  </Badge>
                  {entry.confirmed_at && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.confirmed_at).toLocaleString()}
                    </span>
                  )}
                  {entry.adjust_from && entry.adjust_to && (
                    <Badge variant="secondary">
                      {entry.adjust_from} → {entry.adjust_to}
                    </Badge>
                  )}
                </div>
                {entry.summary && (
                  <p className="text-sm whitespace-pre-wrap">{entry.summary}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <PlanPlannerDialog
        planId={planId}
        open={dialogOpen}
        detail={sessionDetail}
        onOpenChange={setDialogOpen}
        onProposal={onProposal}
      />
    </>
  );
}
