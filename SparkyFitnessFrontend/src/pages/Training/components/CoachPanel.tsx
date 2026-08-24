import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus, Send, Trash2 } from 'lucide-react';
import type { TrainingPlanProposeResponse } from '@workspace/shared';
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
  useCoachMemories,
  useCoachSession,
  useCoachSessions,
  useCreateCoachSessionMutation,
  useDeleteCoachMemoryMutation,
  useSendCoachMessageMutation,
  useUpsertCoachMemoryMutation,
} from '@/hooks/Training/useTrainingCoach';

interface CoachPanelProps {
  planId: string | undefined;
  /** Fired when the coach returns a plan proposal to review. */
  onPlanProposal?: (proposal: TrainingPlanProposeResponse) => void;
}

export default function CoachPanel({
  planId,
  onPlanProposal,
}: CoachPanelProps) {
  const { t } = useTranslation();

  const [pickedSessionId, setPickedSessionId] = useState<string | null>(null);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [memoryKey, setMemoryKey] = useState('');
  const [memoryValue, setMemoryValue] = useState('');

  const { data: sessions = [], isLoading: sessionsLoading } =
    useCoachSessions(planId);
  const { data: memories = [] } = useCoachMemories(planId);

  // Falls back to the newest open chat so the panel is useful on first open,
  // and recovers when the picked chat disappears from the list.
  const activeSessionId = useMemo(() => {
    const picked = sessions.find((session) => session.id === pickedSessionId);
    const firstOpen = sessions.find((session) => session.status === 'open');
    return (picked ?? firstOpen ?? sessions[0])?.id;
  }, [sessions, pickedSessionId]);

  const { data: sessionDetail, isLoading: threadLoading } = useCoachSession(
    planId,
    activeSessionId
  );

  const createSessionMutation = useCreateCoachSessionMutation();
  const sendMessageMutation = useSendCoachMessageMutation();
  const closeSessionMutation = useCloseCoachSessionMutation();
  const upsertMemoryMutation = useUpsertCoachMemoryMutation();
  const deleteMemoryMutation = useDeleteCoachMemoryMutation();

  const activeSession = sessionDetail?.session;
  const isClosed = activeSession?.status === 'closed';

  const handleCreateSession = async () => {
    if (!planId) return;
    const created = await createSessionMutation.mutateAsync({
      planId,
      payload: { title: newSessionTitle.trim() || null },
    });
    setNewSessionTitle('');
    setPickedSessionId(created.id);
  };

  const handleSend = async () => {
    if (!planId || !activeSessionId) return;
    const content = draft.trim();
    if (!content) return;
    const response = await sendMessageMutation.mutateAsync({
      planId,
      sessionId: activeSessionId,
      payload: { content },
    });
    setDraft('');
    if (response.plan_proposal) {
      onPlanProposal?.(response.plan_proposal);
    }
  };

  const handleAddMemory = async () => {
    if (!planId) return;
    await upsertMemoryMutation.mutateAsync({
      planId,
      payload: {
        memory_key: memoryKey.trim(),
        memory_value: memoryValue.trim(),
        source: 'user',
      },
    });
    setMemoryKey('');
    setMemoryValue('');
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

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
              {t('training.coachChat.sessionsTitle', 'Coach chats')}
            </CardTitle>
            <CardDescription>
              {t(
                'training.coachChat.sessionsDescription',
                'Report how training, recovery, and life are going. The coach uses your plan, workouts, wearables, and food diary — then may suggest plan changes you confirm on the Training plan tab.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessionsLoading && (
              <p className="text-sm text-muted-foreground">
                {t('training.coachChat.loadingSessions', 'Loading chats…')}
              </p>
            )}
            {!sessionsLoading && sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t(
                  'training.coachChat.noSessions',
                  'No chats yet. Start one to tell the coach how the block is going.'
                )}
              </p>
            )}
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-left ${
                  session.id === activeSessionId ? 'border-primary' : ''
                }`}
                onClick={() => setPickedSessionId(session.id)}
              >
                <span className="text-sm font-medium">
                  {session.title ||
                    t('training.coachChat.untitled', 'Coach check-in')}
                </span>
                <Badge variant="outline">
                  {t(
                    `training.coachChat.status.${session.status}`,
                    session.status
                  )}
                </Badge>
              </button>
            ))}

            <div className="space-y-2 border-t pt-3">
              <Label htmlFor="training-coach-new-title">
                {t('training.coachChat.newTitle', 'New chat title (optional)')}
              </Label>
              <Input
                id="training-coach-new-title"
                value={newSessionTitle}
                placeholder={t(
                  'training.coachChat.newTitlePlaceholder',
                  'Weekly check-in'
                )}
                onChange={(event) => setNewSessionTitle(event.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={createSessionMutation.isPending}
                onClick={handleCreateSession}
              >
                <MessageSquarePlus className="mr-2 h-4 w-4" />
                {t('training.coachChat.newSession', 'Start chat')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
              {t(
                'training.coachChat.memoriesTitle',
                'What the coach remembers'
              )}
            </CardTitle>
            <CardDescription>
              {t(
                'training.coachChat.memoriesDescription',
                'Durable facts the coach reuses in every chat, like injuries or schedule constraints.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {memories.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('training.coachChat.noMemories', 'Nothing remembered yet.')}
              </p>
            )}
            {memories.map((memory) => (
              <div
                key={memory.id}
                className="flex items-start justify-between gap-2 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{memory.memory_key}</p>
                  <p className="text-xs break-words text-muted-foreground">
                    {memory.memory_value}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t(
                    'training.coachChat.deleteMemory',
                    'Delete memory'
                  )}
                  disabled={deleteMemoryMutation.isPending}
                  onClick={() =>
                    deleteMemoryMutation.mutate({
                      planId,
                      memoryId: memory.id,
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <div className="space-y-2 border-t pt-3">
              <Label htmlFor="training-coach-memory-key">
                {t('training.coachChat.memoryKey', 'Label')}
              </Label>
              <Input
                id="training-coach-memory-key"
                value={memoryKey}
                placeholder={t(
                  'training.coachChat.memoryKeyPlaceholder',
                  'injury_history'
                )}
                onChange={(event) => setMemoryKey(event.target.value)}
              />
              <Label htmlFor="training-coach-memory-value">
                {t('training.coachChat.memoryValue', 'Detail')}
              </Label>
              <Textarea
                id="training-coach-memory-value"
                rows={2}
                value={memoryValue}
                placeholder={t(
                  'training.coachChat.memoryValuePlaceholder',
                  'Left knee flares up on back-to-back speed days'
                )}
                onChange={(event) => setMemoryValue(event.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={
                  memoryKey.trim().length === 0 ||
                  memoryValue.trim().length === 0 ||
                  upsertMemoryMutation.isPending
                }
                onClick={handleAddMemory}
              >
                {t('training.coachChat.addMemory', 'Add memory')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
            {activeSession?.title ||
              t('training.coachChat.threadTitle', 'Coach conversation')}
          </CardTitle>
          <CardDescription>
            {sessionDetail?.summary?.summary ||
              t(
                'training.coachChat.threadDescription',
                'Ask about load, niggles, or a session you want moved. The coach can propose plan changes for you to confirm.'
              )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!activeSessionId && (
            <p className="text-sm text-muted-foreground">
              {t(
                'training.coachChat.noActiveSession',
                'Start a chat to talk to the coach.'
              )}
            </p>
          )}
          {activeSessionId && threadLoading && (
            <p className="text-sm text-muted-foreground">
              {t('training.coachChat.loadingThread', 'Loading conversation…')}
            </p>
          )}
          {activeSessionId &&
            !threadLoading &&
            sessionDetail?.messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t(
                  'training.coachChat.emptyThread',
                  'No messages yet. Say what changed this week.'
                )}
              </p>
            )}

          <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
            {sessionDetail?.messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-md border p-3 ${
                  message.role === 'user'
                    ? 'border-primary/40 bg-primary/5'
                    : message.role === 'system'
                      ? 'border-dashed'
                      : ''
                }`}
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {t(
                    `training.coachChat.role.${message.role}`,
                    message.role === 'user'
                      ? 'You'
                      : message.role === 'assistant'
                        ? 'Coach'
                        : 'Context'
                  )}
                </p>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            ))}
          </div>

          {activeSessionId && (
            <div className="space-y-2 border-t pt-3">
              <Label htmlFor="training-coach-message">
                {t('training.coachChat.message', 'Message')}
              </Label>
              <Textarea
                id="training-coach-message"
                rows={3}
                value={draft}
                disabled={isClosed}
                placeholder={
                  isClosed
                    ? t(
                        'training.coachChat.closedPlaceholder',
                        'This chat is closed. Start a new one to keep talking.'
                      )
                    : t(
                        'training.coachChat.messagePlaceholder',
                        'e.g. I missed Tuesday intervals, calf was tight. What should this week look like?'
                      )
                }
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={
                    isClosed ||
                    draft.trim().length === 0 ||
                    sendMessageMutation.isPending
                  }
                  onClick={handleSend}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {sendMessageMutation.isPending
                    ? t('training.coachChat.sending', 'Coach is thinking…')
                    : t('training.coachChat.send', 'Send')}
                </Button>
                {!isClosed && (
                  <Button
                    variant="outline"
                    disabled={closeSessionMutation.isPending}
                    onClick={() =>
                      closeSessionMutation.mutate({
                        planId,
                        sessionId: activeSessionId,
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
