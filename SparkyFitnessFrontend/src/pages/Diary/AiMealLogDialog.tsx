import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AiMealLogProposedItem } from '@workspace/shared';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import { AI_ICON_CLASS } from '@/components/ai/aiAccent';
import {
  useActiveAIService,
  useAIServices,
} from '@/hooks/AI/useAIServiceSettings';
import {
  useAnalyzeAiMealLogMutation,
  useConfirmAiMealLogMutation,
} from '@/hooks/Diary/useAiMealLog';
import { useAuth } from '@/hooks/useAuth';

interface AiMealLogDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mealType: string;
  mealTypeId?: string;
  selectedDate: string;
}

type DialogStep = 'input' | 'review';

function sourceBadgeVariant(
  source: string
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (source === 'ai_estimate') return 'destructive';
  if (source === 'internal') return 'secondary';
  return 'outline';
}

const AiMealLogDialog = ({
  isOpen,
  onClose,
  mealType,
  mealTypeId,
  selectedDate,
}: AiMealLogDialogProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeQuery = useActiveAIService(isOpen && !!user);
  const servicesQuery = useAIServices();
  const analyzeMutation = useAnalyzeAiMealLogMutation();
  const confirmMutation = useConfirmAiMealLogMutation();

  const [step, setStep] = useState<DialogStep>('input');
  const [text, setText] = useState('');
  const [items, setItems] = useState<AiMealLogProposedItem[]>([]);

  const enabledServices = useMemo(
    () => (servicesQuery.data ?? []).filter((service) => service.is_active),
    [servicesQuery.data]
  );
  const inactiveOnly =
    (servicesQuery.data?.length ?? 0) > 0 && enabledServices.length === 0;

  // Prefer the dedicated active endpoint; fall back to any enabled service from
  // the list (covers parse/cache edge cases where /active looks empty).
  const resolvedService = activeQuery.data ?? enabledServices[0] ?? null;
  const isAiStatusLoading =
    (isOpen && !!user && activeQuery.isLoading) ||
    (servicesQuery.isLoading && !servicesQuery.data);

  useEffect(() => {
    if (!isOpen) {
      setStep('input');
      setText('');
      setItems([]);
      analyzeMutation.reset();
      confirmMutation.reset();
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
      meal_type: mealType,
      meal_type_id: mealTypeId,
      entry_date: selectedDate,
      service_config_id: resolvedService.id,
    });
    setItems(result.items);
    setStep('review');
  };

  const updateItem = (
    clientId: string,
    patch: Partial<AiMealLogProposedItem>
  ) => {
    setItems((prev) =>
      prev.map((item) =>
        item.client_id === clientId ? { ...item, ...patch } : item
      )
    );
  };

  const updateNutrient = (
    clientId: string,
    field: keyof AiMealLogProposedItem['nutrients'],
    value: string
  ) => {
    const parsed = value === '' ? null : Number(value);
    setItems((prev) =>
      prev.map((item) =>
        item.client_id === clientId
          ? {
              ...item,
              nutrients: {
                ...item.nutrients,
                [field]:
                  parsed === null || Number.isNaN(parsed) ? null : parsed,
              },
            }
          : item
      )
    );
  };

  const removeItem = (clientId: string) => {
    setItems((prev) => prev.filter((item) => item.client_id !== clientId));
  };

  const selectAlternative = (clientId: string, alternativeKey: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.client_id !== clientId || !item.alternatives?.length) {
          return item;
        }
        if (alternativeKey === 'current') {
          return item;
        }
        const altIndex = Number(alternativeKey);
        const chosen = item.alternatives[altIndex];
        if (!chosen) {
          return item;
        }
        const previousPrimary = {
          name: item.name,
          brand: item.brand,
          source: item.source,
          food_id: item.food_id,
          variant_id: item.variant_id,
          provider_type: item.provider_type,
          provider_external_id: item.provider_external_id,
          serving_size: item.serving_size,
          serving_unit: item.serving_unit,
          nutrients: item.nutrients,
        };
        const remaining = item.alternatives.filter((_, i) => i !== altIndex);
        return {
          ...item,
          ...chosen,
          warning: null,
          alternatives: [previousPrimary, ...remaining],
        };
      })
    );
  };

  const handleConfirm = async () => {
    if (items.length === 0) {
      return;
    }
    await confirmMutation.mutateAsync({
      meal_type: mealType,
      meal_type_id: mealTypeId,
      entry_date: selectedDate,
      items,
    });
    onClose();
  };

  const isBusy = analyzeMutation.isPending || confirmMutation.isPending;
  const hasAi = Boolean(resolvedService);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className={`h-4 w-4 ${AI_ICON_CLASS}`} />
            {t('aiMealLog.title', 'Quick AI Meal Log')}
          </DialogTitle>
          <DialogDescription>
            {t('aiMealLog.description', {
              mealName: mealType,
              defaultValue: `Describe what you ate for ${mealType}. We will parse items and look up nutrition from your food databases.`,
            })}
          </DialogDescription>
        </DialogHeader>

        {isAiStatusLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('aiMealLog.checkingAi', 'Checking AI service…')}
          </div>
        ) : !hasAi ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {inactiveOnly
              ? t(
                  'aiMealLog.aiServiceInactive',
                  'An AI service exists but is not enabled. In Settings → AI Service, turn on Active for your Google Gemini service (and select it as Active Provider if listed).'
                )
              : t(
                  'aiMealLog.noAiService',
                  'No AI service is configured. Add a Google Gemini (or other) service in Settings, enable Active, then try again.'
                )}{' '}
            <Link to="/settings" className="underline underline-offset-2">
              {t('aiMealLog.openSettings', 'Open Settings')}
            </Link>
          </div>
        ) : null}

        {step === 'input' ? (
          <div className="space-y-3">
            <Label htmlFor="ai-meal-log-text">
              {t('aiMealLog.inputLabel', 'What did you eat?')}
            </Label>
            <Textarea
              id="ai-meal-log-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={t(
                'aiMealLog.placeholder',
                'e.g. I ate 200g of grilled chicken, 100g of broccoli, and 1 large iced tea'
              )}
              disabled={!hasAi || isBusy || isAiStatusLoading}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  'aiMealLog.noItems',
                  'No items left to log. Go back and try a different description.'
                )}
              </p>
            ) : (
              items.map((item) => (
                <div
                  key={item.client_id}
                  className="space-y-3 rounded-md border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={sourceBadgeVariant(item.source)}>
                        {item.source}
                      </Badge>
                      {item.warning ? (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          {item.warning}
                        </span>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(item.client_id)}
                      disabled={isBusy}
                      title={t('aiMealLog.removeItem', 'Remove item')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="sm:col-span-1">
                      <Label>{t('aiMealLog.name', 'Name')}</Label>
                      <Input
                        value={item.name}
                        onChange={(e) =>
                          updateItem(item.client_id, { name: e.target.value })
                        }
                        disabled={isBusy}
                      />
                    </div>
                    <div>
                      <Label>{t('aiMealLog.quantity', 'Quantity')}</Label>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.client_id, {
                            quantity: Number(e.target.value) || 0,
                          })
                        }
                        disabled={isBusy}
                      />
                    </div>
                    <div>
                      <Label>{t('aiMealLog.unit', 'Unit')}</Label>
                      <Input
                        value={item.unit}
                        onChange={(e) =>
                          updateItem(item.client_id, { unit: e.target.value })
                        }
                        disabled={isBusy}
                      />
                    </div>
                  </div>
                  {item.alternatives && item.alternatives.length > 0 ? (
                    <div>
                      <Label>
                        {t(
                          'aiMealLog.pickMatch',
                          'Database match (pick another if wrong)'
                        )}
                      </Label>
                      <Select
                        value="current"
                        onValueChange={(value) =>
                          selectAlternative(item.client_id, value)
                        }
                        disabled={isBusy}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              item.brand
                                ? `${item.name} (${item.brand})`
                                : item.name
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="current">
                            {item.brand
                              ? `${item.name} (${item.brand})`
                              : item.name}
                          </SelectItem>
                          {item.alternatives.map((alt, index) => (
                            <SelectItem
                              key={`${alt.provider_external_id ?? alt.food_id ?? alt.name}-${index}`}
                              value={String(index)}
                            >
                              {alt.brand
                                ? `${alt.name} (${alt.brand})`
                                : alt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(
                      [
                        ['calories', 'Calories'],
                        ['protein', 'Protein'],
                        ['carbs', 'Carbs'],
                        ['fat', 'Fat'],
                      ] as const
                    ).map(([field, label]) => (
                      <div key={field}>
                        <Label>{t(`aiMealLog.${field}`, label)}</Label>
                        <Input
                          type="number"
                          step="any"
                          value={item.nutrients[field] ?? ''}
                          onChange={(e) =>
                            updateNutrient(
                              item.client_id,
                              field,
                              e.target.value
                            )
                          }
                          disabled={isBusy}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'review' ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep('input')}
              disabled={isBusy}
            >
              {t('aiMealLog.back', 'Back')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isBusy}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
          )}
          {step === 'input' ? (
            <Button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={!hasAi || !text.trim() || isBusy || isAiStatusLoading}
            >
              {analyzeMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className={`mr-2 h-4 w-4 ${AI_ICON_CLASS}`} />
              )}
              {t('aiMealLog.analyze', 'Analyze & Review')}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={items.length === 0 || isBusy}
            >
              {confirmMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t('aiMealLog.confirm', 'Log Meal')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AiMealLogDialog;
