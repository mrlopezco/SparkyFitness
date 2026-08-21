import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildMonthGrid,
  todayInZone,
  type TrainingCalendarResponse,
  type TrainingSessionStatus,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MonthCalendar, { type DayCellRender } from '@/components/MonthCalendar';
import { useTrainingCalendar } from '@/hooks/Training/useTrainingPlans';
import {
  COMMITMENT_DOT_COLOR,
  SESSION_STATUS_COLORS,
  SESSION_STATUS_LABELS,
  SESSION_TYPE_LABELS,
} from '../trainingConstants';
import SkipSessionDialog from './SkipSessionDialog';

type CalendarDay = TrainingCalendarResponse['days'][number];
type CalendarSession = CalendarDay['sessions'][number];

interface TrainingCalendarViewProps {
  planId?: string;
}

/** Collapses a day's sessions into the one status that colors its cell. */
function dominantStatus(
  sessions: CalendarSession[]
): TrainingSessionStatus | null {
  if (sessions.length === 0) return null;
  const completed = sessions.filter((s) => s.status === 'completed').length;
  const partial = sessions.filter((s) => s.status === 'partial').length;
  const skipped = sessions.filter((s) => s.status === 'skipped').length;
  const moved = sessions.filter((s) => s.status === 'moved').length;
  if (completed === sessions.length) return 'completed';
  if (completed > 0 || partial > 0) return 'partial';
  if (skipped > 0 && skipped + moved === sessions.length) return 'skipped';
  if (moved === sessions.length) return 'moved';
  return 'planned';
}

function formatPrescription(session: CalendarSession): string {
  const parts: string[] = [];
  const { title, distance_km, duration_minutes, pace_target } =
    session.prescription;
  if (title) parts.push(title);
  if (distance_km) parts.push(`${distance_km} km`);
  if (duration_minutes) parts.push(`${duration_minutes} min`);
  if (pace_target) parts.push(pace_target);
  return parts.join(' · ');
}

export default function TrainingCalendarView({
  planId,
}: TrainingCalendarViewProps) {
  const { t } = useTranslation();
  const { timezone, firstDayOfWeek } = usePreferences();
  const today = todayInZone(timezone);

  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const [sessionPendingSkip, setSessionPendingSkip] =
    useState<CalendarSession | null>(null);

  const { year, monthVal } = useMemo(() => {
    const parts = month.split('-').map(Number);
    return { year: parts[0] ?? 2026, monthVal: parts[1] ?? 1 };
  }, [month]);

  // Fetch the exact range MonthCalendar renders so leading/trailing days from
  // adjacent months are colored too.
  const { gridStart, gridEnd } = useMemo(
    () => buildMonthGrid(year, monthVal, firstDayOfWeek),
    [year, monthVal, firstDayOfWeek]
  );

  const { data, isLoading } = useTrainingCalendar({
    startDate: gridStart,
    endDate: gridEnd,
    planId,
  });

  const daysByDate = useMemo(() => {
    const map: Record<string, CalendarDay> = {};
    (data?.days ?? []).forEach((day) => {
      map[day.date] = day;
    });
    return map;
  }, [data]);

  const weekdayLabels = useMemo(() => {
    const days = [
      t('training.calendar.sun', 'Sun'),
      t('training.calendar.mon', 'Mon'),
      t('training.calendar.tue', 'Tue'),
      t('training.calendar.wed', 'Wed'),
      t('training.calendar.thu', 'Thu'),
      t('training.calendar.fri', 'Fri'),
      t('training.calendar.sat', 'Sat'),
    ];
    const reordered: string[] = [];
    for (let i = 0; i < 7; i++) {
      reordered.push(days[(firstDayOfWeek + i) % 7]!);
    }
    return reordered;
  }, [t, firstDayOfWeek]);

  const legend = useMemo(
    () => [
      {
        label: t('training.status.planned', SESSION_STATUS_LABELS.planned),
        color: SESSION_STATUS_COLORS.planned,
      },
      {
        label: t('training.status.completed', SESSION_STATUS_LABELS.completed),
        color: SESSION_STATUS_COLORS.completed,
      },
      {
        label: t('training.status.partial', SESSION_STATUS_LABELS.partial),
        color: SESSION_STATUS_COLORS.partial,
      },
      {
        label: t('training.status.skipped', SESSION_STATUS_LABELS.skipped),
        color: SESSION_STATUS_COLORS.skipped,
      },
      {
        label: t('training.status.moved', SESSION_STATUS_LABELS.moved),
        color: SESSION_STATUS_COLORS.moved,
      },
      {
        label: t('training.calendar.commitment', 'Commitment'),
        color: COMMITMENT_DOT_COLOR,
      },
    ],
    [t]
  );

  const selectedDay = daysByDate[selectedDate];

  return (
    <div className="space-y-6">
      <MonthCalendar
        month={month}
        onMonthChange={setMonth}
        weekdayLabels={weekdayLabels}
        selectedDate={selectedDate}
        onDayClick={setSelectedDate}
        legend={legend}
        monthLabelLocale={t('i18n.locale', 'en-US')}
        renderDay={(day): DayCellRender => {
          const dayData = daysByDate[day];
          if (!dayData) return {};
          const cell: DayCellRender = {};
          const status = dominantStatus(dayData.sessions);
          if (status) {
            cell.fill = SESSION_STATUS_COLORS[status];
            cell.textColor = '#fff';
          }
          const titleParts = dayData.sessions.map(
            (session) =>
              `${t(
                `training.sessionType.${session.session_type}`,
                SESSION_TYPE_LABELS[session.session_type]
              )}${
                formatPrescription(session)
                  ? ` (${formatPrescription(session)})`
                  : ''
              }`
          );
          dayData.commitments.forEach((commitment) => {
            titleParts.push(commitment.title);
          });
          if (titleParts.length > 0) {
            cell.title = titleParts.join(' · ');
          }
          if (dayData.commitments.length > 0) {
            cell.content = (
              <span
                className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                style={{ backgroundColor: COMMITMENT_DOT_COLOR }}
              />
            );
          }
          return cell;
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('training.calendar.dayTitle', 'Day detail')} · {selectedDate}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && (
            <p className="text-sm text-muted-foreground">
              {t('training.calendar.loading', 'Loading sessions…')}
            </p>
          )}
          {!isLoading &&
            !selectedDay?.sessions.length &&
            !selectedDay?.commitments.length && (
              <p className="text-sm text-muted-foreground">
                {t(
                  'training.calendar.emptyDay',
                  'Nothing planned for this day.'
                )}
              </p>
            )}
          {selectedDay?.sessions.map((session) => (
            <div
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {t(
                    `training.sessionType.${session.session_type}`,
                    SESSION_TYPE_LABELS[session.session_type]
                  )}
                </p>
                {formatPrescription(session) && (
                  <p className="text-xs text-muted-foreground">
                    {formatPrescription(session)}
                  </p>
                )}
                {session.status === 'skipped' && session.skip_reason && (
                  <p className="text-xs text-muted-foreground">
                    {t('training.skip.reasonLabel', 'Skipped: {{reason}}', {
                      reason: session.skip_reason,
                    })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {t(
                    `training.status.${session.status}`,
                    SESSION_STATUS_LABELS[session.status]
                  )}
                </Badge>
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
          ))}
          {selectedDay?.commitments.map((commitment) => (
            <div
              key={commitment.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-3"
            >
              <div>
                <p className="text-sm font-medium">{commitment.title}</p>
                <p className="text-xs text-muted-foreground">
                  {commitment.activity_type}
                </p>
              </div>
              <Badge variant="secondary">
                {t(
                  `training.intensity.${commitment.intensity}`,
                  commitment.intensity
                )}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <SkipSessionDialog
        planId={sessionPendingSkip?.plan_id ?? planId}
        sessionId={sessionPendingSkip?.id ?? null}
        sessionLabel={
          sessionPendingSkip
            ? `${t(
                `training.sessionType.${sessionPendingSkip.session_type}`,
                SESSION_TYPE_LABELS[sessionPendingSkip.session_type]
              )} · ${sessionPendingSkip.scheduled_date}`
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) setSessionPendingSkip(null);
        }}
      />
    </div>
  );
}
