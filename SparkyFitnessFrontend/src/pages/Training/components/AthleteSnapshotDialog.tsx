import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { TrainingAthleteSnapshot } from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  formatDurationSeconds,
  formatPaceMinPerKm,
} from '../trainingConstants';

interface AthleteSnapshotDialogProps {
  snapshot: TrainingAthleteSnapshot | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatNullable(
  value: number | string | null | undefined,
  suffix = ''
): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${suffix}`;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="rounded-md border p-3 text-sm">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export default function AthleteSnapshotDialog({
  snapshot,
  open,
  onOpenChange,
}: AthleteSnapshotDialogProps) {
  const { t } = useTranslation();
  const payload = snapshot?.payload;
  const perKm = t('training.science.perKm', ' /km');
  const pace = (value: number | null | undefined) =>
    `${formatPaceMinPerKm(value)}${perKm}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('training.snapshot.viewTitle', 'Athlete snapshot')}
          </DialogTitle>
          <DialogDescription>
            {snapshot
              ? t(
                  'training.snapshot.viewDescription',
                  'As of {{date}} · {{window}} day window · created {{created}}',
                  {
                    date: snapshot.as_of_date,
                    window: payload?.window_days ?? '—',
                    created: new Date(snapshot.created_at).toLocaleString(),
                  }
                )
              : t(
                  'training.snapshot.none',
                  'No snapshot yet. Build one so the coach can see your recent load.'
                )}
          </DialogDescription>
        </DialogHeader>

        {!snapshot || !payload ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'training.snapshot.viewEmpty',
              'Refresh the snapshot first to populate this view.'
            )}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {t('training.snapshot.asOf', 'As of')} {snapshot.as_of_date}
              </Badge>
              <Badge variant="secondary">
                {t('training.snapshot.window', '{{days}} days', {
                  days: payload.window_days,
                })}
              </Badge>
              {snapshot.token_estimate != null && (
                <Badge variant="outline">
                  {t('training.snapshot.tokens', '~{{n}} tokens', {
                    n: snapshot.token_estimate,
                  })}
                </Badge>
              )}
            </div>

            {payload.running && (
              <Section title={t('training.snapshot.running', 'Running')}>
                <Row
                  label={t('training.snapshot.sessions', 'Sessions')}
                  value={String(payload.running.session_count)}
                />
                <Row
                  label={t('training.snapshot.distance', 'Distance')}
                  value={`${payload.running.total_distance_km} km`}
                />
                <Row
                  label={t('training.snapshot.duration', 'Duration')}
                  value={`${payload.running.total_duration_minutes} min`}
                />
                <Row
                  label={t('training.snapshot.avgDistance', 'Avg distance')}
                  value={formatNullable(payload.running.avg_distance_km, ' km')}
                />
                <Row
                  label={t('training.snapshot.recentLong', 'Recent long run')}
                  value={formatNullable(
                    payload.running.recent_long_run_km,
                    ' km'
                  )}
                />
              </Section>
            )}

            {payload.running_science && (
              <Section
                title={t('training.science.title', 'Fitness snapshot')}
              >
                <Row
                  label={t('training.science.easyPace', 'Easy pace')}
                  value={pace(
                    payload.running_science.estimated_easy_pace_min_per_km
                  )}
                />
                <Row
                  label={t('training.science.tempoPace', 'Tempo pace')}
                  value={pace(
                    payload.running_science.estimated_tempo_pace_min_per_km
                  )}
                />
                <Row
                  label={t('training.science.thresholdPace', 'Threshold pace')}
                  value={pace(
                    payload.running_science.estimated_threshold_pace_min_per_km
                  )}
                />
                <Row
                  label={t('training.science.pred5k', '5K prediction')}
                  value={formatDurationSeconds(
                    payload.running_science.race_prediction_5k_seconds
                  )}
                />
                <Row
                  label={t('training.science.pred10k', '10K prediction')}
                  value={formatDurationSeconds(
                    payload.running_science.race_prediction_10k_seconds
                  )}
                />
                <Row
                  label={t('training.science.predHalf', 'Half prediction')}
                  value={formatDurationSeconds(
                    payload.running_science.race_prediction_half_marathon_seconds
                  )}
                />
                {payload.running_science.race_prediction_marathon_seconds !=
                  null && (
                  <Row
                    label={t(
                      'training.science.predMarathon',
                      'Marathon prediction'
                    )}
                    value={formatDurationSeconds(
                      payload.running_science.race_prediction_marathon_seconds
                    )}
                  />
                )}
              </Section>
            )}

            {payload.sports_breakdown &&
              payload.sports_breakdown.length > 0 && (
                <Section
                  title={t('training.snapshot.sports', 'Sports breakdown')}
                >
                  {payload.sports_breakdown.map((sport) => (
                    <Row
                      key={sport.activity_key}
                      label={sport.activity_key}
                      value={`${sport.session_count} · ${sport.total_duration_minutes} min`}
                    />
                  ))}
                </Section>
              )}

            {payload.weight && (
              <Section title={t('training.snapshot.weight', 'Weight')}>
                <Row
                  label={t('training.snapshot.latestWeight', 'Latest')}
                  value={
                    payload.weight.latest_kg != null
                      ? `${payload.weight.latest_kg} kg${
                          payload.weight.latest_date
                            ? ` (${payload.weight.latest_date})`
                            : ''
                        }`
                      : '—'
                  }
                />
                <Row
                  label={t('training.snapshot.weightDelta', 'Delta')}
                  value={formatNullable(payload.weight.delta_kg, ' kg')}
                />
              </Section>
            )}

            {payload.readiness && (
              <Section title={t('training.snapshot.readiness', 'Readiness')}>
                <Row
                  label={t(
                    'training.snapshot.avgReadiness',
                    'Avg training readiness'
                  )}
                  value={formatNullable(payload.readiness.avg_training_readiness)}
                />
                <Row
                  label={t(
                    'training.snapshot.latestReadiness',
                    'Latest training readiness'
                  )}
                  value={formatNullable(
                    payload.readiness.latest_training_readiness
                  )}
                />
                <Row
                  label={t('training.snapshot.avgAcute', 'Avg acute load')}
                  value={formatNullable(payload.readiness.avg_acute_load)}
                />
                <Row
                  label={t('training.snapshot.avgChronic', 'Avg chronic load')}
                  value={formatNullable(payload.readiness.avg_chronic_load)}
                />
                <Row
                  label={t('training.snapshot.acwr', 'Latest ACWR')}
                  value={formatNullable(payload.readiness.latest_acwr)}
                />
                <Row
                  label={t('training.snapshot.vo2', 'Latest VO₂ max')}
                  value={formatNullable(payload.readiness.latest_vo2_max)}
                />
                <Row
                  label={t('training.snapshot.rhr', 'Latest RHR')}
                  value={formatNullable(payload.readiness.latest_rhr)}
                />
                <Row
                  label={t('training.snapshot.hrv', 'Latest overnight HRV')}
                  value={formatNullable(payload.readiness.latest_overnight_hrv)}
                />
                <Row
                  label={t('training.snapshot.stress', 'Avg stress')}
                  value={formatNullable(payload.readiness.avg_stress)}
                />
                <Row
                  label={t(
                    'training.snapshot.bodyBattery',
                    'Body battery (avg low–high)'
                  )}
                  value={
                    payload.readiness.avg_body_battery_low != null ||
                    payload.readiness.avg_body_battery_high != null
                      ? `${formatNullable(payload.readiness.avg_body_battery_low)} – ${formatNullable(payload.readiness.avg_body_battery_high)}`
                      : '—'
                  }
                />
              </Section>
            )}

            {payload.sleep && (
              <Section title={t('training.snapshot.sleep', 'Sleep')}>
                <Row
                  label={t('training.snapshot.nights', 'Nights logged')}
                  value={String(payload.sleep.nights_logged)}
                />
                <Row
                  label={t('training.snapshot.sleepScore', 'Avg sleep score')}
                  value={formatNullable(payload.sleep.avg_sleep_score)}
                />
                <Row
                  label={t('training.snapshot.hoursAsleep', 'Avg hours asleep')}
                  value={formatNullable(payload.sleep.avg_hours_asleep)}
                />
                <Row
                  label={t('training.snapshot.deepHours', 'Avg deep hours')}
                  value={formatNullable(payload.sleep.avg_deep_hours)}
                />
              </Section>
            )}

            {payload.readiness_trend &&
              payload.readiness_trend.length > 0 && (
                <Section
                  title={t('training.snapshot.readinessTrend', 'Readiness trend')}
                >
                  {payload.readiness_trend.map((day) => (
                    <Row
                      key={day.date}
                      label={day.date}
                      value={`TR ${formatNullable(day.training_readiness)} · BB ${formatNullable(day.body_battery_lowest)}`}
                    />
                  ))}
                </Section>
              )}

            {payload.recent_fitness_tests &&
              payload.recent_fitness_tests.length > 0 && (
                <Section
                  title={t(
                    'training.science.recentTests',
                    'Recent fitness tests'
                  )}
                >
                  {payload.recent_fitness_tests.map((test) => (
                    <div
                      key={test.id}
                      className="flex flex-wrap items-start justify-between gap-2 border-b py-2 last:border-b-0"
                    >
                      <div>
                        <p className="font-medium">{test.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {test.test_type} · {test.scheduled_date}
                          {test.result_summary
                            ? ` · ${test.result_summary}`
                            : ''}
                        </p>
                      </div>
                      <Badge variant="outline">{test.status}</Badge>
                    </div>
                  ))}
                </Section>
              )}

            {payload.notes && payload.notes.length > 0 && (
              <Section title={t('training.snapshot.notes', 'Notes')}>
                <ul className="list-disc space-y-1 pl-4">
                  {payload.notes.map((note, index) => (
                    <li key={`${index}-${note.slice(0, 24)}`}>{note}</li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title={t('training.snapshot.rawJson', 'Raw JSON')}>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 font-mono text-xs">
                {JSON.stringify(snapshot.payload, null, 2)}
              </pre>
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
