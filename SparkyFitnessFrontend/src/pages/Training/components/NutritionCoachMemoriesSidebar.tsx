import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Trash2 } from 'lucide-react';
import type { NutritionCoachMemory } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useDeleteNutritionCoachMemoryMutation,
  useNutritionCoachMemories,
  useUpsertNutritionCoachMemoryMutation,
} from '@/hooks/Training/useNutritionCoach';

function formatMemoryTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function MemoryDetailDialog({
  memory,
  open,
  onOpenChange,
}: {
  memory: NutritionCoachMemory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  if (!memory) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{memory.memory_key}</DialogTitle>
          <DialogDescription>
            {t(
              'training.nutritionCoach.memoryDetailDescription',
              'Full text the nutrition coach reuses in every check-in.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-muted-foreground">
              {t('training.nutritionCoach.memoryValue', 'Detail')}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words">
              {memory.memory_value}
            </p>
          </div>
          <dl className="grid gap-2 border-t pt-3 text-xs text-muted-foreground">
            <div className="flex justify-between gap-4">
              <dt>{t('training.nutritionCoach.memorySource', 'Source')}</dt>
              <dd className="text-foreground">{memory.source ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('training.nutritionCoach.memoryUpdated', 'Updated')}</dt>
              <dd className="text-foreground">
                {formatMemoryTimestamp(memory.updated_at)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('training.nutritionCoach.memoryCreated', 'Created')}</dt>
              <dd className="text-foreground">
                {formatMemoryTimestamp(memory.created_at)}
              </dd>
            </div>
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface NutritionCoachMemoriesSidebarProps {
  className?: string;
}

export default function NutritionCoachMemoriesSidebar({
  className,
}: NutritionCoachMemoriesSidebarProps) {
  const { t } = useTranslation();
  const { data: memories = [] } = useNutritionCoachMemories();
  const upsertMutation = useUpsertNutritionCoachMemoryMutation();
  const deleteMutation = useDeleteNutritionCoachMemoryMutation();

  const [memoryKey, setMemoryKey] = useState('');
  const [memoryValue, setMemoryValue] = useState('');
  const [detailMemory, setDetailMemory] =
    useState<NutritionCoachMemory | null>(null);

  const handleAddMemory = async () => {
    await upsertMutation.mutateAsync({
      memory_key: memoryKey.trim(),
      memory_value: memoryValue.trim(),
      source: 'user',
    });
    setMemoryKey('');
    setMemoryValue('');
  };

  return (
    <div className={className}>
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {t(
          'training.nutritionCoach.memoriesTitle',
          'Nutrition coach memories'
        )}
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        {t(
          'training.nutritionCoach.memoriesDescription',
          'Commitments and constraints reused in every nutrition check-in.'
        )}
      </p>

      {memories.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t('training.nutritionCoach.noMemories', 'Nothing remembered yet.')}
        </p>
      )}

      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {memories.map((memory) => (
          <li
            key={memory.id}
            className="flex items-start gap-1 rounded-md border p-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{memory.memory_key}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {memory.memory_value}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={t(
                'training.nutritionCoach.memoryDetail',
                'View memory details'
              )}
              onClick={() => setDetailMemory(memory)}
            >
              <Info className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={t(
                'training.nutritionCoach.deleteMemory',
                'Delete memory'
              )}
              disabled={deleteMutation.isPending}
              onClick={() => void deleteMutation.mutateAsync(memory.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-2 border-t pt-3">
        <Label htmlFor="nutrition-memory-key-sidebar" className="text-xs">
          {t('training.nutritionCoach.memoryKey', 'Label')}
        </Label>
        <Input
          id="nutrition-memory-key-sidebar"
          className="h-8 text-sm"
          value={memoryKey}
          placeholder={t(
            'training.nutritionCoach.memoryKeyPlaceholder',
            'no_late_snacks'
          )}
          onChange={(event) => setMemoryKey(event.target.value)}
        />
        <Label htmlFor="nutrition-memory-value-sidebar" className="text-xs">
          {t('training.nutritionCoach.memoryValue', 'Detail')}
        </Label>
        <Textarea
          id="nutrition-memory-value-sidebar"
          className="min-h-[4rem] text-sm"
          value={memoryValue}
          rows={2}
          placeholder={t(
            'training.nutritionCoach.memoryValuePlaceholder',
            'Trying to stop eating after 9pm on rest days'
          )}
          onChange={(event) => setMemoryValue(event.target.value)}
        />
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={
            !memoryKey.trim() ||
            !memoryValue.trim() ||
            upsertMutation.isPending
          }
          onClick={() => void handleAddMemory()}
        >
          {t('training.nutritionCoach.addMemory', 'Add memory')}
        </Button>
      </div>

      <MemoryDetailDialog
        memory={detailMemory}
        open={detailMemory != null}
        onOpenChange={(open) => {
          if (!open) setDetailMemory(null);
        }}
      />
    </div>
  );
}
