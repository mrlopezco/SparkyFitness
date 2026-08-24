import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  todayInZone,
  type TrainingSportFocus,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useCreateTrainingPlanMutation, useUpdateTrainingPlanMutation } from '@/hooks/Training/useTrainingPlans';
import { SPORT_FOCUS_LABELS, SPORT_FOCUS_OPTIONS } from '../trainingConstants';

interface CreatePlanCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (planId: string) => void;
}

export default function CreatePlanCard({
  open,
  onOpenChange,
  onCreated,
}: CreatePlanCardProps) {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const today = todayInZone(timezone);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [targetDate, setTargetDate] = useState(() => addDays(today, 84));
  const [sportFocus, setSportFocus] = useState<TrainingSportFocus>('running');
  const [daysPerWeek, setDaysPerWeek] = useState('');
  const [maxQualityDays, setMaxQualityDays] = useState('');
  const [injuryNotes, setInjuryNotes] = useState('');

  const createMutation = useCreateTrainingPlanMutation();
  const updateMutation = useUpdateTrainingPlanMutation();

  const canSubmit =
    name.trim().length > 0 &&
    startDate.length === 10 &&
    targetDate.length === 10 &&
    !createMutation.isPending;

  const resetForm = () => {
    setName('');
    setStartDate(today);
    setTargetDate(addDays(today, 84));
    setSportFocus('running');
    setDaysPerWeek('');
    setMaxQualityDays('');
    setInjuryNotes('');
  };

  const handleSubmit = async () => {
    const plan = await createMutation.mutateAsync({
      name: name.trim(),
      sport_focus: sportFocus,
      start_date: startDate,
      target_date: targetDate,
      goals: [],
      commitments: [],
    });
    const days = daysPerWeek.trim() ? Number(daysPerWeek) : null;
    const quality = maxQualityDays.trim() ? Number(maxQualityDays) : null;
    if (
      (days != null && Number.isFinite(days)) ||
      (quality != null && Number.isFinite(quality)) ||
      injuryNotes.trim()
    ) {
      await updateMutation.mutateAsync({
        planId: plan.id,
        payload: {
          intake_payload: {
            ...(days != null && Number.isFinite(days)
              ? { days_per_week: days }
              : {}),
            ...(quality != null && Number.isFinite(quality)
              ? { max_quality_days: quality }
              : {}),
            ...(injuryNotes.trim()
              ? { injury_notes: injuryNotes.trim() }
              : {}),
          },
        },
      });
    }
    resetForm();
    onOpenChange(false);
    onCreated(plan.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('training.create.title', 'New training plan')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'training.create.description',
              'Set the block window and sport focus, then add goals and let the coach draft sessions.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="training-plan-name">
              {t('training.create.name', 'Plan name')}
            </Label>
            <Input
              id="training-plan-name"
              value={name}
              placeholder={t(
                'training.create.namePlaceholder',
                'Spring 10K build'
              )}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="training-plan-start">
                {t('training.create.startDate', 'Start date')}
              </Label>
              <Input
                id="training-plan-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="training-plan-target">
                {t('training.create.targetDate', 'Target date')}
              </Label>
              <Input
                id="training-plan-target"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="training-plan-sport">
                {t('training.create.sportFocus', 'Sport focus')}
              </Label>
              <Select
                value={sportFocus}
                onValueChange={(value) =>
                  setSportFocus(value as TrainingSportFocus)
                }
              >
                <SelectTrigger id="training-plan-sport">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPORT_FOCUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(
                        `training.sportFocus.${option}`,
                        SPORT_FOCUS_LABELS[option]
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="training-plan-days">
                {t('training.create.daysPerWeek', 'Training days / week')}
              </Label>
              <Input
                id="training-plan-days"
                type="number"
                min={1}
                max={7}
                value={daysPerWeek}
                onChange={(event) => setDaysPerWeek(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="training-plan-quality">
                {t('training.create.maxQuality', 'Max hard days / week')}
              </Label>
              <Input
                id="training-plan-quality"
                type="number"
                min={0}
                max={4}
                value={maxQualityDays}
                onChange={(event) => setMaxQualityDays(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="training-plan-injury">
              {t('training.create.injuryNotes', 'Injuries or limits')}
            </Label>
            <Textarea
              id="training-plan-injury"
              value={injuryNotes}
              rows={2}
              onChange={(event) => setInjuryNotes(event.target.value)}
            />
          </div>
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            {createMutation.isPending
              ? t('training.create.submitting', 'Creating…')
              : t('training.create.submit', 'Create plan')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
