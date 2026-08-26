import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus, Send } from 'lucide-react';
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
  useCloseNutritionCoachSessionMutation,
  useCreateNutritionCoachSessionMutation,
  useNutritionCoachSession,
  useNutritionCoachSessions,
  useSendNutritionCoachMessageMutation,
} from '@/hooks/Training/useNutritionCoach';
import NutritionCoachMemoriesSidebar from './NutritionCoachMemoriesSidebar';

interface NutritionCoachPanelProps {
  activePlanId: string | undefined;
}

export default function NutritionCoachPanel({
  activePlanId,
}: NutritionCoachPanelProps) {
  const { t } = useTranslation();
  const [pickedSessionId, setPickedSessionId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [draft, setDraft] = useState('');

  const { data: sessions = [], isLoading: sessionsLoading } =
    useNutritionCoachSessions();

  const activeSessionId = useMemo(() => {
    if (pickedSessionId && sessions.some((s) => s.id === pickedSessionId)) {
      return pickedSessionId;
    }
    return sessions[0]?.id ?? null;
  }, [sessions, pickedSessionId]);

  const { data: detail, isLoading: threadLoading } =
    useNutritionCoachSession(activeSessionId ?? undefined);

  const createMutation = useCreateNutritionCoachSessionMutation();
  const sendMutation = useSendNutritionCoachMessageMutation();
  const closeMutation = useCloseNutritionCoachSessionMutation();

  const sessionClosed = detail?.session.status === 'closed';
  const isBusy = sendMutation.isPending || closeMutation.isPending;

  const handleStart = async () => {
    const created = await createMutation.mutateAsync({
      title: newTitle.trim() || null,
      ...(activePlanId ? { plan_id: activePlanId } : {}),
    });
    setNewTitle('');
    setPickedSessionId(created.id);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !activeSessionId || sessionClosed) return;
    await sendMutation.mutateAsync({
      sessionId: activeSessionId,
      payload: { content: text },
    });
    setDraft('');
  };

  const handleClose = async () => {
    if (!activeSessionId || sessionClosed) return;
    await closeMutation.mutateAsync({ sessionId: activeSessionId });
  };

  const messages = detail?.messages ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(15rem,17rem)_minmax(0,1fr)] xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold">
              {t('training.nutritionCoach.sessionsTitle', 'Check-ins')}
            </CardTitle>
            <CardDescription className="text-xs">
              {t(
                'training.nutritionCoach.sessionsDescription',
                'Weekly nutrition conversations. Close a check-in to track progress next time.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessionsLoading && (
              <p className="text-sm text-muted-foreground">
                {t('training.nutritionCoach.loadingSessions', 'Loading…')}
              </p>
            )}
            {!sessionsLoading && sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t(
                  'training.nutritionCoach.noSessions',
                  'No check-ins yet. Start one to review how you eat vs your training.'
                )}
              </p>
            )}
            <div className="max-h-52 space-y-2 overflow-y-auto">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`flex w-full flex-col gap-1 rounded-md border p-2.5 text-left ${
                    session.id === activeSessionId ? 'border-primary' : ''
                  }`}
                  onClick={() => setPickedSessionId(session.id)}
                >
                  <span className="text-sm font-medium">
                    {session.title ||
                      t(
                        'training.nutritionCoach.untitled',
                        'Nutrition check-in'
                      )}
                  </span>
                  <Badge variant="outline" className="w-fit text-xs">
                    {t(
                      `training.nutritionCoach.status.${session.status}`,
                      session.status
                    )}
                  </Badge>
                </button>
              ))}
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label htmlFor="nutrition-coach-title" className="text-xs">
                {t('training.nutritionCoach.newTitle', 'Title (optional)')}
              </Label>
              <Input
                id="nutrition-coach-title"
                className="h-8"
                value={newTitle}
                placeholder={t(
                  'training.nutritionCoach.newTitlePlaceholder',
                  'Weekly nutrition review'
                )}
                onChange={(event) => setNewTitle(event.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full"
                disabled={createMutation.isPending}
                onClick={() => void handleStart()}
              >
                <MessageSquarePlus className="mr-2 h-4 w-4" />
                {t('training.nutritionCoach.newSession', 'New check-in')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <NutritionCoachMemoriesSidebar />
          </CardContent>
        </Card>
      </div>

      <Card className="min-h-[min(720px,75vh)]">
        <CardHeader>
          <CardTitle className="text-lg font-bold">
            {t('training.nutritionCoach.threadTitle', 'Conversation')}
          </CardTitle>
          <CardDescription>
            {t(
              'training.nutritionCoach.threadDescription',
              'Ask for honest feedback on patterns, timing, and consistency — not meal plans.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-[min(560px,65vh)] flex-col gap-4">
          {!activeSessionId && (
            <p className="text-sm text-muted-foreground">
              {t(
                'training.nutritionCoach.noActiveSession',
                'Start a check-in to talk to the nutrition coach.'
              )}
            </p>
          )}
          {activeSessionId && threadLoading && (
            <p className="text-sm text-muted-foreground">
              {t('training.nutritionCoach.loadingThread', 'Loading…')}
            </p>
          )}
          {activeSessionId && !threadLoading && messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t(
                'training.nutritionCoach.emptyThread',
                'Describe what you want critiqued — logging gaps, late eating, fueling around long runs, etc.'
              )}
            </p>
          )}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-md border p-3 text-sm ${
                  message.role === 'user' ? 'bg-muted/40' : ''
                }`}
              >
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t(
                    `training.nutritionCoach.role.${message.role}`,
                    message.role
                  )}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            ))}
          </div>

          <div className="mt-auto space-y-2 border-t pt-4">
            <Label htmlFor="nutrition-coach-message">
              {t('training.nutritionCoach.message', 'Message')}
            </Label>
            <Textarea
              id="nutrition-coach-message"
              value={draft}
              rows={4}
              disabled={!activeSessionId || sessionClosed || isBusy}
              placeholder={
                sessionClosed
                  ? t(
                      'training.nutritionCoach.closedPlaceholder',
                      'This check-in is closed. Start a new one to continue.'
                    )
                  : t(
                      'training.nutritionCoach.messagePlaceholder',
                      'e.g. I have been skipping breakfast on run days — be blunt about whether my diary supports that.'
                    )
              }
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={
                  !activeSessionId || sessionClosed || isBusy || !draft.trim()
                }
                onClick={() => void handleSend()}
              >
                <Send className="mr-2 h-4 w-4" />
                {sendMutation.isPending
                  ? t('training.nutritionCoach.sending', 'Thinking…')
                  : t('training.nutritionCoach.send', 'Send')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!activeSessionId || sessionClosed || isBusy}
                onClick={() => void handleClose()}
              >
                {t('training.nutritionCoach.close', 'Close check-in')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
