import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import type {
  TrainingPlanProposedSession,
  TrainingPlanProposeResponse,
  TrainingSessionType,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useConfirmTrainingPlanMutation } from '@/hooks/Training/useTrainingPlans';
import { SESSION_TYPES, SESSION_TYPE_LABELS } from '../trainingConstants';

interface PlanProposalPanelProps {
  proposal: TrainingPlanProposeResponse;
  replaceExisting?: boolean;
  plannerSessionId?: string;
  onReject: () => void;
  onConfirmed: () => void;
}

function parseOptionalNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isInvalidPresetId(value: string | null | undefined): boolean {
  return !!value && !UUID_PATTERN.test(value);
}

export default function PlanProposalPanel({
  proposal,
  replaceExisting = true,
  plannerSessionId,
  onReject,
  onConfirmed,
}: PlanProposalPanelProps) {
  const { t } = useTranslation();
  const confirmMutation = useConfirmTrainingPlanMutation();

  const [edits, setEdits] = useState<{
    proposal: TrainingPlanProposeResponse;
    sessions: TrainingPlanProposedSession[];
  }>({ proposal, sessions: proposal.sessions });

  const sessions =
    edits.proposal === proposal ? edits.sessions : proposal.sessions;

  const setSessions = (
    next: (
      current: TrainingPlanProposedSession[]
    ) => TrainingPlanProposedSession[]
  ) => {
    setEdits({ proposal, sessions: next(sessions) });
  };

  const updateSession = (
    index: number,
    patch: Partial<TrainingPlanProposedSession>
  ) => {
    setSessions((prev) =>
      prev.map((session, i) =>
        i === index ? { ...session, ...patch } : session
      )
    );
  };

  const updatePrescription = (
    index: number,
    patch: Partial<TrainingPlanProposedSession['prescription']>
  ) => {
    setSessions((prev) =>
      prev.map((session, i) =>
        i === index
          ? { ...session, prescription: { ...session.prescription, ...patch } }
          : session
      )
    );
  };

  const hasInvalidPresetId = sessions.some((session) =>
    isInvalidPresetId(session.prescription.workout_preset_id)
  );

  const handleConfirm = async () => {
    await confirmMutation.mutateAsync({
      plan_id: proposal.plan_id,
      replace_existing: replaceExisting,
      sessions,
      fitness_tests: proposal.fitness_tests,
      activate: true,
      ...(plannerSessionId
        ? {
            planner_session_id: plannerSessionId,
            proposal_summary: proposal.summary,
          }
        : {}),
    });
    onConfirmed();
  };

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
          {t('training.review.title', 'Review proposed plan')}
        </CardTitle>
        <CardDescription>{proposal.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {proposal.weekly_volume_notes && (
          <p className="text-sm text-muted-foreground">
            {proposal.weekly_volume_notes}
          </p>
        )}
        {proposal.plan_outline && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">
              {t('training.review.outlineTitle', 'Macro plan outline')}
            </p>
            <p className="mt-1 text-muted-foreground">
              {proposal.plan_outline.summary}
            </p>
            <ul className="mt-2 space-y-1">
              {proposal.plan_outline.weeks.map((week) => (
                <li key={week.week_index} className="text-muted-foreground">
                  {t('training.review.outlineWeek', 'Week {{index}}', {
                    index: week.week_index,
                  })}{' '}
                  ({week.start_date} – {week.end_date}): {week.theme}
                  {week.target_weekly_km_min != null &&
                  week.target_weekly_km_max != null
                    ? ` · ${week.target_weekly_km_min}–${week.target_weekly_km_max} km`
                    : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(proposal.fitness_tests?.length ?? 0) > 0 && (
          <div className="rounded-md border border-dashed p-3 text-sm">
            <p className="font-medium">
              {t(
                'training.review.fitnessTestsTitle',
                'Fitness tests in this proposal'
              )}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              {proposal.fitness_tests?.map((test) => (
                <li key={test.client_id}>
                  {test.scheduled_date}: {test.title}
                </li>
              ))}
            </ul>
          </div>
        )}
        {proposal.warnings?.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-600">
            {proposal.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}

        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {sessions.map((session, index) => (
            <div
              key={session.client_id}
              className="space-y-3 rounded-md border p-3"
            >
              <div className="grid gap-3 sm:grid-cols-[9rem_9rem_1fr_6rem_6rem_auto]">
                <div className="space-y-1">
                  <Label htmlFor={`proposal-date-${index}`} className="text-xs">
                    {t('training.review.date', 'Date')}
                  </Label>
                  <Input
                    id={`proposal-date-${index}`}
                    type="date"
                    value={session.scheduled_date}
                    onChange={(event) =>
                      updateSession(index, {
                        scheduled_date: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`proposal-type-${index}`} className="text-xs">
                    {t('training.review.type', 'Type')}
                  </Label>
                  <Select
                    value={session.session_type}
                    onValueChange={(value) =>
                      updateSession(index, {
                        session_type: value as TrainingSessionType,
                      })
                    }
                  >
                    <SelectTrigger id={`proposal-type-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SESSION_TYPES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(
                            `training.sessionType.${option}`,
                            SESSION_TYPE_LABELS[option]
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`proposal-title-${index}`} className="text-xs">
                    {t('training.review.sessionTitle', 'Title')}
                  </Label>
                  <Input
                    id={`proposal-title-${index}`}
                    value={session.prescription.title ?? ''}
                    placeholder={t(
                      'training.review.titlePlaceholder',
                      'e.g. 8 km easy or 45 min Z2'
                    )}
                    onChange={(event) =>
                      updatePrescription(index, {
                        title: event.target.value || undefined,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={`proposal-distance-${index}`}
                    className="text-xs"
                  >
                    {t('training.review.distanceKm', 'km')}
                  </Label>
                  <Input
                    id={`proposal-distance-${index}`}
                    type="number"
                    min={0}
                    step="0.1"
                    value={session.prescription.distance_km ?? ''}
                    onChange={(event) =>
                      updatePrescription(index, {
                        distance_km: parseOptionalNumber(event.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={`proposal-duration-${index}`}
                    className="text-xs"
                  >
                    {t('training.review.durationMinutes', 'min')}
                  </Label>
                  <Input
                    id={`proposal-duration-${index}`}
                    type="number"
                    min={0}
                    step="1"
                    value={session.prescription.duration_minutes ?? ''}
                    onChange={(event) =>
                      updatePrescription(index, {
                        duration_minutes: parseOptionalNumber(
                          event.target.value
                        ),
                      })
                    }
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('training.review.remove', 'Remove session')}
                    onClick={() =>
                      setSessions((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`proposal-pace-${index}`} className="text-xs">
                    {t('training.review.paceTarget', 'Pace target')}
                  </Label>
                  <Input
                    id={`proposal-pace-${index}`}
                    value={session.prescription.pace_target ?? ''}
                    placeholder={t(
                      'training.review.pacePlaceholder',
                      'e.g. 5:30 /km'
                    )}
                    onChange={(event) =>
                      updatePrescription(index, {
                        pace_target: event.target.value.trim() || null,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`proposal-hr-${index}`} className="text-xs">
                    {t('training.review.heartRateZone', 'Heart rate zone')}
                  </Label>
                  <Input
                    id={`proposal-hr-${index}`}
                    value={session.prescription.heart_rate_zone ?? ''}
                    placeholder={t(
                      'training.review.hrPlaceholder',
                      'e.g. Z2'
                    )}
                    onChange={(event) =>
                      updatePrescription(index, {
                        heart_rate_zone: event.target.value.trim() || null,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor={`proposal-instructions-${index}`}
                  className="text-xs"
                >
                  {t('training.review.instructions', 'Instructions')}
                </Label>
                <Textarea
                  id={`proposal-instructions-${index}`}
                  rows={3}
                  value={session.prescription.instructions ?? ''}
                  placeholder={t(
                    'training.review.instructionsPlaceholder',
                    'How to run (zones/paces) or strength: exercise, sets, reps…'
                  )}
                  onChange={(event) =>
                    updatePrescription(index, {
                      instructions: event.target.value.trim() || null,
                    })
                  }
                />
              </div>

              {session.session_type === 'strength' && (
                <div className="space-y-1">
                  <Label
                    htmlFor={`proposal-preset-${index}`}
                    className="text-xs"
                  >
                    {t(
                      'training.review.workoutPresetId',
                      'Workout preset id'
                    )}
                  </Label>
                  <Input
                    id={`proposal-preset-${index}`}
                    value={session.prescription.workout_preset_id ?? ''}
                    placeholder={t(
                      'training.review.workoutPresetIdPlaceholder',
                      'Paste a workout preset id to link this strength day'
                    )}
                    onChange={(event) =>
                      updatePrescription(index, {
                        workout_preset_id: event.target.value.trim() || null,
                      })
                    }
                  />
                  {isInvalidPresetId(
                    session.prescription.workout_preset_id
                  ) && (
                    <p className="text-xs text-destructive">
                      {t(
                        'training.review.workoutPresetIdInvalid',
                        'Not a valid preset id. Clear the field or paste the full id.'
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onReject}>
          {t('training.review.reject', 'Reject')}
        </Button>
        <Button
          disabled={
            sessions.length === 0 ||
            hasInvalidPresetId ||
            confirmMutation.isPending
          }
          onClick={handleConfirm}
        >
          {confirmMutation.isPending
            ? t('training.review.confirming', 'Saving…')
            : t('training.review.confirm', 'Confirm plan')}
        </Button>
      </CardFooter>
    </Card>
  );
}
