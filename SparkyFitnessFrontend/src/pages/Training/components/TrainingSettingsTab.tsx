import { useTranslation } from 'react-i18next';
import type { TrainingPlan, TrainingPlanDetail } from '@workspace/shared';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import GoalsCommitmentsEditor from './GoalsCommitmentsEditor';
import TrainingPlansSettingsCard from './TrainingPlansSettingsCard';

interface TrainingSettingsTabProps {
  plans: TrainingPlan[];
  plansLoading: boolean;
  currentPlans: TrainingPlan[];
  pastPlans: TrainingPlan[];
  selectedPlanId: string | undefined;
  onSelectPlan: (planId: string) => void;
  onCreateOpen: () => void;
  onExport: () => void;
  onImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  importPending: boolean;
  exportPending: boolean;
  updatePending: boolean;
  adherencePending: boolean;
  onActivate: (planId: string) => void;
  onDeactivate: (planId: string) => void;
  onMatchAdherence: (plan: TrainingPlan) => void;
  onDeleteRequest: (plan: TrainingPlan) => void;
  planDetail: TrainingPlanDetail | null | undefined;
}

export default function TrainingSettingsTab({
  plans,
  plansLoading,
  currentPlans,
  pastPlans,
  selectedPlanId,
  onSelectPlan,
  onCreateOpen,
  onExport,
  onImportFile,
  importPending,
  exportPending,
  updatePending,
  adherencePending,
  onActivate,
  onDeactivate,
  onMatchAdherence,
  onDeleteRequest,
  planDetail,
}: TrainingSettingsTabProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <TrainingPlansSettingsCard
        plansLoading={plansLoading}
        plansCount={plans.length}
        currentPlans={currentPlans}
        pastPlans={pastPlans}
        selectedPlanId={selectedPlanId}
        onSelectPlan={onSelectPlan}
        onCreateOpen={onCreateOpen}
        onExport={onExport}
        onImportFile={onImportFile}
        importPending={importPending}
        exportPending={exportPending}
        updatePending={updatePending}
        adherencePending={adherencePending}
        onActivate={onActivate}
        onDeactivate={onDeactivate}
        onMatchAdherence={onMatchAdherence}
        onDeleteRequest={onDeleteRequest}
      />

      {planDetail ? (
        <GoalsCommitmentsEditor key={planDetail.id} plan={planDetail} />
      ) : (
        <Card>
          <CardContent className="py-10">
            <p className="text-center text-sm italic text-muted-foreground">
              {t(
                'training.goals.selectPlan',
                'Select or create a plan first.'
              )}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
