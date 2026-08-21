import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  coachRepo,
  planRepo,
  snapshotService,
  coachService,
  fitnessTestService,
  timezone,
} = vi.hoisted(() => ({
  coachRepo: {
    getOpenSession: vi.fn(),
    getLatestSessionCreatedAt: vi.fn(),
  },
  planRepo: {
    listActivePlansForScan: vi.fn(),
    countUnmatchedPlannedSessions: vi.fn(),
  },
  snapshotService: { rebuildSnapshot: vi.fn() },
  coachService: { createSession: vi.fn() },
  fitnessTestService: {
    isFitnessTestOverdue: vi.fn(),
    scheduleTest: vi.fn(),
  },
  timezone: { loadUserTimezone: vi.fn() },
}));

vi.mock('../models/trainingCoachRepository.js', () => ({
  default: coachRepo,
  ...coachRepo,
}));
vi.mock('../models/trainingPlanRepository.js', () => ({
  default: planRepo,
  ...planRepo,
}));
vi.mock('../services/trainingAthleteSnapshotService.js', () => ({
  default: snapshotService,
  ...snapshotService,
}));
vi.mock('../services/trainingCoachService.js', () => ({
  default: coachService,
  ...coachService,
}));
vi.mock('../services/trainingFitnessTestService.js', () => ({
  default: fitnessTestService,
  ...fitnessTestService,
}));
vi.mock('../utils/timezoneLoader.js', () => timezone);

const trainingCheckInService = (
  await import('../services/trainingCheckInService.js')
).default;
const { decideCheckIn, buildOpeningBrief } =
  await import('../services/trainingCheckInService.js');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';

/** A date the real clock will never be, so a leaked real clock fails loudly. */
const TODAY = '2027-03-05';

const ACTIVE_PLAN = {
  plan_id: PLAN_ID,
  user_id: USER_ID,
  name: '10K build',
  sport_focus: 'running',
  target_date: '2027-05-16',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00.000Z`));
  timezone.loadUserTimezone.mockResolvedValue('UTC');
  planRepo.listActivePlansForScan.mockResolvedValue([ACTIVE_PLAN]);
  planRepo.countUnmatchedPlannedSessions.mockResolvedValue(0);
  coachRepo.getOpenSession.mockResolvedValue(null);
  coachRepo.getLatestSessionCreatedAt.mockResolvedValue(
    '2027-03-04T00:00:00.000Z'
  );
  fitnessTestService.isFitnessTestOverdue.mockResolvedValue(false);
  fitnessTestService.scheduleTest.mockResolvedValue(null);
  snapshotService.rebuildSnapshot.mockResolvedValue({});
  coachService.createSession.mockResolvedValue({ session: {}, messages: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('decideCheckIn', () => {
  it('opens the first check-in for a plan that has never had one', () => {
    const decision = decideCheckIn({
      hasOpenSession: false,
      daysSinceLastCheckIn: null,
      unmatchedCount: 0,
      fitnessTestOverdue: false,
    });

    expect(decision.shouldOpen).toBe(true);
    expect(decision.reasons[0]).toContain('no coach check-in');
  });

  it('stays quiet while a conversation is already open', () => {
    const decision = decideCheckIn({
      hasOpenSession: true,
      daysSinceLastCheckIn: 30,
      unmatchedCount: 5,
      fitnessTestOverdue: true,
    });

    expect(decision.shouldOpen).toBe(false);
  });

  it('stays quiet when nothing has drifted since the last check-in', () => {
    const decision = decideCheckIn({
      hasOpenSession: false,
      daysSinceLastCheckIn: 2,
      unmatchedCount: 1,
      fitnessTestOverdue: false,
    });

    expect(decision.shouldOpen).toBe(false);
    expect(decision.reasons).toEqual([]);
  });

  it('reaches out on a week of silence', () => {
    const decision = decideCheckIn({
      hasOpenSession: false,
      daysSinceLastCheckIn: 7,
      unmatchedCount: 0,
      fitnessTestOverdue: false,
    });

    expect(decision.shouldOpen).toBe(true);
  });

  it('reaches out on missed sessions even inside the quiet window', () => {
    const decision = decideCheckIn({
      hasOpenSession: false,
      daysSinceLastCheckIn: 1,
      unmatchedCount: 3,
      fitnessTestOverdue: false,
    });

    expect(decision.shouldOpen).toBe(true);
    expect(decision.reasons).toEqual([
      '3 planned sessions in the last week were never logged',
    ]);
  });

  it('reaches out on stale fitness even inside the quiet window', () => {
    const decision = decideCheckIn({
      hasOpenSession: false,
      daysSinceLastCheckIn: 1,
      unmatchedCount: 0,
      fitnessTestOverdue: true,
    });

    expect(decision.shouldOpen).toBe(true);
    expect(decision.reasons[0]).toContain('no fitness test');
  });
});

describe('buildOpeningBrief', () => {
  it('names the plan, the countdown, and every reason', () => {
    const brief = buildOpeningBrief(
      { name: '10K build', target_date: '2026-10-31' },
      '2026-08-20',
      {
        shouldOpen: true,
        reasons: ['3 planned sessions in the last week were never logged'],
        unmatchedCount: 3,
        fitnessTestOverdue: false,
      }
    );

    expect(brief).toContain('10K build');
    expect(brief).toContain('72 days remain');
    expect(brief).toContain('never logged');
  });

  it('says so when the target date has already passed', () => {
    const brief = buildOpeningBrief(
      { name: '10K build', target_date: '2026-08-01' },
      '2026-08-20',
      {
        shouldOpen: true,
        reasons: ['the last check-in was 20 days ago'],
        unmatchedCount: 0,
        fitnessTestOverdue: false,
      }
    );

    expect(brief).toContain('has passed');
  });
});

describe('runWeeklyCheckIns', () => {
  it('opens a session and refreshes the snapshot for a drifting athlete', async () => {
    planRepo.countUnmatchedPlannedSessions.mockResolvedValue(4);

    const opened = await trainingCheckInService.runWeeklyCheckIns();

    expect(opened).toBe(1);
    expect(snapshotService.rebuildSnapshot).toHaveBeenCalledWith(
      USER_ID,
      PLAN_ID
    );
    expect(coachService.createSession).toHaveBeenCalledWith(
      USER_ID,
      PLAN_ID,
      expect.objectContaining({ title: `Weekly check-in ${TODAY}` })
    );
  });

  it('skips an athlete who already has an open conversation', async () => {
    coachRepo.getOpenSession.mockResolvedValue({ id: 'open-session' });
    planRepo.countUnmatchedPlannedSessions.mockResolvedValue(9);

    const opened = await trainingCheckInService.runWeeklyCheckIns();

    expect(opened).toBe(0);
    expect(coachService.createSession).not.toHaveBeenCalled();
    expect(planRepo.countUnmatchedPlannedSessions).not.toHaveBeenCalled();
  });

  it('schedules a fitness test alongside the check-in when fitness is stale', async () => {
    fitnessTestService.isFitnessTestOverdue.mockResolvedValue(true);

    await trainingCheckInService.runWeeklyCheckIns();

    expect(fitnessTestService.scheduleTest).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        plan_id: PLAN_ID,
        test_type: '5k_time_trial',
        scheduled_date: '2027-03-10',
        source: 'system',
      })
    );
  });

  it('does not schedule a test that would land after the target date', async () => {
    fitnessTestService.isFitnessTestOverdue.mockResolvedValue(true);
    planRepo.listActivePlansForScan.mockResolvedValue([
      { ...ACTIVE_PLAN, target_date: '2027-03-07' },
    ]);

    await trainingCheckInService.runWeeklyCheckIns();

    expect(fitnessTestService.scheduleTest).not.toHaveBeenCalled();
    expect(coachService.createSession).toHaveBeenCalled();
  });

  it('still opens the session when the snapshot rebuild fails', async () => {
    planRepo.countUnmatchedPlannedSessions.mockResolvedValue(4);
    snapshotService.rebuildSnapshot.mockRejectedValue(new Error('db down'));

    const opened = await trainingCheckInService.runWeeklyCheckIns();

    expect(opened).toBe(1);
    expect(coachService.createSession).toHaveBeenCalled();
  });

  it('keeps scanning after one athlete fails', async () => {
    planRepo.listActivePlansForScan.mockResolvedValue([
      ACTIVE_PLAN,
      { ...ACTIVE_PLAN, user_id: 'user-2', plan_id: 'plan-2' },
    ]);
    planRepo.countUnmatchedPlannedSessions.mockResolvedValue(4);
    coachService.createSession
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce({ session: {}, messages: [] });

    const opened = await trainingCheckInService.runWeeklyCheckIns();

    expect(opened).toBe(1);
  });

  it('never throws when the scan itself fails', async () => {
    planRepo.listActivePlansForScan.mockRejectedValue(new Error('db down'));

    await expect(trainingCheckInService.runWeeklyCheckIns()).resolves.toBe(0);
  });
});
