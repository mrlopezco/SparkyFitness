import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSkipTrainingSessionMutation } from '@/hooks/Training/useTrainingPlans';

interface SkipSessionDialogProps {
  planId: string | undefined;
  sessionId: string | null;
  /** Shown in the dialog body so the user knows which day they are skipping. */
  sessionLabel?: string;
  onOpenChange: (open: boolean) => void;
}

export default function SkipSessionDialog({
  planId,
  sessionId,
  sessionLabel,
  onOpenChange,
}: SkipSessionDialogProps) {
  const { t } = useTranslation();
  const skipMutation = useSkipTrainingSessionMutation();
  const [reason, setReason] = useState('');

  const open = !!sessionId && !!planId;

  const handleOpenChange = (next: boolean) => {
    if (!next) setReason('');
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    if (!planId || !sessionId) return;
    await skipMutation.mutateAsync({
      planId,
      sessionId,
      reason: reason.trim(),
    });
    setReason('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('training.skip.title', 'Skip this session')}
          </DialogTitle>
          <DialogDescription>
            {sessionLabel
              ? t(
                  'training.skip.descriptionWithSession',
                  'Tell the coach why {{session}} did not happen. It uses the reason when it adjusts the rest of the block.',
                  { session: sessionLabel }
                )
              : t(
                  'training.skip.description',
                  'Tell the coach why this session did not happen. It uses the reason when it adjusts the rest of the block.'
                )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="training-skip-reason">
            {t('training.skip.reason', 'Reason')}
          </Label>
          <Textarea
            id="training-skip-reason"
            rows={3}
            value={reason}
            placeholder={t(
              'training.skip.reasonPlaceholder',
              'e.g. calf was tight after the long run, took a rest day instead'
            )}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('training.skip.cancel', 'Cancel')}
          </Button>
          <Button
            disabled={reason.trim().length === 0 || skipMutation.isPending}
            onClick={handleConfirm}
          >
            {skipMutation.isPending
              ? t('training.skip.saving', 'Saving…')
              : t('training.skip.confirm', 'Mark skipped')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
