import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Download,
  Flag,
  MessageSquare,
  Plus,
  Target,
  Timer,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  todayInZone,
  trainingPlanExportDocumentSchema,
  type TrainingPlan,
  type TrainingPlanProposeResponse,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  useCreateAthleteSnapshotMutation,
  useDeleteTrainingPlanMutation,
  useExportTrainingPlanMutation,
  useImportTrainingPlanMutation,
  useLatestAthleteSnapshot,
  useMatchTrainingAdherenceMutation,
  useTrainingPlanDetail,
  useTrainingPlans,
  useUpdateTrainingPlanMutation,
} from '@/hooks/Training/useTrainingPlans';
import ActivePlanDetailsCard from './components/ActivePlanDetailsCard';
import CoachPanel from './components/CoachPanel';
import CreatePlanCard from './components/CreatePlanCard';
import FitnessTestsPanel from './components/FitnessTestsPanel';
import GoalsCommitmentsEditor from './components/GoalsCommitmentsEditor';
import TrainingPlanWorkspace from './components/TrainingPlanWorkspace';
import { SPORT_FOCUS_LABELS } from './trainingConstants';

const SNAPSHOT_WINDOW_DAYS = 28;

const TRAINING_TABS = [
  { id: 'overview', labelKey: 'training.tabs.overview', labelDefault: 'Overview', icon: Target },
  {
    id: 'goals',
    labelKey: 'training.tabs.goals',
    labelDefault: 'Goals & commitments',
    icon: Flag,
  },
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
] as const;

type TrainingTabId = (typeof TRAINING_TABS)[number]['id'];

export default function TrainingPage() {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const today = todayInZone(timezone);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TrainingTabId>('overview');
  const [pickedPlanId, setPickedPlanId] = useState<string | null>(null);
  const [coachNotes, setCoachNotes] = useState('');
  const [proposal, setProposal] = useState<TrainingPlanProposeResponse | null>(
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
  const snapshotMutation = useCreateAthleteSnapshotMutation();
  const updateMutation = useUpdateTrainingPlanMutation();
  const deleteMutation = useDeleteTrainingPlanMutation();
  const adherenceMutation = useMatchTrainingAdherenceMutation();
  const exportMutation = useExportTrainingPlanMutation();
  const importMutation = useImportTrainingPlanMutation();

  const openProposalInWorkspace = (
    next: TrainingPlanProposeResponse | null
  ) => {
    setProposal(next);
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
    setActiveTab('plan');
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
              <Button onClick={() => setCreateOpen(true)}>
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
              {!plansLoading && plans.length === 0 && (
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
                    onClick={() => setPickedPlanId(plan.id)}
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
                        disabled={updateMutation.isPending}
                        onClick={() =>
                          updateMutation.mutate({
                            planId: plan.id,
                            payload: { status: 'active' },
                          })
                        }
                      >
                        {t('training.plans.activate', 'Activate')}
                      </Button>
                    )}
                    {plan.status === 'active' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={updateMutation.isPending}
                          onClick={() =>
                            updateMutation.mutate({
                              planId: plan.id,
                              payload: { status: 'draft' },
                            })
                          }
                        >
                          {t('training.plans.deactivate', 'Deactivate')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={adherenceMutation.isPending}
                          onClick={() =>
                            adherenceMutation.mutate({
                              plan_id: plan.id,
                              start_date: plan.start_date,
                              end_date: plan.target_date,
                            })
                          }
                        >
                          {t('training.plans.syncAdherence', 'Match activities')}
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('training.plans.delete', 'Delete plan')}
                      onClick={() => setPlanPendingDelete(plan)}
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
                      onClick={() => setPickedPlanId(plan.id)}
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
                  disabled={!selectedPlanId || exportMutation.isPending}
                  onClick={handleExport}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t('training.plans.export', 'Export JSON')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={importMutation.isPending}
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
                  onChange={handleImportFile}
                />
              </div>
            </CardContent>
          </Card>

          <ActivePlanDetailsCard
            plan={activePlanDetail}
            snapshot={snapshot}
            today={today}
            snapshotRefreshing={snapshotMutation.isPending}
            onRefreshSnapshot={() => {
              if (!activePlanSummary) return;
              snapshotMutation.mutate({
                planId: activePlanSummary.id,
                payload: {
                  as_of_date: today,
                  window_days: SNAPSHOT_WINDOW_DAYS,
                },
              });
            }}
            onOpenPlanTab={() => {
              if (activePlanSummary) setPickedPlanId(activePlanSummary.id);
              setActiveTab('plan');
            }}
          />

          <CreatePlanCard
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={(planId) => {
              setPickedPlanId(planId);
              setActiveTab('goals');
            }}
          />
        </TabsContent>

        <TabsContent value="goals" className="focus-visible:outline-none">
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
        </TabsContent>

        <TabsContent value="plan" className="focus-visible:outline-none">
          <TrainingPlanWorkspace
            planId={selectedPlanId}
            coachNotes={coachNotes}
            onCoachNotesChange={setCoachNotes}
            proposal={proposal}
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
