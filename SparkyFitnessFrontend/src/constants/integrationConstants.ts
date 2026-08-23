export const MANUAL_SYNC_PROVIDERS = [
  'strava',
  'fitbit',
  'oura',
  'polar',
  'withings',
  'garmin',
  'garmin_health_data',
  'hevy',
] as const;

export type ManualSyncProvider = (typeof MANUAL_SYNC_PROVIDERS)[number];
