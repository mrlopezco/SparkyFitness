import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Trash2 } from 'lucide-react';
import {
  todayInZone,
  type TrainingFitnessTest,
  type TrainingFitnessTestType,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  useCreateFitnessTestMutation,
  useDeleteFitnessTestMutation,
  useFitnessTests,
  useReportFitnessTestMutation,
} from '@/hooks/Training/useFitnessTests';
import {
  FITNESS_TEST_STATUS_LABELS,
  FITNESS_TEST_TYPE_LABELS,
  FITNESS_TEST_TYPES,
  formatDurationSeconds,
} from '../trainingConstants';

interface FitnessTestsPanelProps {
  planId: string | undefined;
}

interface ResultDraft {
  durationMinutes: string;
  durationSeconds: string;
  distanceKm: string;
  avgHeartRate: string;
  perceivedEffort: string;
  notes: string;
}

const EMPTY_RESULT: ResultDraft = {
  durationMinutes: '',
  durationSeconds: '',
  distanceKm: '',
  avgHeartRate: '',
  perceivedEffort: '',
  notes: '',
};

function parseOptionalNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function FitnessTestsPanel({ planId }: FitnessTestsPanelProps) {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const today = todayInZone(timezone);

  const [testType, setTestType] =
    useState<TrainingFitnessTestType>('5k_time_trial');
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState(today);
  const [instructions, setInstructions] = useState('');

  const [reportingTest, setReportingTest] =
    useState<TrainingFitnessTest | null>(null);
  const [result, setResult] = useState<ResultDraft>(EMPTY_RESULT);

  const { data: tests = [], isLoading } = useFitnessTests(planId);
  const createMutation = useCreateFitnessTestMutation();
  const reportMutation = useReportFitnessTestMutation();
  const deleteMutation = useDeleteFitnessTestMutation();

  const scheduled = tests.filter((test) => test.status === 'scheduled');
  const finished = tests.filter((test) => test.status !== 'scheduled');

  const handleSchedule = async () => {
    if (!planId) return;
    await createMutation.mutateAsync({
      plan_id: planId,
      test_type: testType,
      title:
        title.trim() ||
        t(
          `training.fitnessTestType.${testType}`,
          FITNESS_TEST_TYPE_LABELS[testType]
        ),
      scheduled_date: scheduledDate,
      prescription: { instructions: instructions.trim() || null },
      source: 'user',
    });
    setTitle('');
    setInstructions('');
  };

  const openReport = (test: TrainingFitnessTest) => {
    setReportingTest(test);
    setResult(EMPTY_RESULT);
  };

  const handleReport = async () => {
    if (!reportingTest) return;
    const minutes = parseOptionalNumber(result.durationMinutes) ?? 0;
    const seconds = parseOptionalNumber(result.durationSeconds) ?? 0;
    const totalSeconds = minutes * 60 + seconds;
    await reportMutation.mutateAsync({
      testId: reportingTest.id,
      payload: {
        status: 'completed',
        result: {
          distance_km: parseOptionalNumber(result.distanceKm),
          duration_seconds: totalSeconds > 0 ? totalSeconds : null,
          avg_heart_rate: parseOptionalNumber(result.avgHeartRate),
          perceived_effort: parseOptionalNumber(result.perceivedEffort),
          notes: result.notes.trim() || null,
        },
      },
    });
    setReportingTest(null);
  };

  if (!planId) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-center text-sm italic text-muted-foreground">
            {t(
              'training.fitnessTests.selectPlan',
              'Select or create a plan first.'
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  const renderTest = (test: TrainingFitnessTest) => (
    <div
      key={test.id}
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{test.title}</p>
        <p className="text-xs text-muted-foreground">
          {t(
            `training.fitnessTestType.${test.test_type}`,
            FITNESS_TEST_TYPE_LABELS[test.test_type]
          )}
          {' · '}
          {test.scheduled_date}
          {test.result?.duration_seconds
            ? ` · ${formatDurationSeconds(test.result.duration_seconds)}`
            : ''}
          {test.result?.distance_km ? ` · ${test.result.distance_km} km` : ''}
        </p>
        {test.prescription.instructions && (
          <p className="text-xs text-muted-foreground">
            {test.prescription.instructions}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">
          {t(
            `training.fitnessTestStatus.${test.status}`,
            FITNESS_TEST_STATUS_LABELS[test.status]
          )}
        </Badge>
        {test.status === 'scheduled' && (
          <Button variant="outline" size="sm" onClick={() => openReport(test)}>
            <ClipboardCheck className="mr-2 h-4 w-4" />
            {t('training.fitnessTests.report', 'Report results')}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('training.fitnessTests.delete', 'Delete test')}
          disabled={deleteMutation.isPending}
          onClick={() => deleteMutation.mutate(test.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('training.fitnessTests.title', 'Fitness tests')}
          </CardTitle>
          <CardDescription>
            {t(
              'training.fitnessTests.description',
              'Periodic benchmarks the coach uses to re-estimate your training paces.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && (
            <p className="text-sm text-muted-foreground">
              {t('training.fitnessTests.loading', 'Loading tests…')}
            </p>
          )}
          {!isLoading && scheduled.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('training.fitnessTests.noScheduled', 'No tests scheduled.')}
            </p>
          )}
          {scheduled.map(renderTest)}

          {finished.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                {t('training.fitnessTests.past', 'Completed & skipped')}
              </p>
              {finished.map(renderTest)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('training.fitnessTests.scheduleTitle', 'Schedule a test')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="fitness-test-type">
              {t('training.fitnessTests.type', 'Test type')}
            </Label>
            <Select
              value={testType}
              onValueChange={(value) =>
                setTestType(value as TrainingFitnessTestType)
              }
            >
              <SelectTrigger id="fitness-test-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FITNESS_TEST_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(
                      `training.fitnessTestType.${option}`,
                      FITNESS_TEST_TYPE_LABELS[option]
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fitness-test-title">
              {t('training.fitnessTests.testTitle', 'Title')}
            </Label>
            <Input
              id="fitness-test-title"
              value={title}
              placeholder={t(
                'training.fitnessTests.testTitlePlaceholder',
                'Mid-block 5K check'
              )}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fitness-test-date">
              {t('training.fitnessTests.date', 'Date')}
            </Label>
            <Input
              id="fitness-test-date"
              type="date"
              value={scheduledDate}
              onChange={(event) => setScheduledDate(event.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="fitness-test-instructions">
              {t('training.fitnessTests.instructions', 'Instructions')}
            </Label>
            <Textarea
              id="fitness-test-instructions"
              rows={2}
              value={instructions}
              placeholder={t(
                'training.fitnessTests.instructionsPlaceholder',
                'e.g. 15 min warm-up, 5 km flat and hard, 10 min cool-down'
              )}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              disabled={createMutation.isPending}
              onClick={handleSchedule}
            >
              {createMutation.isPending
                ? t('training.fitnessTests.scheduling', 'Scheduling…')
                : t('training.fitnessTests.schedule', 'Schedule test')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!reportingTest}
        onOpenChange={(open) => {
          if (!open) setReportingTest(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('training.fitnessTests.reportTitle', 'Report test results')}
            </DialogTitle>
            <DialogDescription>{reportingTest?.title}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fitness-result-minutes">
                {t('training.fitnessTests.minutes', 'Minutes')}
              </Label>
              <Input
                id="fitness-result-minutes"
                type="number"
                min={0}
                step="1"
                value={result.durationMinutes}
                onChange={(event) =>
                  setResult((prev) => ({
                    ...prev,
                    durationMinutes: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fitness-result-seconds">
                {t('training.fitnessTests.seconds', 'Seconds')}
              </Label>
              <Input
                id="fitness-result-seconds"
                type="number"
                min={0}
                max={59}
                step="1"
                value={result.durationSeconds}
                onChange={(event) =>
                  setResult((prev) => ({
                    ...prev,
                    durationSeconds: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fitness-result-distance">
                {t('training.fitnessTests.distanceKm', 'Distance (km)')}
              </Label>
              <Input
                id="fitness-result-distance"
                type="number"
                min={0}
                step="0.01"
                value={result.distanceKm}
                onChange={(event) =>
                  setResult((prev) => ({
                    ...prev,
                    distanceKm: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fitness-result-hr">
                {t('training.fitnessTests.avgHeartRate', 'Avg heart rate')}
              </Label>
              <Input
                id="fitness-result-hr"
                type="number"
                min={0}
                step="1"
                value={result.avgHeartRate}
                onChange={(event) =>
                  setResult((prev) => ({
                    ...prev,
                    avgHeartRate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fitness-result-rpe">
                {t('training.fitnessTests.perceivedEffort', 'RPE (1-10)')}
              </Label>
              <Input
                id="fitness-result-rpe"
                type="number"
                min={1}
                max={10}
                step="1"
                value={result.perceivedEffort}
                onChange={(event) =>
                  setResult((prev) => ({
                    ...prev,
                    perceivedEffort: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="fitness-result-notes">
                {t('training.fitnessTests.notes', 'Notes')}
              </Label>
              <Textarea
                id="fitness-result-notes"
                rows={2}
                value={result.notes}
                onChange={(event) =>
                  setResult((prev) => ({ ...prev, notes: event.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReportingTest(null)}>
              {t('training.fitnessTests.cancel', 'Cancel')}
            </Button>
            <Button disabled={reportMutation.isPending} onClick={handleReport}>
              {reportMutation.isPending
                ? t('training.fitnessTests.saving', 'Saving…')
                : t('training.fitnessTests.saveResults', 'Save results')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
