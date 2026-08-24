import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import type { TrainingPlan } from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SPORT_FOCUS_LABELS } from '../trainingConstants';

export interface TrainingPlansSettingsCardProps {
  plansLoading: boolean;
  plansCount: number;
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
}

export default function TrainingPlansSettingsCard({
  plansLoading,
  plansCount,
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
}: TrainingPlansSettingsCardProps) {
  const { t } = useTranslation();
  const importInputRef = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-4">
        <div>
          <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('training.plans.title', 'Your plans')}
          </CardTitle>
          <CardDescription className="mt-1.5">
            {t(
              'training.plans.description',
              'Create multiple plans if you like — only one can be active at a time.'
            )}
          </CardDescription>
        </div>
        <Button onClick={onCreateOpen}>
          <Plus className="mr-2 h-4 w-4" />
          {t('training.create.open', 'New plan')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {plansLoading && (
          <p className="text-sm text-muted-foreground">
            {t('training.plans.loading', 'Loading plans…')}
          </p>
        )}
        {!plansLoading && plansCount === 0 && (
          <p className="py-6 text-center text-sm italic text-muted-foreground">
            {t(
              'training.plans.empty',
              'No training plans yet. Create one to get started.'
            )}
          </p>
        )}
        {currentPlans.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 ${
              plan.id === selectedPlanId ? 'border-primary' : ''
            }`}
          >
            <button
              type="button"
              className="flex-1 text-left"
              onClick={() => onSelectPlan(plan.id)}
            >
              <p className="font-semibold">{plan.name}</p>
              <p className="text-sm text-muted-foreground">
                {plan.start_date} → {plan.target_date} ·{' '}
                {t(
                  `training.sportFocus.${plan.sport_focus}`,
                  SPORT_FOCUS_LABELS[plan.sport_focus]
                )}
              </p>
            </button>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {t(`training.planStatus.${plan.status}`, plan.status)}
              </Badge>
              {plan.status === 'draft' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={updatePending}
                  onClick={() => onActivate(plan.id)}
                >
                  {t('training.plans.activate', 'Activate')}
                </Button>
              )}
              {plan.status === 'active' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={updatePending}
                    onClick={() => onDeactivate(plan.id)}
                  >
                    {t('training.plans.deactivate', 'Deactivate')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={adherencePending}
                    onClick={() => onMatchAdherence(plan)}
                  >
                    {t('training.plans.syncAdherence', 'Match activities')}
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('training.plans.delete', 'Delete plan')}
                onClick={() => onDeleteRequest(plan)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {pastPlans.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {t('training.plans.past', 'Completed & archived')}
            </p>
            {pastPlans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                className="block w-full text-left text-sm text-muted-foreground hover:text-foreground"
                onClick={() => onSelectPlan(plan.id)}
              >
                {plan.name} · {plan.start_date} → {plan.target_date}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!selectedPlanId || exportPending}
            onClick={onExport}
          >
            <Download className="mr-2 h-4 w-4" />
            {t('training.plans.export', 'Export JSON')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={importPending}
            onClick={() => importInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {t('training.plans.import', 'Import JSON')}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onImportFile}
          />
        </div>
      </CardContent>
    </Card>
  );
}
