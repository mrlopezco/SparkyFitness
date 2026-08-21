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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateTrainingPlanMutation } from '@/hooks/Training/useTrainingPlans';
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

  const createMutation = useCreateTrainingPlanMutation();

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
