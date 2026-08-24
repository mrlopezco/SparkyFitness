import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileCheck,
  MessageSquarePlus,
  Send,
  Sparkles,
} from 'lucide-react';
import type {
  TrainingPlanPlannerMode,
  TrainingPlanProposeResponse,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  useCloseCoachSessionMutation,
  useCoachSession,
  useCoachSessions,
  useCreateCoachSessionMutation,
  useSendCoachMessageMutation,
} from '@/hooks/Training/useTrainingCoach';
import {
  useCreatePlannerSessionMutation,
  useDraftPlannerSessionMutation,
  usePlannerSessionDetail,
  usePlannerSessions,
  useSendPlannerMessageMutation,
} from '@/hooks/Training/useTrainingPlanPlanner';

type ThreadKind = 'coach' | 'planner';

interface ThreadRef {
  kind: ThreadKind;
  id: string;
  updatedAt: string;
  label: string;
  badge: string;
}

interface TrainingAiChatsPanelProps {
  planId: string | undefined;
  onPlanProposal?: (
    proposal: TrainingPlanProposeResponse,
    plannerSessionId?: string
  ) => void;
}

function threadKey(ref: ThreadRef): string {
  return `${ref.kind}:${ref.id}`;
}

export default function TrainingAiChatsPanel({
  planId,
  onPlanProposal,
}: TrainingAiChatsPanelProps) {
  const { t } = useTranslation();

  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [coachTitle, setCoachTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [readyForDraft, setReadyForDraft] = useState(false);
  const [adjustWindow, setAdjustWindow] = useState<{
    from?: string;
    to?: string;
  }>({});

  const { data: coachSessions = [], isLoading: coachLoading } =
    useCoachSessions(planId);
  const { data: plannerSessions = [], isLoading: plannerLoading } =
    usePlannerSessions(planId);

  const threads = useMemo((): ThreadRef[] => {
    const coach: ThreadRef[] = coachSessions.map((session) => ({
      kind: 'coach',
      id: session.id,
      updatedAt: session.updated_at,
      label:
        session.title ||
        t('training.coachChat.untitled', 'Coach check-in'),
      badge: t(`training.coachChat.status.${session.status}`, session.status),
    }));
    const planner: ThreadRef[] = plannerSessions
      .filter((session) => session.status !== 'cancelled')
      .map((session) => ({
        kind: 'planner',
        id: session.id,
        updatedAt: session.updated_at,
        label:
          session.mode === 'generate'
            ? t('training.planner.modeGenerate', 'Generate plan')
            : t('training.planner.modeAdjust', 'Change plan'),
        badge:
          session.status === 'active'
            ? t('training.aiChats.inProgress', 'In progress')
            : t('training.aiChats.confirmed', 'Confirmed'),
      }));
    return [...coach, ...planner].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [coachSessions, plannerSessions, t]);

  const activeThread = useMemo(() => {
    if (pickedKey) {
      const found = threads.find((thread) => threadKey(thread) === pickedKey);
      if (found) return found;
    }
    return threads[0] ?? null;
  }, [threads, pickedKey]);

  const activeKey = activeThread ? threadKey(activeThread) : null;

  const { data: coachDetail, isLoading: coachThreadLoading } = useCoachSession(
    planId,
    activeThread?.kind === 'coach' ? activeThread.id : undefined
  );

  const { data: plannerDetail, isLoading: plannerThreadLoading } =
    usePlannerSessionDetail(
      planId,
      activeThread?.kind === 'planner' ? activeThread.id : undefined
    );

  const createCoachMutation = useCreateCoachSessionMutation();
  const createPlannerMutation = useCreatePlannerSessionMutation();
  const sendCoachMutation = useSendCoachMessageMutation();
  const sendPlannerMutation = useSendPlannerMessageMutation();
  const draftPlannerMutation = useDraftPlannerSessionMutation();
  const closeCoachMutation = useCloseCoachSessionMutation();

  const plannerSession = plannerDetail?.session;
  const plannerReadOnly =
    plannerSession?.status === 'confirmed' ||
    plannerSession?.status === 'cancelled';
  const coachClosed = coachDetail?.session.status === 'closed';
  const isBusy =
    sendCoachMutation.isPending ||
    sendPlannerMutation.isPending ||
    draftPlannerMutation.isPending;

  const handleStartCoach = async () => {
    if (!planId) return;
    const created = await createCoachMutation.mutateAsync({
      planId,
      payload: { title: coachTitle.trim() || null },
    });
    setCoachTitle('');
    setPickedKey(`coach:${created.id}`);
  };

  const handleStartPlanner = async (mode: TrainingPlanPlannerMode) => {
    if (!planId) return;
    const detail = await createPlannerMutation.mutateAsync({
      planId,
      payload: { mode },
    });
    setPickedKey(`planner:${detail.session.id}`);
    setReadyForDraft(false);
    setAdjustWindow({});
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !planId || !activeThread) return;

    if (activeThread.kind === 'coach') {
      const response = await sendCoachMutation.mutateAsync({
        planId,
        sessionId: activeThread.id,
        payload: { content: text },
      });
      setDraft('');
      if (response.plan_proposal) {
        onPlanProposal?.(response.plan_proposal);
      }
      return;
    }

    const response = await sendPlannerMutation.mutateAsync({
      planId,
      sessionId: activeThread.id,
      payload: { content: text },
    });
    setDraft('');
    setReadyForDraft(response.ready_for_draft);
    if (response.adjust_from || response.adjust_to) {
      setAdjustWindow({
        from: response.adjust_from,
        to: response.adjust_to,
      });
    }
  };

  const handleDraftPlanner = async () => {
    if (!planId || activeThread?.kind !== 'planner') return;
    const proposal = await draftPlannerMutation.mutateAsync({
      planId,
      sessionId: activeThread.id,
      payload: { replace_existing: true },
    });
    onPlanProposal?.(proposal, activeThread.id);
  };

  if (!planId) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-center text-sm italic text-muted-foreground">
            {t(
              'training.coachChat.selectPlan',
              'Select or create a plan first.'
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  const messages =
    activeThread?.kind === 'coach'
      ? (coachDetail?.messages ?? [])
      : (plannerDetail?.messages ?? []);

  const threadLoading =
    activeThread?.kind === 'coach'
      ? coachThreadLoading
      : plannerThreadLoading;

  const inputDisabled =
    !activeThread ||
    isBusy ||
    (activeThread.kind === 'coach' && coachClosed) ||
    (activeThread.kind === 'planner' && plannerReadOnly);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(14rem,20rem)_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">
            {t('training.aiChats.historyTitle', 'Conversations')}
          </CardTitle>
          <CardDescription>
            {t(
              'training.aiChats.historyDescription',
              'Coach check-ins and plan generate/change threads. Pick one to continue.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(coachLoading || plannerLoading) && (
            <p className="text-sm text-muted-foreground">
              {t('training.aiChats.loading', 'Loading…')}
            </p>
          )}
          {!coachLoading && !plannerLoading && threads.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t(
                'training.aiChats.empty',
                'No conversations yet. Start one below.'
              )}
            </p>
          )}
          {threads.map((thread) => (
            <button
              key={threadKey(thread)}
              type="button"
              className={`flex w-full flex-col gap-1 rounded-md border p-3 text-left ${
                threadKey(thread) === activeKey ? 'border-primary' : ''
              }`}
              onClick={() => setPickedKey(threadKey(thread))}
            >
              <span className="text-sm font-medium">{thread.label}</span>
              <Badge variant="outline" className="w-fit text-xs">
                {thread.kind === 'coach'
                  ? t('training.aiChats.agentCoach', 'Coach')
                  : t('training.aiChats.agentPlanner', 'Planner')}
                {' · '}
                {thread.badge}
              </Badge>
            </button>
          ))}

          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t('training.aiChats.startNew', 'Start new')}
            </p>
            <Input
              value={coachTitle}
              placeholder={t(
                'training.coachChat.newTitlePlaceholder',
                'Weekly check-in'
              )}
              onChange={(event) => setCoachTitle(event.target.value)}
            />
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={createCoachMutation.isPending}
                onClick={() => void handleStartCoach()}
              >
                <MessageSquarePlus className="mr-2 h-4 w-4" />
                {t('training.aiChats.newCoach', 'Coach chat')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={createPlannerMutation.isPending}
                onClick={() => void handleStartPlanner('generate')}
              >
                <MessageSquarePlus className="mr-2 h-4 w-4" />
                {t('training.planner.modeGenerate', 'Generate plan')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={createPlannerMutation.isPending}
                onClick={() => void handleStartPlanner('adjust')}
              >
                <MessageSquarePlus className="mr-2 h-4 w-4" />
                {t('training.planner.modeAdjust', 'Change plan')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
            {activeThread?.label ??
              t('training.aiChats.selectThread', 'Select a conversation')}
          </CardTitle>
          <CardDescription>
            {activeThread?.kind === 'planner' && plannerSession?.summary
              ? plannerSession.summary
              : coachDetail?.summary?.summary ||
                t(
                  'training.aiChats.threadHint',
                  'Messages stay saved — close the tab and come back anytime.'
                )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!activeThread && (
            <p className="text-sm text-muted-foreground">
              {t(
                'training.aiChats.pickOrStart',
                'Pick a thread from the list or start a new one.'
              )}
            </p>
          )}

          {activeThread?.kind === 'planner' && (
            <div className="flex flex-wrap gap-2">
              {readyForDraft && !plannerReadOnly && (
                <Badge variant="secondary">
                  {t('training.planner.readyBadge', 'Ready to draft')}
                </Badge>
              )}
              {plannerSession?.adjust_from && plannerSession.adjust_to && (
                <Badge variant="outline">
                  {plannerSession.adjust_from} → {plannerSession.adjust_to}
                </Badge>
              )}
            </div>
          )}

          {activeThread && threadLoading && (
            <p className="text-sm text-muted-foreground">
              {t('training.coachChat.loadingThread', 'Loading conversation…')}
            </p>
          )}

          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {messages.map((message, index) => (
              <div
                key={'id' in message && message.id ? message.id : index}
                className={`rounded-md border p-3 ${
                  message.role === 'user'
                    ? 'border-primary/40 bg-primary/5'
                    : ''
                }`}
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {message.role === 'user'
                    ? t('training.planner.roleYou', 'You')
                    : activeThread?.kind === 'coach'
                      ? t('training.coachChat.role.assistant', 'Coach')
                      : t('training.planner.rolePlanner', 'Planner')}
                </p>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            ))}
          </div>

          {activeThread && (
            <div className="space-y-2 border-t pt-3">
              <Label htmlFor="training-ai-chat-message">
                {t('training.planner.message', 'Your message')}
              </Label>
              <Textarea
                id="training-ai-chat-message"
                rows={3}
                value={draft}
                disabled={inputDisabled}
                placeholder={
                  plannerReadOnly
                    ? t(
                        'training.aiChats.plannerClosed',
                        'This planning thread is finished. Start a new one to change the plan again.'
                      )
                    : coachClosed
                      ? t(
                          'training.coachChat.closedPlaceholder',
                          'This chat is closed. Start a new one to keep talking.'
                        )
                      : t(
                          'training.coachChat.messagePlaceholder',
                          'Type your update…'
                        )
                }
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={inputDisabled || draft.trim().length === 0}
                  onClick={() => void handleSend()}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {isBusy
                    ? t('training.planner.thinking', 'Thinking…')
                    : t('training.planner.send', 'Send')}
                </Button>
                {activeThread.kind === 'planner' && !plannerReadOnly && (
                  <Button
                    variant={readyForDraft ? 'default' : 'outline'}
                    disabled={
                      inputDisabled ||
                      !messages.some((message) => message.role === 'user')
                    }
                    onClick={() => void handleDraftPlanner()}
                  >
                    {draftPlannerMutation.isPending ? (
                      <>
                        <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                        {t('training.planner.drafting', 'Drafting sessions…')}
                      </>
                    ) : (
                      <>
                        <FileCheck className="mr-2 h-4 w-4" />
                        {t(
                          'training.planner.draftProposal',
                          'Draft proposal'
                        )}
                      </>
                    )}
                  </Button>
                )}
                {activeThread.kind === 'coach' && !coachClosed && (
                  <Button
                    variant="outline"
                    disabled={closeCoachMutation.isPending}
                    onClick={() =>
                      closeCoachMutation.mutate({
                        planId,
                        sessionId: activeThread.id,
                      })
                    }
                  >
                    {t('training.coachChat.close', 'Close chat')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
