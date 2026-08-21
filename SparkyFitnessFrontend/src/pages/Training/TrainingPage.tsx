import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Flag,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Target,
  Timer,
  Trash2,
} from 'lucide-react';
import {
  todayInZone,
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
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateAthleteSnapshotMutation,
  useDeleteTrainingPlanMutation,
  useLatestAthleteSnapshot,
  useMatchTrainingAdherenceMutation,
  useProposeTrainingPlanMutation,
  useTrainingPlanDetail,
  useTrainingPlans,
  useUpdateTrainingPlanMutation,
} from '@/hooks/Training/useTrainingPlans';
import { useFitnessTests } from '@/hooks/Training/useFitnessTests';
import AdjustPlanButton from './components/AdjustPlanButton';
import CoachPanel from './components/CoachPanel';
import CreatePlanCard from './components/CreatePlanCard';
import FitnessSnapshotCard from './components/FitnessSnapshotCard';
import FitnessTestsPanel from './components/FitnessTestsPanel';
import GoalsCommitmentsEditor from './components/GoalsCommitmentsEditor';
import PlanReviewDialog from './components/PlanReviewDialog';
import TrainingCalendarView from './components/TrainingCalendarView';
import { GOAL_TYPE_LABELS, SPORT_FOCUS_LABELS } from './trainingConstants';

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
    id: 'calendar',
    labelKey: 'training.tabs.calendar',
    labelDefault: 'Calendar',
    icon: CalendarDays,
  },
  {
    id: 'coach',
    labelKey: 'training.tabs.coach',
    labelDefault: 'Coach',
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

  const [activeTab, setActiveTab] = useState<TrainingTabId>('overview');
  const [pickedPlanId, setPickedPlanId] = useState<string | null>(null);
  const [coachNotes, setCoachNotes] = useState('');
  const [proposal, setProposal] = useState<TrainingPlanProposeResponse | null>(
    null
  );
  const [planPendingDelete, setPlanPendingDelete] =
    useState<TrainingPlan | null>(null);

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

  // Falls back to the first current plan so the page is useful before the user
  // picks one, and recovers when the picked plan disappears (deleted elsewhere).
  const selectedPlan = useMemo(() => {
    const picked = plans.find((plan) => plan.id === pickedPlanId);
    return picked ?? currentPlans[0] ?? plans[0];
  }, [plans, currentPlans, pickedPlanId]);
  const selectedPlanId = selectedPlan?.id;

  const { data: planDetail } = useTrainingPlanDetail(selectedPlanId);
  const { data: snapshot } = useLatestAthleteSnapshot(selectedPlanId);
  const { data: fitnessTests = [] } = useFitnessTests(selectedPlanId);

  const proposeMutation = useProposeTrainingPlanMutation();
  const updateMutation = useUpdateTrainingPlanMutation();
  const deleteMutation = useDeleteTrainingPlanMutation();
  const snapshotMutation = useCreateAthleteSnapshotMutation();
  const adherenceMutation = useMatchTrainingAdherenceMutation();

  const handleGenerate = async () => {
    if (!selectedPlanId) return;
    const response = await proposeMutation.mutateAsync({
      plan_id: selectedPlanId,
      user_notes: coachNotes.trim() || undefined,
      replace_existing: true,
    });
    setProposal(response);
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
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
                  {t('training.plans.title', 'Your plans')}
                </CardTitle>
                <CardDescription className="mt-1.5">
                  {t(
                    'training.plans.description',
                    'Pick the plan the goals editor and calendar should follow.'
                  )}
                </CardDescription>
              </div>
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
                    'No training plans yet. Create one below.'
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
            </CardContent>
          </Card>

          {selectedPlan && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
                  {t('training.progress.title', 'Goal progress')}
                </CardTitle>
                <CardDescription>
                  {t(
                    'training.progress.description',
                    'Progress tracking arrives with the coach review; goals and targets are shown here for now.'
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(planDetail?.goals.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t(
                      'training.progress.empty',
                      'No goals yet — add them in the Goals & commitments tab.'
                    )}
                  </p>
                )}
                {planDetail?.goals.map((goal) => (
                  <div
                    key={goal.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <div>
                      <h4 className="font-semibold">{goal.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {t(
                          `training.goalType.${goal.type}`,
                          GOAL_TYPE_LABELS[goal.type]
                        )}
                        {goal.target_date ? ` · ${goal.target_date}` : ''}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {t('training.progress.pending', 'Tracking soon')}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {selectedPlan && (
            <FitnessSnapshotCard snapshot={snapshot} tests={fitnessTests} />
          )}

          {selectedPlan && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
                  {t('training.coach.title', 'AI coach')}
                </CardTitle>
                <CardDescription>
                  {t(
                    'training.coach.description',
                    'Draft sessions for this plan from your recent training, goals and commitments. Nothing is saved until you confirm.'
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <h4 className="font-semibold">
                      {t('training.snapshot.title', 'Athlete snapshot')}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {snapshot
                        ? t(
                            'training.snapshot.summary',
                            'As of {{date}} · {{sessions}} sessions · {{distance}} km',
                            {
                              date: snapshot.as_of_date,
                              sessions:
                                snapshot.payload.running?.session_count ?? 0,
                              distance:
                                snapshot.payload.running?.total_distance_km ??
                                0,
                            }
                          )
                        : t(
                            'training.snapshot.none',
                            'No snapshot yet. Build one so the coach can see your recent load.'
                          )}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={snapshotMutation.isPending}
                    onClick={() =>
                      snapshotMutation.mutate({
                        planId: selectedPlan.id,
                        payload: {
                          as_of_date: today,
                          window_days: SNAPSHOT_WINDOW_DAYS,
                        },
                      })
                    }
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('training.snapshot.refresh', 'Refresh snapshot')}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="training-coach-notes">
                    {t('training.coach.notes', 'Notes for the coach')}
                  </Label>
                  <Textarea
                    id="training-coach-notes"
                    rows={3}
                    value={coachNotes}
                    placeholder={t(
                      'training.coach.notesPlaceholder',
                      'e.g. keep long runs on Sunday, no doubles, knee is sensitive to speed work'
                    )}
                    onChange={(event) => setCoachNotes(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={proposeMutation.isPending}
                    onClick={handleGenerate}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {proposeMutation.isPending
                      ? t('training.coach.generating', 'Drafting plan…')
                      : t('training.coach.generate', 'Generate plan')}
                  </Button>
                  <AdjustPlanButton
                    planId={selectedPlan.id}
                    userNotes={coachNotes}
                    onProposal={setProposal}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'training.adjust.description',
                    'Adjusting keeps your goals and reads what you actually did, then reworks the remaining sessions.'
                  )}
                </p>
              </CardContent>
            </Card>
          )}

          <CreatePlanCard onCreated={setPickedPlanId} />
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

        <TabsContent value="calendar" className="focus-visible:outline-none">
          <TrainingCalendarView planId={selectedPlanId} />
        </TabsContent>

        <TabsContent value="coach" className="focus-visible:outline-none">
          <CoachPanel planId={selectedPlanId} />
        </TabsContent>

        <TabsContent
          value="fitnessTests"
          className="focus-visible:outline-none"
        >
          <FitnessTestsPanel planId={selectedPlanId} />
        </TabsContent>
      </Tabs>

      <PlanReviewDialog
        proposal={proposal}
        replaceExisting
        onReject={() => setProposal(null)}
        onConfirmed={() => setProposal(null)}
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
