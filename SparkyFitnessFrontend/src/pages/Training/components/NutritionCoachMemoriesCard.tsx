import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
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
  useDeleteNutritionCoachMemoryMutation,
  useNutritionCoachMemories,
  useUpsertNutritionCoachMemoryMutation,
} from '@/hooks/Training/useNutritionCoach';

export default function NutritionCoachMemoriesCard() {
  const { t } = useTranslation();
  const { data: memories = [] } = useNutritionCoachMemories();
  const upsertMutation = useUpsertNutritionCoachMemoryMutation();
  const deleteMutation = useDeleteNutritionCoachMemoryMutation();

  const [memoryKey, setMemoryKey] = useState('');
  const [memoryValue, setMemoryValue] = useState('');

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
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
          {t(
            'training.nutritionCoach.memoriesTitle',
            'Nutrition coach memories'
          )}
        </CardTitle>
        <CardDescription>
          {t(
            'training.nutritionCoach.memoriesDescription',
            'Commitments and constraints reused in every nutrition check-in.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {memories.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('training.nutritionCoach.noMemories', 'Nothing remembered yet.')}
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
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t(
                'training.nutritionCoach.deleteMemory',
                'Delete memory'
              )}
              disabled={deleteMutation.isPending}
              onClick={() => void deleteMutation.mutateAsync(memory.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="nutrition-memory-key">
              {t('training.nutritionCoach.memoryKey', 'Label')}
            </Label>
            <Input
              id="nutrition-memory-key"
              value={memoryKey}
              placeholder={t(
                'training.nutritionCoach.memoryKeyPlaceholder',
                'no_late_snacks'
              )}
              onChange={(event) => setMemoryKey(event.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="nutrition-memory-value">
              {t('training.nutritionCoach.memoryValue', 'Detail')}
            </Label>
            <Textarea
              id="nutrition-memory-value"
              value={memoryValue}
              rows={2}
              placeholder={t(
                'training.nutritionCoach.memoryValuePlaceholder',
                'Trying to stop eating after 9pm on rest days'
              )}
              onChange={(event) => setMemoryValue(event.target.value)}
            />
          </div>
          <Button
            type="button"
            className="sm:col-span-2 sm:w-fit"
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
      </CardContent>
    </Card>
  );
}
