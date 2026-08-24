import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { usePlannerChangeHistory } from '@/hooks/Training/useTrainingPlanPlanner';

interface PlanPlannerPanelProps {
  planId: string;
  onOpenAiChats: () => void;
}

/** Confirmed plan changes only; live planning conversations live under AI Chats. */
export default function PlanPlannerPanel({
  planId,
  onOpenAiChats,
}: PlanPlannerPanelProps) {
  const { t } = useTranslation();
  const { data: history = [], isLoading: historyLoading } =
    usePlannerChangeHistory(planId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
          {t('training.planner.title', 'Plan with AI')}
        </CardTitle>
        <CardDescription>
          {t(
            'training.planner.descriptionAiChats',
            'Generate or change your calendar in the AI Chats tab. Confirmed updates are summarized below for future planning.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button type="button" onClick={onOpenAiChats}>
          {t('training.planner.openAiChats', 'Open AI Chats')}
        </Button>

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
            <div key={entry.id} className="space-y-2 rounded-md border p-3">
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
  );
}
