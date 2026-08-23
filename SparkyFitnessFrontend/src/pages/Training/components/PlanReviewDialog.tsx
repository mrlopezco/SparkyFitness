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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConfirmTrainingPlanMutation } from '@/hooks/Training/useTrainingPlans';
import { SESSION_TYPES, SESSION_TYPE_LABELS } from '../trainingConstants';

interface PlanReviewDialogProps {
  proposal: TrainingPlanProposeResponse | null;
  replaceExisting: boolean;
  onReject: () => void;
  onConfirmed: () => void;
}

function parseOptionalNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// The confirm request rejects a non-uuid preset id, so the dialog validates the
// raw text here and blocks the save instead of silently dropping what was typed.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isInvalidPresetId(value: string | null | undefined): boolean {
  return !!value && !UUID_PATTERN.test(value);
}

export default function PlanReviewDialog({
  proposal,
  replaceExisting,
  onReject,
  onConfirmed,
}: PlanReviewDialogProps) {
  const { t } = useTranslation();
  const confirmMutation = useConfirmTrainingPlanMutation();

  // Edits are tagged with the proposal they belong to, so a fresh proposal
  // resets the list without an effect that would re-render on open.
  const [edits, setEdits] = useState<{
    proposal: TrainingPlanProposeResponse | null;
    sessions: TrainingPlanProposedSession[];
  }>({ proposal: null, sessions: [] });

  const sessions =
    edits.proposal === proposal ? edits.sessions : (proposal?.sessions ?? []);

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
    if (!proposal) return;
    await confirmMutation.mutateAsync({
      plan_id: proposal.plan_id,
      replace_existing: replaceExisting,
      sessions,
      activate: true,
    });
    onConfirmed();
  };

  return (
    <Dialog
      open={!!proposal}
      onOpenChange={(open) => {
        if (!open) onReject();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t('training.review.title', 'Review proposed plan')}
          </DialogTitle>
          <DialogDescription>{proposal?.summary}</DialogDescription>
        </DialogHeader>

        {proposal?.weekly_volume_notes && (
          <p className="text-sm text-muted-foreground">
            {proposal.weekly_volume_notes}
          </p>
        )}
        {proposal?.warnings?.length ? (
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
                  <Label htmlFor={`session-date-${index}`} className="text-xs">
                    {t('training.review.date', 'Date')}
                  </Label>
                  <Input
                    id={`session-date-${index}`}
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
                  <Label htmlFor={`session-type-${index}`} className="text-xs">
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
                    <SelectTrigger id={`session-type-${index}`}>
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
                  <Label htmlFor={`session-title-${index}`} className="text-xs">
                    {t('training.review.sessionTitle', 'Title')}
                  </Label>
                  <Input
                    id={`session-title-${index}`}
                    value={session.prescription.title ?? ''}
                    onChange={(event) =>
                      updatePrescription(index, {
                        title: event.target.value || undefined,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={`session-distance-${index}`}
                    className="text-xs"
                  >
                    {t('training.review.distanceKm', 'km')}
                  </Label>
                  <Input
                    id={`session-distance-${index}`}
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
                    htmlFor={`session-duration-${index}`}
                    className="text-xs"
                  >
                    {t('training.review.durationMinutes', 'min')}
                  </Label>
                  <Input
                    id={`session-duration-${index}`}
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

              {session.session_type === 'strength' && (
                <div className="space-y-1">
                  <Label
                    htmlFor={`session-preset-${index}`}
                    className="text-xs"
                  >
                    {t('training.review.workoutPresetId', 'Workout preset id')}
                  </Label>
                  <Input
                    id={`session-preset-${index}`}
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

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
