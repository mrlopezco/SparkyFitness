import { useTranslation } from 'react-i18next';
import { Wand2 } from 'lucide-react';
import type { TrainingPlanProposeResponse } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { useAdjustTrainingPlanMutation } from '@/hooks/Training/useTrainingPlans';

interface AdjustPlanButtonProps {
  planId: string | undefined;
  /** Free-text guidance shared with the plan generator on the same tab. */
  userNotes?: string;
  onProposal: (proposal: TrainingPlanProposeResponse) => void;
}

export default function AdjustPlanButton({
  planId,
  userNotes,
  onProposal,
}: AdjustPlanButtonProps) {
  const { t } = useTranslation();
  const adjustMutation = useAdjustTrainingPlanMutation();

  const handleAdjust = async () => {
    if (!planId) return;
    const proposal = await adjustMutation.mutateAsync({
      plan_id: planId,
      user_notes: userNotes?.trim() || undefined,
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
        : t('training.adjust.suggest', 'Suggest adjustment')}
    </Button>
  );
}
