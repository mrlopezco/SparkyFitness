-- Data cleanup: when Garmin Health Data (GHD) owns a calendar day, remove classic
-- Garmin parallel facts so Diary/Reports/Training do not double-count.
-- No schema changes. Classic nutrition / workout presets are left alone.

-- 1) daily_health_metrics twins
DELETE FROM daily_health_metrics d
WHERE d.source_provider = 'garmin'
  AND EXISTS (
    SELECT 1
    FROM daily_health_metrics g
    WHERE g.user_id = d.user_id
      AND g.entry_date = d.entry_date
      AND g.source_provider = 'garmin_health_data'
  );

-- 2) health_metric_samples twins
DELETE FROM health_metric_samples s
WHERE s.source_provider = 'garmin'
  AND EXISTS (
    SELECT 1
    FROM health_metric_samples g
    WHERE g.user_id = s.user_id
      AND g.entry_date = s.entry_date
      AND g.metric = s.metric
      AND g.source_provider = 'garmin_health_data'
  );

-- 3) sleep_entries twins (stages cascade)
DELETE FROM sleep_entries s
WHERE s.source = 'garmin'
  AND EXISTS (
    SELECT 1
    FROM sleep_entries g
    WHERE g.user_id = s.user_id
      AND g.entry_date = s.entry_date
      AND g.source = 'garmin_health_data'
  );

-- 4) Classic Active Calories diary rows when the user has GHD daily metrics
DELETE FROM exercise_entries ee
WHERE ee.source = 'garmin'
  AND (
    ee.exercise_name = 'Active Calories'
    OR COALESCE(ee.notes, '') ILIKE '%Active calor%'
  )
  AND EXISTS (
    SELECT 1
    FROM daily_health_metrics g
    WHERE g.user_id = ee.user_id
      AND g.entry_date = ee.entry_date
      AND g.source_provider = 'garmin_health_data'
  );

-- 5) Classic wellness custom_measurements mirrors on GHD days
DELETE FROM custom_measurements cm
WHERE cm.source = 'garmin'
  AND EXISTS (
    SELECT 1
    FROM daily_health_metrics g
    WHERE g.user_id = cm.user_id
      AND g.entry_date = cm.entry_date
      AND g.source_provider = 'garmin_health_data'
  );

-- 6) Check-in steps that tracked classic Garmin (keep weigh-ins / body comp)
UPDATE check_in_measurements c
SET steps = NULL
WHERE c.steps IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM daily_health_metrics g
    WHERE g.user_id = c.user_id
      AND g.entry_date = c.entry_date
      AND g.source_provider = 'garmin_health_data'
      AND g.total_steps IS NOT NULL
  );

-- 7) Deactivate classic Garmin provider so cron cannot call a removed sidecar
UPDATE external_data_providers
SET is_active = false,
    updated_at = NOW()
WHERE provider_type = 'garmin'
  AND is_active = true
  AND EXISTS (
    SELECT 1
    FROM external_data_providers g
    WHERE g.user_id = external_data_providers.user_id
      AND g.provider_type = 'garmin_health_data'
      AND g.is_active = true
  );

-- 8) Enable hourly keep-alive for active GHD providers stuck on create-default 'manual'
UPDATE external_data_providers
SET sync_frequency = 'hourly',
    updated_at = NOW()
WHERE provider_type = 'garmin_health_data'
  AND is_active = true
  AND (sync_frequency IS NULL OR sync_frequency = 'manual');
