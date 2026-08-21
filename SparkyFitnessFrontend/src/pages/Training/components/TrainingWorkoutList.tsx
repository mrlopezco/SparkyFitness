import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { TrainingCalendarResponse } from '@workspace/shared';
import {
  SESSION_STATUS_LABELS,
  SESSION_TYPE_LABELS,
} from '../trainingConstants';
import SessionExecutionDialog from './SessionExecutionDialog';
import SkipSessionDialog from './SkipSessionDialog';

type CalendarSession =
  TrainingCalendarResponse['days'][number]['sessions'][number];

interface TrainingWorkoutListProps {
  planId: string | undefined;
  sessions: CalendarSession[];
  isLoading?: boolean;
  highlightedDate: string | null;
  onHighlightedDateChange: (date: string) => void;
  /** When set, scroll this date's first workout into view (calendar click). */
  scrollToDate: string | null;
  openSessionId: string | null;
  onOpenSessionIdChange: (sessionId: string | null) => void;
}

function loadLabel(session: CalendarSession): string {
  const { distance_km, duration_minutes } = session.prescription;
  if (distance_km != null && distance_km > 0) return `${distance_km} km`;
  if (duration_minutes != null && duration_minutes > 0) {
    return `${duration_minutes} min`;
  }
  return '—';
}

export default function TrainingWorkoutList({
  planId,
  sessions,
  isLoading,
  highlightedDate,
  onHighlightedDateChange,
  scrollToDate,
  openSessionId,
  onOpenSessionIdChange,
}: TrainingWorkoutListProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [sessionPendingSkip, setSessionPendingSkip] =
    useState<CalendarSession | null>(null);
  const [sessionPendingExecution, setSessionPendingExecution] =
    useState<CalendarSession | null>(null);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) =>
        a.scheduled_date === b.scheduled_date
          ? (a.sort_order ?? 0) - (b.sort_order ?? 0)
          : a.scheduled_date.localeCompare(b.scheduled_date)
      ),
    [sessions]
  );

  // Highlight the calendar day that owns the most-visible list row while scrolling.
  useEffect(() => {
    const root = listRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0];
        if (!top) return;
        const date = (top.target as HTMLElement).dataset['date'];
        if (date) onHighlightedDateChange(date);
      },
      { root, threshold: [0.35, 0.55, 0.75] }
    );

    Object.values(itemRefs.current).forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [sortedSessions, onHighlightedDateChange]);

  // When the calendar picks a day, scroll that day's first workout into view.
  useEffect(() => {
    if (!scrollToDate) return;
    const match = sortedSessions.find(
      (session) => session.scheduled_date === scrollToDate
    );
    if (!match) return;
    const node = itemRefs.current[match.id];
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [scrollToDate, sortedSessions]);

  return (
    <Card className="flex h-full min-h-[28rem] flex-col">
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
          {t('training.workoutList.title', 'Workouts')}
        </CardTitle>
        <CardDescription>
          {t(
            'training.workoutList.description',
            'Scroll the list to move through the calendar. Open a row for details.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {isLoading && (
          <p className="text-sm text-muted-foreground">
            {t('training.calendar.loading', 'Loading sessions…')}
          </p>
        )}
        {!isLoading && sortedSessions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t(
              'training.workoutList.empty',
              'No workouts yet. Generate a plan to fill this list.'
            )}
          </p>
        )}

        <div
          ref={listRef}
          className="max-h-[36rem] space-y-1 overflow-y-auto pr-1"
        >
          <Accordion
            type="single"
            collapsible
            value={openSessionId ?? undefined}
            onValueChange={(value) => onOpenSessionIdChange(value || null)}
          >
            {sortedSessions.map((session) => {
              const isHighlighted =
                session.scheduled_date === highlightedDate;
              return (
                <div
                  key={session.id}
                  ref={(node) => {
                    itemRefs.current[session.id] = node;
                  }}
                  data-date={session.scheduled_date}
                  className={`rounded-md ${
                    isHighlighted ? 'bg-muted/60 ring-1 ring-primary/30' : ''
                  }`}
                >
                  <AccordionItem value={session.id} className="border-b-0 px-2">
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <div className="flex w-full flex-col gap-1 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            {session.scheduled_date}
                          </span>
                          <Badge variant="outline">
                            {t(
                              `training.sessionType.${session.session_type}`,
                              SESSION_TYPE_LABELS[session.session_type]
                            )}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {loadLabel(session)}
                          </span>
                        </div>
                        {session.prescription.title && (
                          <span className="text-xs text-muted-foreground">
                            {session.prescription.title}
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">
                            {t(
                              `training.status.${session.status}`,
                              SESSION_STATUS_LABELS[session.status]
                            )}
                          </Badge>
                          {session.prescription.pace_target && (
                            <span className="text-xs text-muted-foreground">
                              {session.prescription.pace_target}
                            </span>
                          )}
                          {session.prescription.heart_rate_zone && (
                            <span className="text-xs text-muted-foreground">
                              {session.prescription.heart_rate_zone}
                            </span>
                          )}
                        </div>
                        {session.prescription.instructions && (
                          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                            {session.prescription.instructions}
                          </p>
                        )}
                        {session.completion?.ai_review && (
                          <p className="text-xs whitespace-pre-wrap text-muted-foreground">
                            {t(
                              'training.execution.aiReviewLabel',
                              'AI review:'
                            )}{' '}
                            {session.completion.ai_review}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {(session.status === 'planned' ||
                            session.status === 'partial') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setSessionPendingExecution(session)
                              }
                            >
                              {t(
                                'training.execution.action',
                                'Log execution'
                              )}
                            </Button>
                          )}
                          {session.status === 'planned' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSessionPendingSkip(session)}
                            >
                              {t('training.skip.action', 'Skip')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </div>
              );
            })}
          </Accordion>
        </div>

        <SkipSessionDialog
          planId={sessionPendingSkip?.plan_id ?? planId}
          sessionId={sessionPendingSkip?.id ?? null}
          sessionLabel={
            sessionPendingSkip
              ? `${sessionPendingSkip.prescription.title || sessionPendingSkip.session_type} · ${sessionPendingSkip.scheduled_date}`
              : undefined
          }
          onOpenChange={(open) => {
            if (!open) setSessionPendingSkip(null);
          }}
        />

        <SessionExecutionDialog
          planId={sessionPendingExecution?.plan_id ?? planId}
          sessionId={sessionPendingExecution?.id ?? null}
          sessionLabel={
            sessionPendingExecution
              ? `${
                  sessionPendingExecution.prescription.title ||
                  sessionPendingExecution.session_type
                } · ${sessionPendingExecution.scheduled_date}`
              : undefined
          }
          onOpenChange={(open) => {
            if (!open) setSessionPendingExecution(null);
          }}
        />
      </CardContent>
    </Card>
  );
}
