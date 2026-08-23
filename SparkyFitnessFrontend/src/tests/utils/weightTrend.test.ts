import {
  evaluateWeightTrend,
  FLAT_DELTA_KG,
} from '@/utils/weightTrend';

describe('evaluateWeightTrend', () => {
  const pts = (weights: number[]) =>
    weights.map((weightKg, i) => ({
      entry_date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      weightKg,
    }));

  it('returns insufficient_data with fewer than 2 points', () => {
    expect(evaluateWeightTrend([], 'cut').status).toBe('insufficient_data');
    expect(evaluateWeightTrend(pts([80]), 'cut').status).toBe(
      'insufficient_data'
    );
  });

  it('marks cut + falling as on_track', () => {
    const result = evaluateWeightTrend(pts([82, 81, 80]), 'cut');
    expect(result.status).toBe('on_track');
    expect(result.deltaKg).toBe(-2);
  });

  it('marks cut + rising as off_track', () => {
    const result = evaluateWeightTrend(pts([80, 81, 82]), 'cut');
    expect(result.status).toBe('off_track');
  });

  it('inverts for lean_bulk / bulk', () => {
    expect(evaluateWeightTrend(pts([70, 71, 72]), 'lean_bulk').status).toBe(
      'on_track'
    );
    expect(evaluateWeightTrend(pts([72, 71, 70]), 'bulk').status).toBe(
      'off_track'
    );
  });

  it('marks maintain + flat as neutral', () => {
    const mid = 75;
    const result = evaluateWeightTrend(
      pts([mid, mid + FLAT_DELTA_KG / 2, mid]),
      'maintain'
    );
    expect(result.status).toBe('neutral');
  });

  it('uses target gap for maintain toward target', () => {
    const result = evaluateWeightTrend(pts([82, 81, 80]), 'maintain', 0, 75);
    expect(result.status).toBe('on_track');
    expect(result.gapToTargetKg).toBe(5);
  });

  it('flags cut moving away from target as off_track', () => {
    // Losing weight but already below a higher target? Rising away from lower target.
    const result = evaluateWeightTrend(pts([70, 71, 72]), 'cut', 0, 65);
    expect(result.status).toBe('off_track');
  });

  it('treats manual surplus as gain', () => {
    expect(
      evaluateWeightTrend(pts([70, 71, 72]), 'manual', 10).status
    ).toBe('on_track');
  });
});
