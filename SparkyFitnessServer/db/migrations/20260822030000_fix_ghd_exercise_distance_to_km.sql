-- GHD previously wrote exercise_entries.distance as metres (distance_km * 1000).
-- Product convention (Diary + Training) is kilometers. Convert existing GHD rows.
UPDATE exercise_entries
SET distance = distance / 1000.0,
    updated_at = NOW()
WHERE source = 'garmin_health_data'
  AND distance IS NOT NULL
  AND distance >= 100;
