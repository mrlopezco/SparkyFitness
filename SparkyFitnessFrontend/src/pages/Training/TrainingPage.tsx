import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  MessageSquare,
  Settings,
  Target,
  Timer,
} from 'lucide-react';
import {
  todayInZone,
  trainingPlanExportDocumentSchema,
  type TrainingPlan,
  type TrainingPlanProposeResponse,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import {
  useDeleteTrainingPlanMutation,
  useExportTrainingPlanMutation,
  useImportTrainingPlanMutation,
  useLatestAthleteSnapshot,
  useMatchTrainingAdherenceMutation,
  useTrainingPlanDetail,
  useTrainingPlans,
  useUpdateTrainingPlanMutation,
} from '@/hooks/Training/useTrainingPlans';
import CoachPanel from './components/CoachPanel';
import CreatePlanCard from './components/CreatePlanCard';
import FitnessTestsPanel from './components/FitnessTestsPanel';
import TrainingOverviewTab from './components/TrainingOverviewTab';
import TrainingPlanWorkspace from './components/TrainingPlanWorkspace';
import TrainingSettingsTab from './components/TrainingSettingsTab';
import { Button } from '@/components/ui/button';

const TRAINING_TABS = [
  { id: 'overview', labelKey: 'training.tabs.overview', labelDefault: 'Overview', icon: Target },
  {
    id: 'plan',
    labelKey: 'training.tabs.plan',
    labelDefault: 'Training plan',
    icon: CalendarDays,
  },
  {
    id: 'coach',
    labelKey: 'training.tabs.coachChats',
    labelDefault: 'Coach Chats',
    icon: MessageSquare,
  },
  {
    id: 'fitnessTests',
    labelKey: 'training.tabs.fitnessTests',
    labelDefault: 'Fitness tests',
    icon: Timer,
  },
  {
    id: 'settings',
    labelKey: 'training.tabs.settings',
    labelDefault: 'Settings',
    icon: Settings,
  },
] as const;

type TrainingTabId = (typeof TRAINING_TABS)[number]['id'];

export default function TrainingPage() {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const today = todayInZone(timezone);

  const [activeTab, setActiveTab] = useState<TrainingTabId>('overview');
  const [pickedPlanId, setPickedPlanId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<TrainingPlanProposeResponse | null>(
    null
  );
  const [plannerSessionId, setPlannerSessionId] = useState<string | null>(
    null
  );
  const [planPendingDelete, setPlanPendingDelete] =
    useState<TrainingPlan | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: plans = [], isLoading: plansLoading } = useTrainingPlans();

  const currentPlans = useMemo(
    () =>
      plans.filter(
        (plan) => plan.status === 'active' || plan.status === 'draft'
      ),
    [plans]
  );
  const pastPlans = useMemo(
    () =>
      plans.filter(
        (plan) => plan.status === 'completed' || plan.status === 'archived'
      ),
    [plans]
  );
  const activePlanSummary = useMemo(
    () => plans.find((plan) => plan.status === 'active'),
    [plans]
  );

  const selectedPlan = useMemo(() => {
    const picked = plans.find((plan) => plan.id === pickedPlanId);
    return picked ?? activePlanSummary ?? currentPlans[0] ?? plans[0];
  }, [plans, currentPlans, pickedPlanId, activePlanSummary]);
  const selectedPlanId = selectedPlan?.id;

  const { data: planDetail } = useTrainingPlanDetail(selectedPlanId);
  const { data: activePlanDetail } = useTrainingPlanDetail(
    activePlanSummary?.id
  );
  const { data: snapshot } = useLatestAthleteSnapshot(activePlanSummary?.id);
  const updateMutation = useUpdateTrainingPlanMutation();
  const deleteMutation = useDeleteTrainingPlanMutation();
  const adherenceMutation = useMatchTrainingAdherenceMutation();
  const exportMutation = useExportTrainingPlanMutation();
  const importMutation = useImportTrainingPlanMutation();

  const openProposalInWorkspace = (
    next: TrainingPlanProposeResponse | null,
    sessionId?: string | null
  ) => {
    setProposal(next);
    setPlannerSessionId(sessionId ?? null);
    if (next) setActiveTab('plan');
  };

  const handleExport = async () => {
    if (!selectedPlanId) return;
    const document = await exportMutation.mutateAsync(selectedPlanId);
    const blob = new Blob([JSON.stringify(document, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `training-plan-${selectedPlan?.name ?? selectedPlanId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    const parsed = trainingPlanExportDocumentSchema.parse(JSON.parse(text));
    const result = await importMutation.mutateAsync({
      document: parsed,
      replace_plan_id: selectedPlanId,
      activate: false,
    });
    setPickedPlanId(result.plan.id);
    setActiveTab('settings');
  };

  return (
    <div className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as TrainingTabId)}
        className="w-full"
      >
        <div className="mb-6 flex flex-col items-center justify-between gap-4 border-b pb-3 lg:flex-row lg:items-center">
          <div className="flex flex-1 flex-wrap items-center justify-center gap-1 lg:justify-start">
            {TRAINING_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <Button
                  key={tab.id}
                  type="button"
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab(tab.id)}
                  className={`h-9 gap-2 rounded-full px-4 transition-all ${
                    isActive
                      ? 'bg-slate-200/60 text-foreground shadow-sm dark:bg-muted'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-semibold">
                    {t(tab.labelKey, tab.labelDefault)}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        <TabsContent
          value="overview"
          className="space-y-6 focus-visible:outline-none"
        >
          <TrainingOverviewTab
            activePlanId={activePlanSummary?.id}
            plan={activePlanDetail}
            snapshot={snapshot}
            today={today}
            onOpenPlanTab={() => {
              if (activePlanSummary) setPickedPlanId(activePlanSummary.id);
              setActiveTab('plan');
            }}
          />
        </TabsContent>

        <TabsContent value="settings" className="focus-visible:outline-none">
          <TrainingSettingsTab
            plans={plans}
            plansLoading={plansLoading}
            currentPlans={currentPlans}
            pastPlans={pastPlans}
            selectedPlanId={selectedPlanId}
            onSelectPlan={setPickedPlanId}
            onCreateOpen={() => setCreateOpen(true)}
            onExport={handleExport}
            onImportFile={handleImportFile}
            importPending={importMutation.isPending}
            exportPending={exportMutation.isPending}
            updatePending={updateMutation.isPending}
            adherencePending={adherenceMutation.isPending}
            onActivate={(planId) =>
              updateMutation.mutate({
                planId,
                payload: { status: 'active' },
              })
            }
            onDeactivate={(planId) =>
              updateMutation.mutate({
                planId,
                payload: { status: 'draft' },
              })
            }
            onMatchAdherence={(plan) =>
              adherenceMutation.mutate({
                plan_id: plan.id,
                start_date: plan.start_date,
                end_date: plan.target_date,
              })
            }
            onDeleteRequest={setPlanPendingDelete}
            planDetail={planDetail}
          />
        </TabsContent>

        <TabsContent value="plan" className="focus-visible:outline-none">
          <TrainingPlanWorkspace
            planId={selectedPlanId}
            proposal={proposal}
            plannerSessionId={plannerSessionId}
            onProposal={openProposalInWorkspace}
          />
        </TabsContent>

        <TabsContent value="coach" className="focus-visible:outline-none">
          <CoachPanel
            planId={selectedPlanId}
            onPlanProposal={openProposalInWorkspace}
          />
        </TabsContent>

        <TabsContent
          value="fitnessTests"
          className="focus-visible:outline-none"
        >
          <FitnessTestsPanel planId={selectedPlanId} />
        </TabsContent>
      </Tabs>

      <CreatePlanCard
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(planId) => {
          setPickedPlanId(planId);
          setActiveTab('settings');
        }}
      />

      <ConfirmationDialog
        open={!!planPendingDelete}
        onOpenChange={(open) => {
          if (!open) setPlanPendingDelete(null);
        }}
        title={t('training.plans.deleteTitle', 'Delete training plan')}
        description={t(
          'training.plans.deleteDescription',
          'This removes the plan, its goals, commitments and planned sessions.'
        )}
        variant="destructive"
        confirmLabel={t('training.plans.deleteConfirm', 'Delete')}
        onConfirm={() => {
          if (planPendingDelete) {
            deleteMutation.mutate(planPendingDelete.id);
          }
          setPlanPendingDelete(null);
        }}
      />
    </div>
  );
}
