/**
 * Prefer Garmin Health Data over classic Garmin when both providers
 * have a row for the same calendar day (GHD-only fork stance).
 */

export const GHD_SOURCE = 'garmin_health_data';
export const CLASSIC_GARMIN_SOURCE = 'garmin';

/** SQL CASE expression for source_provider ranking (lower = preferred). */
export const HEALTH_SOURCE_PROVIDER_RANK_SQL = `CASE source_provider
  WHEN '${GHD_SOURCE}' THEN 0
  WHEN '${CLASSIC_GARMIN_SOURCE}' THEN 1
  ELSE 2
END`;

/** SQL CASE expression for sleep_entries.source ranking. */
export const SLEEP_SOURCE_RANK_SQL = `CASE source
  WHEN '${GHD_SOURCE}' THEN 0
  WHEN '${CLASSIC_GARMIN_SOURCE}' THEN 1
  ELSE 2
END`;

export function garminFamilySourceRank(source: string | null | undefined): number {
  if (source === GHD_SOURCE) return 0;
  if (source === CLASSIC_GARMIN_SOURCE) return 1;
  return 2;
}

/**
 * Drop classic `garmin` rows when a `garmin_health_data` row exists for the
 * same calendar day. Non-Garmin sources are always kept.
 */
export function preferGhdOverClassicGarminByDate<
  T extends { entry_date: string; source?: string | null },
>(rows: T[]): T[] {
  const ghdDays = new Set(
    rows
      .filter((r) => r.source === GHD_SOURCE)
      .map((r) => r.entry_date)
  );
  if (ghdDays.size === 0) return rows;
  return rows.filter(
    (r) => !(r.source === CLASSIC_GARMIN_SOURCE && ghdDays.has(r.entry_date))
  );
}
