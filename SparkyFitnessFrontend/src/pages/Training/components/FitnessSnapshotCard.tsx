import { useTranslation } from 'react-i18next';
import type {
  TrainingAthleteSnapshot,
  TrainingFitnessTest,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  FITNESS_TEST_STATUS_LABELS,
  FITNESS_TEST_TYPE_LABELS,
  formatDurationSeconds,
  formatPaceMinPerKm,
} from '../trainingConstants';

interface FitnessSnapshotCardProps {
  snapshot: TrainingAthleteSnapshot | null | undefined;
  tests: TrainingFitnessTest[];
}

const RECENT_TEST_LIMIT = 3;

export default function FitnessSnapshotCard({
  snapshot,
  tests,
}: FitnessSnapshotCardProps) {
  const { t } = useTranslation();
  const science = snapshot?.payload.running_science;

  const recentTests = tests
    .filter((test) => test.status !== 'scheduled')
    .slice(0, RECENT_TEST_LIMIT);

  const perKm = t('training.science.perKm', ' /km');
  const pace = (value: number | null | undefined) =>
    `${formatPaceMinPerKm(value)}${perKm}`;

  // The card only earns its space once the snapshot carries derived paces or a
  // test has been reported; otherwise the Overview stays uncluttered.
  if (!science && recentTests.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
          {t('training.science.title', 'Fitness snapshot')}
        </CardTitle>
        <CardDescription>
          {t(
            'training.science.description',
            'Training paces the coach derives from your race predictions and reported tests.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {science && (
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {t('training.science.easyPace', 'Easy pace')}
              </p>
              <p className="text-2xl font-bold leading-none mt-1">
                {pace(science.estimated_easy_pace_min_per_km)}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {t('training.science.tempoPace', 'Tempo pace')}
              </p>
              <p className="text-2xl font-bold leading-none mt-1">
                {pace(science.estimated_tempo_pace_min_per_km)}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {t('training.science.thresholdPace', 'Threshold pace')}
              </p>
              <p className="text-2xl font-bold leading-none mt-1">
                {pace(science.estimated_threshold_pace_min_per_km)}
              </p>
            </div>
          </div>
        )}

        {science && (
          <p className="text-xs text-muted-foreground">
            {t('training.science.predictions', 'Predictions')}
            {`: 5K ${formatDurationSeconds(science.race_prediction_5k_seconds)}`}
            {` · 10K ${formatDurationSeconds(
              science.race_prediction_10k_seconds
            )}`}
            {` · ${t('training.science.half', 'Half')} ${formatDurationSeconds(
              science.race_prediction_half_marathon_seconds
            )}`}
          </p>
        )}

        {recentTests.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t('training.science.recentTests', 'Recent fitness tests')}
            </p>
            {recentTests.map((test) => (
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
                    {` · ${test.scheduled_date}`}
                    {test.result?.duration_seconds
                      ? ` · ${formatDurationSeconds(
                          test.result.duration_seconds
                        )}`
                      : ''}
                  </p>
                </div>
                <Badge variant="outline">
                  {t(
                    `training.fitnessTestStatus.${test.status}`,
                    FITNESS_TEST_STATUS_LABELS[test.status]
                  )}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
