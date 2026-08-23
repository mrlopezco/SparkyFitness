import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainingFitnessTest, TrainingPlan } from '@workspace/shared';

const { testRepo, planRepo, timezone } = vi.hoisted(() => ({
  testRepo: {
    createTest: vi.fn(),
    listTests: vi.fn(),
    getTestById: vi.fn(),
    reportResult: vi.fn(),
    deleteTest: vi.fn(),
    getLatestTestDate: vi.fn(),
  },
  planRepo: { getPlanById: vi.fn() },
  timezone: { loadUserTimezone: vi.fn() },
}));

vi.mock('../models/trainingFitnessTestRepository.js', () => ({
  default: testRepo,
  ...testRepo,
}));
vi.mock('../models/trainingPlanRepository.js', () => ({
  default: planRepo,
  ...planRepo,
}));
vi.mock('../utils/timezoneLoader.js', () => timezone);

const trainingFitnessTestService = (
  await import('../services/trainingFitnessTestService.js')
).default;
const { NotFoundError } = await import('../services/trainingAiSupport.js');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const TEST_ID = '33333333-3333-4333-8333-333333333333';
const TODAY = '2026-08-20';

function plan(): TrainingPlan {
  return {
    id: PLAN_ID,
    user_id: USER_ID,
    name: '10K build',
    description: null,
    sport_focus: 'running',
    start_date: '2026-08-01',
    target_date: '2026-10-31',
    status: 'active',
    notes: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}

function fitnessTest(
  overrides: Partial<TrainingFitnessTest> = {}
): TrainingFitnessTest {
  return {
    id: TEST_ID,
    plan_id: PLAN_ID,
    user_id: USER_ID,
    test_type: '5k_time_trial',
    title: '5K time trial',
    scheduled_date: '2026-08-25',
    status: 'scheduled',
    prescription: { distance_km: 5 },
    result: null,
    source: 'coach',
    due_interval_days: 28,
    notes: null,
    created_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

function createRequest(scheduledDate: string) {
  return {
    plan_id: PLAN_ID,
    test_type: '5k_time_trial' as const,
    title: '5K time trial',
    scheduled_date: scheduledDate,
    prescription: {},
    source: 'coach' as const,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  timezone.loadUserTimezone.mockResolvedValue('UTC');
  planRepo.getPlanById.mockResolvedValue(plan());
  testRepo.createTest.mockImplementation(async () => fitnessTest());
});

describe('createTest', () => {
  it('stores a test for a plan the athlete owns', async () => {
    const created = await trainingFitnessTestService.createTest(
      USER_ID,
      createRequest('2026-08-25')
    );

    expect(created.id).toBe(TEST_ID);
    expect(testRepo.createTest).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ plan_id: PLAN_ID })
    );
  });

  it('refuses a test on a plan that is not theirs', async () => {
    planRepo.getPlanById.mockResolvedValue(null);

    await expect(
      trainingFitnessTestService.createTest(
        USER_ID,
        createRequest('2026-08-25')
      )
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(testRepo.createTest).not.toHaveBeenCalled();
  });

  it('allows a plan-less test without an ownership check', async () => {
    await trainingFitnessTestService.createTest(USER_ID, {
      ...createRequest('2026-08-25'),
      plan_id: null,
    });

    expect(planRepo.getPlanById).not.toHaveBeenCalled();
  });
});

describe('reportResult', () => {
  it('records the outcome of a scheduled test', async () => {
    testRepo.getTestById.mockResolvedValue(fitnessTest());
    testRepo.reportResult.mockResolvedValue(
      fitnessTest({
        status: 'completed',
        result: { distance_km: 5, duration_seconds: 1200 },
        completed_at: '2026-08-25T09:00:00.000Z',
      })
    );

    const updated = await trainingFitnessTestService.reportResult(
      USER_ID,
      TEST_ID,
      {
        status: 'completed',
        result: { distance_km: 5, duration_seconds: 1200 },
      }
    );

    expect(updated.status).toBe('completed');
    expect(testRepo.reportResult).toHaveBeenCalledWith(
      USER_ID,
      TEST_ID,
      'completed',
      { distance_km: 5, duration_seconds: 1200 },
      null
    );
  });

  it('reports a missing test as not found', async () => {
    testRepo.getTestById.mockResolvedValue(null);

    await expect(
      trainingFitnessTestService.reportResult(USER_ID, TEST_ID, {
        status: 'completed',
        result: {},
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(testRepo.reportResult).not.toHaveBeenCalled();
  });
});

describe('deleteTest', () => {
  it('reports a missing test as not found', async () => {
    testRepo.deleteTest.mockResolvedValue(false);

    await expect(
      trainingFitnessTestService.deleteTest(USER_ID, TEST_ID)
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('isFitnessTestOverdue', () => {
  it('treats an athlete with no tests at all as overdue', async () => {
    testRepo.getLatestTestDate.mockResolvedValue(null);

    await expect(
      trainingFitnessTestService.isFitnessTestOverdue(
        USER_ID,
        PLAN_ID,
        TODAY,
        28
      )
    ).resolves.toBe(true);
  });

  it('is not overdue while a test is still upcoming', async () => {
    testRepo.getLatestTestDate.mockResolvedValue('2026-09-15');

    await expect(
      trainingFitnessTestService.isFitnessTestOverdue(
        USER_ID,
        PLAN_ID,
        TODAY,
        28
      )
    ).resolves.toBe(false);
  });

  it('is overdue once the last test is older than the window', async () => {
    testRepo.getLatestTestDate.mockResolvedValue('2026-07-01');

    await expect(
      trainingFitnessTestService.isFitnessTestOverdue(
        USER_ID,
        PLAN_ID,
        TODAY,
        28
      )
    ).resolves.toBe(true);
  });

  it('is not overdue for a test taken inside the window', async () => {
    testRepo.getLatestTestDate.mockResolvedValue('2026-08-10');

    await expect(
      trainingFitnessTestService.isFitnessTestOverdue(
        USER_ID,
        PLAN_ID,
        TODAY,
        28
      )
    ).resolves.toBe(false);
  });
});

describe('scheduleTest', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00.000Z`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules a test dated today or later', async () => {
    const created = await trainingFitnessTestService.scheduleTest(
      USER_ID,
      createRequest('2026-08-25')
    );

    expect(created?.id).toBe(TEST_ID);
  });

  it('refuses a test dated in the past', async () => {
    const created = await trainingFitnessTestService.scheduleTest(
      USER_ID,
      createRequest('2026-08-01')
    );

    expect(created).toBeNull();
    expect(testRepo.createTest).not.toHaveBeenCalled();
  });

  it('refuses a test scheduled beyond a year out', async () => {
    const created = await trainingFitnessTestService.scheduleTest(
      USER_ID,
      createRequest('2028-01-01')
    );

    expect(created).toBeNull();
    expect(testRepo.createTest).not.toHaveBeenCalled();
  });
});
