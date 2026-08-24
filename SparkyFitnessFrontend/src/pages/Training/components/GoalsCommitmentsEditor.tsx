import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type {
  TrainingCommitment,
  TrainingCommitmentPayload,
  TrainingGoal,
  TrainingGoalPayload,
  TrainingGoalType,
  TrainingPlanDetail,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  useSaveTrainingCommitmentsMutation,
  useSaveTrainingGoalsMutation,
} from '@/hooks/Training/useTrainingPlans';
import {
  COMMITMENT_INTENSITIES,
  GOAL_TYPES,
  GOAL_TYPE_LABELS,
} from '../trainingConstants';

const WEEKDAYS = [
  { value: 'MO', labelKey: 'training.commitments.weekday.mo', labelDefault: 'Monday' },
  { value: 'TU', labelKey: 'training.commitments.weekday.tu', labelDefault: 'Tuesday' },
  { value: 'WE', labelKey: 'training.commitments.weekday.we', labelDefault: 'Wednesday' },
  { value: 'TH', labelKey: 'training.commitments.weekday.th', labelDefault: 'Thursday' },
  { value: 'FR', labelKey: 'training.commitments.weekday.fr', labelDefault: 'Friday' },
  { value: 'SA', labelKey: 'training.commitments.weekday.sa', labelDefault: 'Saturday' },
  { value: 'SU', labelKey: 'training.commitments.weekday.su', labelDefault: 'Sunday' },
] as const;

function weekdayFromRule(rule: string | null | undefined): string {
  if (!rule) return 'TU';
  const match = /BYDAY=([A-Z]{2})/i.exec(rule);
  const day = match?.[1]?.toUpperCase();
  return WEEKDAYS.some((entry) => entry.value === day) ? (day as string) : 'TU';
}

interface GoalsCommitmentsEditorProps {
  plan: TrainingPlanDetail;
}

type CommitmentIntensity = TrainingCommitmentPayload['intensity'];

function toGoalPayloads(goals: TrainingGoal[]): TrainingGoalPayload[] {
  return goals.map((goal) => ({
    type: goal.type,
    title: goal.title,
    target_date: goal.target_date ?? null,
    race_distance_meters: goal.race_distance_meters ?? null,
    race_target_seconds: goal.race_target_seconds ?? null,
    weight_target_kg: goal.weight_target_kg ?? null,
    weight_delta_kg: goal.weight_delta_kg ?? null,
    notes: goal.notes ?? null,
  }));
}

function toCommitmentPayloads(
  commitments: TrainingCommitment[]
): TrainingCommitmentPayload[] {
  return commitments.map((commitment) => ({
    kind: commitment.kind ?? 'standard',
    title: commitment.title,
    activity_type: commitment.activity_type,
    intensity: commitment.intensity,
    date: commitment.date ?? null,
    end_date: commitment.end_date ?? null,
    recurrence_rule: commitment.recurrence_rule ?? null,
    start_time: commitment.start_time ?? null,
    duration_minutes: commitment.duration_minutes ?? null,
    blocks_training: commitment.blocks_training,
    notes: commitment.notes ?? null,
  }));
}

export default function GoalsCommitmentsEditor({
  plan,
}: GoalsCommitmentsEditorProps) {
  const { t } = useTranslation();
  const [goals, setGoals] = useState<TrainingGoalPayload[]>(() =>
    toGoalPayloads(plan.goals)
  );
  const [commitments, setCommitments] = useState<TrainingCommitmentPayload[]>(
    () => toCommitmentPayloads(plan.commitments)
  );

  const saveGoals = useSaveTrainingGoalsMutation();
  const saveCommitments = useSaveTrainingCommitmentsMutation();

  const updateGoal = (index: number, patch: Partial<TrainingGoalPayload>) => {
    setGoals((prev) =>
      prev.map((goal, i) => (i === index ? { ...goal, ...patch } : goal))
    );
  };

  const updateCommitment = (
    index: number,
    patch: Partial<TrainingCommitmentPayload>
  ) => {
    setCommitments((prev) =>
      prev.map((commitment, i) =>
        i === index ? { ...commitment, ...patch } : commitment
      )
    );
  };

  const handleSaveGoals = () => {
    saveGoals.mutate({
      planId: plan.id,
      goals: goals
        .filter((goal) => goal.title.trim().length > 0)
        .map((goal, index) => ({
          ...goal,
          title: goal.title.trim(),
          sort_order: index,
        })),
    });
  };

  const handleSaveCommitments = () => {
    saveCommitments.mutate({
      planId: plan.id,
      commitments: commitments
        .filter((commitment) => {
          if (commitment.title.trim().length === 0) return false;
          if (commitment.kind === 'vacation') {
            return (
              commitment.date &&
              commitment.end_date &&
              commitment.end_date >= commitment.date
            );
          }
          return commitment.activity_type.trim().length > 0;
        })
        .map((commitment) => ({
          ...commitment,
          title: commitment.title.trim(),
          activity_type:
            commitment.kind === 'vacation'
              ? 'vacation'
              : commitment.activity_type.trim(),
          kind: commitment.kind ?? 'standard',
        })),
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('training.goals.title', 'Goals')}
          </CardTitle>
          <CardDescription>
            {t(
              'training.goals.description',
              'What this block is for: a race, a body-weight target, a volume or habit goal.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {goals.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('training.goals.empty', 'No goals yet.')}
            </p>
          )}
          {goals.map((goal, index) => (
            <div
              key={`goal-${index}`}
              className="grid gap-3 rounded-md border p-3 sm:grid-cols-[9rem_1fr_10rem_auto]"
            >
              <div className="space-y-1">
                <Label htmlFor={`goal-type-${index}`} className="text-xs">
                  {t('training.goals.type', 'Type')}
                </Label>
                <Select
                  value={goal.type}
                  onValueChange={(value) =>
                    updateGoal(index, { type: value as TrainingGoalType })
                  }
                >
                  <SelectTrigger id={`goal-type-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(
                          `training.goalType.${option}`,
                          GOAL_TYPE_LABELS[option]
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`goal-title-${index}`} className="text-xs">
                  {t('training.goals.goalTitle', 'Title')}
                </Label>
                <Input
                  id={`goal-title-${index}`}
                  value={goal.title}
                  onChange={(event) =>
                    updateGoal(index, { title: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`goal-date-${index}`} className="text-xs">
                  {t('training.goals.targetDate', 'Target date')}
                </Label>
                <Input
                  id={`goal-date-${index}`}
                  type="date"
                  value={goal.target_date ?? ''}
                  onChange={(event) =>
                    updateGoal(index, {
                      target_date: event.target.value || null,
                    })
                  }
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('training.goals.remove', 'Remove goal')}
                  onClick={() =>
                    setGoals((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setGoals((prev) => [
                  ...prev,
                  { type: 'race', title: '', target_date: null },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('training.goals.add', 'Add goal')}
            </Button>
            <Button disabled={saveGoals.isPending} onClick={handleSaveGoals}>
              {t('training.goals.save', 'Save goals')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('training.commitments.title', 'Commitments')}
          </CardTitle>
          <CardDescription>
            {t(
              'training.commitments.description',
              'Weekly or one-off activities the coach should plan around, like a Tuesday football match.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {commitments.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('training.commitments.empty', 'No commitments yet.')}
            </p>
          )}
          {commitments.map((commitment, index) => {
            const isVacation = commitment.kind === 'vacation';
            return (
            <div
              key={`commitment-${index}`}
              className="space-y-3 rounded-md border p-3"
            >
              {isVacation && (
                <Badge variant="secondary">
                  {t('training.commitments.vacationBadge', 'Vacation / travel')}
                </Badge>
              )}
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_9rem_auto]">
                <div className="space-y-1">
                  <Label
                    htmlFor={`commitment-title-${index}`}
                    className="text-xs"
                  >
                    {t('training.commitments.commitmentTitle', 'Title')}
                  </Label>
                  <Input
                    id={`commitment-title-${index}`}
                    value={commitment.title}
                    placeholder={
                      isVacation
                        ? t(
                            'training.commitments.vacationTitlePlaceholder',
                            'Ski trip'
                          )
                        : undefined
                    }
                    onChange={(event) =>
                      updateCommitment(index, { title: event.target.value })
                    }
                  />
                </div>
                {!isVacation && (
                <div className="space-y-1">
                  <Label
                    htmlFor={`commitment-activity-${index}`}
                    className="text-xs"
                  >
                    {t('training.commitments.activityType', 'Activity')}
                  </Label>
                  <Input
                    id={`commitment-activity-${index}`}
                    value={commitment.activity_type}
                    placeholder={t(
                      'training.commitments.activityPlaceholder',
                      'football'
                    )}
                    onChange={(event) =>
                      updateCommitment(index, {
                        activity_type: event.target.value,
                      })
                    }
                  />
                </div>
                )}
                {!isVacation && (
                <div className="space-y-1">
                  <Label
                    htmlFor={`commitment-intensity-${index}`}
                    className="text-xs"
                  >
                    {t('training.commitments.intensity', 'Intensity')}
                  </Label>
                  <Select
                    value={commitment.intensity}
                    onValueChange={(value) =>
                      updateCommitment(index, {
                        intensity: value as CommitmentIntensity,
                      })
                    }
                  >
                    <SelectTrigger id={`commitment-intensity-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMITMENT_INTENSITIES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`training.intensity.${option}`, option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                )}
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t(
                      'training.commitments.remove',
                      'Remove commitment'
                    )}
                    onClick={() =>
                      setCommitments((prev) =>
                        prev.filter((_, i) => i !== index)
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {isVacation ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label
                      htmlFor={`commitment-vacation-start-${index}`}
                      className="text-xs"
                    >
                      {t('training.commitments.vacationStart', 'Start date')}
                    </Label>
                    <Input
                      id={`commitment-vacation-start-${index}`}
                      type="date"
                      value={commitment.date ?? ''}
                      onChange={(event) =>
                        updateCommitment(index, {
                          date: event.target.value || null,
                          recurrence_rule: null,
                          end_date: commitment.end_date,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor={`commitment-vacation-end-${index}`}
                      className="text-xs"
                    >
                      {t('training.commitments.vacationEnd', 'End date')}
                    </Label>
                    <Input
                      id={`commitment-vacation-end-${index}`}
                      type="date"
                      value={commitment.end_date ?? ''}
                      onChange={(event) =>
                        updateCommitment(index, {
                          end_date: event.target.value || null,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label
                      htmlFor={`commitment-vacation-notes-${index}`}
                      className="text-xs"
                    >
                      {t(
                        'training.commitments.vacationWorkouts',
                        'What training is possible?'
                      )}
                    </Label>
                    <Textarea
                      id={`commitment-vacation-notes-${index}`}
                      rows={3}
                      value={commitment.notes ?? ''}
                      placeholder={t(
                        'training.commitments.vacationNotesPlaceholder',
                        'e.g. Hotel gym for easy 30 min; skiing most days — treat as cross-training, no hard runs'
                      )}
                      onChange={(event) =>
                        updateCommitment(index, {
                          notes: event.target.value || null,
                        })
                      }
                    />
                  </div>
                </div>
              ) : (
              <div className="grid gap-3 sm:grid-cols-[9rem_1fr_10rem_auto]">
                <div className="space-y-1">
                  <Label
                    htmlFor={`commitment-schedule-${index}`}
                    className="text-xs"
                  >
                    {t('training.commitments.schedule', 'Schedule')}
                  </Label>
                  <Select
                    value={
                      commitment.recurrence_rule
                        ? 'weekly'
                        : commitment.date
                          ? 'one_off'
                          : 'one_off'
                    }
                    onValueChange={(value) => {
                      if (value === 'weekly') {
                        updateCommitment(index, {
                          date: null,
                          recurrence_rule:
                            commitment.recurrence_rule || 'FREQ=WEEKLY;BYDAY=TU',
                        });
                      } else {
                        updateCommitment(index, {
                          recurrence_rule: null,
                          date: commitment.date,
                        });
                      }
                    }}
                  >
                    <SelectTrigger id={`commitment-schedule-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_off">
                        {t('training.commitments.oneOff', 'One-off date')}
                      </SelectItem>
                      <SelectItem value="weekly">
                        {t('training.commitments.weekly', 'Weekly')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {commitment.recurrence_rule ? (
                  <div className="space-y-1">
                    <Label
                      htmlFor={`commitment-weekday-${index}`}
                      className="text-xs"
                    >
                      {t('training.commitments.weekday', 'Weekday')}
                    </Label>
                    <Select
                      value={weekdayFromRule(commitment.recurrence_rule)}
                      onValueChange={(value) =>
                        updateCommitment(index, {
                          recurrence_rule: `FREQ=WEEKLY;BYDAY=${value}`,
                          date: null,
                        })
                      }
                    >
                      <SelectTrigger id={`commitment-weekday-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((day) => (
                          <SelectItem key={day.value} value={day.value}>
                            {t(day.labelKey, day.labelDefault)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label
                      htmlFor={`commitment-date-${index}`}
                      className="text-xs"
                    >
                      {t('training.commitments.date', 'One-off date')}
                    </Label>
                    <Input
                      id={`commitment-date-${index}`}
                      type="date"
                      value={commitment.date ?? ''}
                      onChange={(event) =>
                        updateCommitment(index, {
                          date: event.target.value || null,
                          recurrence_rule: null,
                        })
                      }
                    />
                  </div>
                )}
                <div className="flex items-end gap-2 pb-2 sm:col-span-2">
                  <Switch
                    id={`commitment-blocks-${index}`}
                    checked={commitment.blocks_training}
                    onCheckedChange={(checked) =>
                      updateCommitment(index, { blocks_training: checked })
                    }
                  />
                  <Label
                    htmlFor={`commitment-blocks-${index}`}
                    className="text-xs"
                  >
                    {t(
                      'training.commitments.blocksTraining',
                      'Blocks training'
                    )}
                  </Label>
                </div>
              </div>
              )}
            </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setCommitments((prev) => [
                  ...prev,
                  {
                    kind: 'standard',
                    title: '',
                    activity_type: '',
                    intensity: 'moderate',
                    blocks_training: true,
                    date: null,
                    recurrence_rule: null,
                  },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('training.commitments.add', 'Add commitment')}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setCommitments((prev) => [
                  ...prev,
                  {
                    kind: 'vacation',
                    title: '',
                    activity_type: 'vacation',
                    intensity: 'low',
                    blocks_training: false,
                    date: null,
                    end_date: null,
                    recurrence_rule: null,
                    notes: null,
                  },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('training.commitments.addVacation', 'Add vacation')}
            </Button>
            <Button
              disabled={saveCommitments.isPending}
              onClick={handleSaveCommitments}
            >
              {t('training.commitments.save', 'Save commitments')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
