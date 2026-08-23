import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  TrainingCommitment,
  TrainingGoal,
  TrainingPlan,
  TrainingPlanSession,
} from '@workspace/shared';

const { repo, snapshotService, dispatch, chatRepo, globalSettings } =
  vi.hoisted(() => ({
    repo: {
      createPlan: vi.fn(),
      listPlans: vi.fn(),
      getPlanById: vi.fn(),
      updatePlan: vi.fn(),
      deletePlan: vi.fn(),
      listGoals: vi.fn(),
      replaceGoals: vi.fn(),
      listCommitments: vi.fn(),
      replaceCommitments: vi.fn(),
      listSessions: vi.fn(),
      listSessionsInRange: vi.fn(),
      replaceSessions: vi.fn(),
      updateSessionStatus: vi.fn(),
      upsertCompletion: vi.fn(),
      insertSnapshot: vi.fn(),
      getLatestSnapshot: vi.fn(),
      listActivityEntries: vi.fn(),
      listWeightSeries: vi.fn(),
      getReadinessAggregate: vi.fn(),
    },
    snapshotService: {
      rebuildSnapshot: vi.fn(),
      getLatestSnapshot: vi.fn(),
      buildSnapshotPayload: vi.fn(),
      estimateTokens: vi.fn(),
    },
    dispatch: { dispatchAiRequest: vi.fn() },
    chatRepo: {
      getActiveAiServiceSetting: vi.fn(),
      getAiServiceSettingForBackend: vi.fn(),
    },
    globalSettings: { isUserAiConfigAllowed: vi.fn() },
  }));

vi.mock('../models/trainingPlanRepository.js', () => ({
  default: repo,
  ...repo,
}));
vi.mock('../services/trainingAthleteSnapshotService.js', () => ({
  default: snapshotService,
  ...snapshotService,
}));
vi.mock('../ai/providerDispatch.js', () => ({
  default: dispatch,
  ...dispatch,
}));
vi.mock('../models/chatRepository.js', () => ({ default: chatRepo }));
vi.mock('../models/globalSettingsRepository.js', () => ({
  default: globalSettings,
}));
vi.mock('../utils/outboundUrlPolicy.js', () => ({
  deriveAiNetworkPolicy: () => ({ allowPrivateNetwork: false }),
}));

const trainingPlanService = (await import('../services/trainingPlanService.js'))
  .default;
const { proposeTrainingPlan, ProviderResponseError, NotFoundError, buildProposeChunks } =
  await import('../services/trainingPlanAiService.js');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';

function plan(overrides: Partial<TrainingPlan> = {}): TrainingPlan {
  return {
    id: PLAN_ID,
    user_id: USER_ID,
    name: '10K build',
    description: null,
    sport_focus: 'running',
    start_date: '2026-09-01',
    target_date: '2026-10-31',
    status: 'draft',
    notes: null,
    created_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

function session(
  overrides: Partial<TrainingPlanSession> = {}
): TrainingPlanSession {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    plan_id: PLAN_ID,
    scheduled_date: '2026-09-02',
    session_type: 'easy_run',
    status: 'planned',
    prescription: { distance_km: 6 },
    sort_order: 0,
    created_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  snapshotService.rebuildSnapshot.mockResolvedValue({
    id: '44444444-4444-4444-8444-444444444444',
    user_id: USER_ID,
    plan_id: PLAN_ID,
    as_of_date: '2026-08-20',
    payload: { as_of_date: '2026-08-20', window_days: 42 },
    token_estimate: 20,
    created_at: '2026-08-20T00:00:00.000Z',
  });
  globalSettings.isUserAiConfigAllowed.mockResolvedValue(true);
  chatRepo.getActiveAiServiceSetting.mockResolvedValue({ id: 'setting-1' });
  chatRepo.getAiServiceSettingForBackend.mockResolvedValue({
    service_type: 'openai',
    api_key: 'key',
    model_name: 'gpt-test',
  });
});

describe('createPlan', () => {
  it('passes the request through to the repository and returns the detail', async () => {
    const goals: TrainingGoal[] = [
      {
        id: '55555555-5555-4555-8555-555555555555',
        plan_id: PLAN_ID,
        type: 'race',
        title: 'Sub-50 10K',
        target_date: '2026-10-31',
        race_distance_meters: 10000,
        race_target_seconds: 3000,
        weight_target_kg: null,
        weight_delta_kg: null,
        notes: null,
        sort_order: 0,
        created_at: '2026-08-20T00:00:00.000Z',
        updated_at: '2026-08-20T00:00:00.000Z',
      },
    ];
    const commitments: TrainingCommitment[] = [];
    repo.createPlan.mockResolvedValue({ plan: plan(), goals, commitments });

    const result = await trainingPlanService.createPlan(USER_ID, {
      name: '10K build',
      sport_focus: 'running',
      start_date: '2026-09-01',
      target_date: '2026-10-31',
      goals: [
        {
          type: 'race',
          title: 'Sub-50 10K',
          race_distance_meters: 10000,
          race_target_seconds: 3000,
        },
      ],
      commitments: [],
    });

    expect(repo.createPlan).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        name: '10K build',
        start_date: '2026-09-01',
        target_date: '2026-10-31',
      })
    );
    expect(result).toMatchObject({ id: PLAN_ID, goals, commitments });
    expect(result.sessions).toEqual([]);
  });

  it('rebuilds the athlete snapshot for the new plan', async () => {
    repo.createPlan.mockResolvedValue({
      plan: plan(),
      goals: [],
      commitments: [],
    });

    await trainingPlanService.createPlan(USER_ID, {
      name: '10K build',
      sport_focus: 'running',
      start_date: '2026-09-01',
      target_date: '2026-10-31',
      goals: [],
      commitments: [],
    });

    expect(snapshotService.rebuildSnapshot).toHaveBeenCalledWith(
      USER_ID,
      PLAN_ID
    );
  });

  it('still returns the plan when the snapshot rebuild fails', async () => {
    repo.createPlan.mockResolvedValue({
      plan: plan(),
      goals: [],
      commitments: [],
    });
    snapshotService.rebuildSnapshot.mockRejectedValue(new Error('db down'));

    const result = await trainingPlanService.createPlan(USER_ID, {
      name: '10K build',
      sport_focus: 'running',
      start_date: '2026-09-01',
      target_date: '2026-10-31',
      goals: [],
      commitments: [],
    });

    expect(result.id).toBe(PLAN_ID);
  });

  it('rejects a plan whose start date is after its target date', async () => {
    await expect(
      trainingPlanService.createPlan(USER_ID, {
        name: 'Backwards',
        sport_focus: 'running',
        start_date: '2026-10-31',
        target_date: '2026-09-01',
        goals: [],
        commitments: [],
      })
    ).rejects.toThrow('start_date must not be after target_date.');
    expect(repo.createPlan).not.toHaveBeenCalled();
  });
});

describe('buildProposeChunks', () => {
  it('splits a multi-month window into ~28-day chunks', () => {
    expect(buildProposeChunks('2026-09-01', '2026-10-31', 28)).toEqual([
      { start: '2026-09-01', end: '2026-09-28' },
      { start: '2026-09-29', end: '2026-10-26' },
      { start: '2026-10-27', end: '2026-10-31' },
    ]);
  });
});

describe('proposeTrainingPlan', () => {
  const providerPlan = {
    summary: 'Eight weeks of aerobic base with one quality session per week.',
    weekly_volume_notes: '30km rising to 45km.',
    sessions: [
      {
        client_id: 'a1',
        scheduled_date: '2026-09-02',
        session_type: 'easy_run',
        prescription: { distance_km: 6, notes: 'Conversational pace' },
      },
    ],
  };

  beforeEach(() => {
    repo.getPlanById.mockResolvedValue(plan());
    repo.listGoals.mockResolvedValue([]);
    repo.listCommitments.mockResolvedValue([]);
    snapshotService.getLatestSnapshot.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      user_id: USER_ID,
      plan_id: PLAN_ID,
      as_of_date: '2026-08-20',
      payload: { as_of_date: '2026-08-20', window_days: 42 },
      token_estimate: 20,
      created_at: '2026-08-20T00:00:00.000Z',
    });
  });

  it('parses a valid provider response and injects the plan id', async () => {
    dispatch.dispatchAiRequest.mockResolvedValue({
      ok: true,
      text: JSON.stringify(providerPlan),
      json: providerPlan,
    });

    const result = await proposeTrainingPlan(
      USER_ID,
      USER_ID,
      { plan_id: PLAN_ID, replace_existing: true },
      false
    );

    expect(result.plan_id).toBe(PLAN_ID);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      client_id: 'a1',
      scheduled_date: '2026-09-02',
      session_type: 'easy_run',
    });
  });

  it('rejects a response with no sessions', async () => {
    dispatch.dispatchAiRequest.mockResolvedValue({
      ok: true,
      text: '{}',
      json: { summary: 'Nothing to do', sessions: [] },
    });

    await expect(
      proposeTrainingPlan(
        USER_ID,
        USER_ID,
        { plan_id: PLAN_ID, replace_existing: true },
        false
      )
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it('rejects a session carrying a malformed date', async () => {
    dispatch.dispatchAiRequest.mockResolvedValue({
      ok: true,
      text: '{}',
      json: {
        summary: 'Bad dates',
        sessions: [
          {
            client_id: 'a1',
            scheduled_date: 'next Tuesday',
            session_type: 'easy_run',
            prescription: {},
          },
        ],
      },
    });

    await expect(
      proposeTrainingPlan(
        USER_ID,
        USER_ID,
        { plan_id: PLAN_ID, replace_existing: true },
        false
      )
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it('reports a missing plan as not found without calling the provider', async () => {
    repo.getPlanById.mockResolvedValue(null);

    await expect(
      proposeTrainingPlan(
        USER_ID,
        USER_ID,
        { plan_id: PLAN_ID, replace_existing: true },
        false
      )
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(dispatch.dispatchAiRequest).not.toHaveBeenCalled();
  });
});

describe('confirmPlan', () => {
  beforeEach(() => {
    repo.getPlanById.mockResolvedValue(plan());
    repo.replaceSessions.mockResolvedValue([session()]);
    repo.updatePlan.mockResolvedValue(plan({ status: 'active' }));
  });

  it('maps proposed sessions to planned session payloads in order', async () => {
    repo.replaceSessions.mockResolvedValue([
      session({ id: '33333333-3333-4333-8333-333333333333' }),
      session({
        id: '66666666-6666-4666-8666-666666666666',
        scheduled_date: '2026-09-04',
        session_type: 'long_run',
      }),
    ]);

    const result = await trainingPlanService.confirmPlan(USER_ID, {
      plan_id: PLAN_ID,
      replace_existing: true,
      activate: true,
      sessions: [
        {
          client_id: 'a1',
          scheduled_date: '2026-09-02',
          session_type: 'easy_run',
          prescription: { distance_km: 6 },
        },
        {
          client_id: 'a2',
          scheduled_date: '2026-09-04',
          session_type: 'long_run',
          prescription: { distance_km: 14 },
        },
      ],
    });

    expect(repo.replaceSessions).toHaveBeenCalledWith(
      USER_ID,
      PLAN_ID,
      [
        {
          scheduled_date: '2026-09-02',
          session_type: 'easy_run',
          status: 'planned',
          prescription: { distance_km: 6 },
          sort_order: 0,
        },
        {
          scheduled_date: '2026-09-04',
          session_type: 'long_run',
          status: 'planned',
          prescription: { distance_km: 14 },
          sort_order: 1,
        },
      ],
      true
    );
    expect(result.created_count).toBe(2);
    expect(result.session_ids).toHaveLength(2);
  });

  it('activates a draft plan when asked', async () => {
    await trainingPlanService.confirmPlan(USER_ID, {
      plan_id: PLAN_ID,
      replace_existing: true,
      activate: true,
      sessions: [
        {
          client_id: 'a1',
          scheduled_date: '2026-09-02',
          session_type: 'easy_run',
          prescription: {},
        },
      ],
    });

    expect(repo.updatePlan).toHaveBeenCalledWith(USER_ID, PLAN_ID, {
      status: 'active',
    });
  });

  it('refuses sessions scheduled outside the plan window', async () => {
    await expect(
      trainingPlanService.confirmPlan(USER_ID, {
        plan_id: PLAN_ID,
        replace_existing: true,
        activate: true,
        sessions: [
          {
            client_id: 'a1',
            scheduled_date: '2027-01-01',
            session_type: 'easy_run',
            prescription: {},
          },
        ],
      })
    ).rejects.toThrow(/outside the plan window/);
    expect(repo.replaceSessions).not.toHaveBeenCalled();
  });
});
