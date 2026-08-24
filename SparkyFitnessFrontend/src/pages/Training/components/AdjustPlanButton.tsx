import { useTranslation } from 'react-i18next';
import { addDays, todayInZone } from '@workspace/shared';
import { Wand2 } from 'lucide-react';
import type { TrainingPlanProposeResponse } from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Button } from '@/components/ui/button';
import {
  useAdjustTrainingPlanMutation,
  useTrainingPlanHealth,
} from '@/hooks/Training/useTrainingPlans';

interface AdjustPlanButtonProps {
  planId: string | undefined;
  /** Free-text guidance shared with the plan generator on the same tab. */
  userNotes?: string;
  /** When true, adjusts today through today+6 with plan-health-driven notes. */
  adjustThisWeek?: boolean;
  onProposal: (proposal: TrainingPlanProposeResponse) => void;
}

export default function AdjustPlanButton({
  planId,
  userNotes,
  adjustThisWeek = false,
  onProposal,
}: AdjustPlanButtonProps) {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const today = todayInZone(timezone);
  const adjustMutation = useAdjustTrainingPlanMutation();
  const { data: planHealth } = useTrainingPlanHealth(
    adjustThisWeek ? planId : undefined
  );

  const handleAdjust = async () => {
    if (!planId) return;
    const healthNotes =
      adjustThisWeek && planHealth?.summary_lines.length
        ? planHealth.summary_lines.join(' ')
        : undefined;
    const mergedNotes = [healthNotes, userNotes?.trim()]
      .filter(Boolean)
      .join(' ');
    const proposal = await adjustMutation.mutateAsync({
      plan_id: planId,
      from_date: adjustThisWeek ? today : undefined,
      to_date: adjustThisWeek ? addDays(today, 6) : undefined,
      user_notes: mergedNotes || undefined,
      replace_existing: true,
    });
    onProposal(proposal);
  };

  return (
    <Button
      variant="outline"
      disabled={!planId || adjustMutation.isPending}
      onClick={handleAdjust}
    >
      <Wand2 className="mr-2 h-4 w-4" />
      {adjustMutation.isPending
        ? t('training.adjust.pending', 'Reviewing your block…')
        : adjustThisWeek
          ? t('training.adjust.thisWeek', 'Adjust this week')
          : t('training.adjust.suggest', 'Suggest adjustment')}
    </Button>
  );
}
