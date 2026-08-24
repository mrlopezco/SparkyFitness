import { useTranslation } from 'react-i18next';
import { addDays } from '@workspace/shared';
import type { TrainingCalendarDay } from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTrainingCalendar } from '@/hooks/Training/useTrainingPlans';
import {
  SESSION_STATUS_LABELS,
} from '../trainingConstants';

interface UpcomingWeekPanelProps {
  planId: string | undefined;
  today: string;
  onOpenPlanTab?: (date: string) => void;
  planHealthSummary?: string[] | null;
}

export default function UpcomingWeekPanel({
  planId,
  today,
  onOpenPlanTab,
  planHealthSummary,
}: UpcomingWeekPanelProps) {
  const { t } = useTranslation();
  const endDate = addDays(today, 6);
  const { data: calendar, isLoading } = useTrainingCalendar({
    startDate: today,
    endDate,
    planId,
    enabled: !!planId,
  });

  const days = calendar?.days ?? [];

  const renderSession = (day: TrainingCalendarDay) => {
    const session = day.sessions[0];
    if (!session) return null;
    const title =
      session.prescription.title ??
      t(`training.sessionType.${session.session_type}`, session.session_type);
    return (
      <button
        key={day.date}
        type="button"
        className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-left hover:bg-muted/40"
        onClick={() => onOpenPlanTab?.(day.date)}
      >
        <div>
          <p className="font-medium">{day.date}</p>
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
        <Badge variant="outline">
          {t(
            `training.sessionStatus.${session.status}`,
            SESSION_STATUS_LABELS[session.status] ?? session.status
          )}
        </Badge>
      </button>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('training.upcomingWeek.title', 'Next 7 days')}
        </CardTitle>
        <CardDescription>
          {t(
            'training.upcomingWeek.description',
            'Upcoming sessions for your active plan.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {planHealthSummary && planHealthSummary.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-500">
            {planHealthSummary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {isLoading && (
          <p className="text-sm text-muted-foreground">
            {t('training.upcomingWeek.loading', 'Loading sessions…')}
          </p>
        )}
        {!isLoading && days.length === 0 && (
          <p className="text-sm italic text-muted-foreground">
            {t('training.upcomingWeek.empty', 'No sessions in this window.')}
          </p>
        )}
        {days.map((day) => renderSession(day))}
      </CardContent>
    </Card>
  );
}
