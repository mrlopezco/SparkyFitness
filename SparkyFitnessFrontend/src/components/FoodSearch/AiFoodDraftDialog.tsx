import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AiMealLogProposedItem } from '@workspace/shared';
import { todayInZone } from '@workspace/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles } from 'lucide-react';
import { AI_BUTTON_CLASS, AI_ICON_CLASS } from '@/components/ai/aiAccent';
import {
  useActiveAIService,
  useAIServices,
} from '@/hooks/AI/useAIServiceSettings';
import { useAnalyzeAiMealLogMutation } from '@/hooks/Diary/useAiMealLog';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';

export interface AiFoodDraftResult {
  name: string;
  brand?: string | null;
  serving_size: number;
  serving_unit: string;
  nutrients: AiMealLogProposedItem['nutrients'];
  source: 'ai_estimate' | 'imported';
  warning?: string | null;
}

interface AiFoodDraftDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (draft: AiFoodDraftResult) => void;
}

function proposedItemToDraft(item: AiMealLogProposedItem): AiFoodDraftResult {
  const isEstimate = item.source === 'ai_estimate';
  const servingSize =
    (!isEstimate && item.serving_size && item.serving_size > 0
      ? item.serving_size
      : item.quantity) || 100;
  const servingUnit =
    (!isEstimate && item.serving_unit
      ? item.serving_unit
      : item.unit) || 'g';

  return {
    name: item.name,
    brand: item.brand ?? null,
    serving_size: servingSize,
    serving_unit: servingUnit,
    nutrients: item.nutrients,
    source: isEstimate ? 'ai_estimate' : 'imported',
    warning: item.warning ?? null,
  };
}

const AiFoodDraftDialog = ({
  isOpen,
  onClose,
  onApply,
}: AiFoodDraftDialogProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { timezone } = usePreferences();
  const activeQuery = useActiveAIService(isOpen && !!user);
  const servicesQuery = useAIServices();
  const analyzeMutation = useAnalyzeAiMealLogMutation();

  const [text, setText] = useState('');

  const enabledServices = useMemo(
    () => (servicesQuery.data ?? []).filter((service) => service.is_active),
    [servicesQuery.data]
  );
  const inactiveOnly =
    (servicesQuery.data?.length ?? 0) > 0 && enabledServices.length === 0;
  const resolvedService = activeQuery.data ?? enabledServices[0] ?? null;
  const isAiStatusLoading =
    (isOpen && !!user && activeQuery.isLoading) ||
    (servicesQuery.isLoading && !servicesQuery.data);
  const hasAi = Boolean(resolvedService);
  const isBusy = analyzeMutation.isPending;

  useEffect(() => {
    if (!isOpen) {
      setText('');
      analyzeMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleAnalyze = async () => {
    const trimmed = text.trim();
    if (!trimmed || !resolvedService) {
      return;
    }
    const result = await analyzeMutation.mutateAsync({
      text: trimmed,
      entry_date: todayInZone(timezone),
      service_config_id: resolvedService.id,
    });
    const first = result.items[0];
    if (!first) {
      return;
    }
    onApply(proposedItemToDraft(first));
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className={`h-4 w-4 ${AI_ICON_CLASS}`} />
            {t('aiFoodDraft.title', 'Describe Food with AI')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'aiFoodDraft.description',
              'Describe one food in plain language. We will look up nutrition and fill the form for you to review before saving.'
            )}
          </DialogDescription>
        </DialogHeader>

        {isAiStatusLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('aiFoodDraft.checkingAi', 'Checking AI service…')}
          </div>
        ) : !hasAi ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {inactiveOnly
              ? t(
                  'aiFoodDraft.aiServiceInactive',
                  'An AI service exists but is not enabled. Turn on Active in Settings → AI Service.'
                )
              : t(
                  'aiFoodDraft.noAiService',
                  'No AI service is configured. Add one in Settings, enable Active, then try again.'
                )}{' '}
            <Link to="/settings" className="underline underline-offset-2">
              {t('aiFoodDraft.openSettings', 'Open Settings')}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <Label htmlFor="ai-food-draft-text">
              {t('aiFoodDraft.inputLabel', 'What food is this?')}
            </Label>
            <Textarea
              id="ai-food-draft-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={t(
                'aiFoodDraft.placeholder',
                'e.g. 100g grilled chicken breast, or one Kinder Bueno bar'
              )}
              disabled={isBusy}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isBusy}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={!hasAi || !text.trim() || isBusy || isAiStatusLoading}
            className={AI_BUTTON_CLASS}
          >
            {isBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {t('aiFoodDraft.fillForm', 'Fill Form')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AiFoodDraftDialog;
