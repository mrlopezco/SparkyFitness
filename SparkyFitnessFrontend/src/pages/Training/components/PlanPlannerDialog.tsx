import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileCheck, Send, Sparkles } from 'lucide-react';
import type {
  TrainingPlanPlannerMessage,
  TrainingPlanPlannerSessionDetail,
  TrainingPlanProposeResponse,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useCancelPlannerSessionMutation,
  useDraftPlannerSessionMutation,
  useSendPlannerMessageMutation,
} from '@/hooks/Training/useTrainingPlanPlanner';

interface PlanPlannerDialogProps {
  planId: string;
  open: boolean;
  detail: TrainingPlanPlannerSessionDetail | null;
  onOpenChange: (open: boolean) => void;
  onProposal: (
    proposal: TrainingPlanProposeResponse,
    sessionId: string
  ) => void;
}

export default function PlanPlannerDialog({
  planId,
  open,
  detail,
  onOpenChange,
  onProposal,
}: PlanPlannerDialogProps) {
  const { t } = useTranslation();
  const sendMutation = useSendPlannerMessageMutation();
  const draftMutation = useDraftPlannerSessionMutation();
  const cancelMutation = useCancelPlannerSessionMutation();

  const [messages, setMessages] = useState<TrainingPlanPlannerMessage[]>([]);
  const [readyForDraft, setReadyForDraft] = useState(false);
  const [adjustWindow, setAdjustWindow] = useState<{
    from?: string;
    to?: string;
  }>({});
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (detail) {
      setMessages(detail.messages);
      setReadyForDraft(false);
      setAdjustWindow({
        from: detail.session.adjust_from ?? undefined,
        to: detail.session.adjust_to ?? undefined,
      });
      setDraft('');
    }
  }, [detail]);

  const sessionId = detail?.session.id;
  const mode = detail?.session.mode;
  const isBusy =
    sendMutation.isPending || draftMutation.isPending || cancelMutation.isPending;
  const hasUserMessage = messages.some((message) => message.role === 'user');

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && sessionId && detail?.session.status === 'active') {
      cancelMutation.mutate({ planId, sessionId });
    }
    onOpenChange(nextOpen);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !sessionId || isBusy) return;
    setDraft('');

    const response = await sendMutation.mutateAsync({
      planId,
      sessionId,
      payload: { content: text },
    });

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: response.reply },
    ]);
    setReadyForDraft(response.ready_for_draft);
    if (response.adjust_from || response.adjust_to) {
      setAdjustWindow({
        from: response.adjust_from,
        to: response.adjust_to,
      });
    }
  };

  const handleDraft = async () => {
    if (!sessionId || !hasUserMessage || isBusy) return;
    const proposal = await draftMutation.mutateAsync({
      planId,
      sessionId,
      payload: { replace_existing: true },
    });
    onOpenChange(false);
    onProposal(proposal, sessionId);
  };

  const title =
    mode === 'adjust'
      ? t('training.planner.dialogAdjust', 'Change plan')
      : t('training.planner.dialogGenerate', 'Generate plan');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t(
              'training.planner.dialogDescription',
              'Discuss what you need, then draft sessions to review on the Training plan tab.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {readyForDraft && (
            <Badge variant="secondary">
              {t('training.planner.readyBadge', 'Ready to draft')}
            </Badge>
          )}
          {mode === 'adjust' && adjustWindow.from && adjustWindow.to && (
            <Badge variant="outline">
              {t('training.planner.window', 'Window {{from}} → {{to}}', {
                from: adjustWindow.from,
                to: adjustWindow.to,
              })}
            </Badge>
          )}
        </div>

        <div className="min-h-[200px] flex-1 space-y-3 overflow-y-auto rounded-md border p-3">
          {messages.map((message, index) => (
            <div
              key={`${message.id ?? message.role}-${index}`}
              className={`rounded-md border p-3 ${
                message.role === 'user'
                  ? 'border-primary/40 bg-primary/5'
                  : ''
              }`}
            >
              <p className="text-xs font-medium text-muted-foreground">
                {message.role === 'user'
                  ? t('training.planner.roleYou', 'You')
                  : t('training.planner.rolePlanner', 'Planner')}
              </p>
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="training-planner-dialog-message">
            {t('training.planner.message', 'Your message')}
          </Label>
          <Textarea
            id="training-planner-dialog-message"
            rows={3}
            value={draft}
            disabled={isBusy}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={draft.trim().length === 0 || isBusy}
              onClick={handleSend}
            >
              <Send className="mr-2 h-4 w-4" />
              {sendMutation.isPending
                ? t('training.planner.thinking', 'Planner is thinking…')
                : t('training.planner.send', 'Send')}
            </Button>
            <Button
              variant={readyForDraft ? 'default' : 'outline'}
              disabled={!hasUserMessage || isBusy}
              onClick={handleDraft}
            >
              {draftMutation.isPending ? (
                <>
                  <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                  {t('training.planner.drafting', 'Drafting sessions…')}
                </>
              ) : (
                <>
                  <FileCheck className="mr-2 h-4 w-4" />
                  {t('training.planner.draftProposal', 'Draft proposal')}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
