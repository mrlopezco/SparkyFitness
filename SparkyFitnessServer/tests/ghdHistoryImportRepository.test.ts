import { describe, expect, it } from 'vitest';
import { buildWeekWindows } from '../models/ghdHistoryImportRepository.js';

describe('buildWeekWindows', () => {
  it('splits an inclusive range into 7-day windows', () => {
    const windows = buildWeekWindows('2026-08-01', '2026-08-20');
    expect(windows[0]).toEqual({
      week_start: '2026-08-01',
      week_end: '2026-08-07',
    });
    expect(windows[windows.length - 1]).toEqual({
      week_start: '2026-08-15',
      week_end: '2026-08-20',
    });
    expect(windows).toHaveLength(3);
  });

  it('handles a single-day range', () => {
    expect(buildWeekWindows('2026-08-20', '2026-08-20')).toEqual([
      { week_start: '2026-08-20', week_end: '2026-08-20' },
    ]);
  });
});
