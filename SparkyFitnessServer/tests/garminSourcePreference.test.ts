import { describe, expect, it } from 'vitest';
import {
  preferGhdOverClassicGarminByDate,
  garminFamilySourceRank,
} from '../services/garminHealthData/garminSourcePreference.js';

describe('preferGhdOverClassicGarminByDate', () => {
  it('drops classic garmin when GHD exists for the same day', () => {
    const rows = [
      { entry_date: '2026-08-21', source: 'garmin', id: 'c' },
      { entry_date: '2026-08-21', source: 'garmin_health_data', id: 'g' },
      { entry_date: '2026-08-20', source: 'garmin', id: 'c2' },
      { entry_date: '2026-08-19', source: 'manual', id: 'm' },
    ];
    expect(preferGhdOverClassicGarminByDate(rows)).toEqual([
      { entry_date: '2026-08-21', source: 'garmin_health_data', id: 'g' },
      { entry_date: '2026-08-20', source: 'garmin', id: 'c2' },
      { entry_date: '2026-08-19', source: 'manual', id: 'm' },
    ]);
  });

  it('ranks GHD above classic', () => {
    expect(garminFamilySourceRank('garmin_health_data')).toBe(0);
    expect(garminFamilySourceRank('garmin')).toBe(1);
    expect(garminFamilySourceRank('manual')).toBe(2);
  });
});
