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
  useCoachMemories,
  useDeleteCoachMemoryMutation,
  useUpsertCoachMemoryMutation,
} from '@/hooks/Training/useTrainingCoach';

interface CoachMemoriesCardProps {
  planId: string | undefined;
}

export default function CoachMemoriesCard({ planId }: CoachMemoriesCardProps) {
  const { t } = useTranslation();
  const { data: memories = [] } = useCoachMemories(planId);
  const upsertMemoryMutation = useUpsertCoachMemoryMutation();
  const deleteMemoryMutation = useDeleteCoachMemoryMutation();

  const [memoryKey, setMemoryKey] = useState('');
  const [memoryValue, setMemoryValue] = useState('');

  if (!planId) {
    return null;
  }

  const handleAddMemory = async () => {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
          {t(
            'training.coachChat.memoriesTitle',
            'Coach & planner constraints'
          )}
        </CardTitle>
        <CardDescription>
          {t(
            'training.coachChat.memoriesDescription',
            'Durable facts reused in every AI chat (injuries, schedule limits, preferences).'
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
  );
}
