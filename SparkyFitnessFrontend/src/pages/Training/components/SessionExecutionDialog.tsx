import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TrainingSessionStatus } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useReportTrainingSessionExecutionMutation } from '@/hooks/Training/useTrainingPlans';

interface SessionExecutionDialogProps {
  planId: string | undefined;
  sessionId: string | null;
  sessionLabel?: string;
  onOpenChange: (open: boolean) => void;
}

export default function SessionExecutionDialog({
  planId,
  sessionId,
  sessionLabel,
  onOpenChange,
}: SessionExecutionDialogProps) {
  const { t } = useTranslation();
  const reportMutation = useReportTrainingSessionExecutionMutation();

  const [status, setStatus] = useState<'completed' | 'partial'>('completed');
  const [score, setScore] = useState('8');
  const [notes, setNotes] = useState('');
  const [requestAiReview, setRequestAiReview] = useState(true);

  const open = !!sessionId && !!planId;

  const handleSubmit = async () => {
    if (!planId || !sessionId) return;
    const parsedScore = Number(score);
    await reportMutation.mutateAsync({
      planId,
      sessionId,
      payload: {
        status: status as Extract<TrainingSessionStatus, 'completed' | 'partial'>,
        execution_score: Number.isFinite(parsedScore)
          ? Math.min(10, Math.max(0, Math.round(parsedScore)))
          : undefined,
        notes: notes.trim() || null,
        request_ai_review: requestAiReview,
      },
    });
    setNotes('');
    setScore('8');
    setStatus('completed');
    setRequestAiReview(true);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('training.execution.title', 'Log workout execution')}
          </DialogTitle>
          <DialogDescription>
            {sessionLabel
              ? t(
                  'training.execution.descriptionWithLabel',
                  'Tell the coach how {{label}} went. Garmin is optional.',
                  { label: sessionLabel }
                )
              : t(
                  'training.execution.description',
                  'Tell the coach how this workout went. Garmin is optional.'
                )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="execution-status">
              {t('training.execution.status', 'How did it go?')}
            </Label>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as 'completed' | 'partial')
              }
            >
              <SelectTrigger id="execution-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">
                  {t('training.execution.completed', 'Done')}
                </SelectItem>
                <SelectItem value="partial">
                  {t('training.execution.partial', 'Partially done')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="execution-score">
              {t('training.execution.score', 'Execution score (0–10)')}
            </Label>
            <Input
              id="execution-score"
              type="number"
              min={0}
              max={10}
              step={1}
              value={score}
              onChange={(event) => setScore(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="execution-notes">
              {t('training.execution.notes', 'Your notes')}
            </Label>
            <Textarea
              id="execution-notes"
              rows={3}
              value={notes}
              placeholder={t(
                'training.execution.notesPlaceholder',
                'e.g. forgot watch, felt strong in Z2, cut last interval short'
              )}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requestAiReview}
              onChange={(event) => setRequestAiReview(event.target.checked)}
            />
            {t(
              'training.execution.requestAiReview',
              'Ask AI to review (uses Garmin when matched, otherwise your notes)'
            )}
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            disabled={reportMutation.isPending}
            onClick={handleSubmit}
          >
            {reportMutation.isPending
              ? t('training.execution.saving', 'Saving…')
              : t('training.execution.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
