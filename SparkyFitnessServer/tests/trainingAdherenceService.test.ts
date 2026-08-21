import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEntryRow } from '../models/trainingPlanRepository.js';

const { repo } = vi.hoisted(() => ({
  repo: {
    listSessionsInRange: vi.fn(),
    listActivityEntries: vi.fn(),
    upsertCompletion: vi.fn(),
    updateSessionStatus: vi.fn(),
  },
}));

vi.mock('../models/trainingPlanRepository.js', () => ({
  default: repo,
  ...repo,
}));

const {
  isAutoMatchable,
  matchForUser,
  matchSessionsToActivities,
  scoreAdherence,
  sportForSessionType,
} = await import('../services/trainingAdherenceService.js');

type SessionInput = Parameters<typeof matchSessionsToActivities>[0][number];

let entrySeq = 0;

function activity(overrides: Partial<ActivityEntryRow> = {}): ActivityEntryRow {
  entrySeq += 1;
  return {
    id: `entry-${entrySeq}`,
    entry_date: '2026-09-02',
    exercise_name: 'Morning Run',
    category: 'cardio',
    notes: null,
    distance_km: 6,
    duration_minutes: 33,
    provider_name: null,
    detail_data: null,
    exercise_source_id: null,
    ...overrides,
  };
}

function session(overrides: Partial<SessionInput> = {}): SessionInput {
  return {
    id: 'session-1',
    scheduled_date: '2026-09-02',
    session_type: 'easy_run',
    prescription: { distance_km: 6 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  entrySeq = 0;
});

describe('sportForSessionType', () => {
  it('maps every running session type to running', () => {
    for (const type of [
      'easy_run',
      'intervals',
      'tempo',
      'long_run',
      'race',
    ] as const) {
      expect(sportForSessionType(type)).toBe('running');
    }
  });

  it('treats cross-training as sport-agnostic', () => {
    expect(sportForSessionType('cross_train')).toBeNull();
  });

  it('never auto-matches a rest day', () => {
    expect(isAutoMatchable('rest')).toBe(false);
  });
});

describe('scoreAdherence', () => {
  it('scores a same-day run of the prescribed distance as a full match', () => {
    expect(scoreAdherence(session(), activity())).toBe(1);
  });

  it('discounts an activity logged a day off the schedule', () => {
    const score = scoreAdherence(
      session(),
      activity({ entry_date: '2026-09-03' })
    );
    expect(score).toBeCloseTo(0.9, 5);
  });

  it('ignores an activity more than a day away', () => {
    expect(
      scoreAdherence(session(), activity({ entry_date: '2026-09-05' }))
    ).toBe(0);
  });

  it('ignores an activity of the wrong sport', () => {
    expect(
      scoreAdherence(
        session(),
        activity({ exercise_name: 'Evening Bike Ride', distance_km: 30 })
      )
    ).toBe(0);
  });

  it('scores a half-distance run as roughly half adherence', () => {
    const score = scoreAdherence(session(), activity({ distance_km: 3 }));
    expect(score).toBeCloseTo(0.75, 5);
  });

  it('falls back to duration when no distance is prescribed', () => {
    const score = scoreAdherence(
      session({ prescription: { duration_minutes: 40 } }),
      activity({ distance_km: null, duration_minutes: 20 })
    );
    expect(score).toBeCloseTo(0.75, 5);
  });

  it('accepts any sport for a cross-training session', () => {
    const score = scoreAdherence(
      session({ session_type: 'cross_train', prescription: {} }),
      activity({ exercise_name: 'Soccer match', distance_km: null })
    );
    expect(score).toBeGreaterThan(0.5);
  });
});

describe('matchSessionsToActivities', () => {
  it('gives the best-scoring pairing priority and never reuses an activity', () => {
    const easy = session({
      id: 'easy',
      scheduled_date: '2026-09-02',
      prescription: { distance_km: 6 },
    });
    const long = session({
      id: 'long',
      scheduled_date: '2026-09-03',
      session_type: 'long_run',
      prescription: { distance_km: 16 },
    });
    const shortRun = activity({
      id: 'short-run',
      entry_date: '2026-09-02',
      distance_km: 6,
    });
    const longRun = activity({
      id: 'long-run',
      entry_date: '2026-09-03',
      distance_km: 16,
    });

    const matches = matchSessionsToActivities(
      [easy, long],
      [shortRun, longRun]
    );

    expect(matches).toHaveLength(2);
    expect(matches.find((m) => m.session.id === 'easy')?.entry.id).toBe(
      'short-run'
    );
    expect(matches.find((m) => m.session.id === 'long')?.entry.id).toBe(
      'long-run'
    );
  });

  it('leaves the second session unmatched when only one run was logged', () => {
    const matches = matchSessionsToActivities(
      [session({ id: 'a' }), session({ id: 'b' })],
      [activity()]
    );
    expect(matches).toHaveLength(1);
  });

  it('classifies a well-short session as partial rather than completed', () => {
    const matches = matchSessionsToActivities(
      [session({ prescription: { distance_km: 12 } })],
      [activity({ distance_km: 6 })]
    );
    expect(matches[0].status).toBe('partial');
  });
});

describe('matchForUser', () => {
  it('persists a completion and the new session status for each match', async () => {
    repo.listSessionsInRange.mockResolvedValue([
      { ...session(), status: 'planned' },
    ]);
    repo.listActivityEntries.mockResolvedValue([activity()]);
    repo.upsertCompletion.mockResolvedValue({});
    repo.updateSessionStatus.mockResolvedValue(true);

    const result = await matchForUser(
      'user-1',
      '2026-09-01',
      '2026-09-07',
      'plan-1'
    );

    expect(repo.upsertCompletion).toHaveBeenCalledWith('user-1', {
      plan_session_id: 'session-1',
      exercise_entry_id: 'entry-1',
      adherence_score: 1,
      matched_by: 'auto',
    });
    expect(repo.updateSessionStatus).toHaveBeenCalledWith(
      'user-1',
      'session-1',
      'completed'
    );
    expect(result).toEqual({ matched: 1, partial: 0, unmatched_sessions: 0 });
  });

  it('skips sessions that are no longer planned', async () => {
    repo.listSessionsInRange.mockResolvedValue([
      { ...session(), status: 'skipped' },
    ]);

    const result = await matchForUser('user-1', '2026-09-01', '2026-09-07');

    expect(repo.listActivityEntries).not.toHaveBeenCalled();
    expect(result).toEqual({ matched: 0, partial: 0, unmatched_sessions: 0 });
  });

  it('counts a planned session with nothing logged as unmatched', async () => {
    repo.listSessionsInRange.mockResolvedValue([
      { ...session(), status: 'planned' },
    ]);
    repo.listActivityEntries.mockResolvedValue([]);

    const result = await matchForUser('user-1', '2026-09-01', '2026-09-07');

    expect(result).toEqual({ matched: 0, partial: 0, unmatched_sessions: 1 });
  });
});
