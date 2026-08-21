import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  TrainingCoachMessage,
  TrainingCoachSession,
  TrainingPlan,
} from '@workspace/shared';

const {
  coachRepo,
  planRepo,
  snapshotService,
  fitnessTestService,
  dispatch,
  chatRepo,
  globalSettings,
} = vi.hoisted(() => ({
  coachRepo: {
    createSession: vi.fn(),
    listSessions: vi.fn(),
    getSession: vi.fn(),
    getOpenSession: vi.fn(),
    getLatestSessionCreatedAt: vi.fn(),
    closeSession: vi.fn(),
    insertMessage: vi.fn(),
    listMessages: vi.fn(),
    getSummary: vi.fn(),
    upsertSummary: vi.fn(),
    listMemories: vi.fn(),
    upsertMemory: vi.fn(),
    deleteMemory: vi.fn(),
  },
  planRepo: {
    getPlanById: vi.fn(),
    getSessionById: vi.fn(),
    listGoals: vi.fn(),
    listCommitments: vi.fn(),
    listSessionsInRange: vi.fn(),
  },
  snapshotService: {
    getLatestSnapshot: vi.fn(),
    rebuildSnapshot: vi.fn(),
  },
  fitnessTestService: {
    listTests: vi.fn(),
    scheduleTest: vi.fn(),
  },
  dispatch: { dispatchAiRequest: vi.fn() },
  chatRepo: {
    getActiveAiServiceSetting: vi.fn(),
    getAiServiceSettingForBackend: vi.fn(),
  },
  globalSettings: { isUserAiConfigAllowed: vi.fn() },
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
vi.mock('../services/trainingFitnessTestService.js', () => ({
  default: fitnessTestService,
  ...fitnessTestService,
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
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

const trainingCoachService = (
  await import('../services/trainingCoachService.js')
).default;
const { parseCoachTurn, buildExtractiveSummary } =
  await import('../services/trainingCoachService.js');
const { NotFoundError, ProviderResponseError } =
  await import('../services/trainingAiSupport.js');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const COACH_SESSION_ID = '33333333-3333-4333-8333-333333333333';
const PLAN_SESSION_ID = '44444444-4444-4444-8444-444444444444';

function plan(overrides: Partial<TrainingPlan> = {}): TrainingPlan {
  return {
    id: PLAN_ID,
    user_id: USER_ID,
    name: '10K build',
    description: null,
    sport_focus: 'running',
    start_date: '2026-09-01',
    target_date: '2026-10-31',
    status: 'active',
    notes: null,
    created_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

function coachSession(
  overrides: Partial<TrainingCoachSession> = {}
): TrainingCoachSession {
  return {
    id: COACH_SESSION_ID,
    plan_id: PLAN_ID,
    user_id: USER_ID,
    status: 'open',
    title: 'Weekly check-in',
    created_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
    closed_at: null,
    ...overrides,
  };
}

function message(
  overrides: Partial<TrainingCoachMessage> = {}
): TrainingCoachMessage {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    session_id: COACH_SESSION_ID,
    role: 'user',
    content: 'I missed my long run.',
    parts: null,
    created_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

function providerReply(json: unknown) {
  return { ok: true, text: JSON.stringify(json), json };
}

beforeEach(() => {
  vi.clearAllMocks();
  globalSettings.isUserAiConfigAllowed.mockResolvedValue(true);
  chatRepo.getActiveAiServiceSetting.mockResolvedValue({ id: 'setting-1' });
  chatRepo.getAiServiceSettingForBackend.mockResolvedValue({
    service_type: 'openai',
    api_key: 'key',
    model_name: 'gpt-test',
  });

  coachRepo.getSession.mockResolvedValue(coachSession());
  coachRepo.listMessages.mockResolvedValue([message()]);
  coachRepo.getSummary.mockResolvedValue(null);
  coachRepo.listMemories.mockResolvedValue([]);
  coachRepo.upsertMemory.mockResolvedValue({});
  coachRepo.insertMessage.mockImplementation(
    async (
      _userId: string,
      sessionId: string,
      role: TrainingCoachMessage['role'],
      content: string,
      parts: unknown = null
    ) =>
      message({
        id: role === 'user' ? 'user-msg' : 'assistant-msg',
        session_id: sessionId,
        role,
        content,
        parts,
      })
  );

  planRepo.getPlanById.mockResolvedValue(plan());
  planRepo.getSessionById.mockResolvedValue(null);
  planRepo.listGoals.mockResolvedValue([]);
  planRepo.listCommitments.mockResolvedValue([]);
  planRepo.listSessionsInRange.mockResolvedValue([]);

  snapshotService.getLatestSnapshot.mockResolvedValue({
    id: '66666666-6666-4666-8666-666666666666',
    user_id: USER_ID,
    plan_id: PLAN_ID,
    as_of_date: '2026-08-20',
    payload: { as_of_date: '2026-08-20', window_days: 42 },
    token_estimate: 20,
    created_at: '2026-08-20T00:00:00.000Z',
  });

  fitnessTestService.listTests.mockResolvedValue([]);
  fitnessTestService.scheduleTest.mockResolvedValue(null);
});

describe('parseCoachTurn', () => {
  it('reads the reply and both side effects', () => {
    const turn = parseCoachTurn({
      reply: 'Take the easy run tomorrow.',
      memories: [{ memory_key: 'night_shifts', memory_value: 'Works Weds' }],
      schedule_fitness_test: {
        test_type: '5k_time_trial',
        title: '5K test',
        scheduled_date: '2026-09-10',
      },
      ask_skip_for_session_id: PLAN_SESSION_ID,
    });

    expect(turn?.reply).toBe('Take the easy run tomorrow.');
    expect(turn?.memories).toEqual([
      {
        memory_key: 'night_shifts',
        memory_value: 'Works Weds',
        source: 'coach',
      },
    ]);
    expect(turn?.scheduleFitnessTest).toMatchObject({
      test_type: '5k_time_trial',
    });
    expect(turn?.askSkipForSessionId).toBe(PLAN_SESSION_ID);
  });

  it('rejects a turn with no usable reply', () => {
    expect(parseCoachTurn(null)).toBeNull();
    expect(parseCoachTurn({})).toBeNull();
    expect(parseCoachTurn({ reply: '   ' })).toBeNull();
    expect(parseCoachTurn([{ reply: 'x' }])).toBeNull();
  });

  it('keeps the reply and drops only the malformed side effects', () => {
    const turn = parseCoachTurn({
      reply: 'Good week.',
      memories: [
        { memory_key: '', memory_value: 'nothing' },
        { memory_key: 'prefers_mornings' },
        { memory_key: 'hates_treadmill', memory_value: 'Outdoor only' },
      ],
      schedule_fitness_test: 'next tuesday',
      ask_skip_for_session_id: 42,
    });

    expect(turn?.reply).toBe('Good week.');
    expect(turn?.memories).toHaveLength(1);
    expect(turn?.memories[0].memory_key).toBe('hates_treadmill');
    expect(turn?.scheduleFitnessTest).toBeNull();
    expect(turn?.askSkipForSessionId).toBeNull();
  });

  it('caps how many memories one turn can write', () => {
    const turn = parseCoachTurn({
      reply: 'Noted.',
      memories: Array.from({ length: 12 }, (_, index) => ({
        memory_key: `key_${index}`,
        memory_value: 'value',
      })),
    });

    expect(turn?.memories).toHaveLength(5);
  });
});

describe('sendMessage', () => {
  it('persists the athlete message and returns the coach reply', async () => {
    dispatch.dispatchAiRequest.mockResolvedValue(
      providerReply({ reply: 'Move the long run to Sunday.' })
    );

    const result = await trainingCoachService.sendMessage(
      USER_ID,
      USER_ID,
      PLAN_ID,
      COACH_SESSION_ID,
      { content: 'I missed my long run.' }
    );

    expect(result.user_message.role).toBe('user');
    expect(result.user_message.content).toBe('I missed my long run.');
    expect(result.assistant_message.role).toBe('assistant');
    expect(result.assistant_message.content).toBe(
      'Move the long run to Sunday.'
    );
    expect(result.memories_added).toBeUndefined();
    expect(result.scheduled_fitness_test_ids).toBeUndefined();
  });

  it('applies the memories and the fitness test the coach asked for', async () => {
    dispatch.dispatchAiRequest.mockResolvedValue(
      providerReply({
        reply: "Let's measure where you are.",
        memories: [
          { memory_key: 'shin_niggle', memory_value: 'Left shin since Aug' },
        ],
        schedule_fitness_test: {
          test_type: '5k_time_trial',
          title: '5K time trial',
          scheduled_date: '2026-09-10',
          prescription: { distance_km: 5 },
          due_interval_days: 28,
        },
      })
    );
    fitnessTestService.scheduleTest.mockResolvedValue({ id: 'test-1' });

    const result = await trainingCoachService.sendMessage(
      USER_ID,
      USER_ID,
      PLAN_ID,
      COACH_SESSION_ID,
      { content: 'How fit am I?' }
    );

    expect(coachRepo.upsertMemory).toHaveBeenCalledWith(USER_ID, PLAN_ID, {
      memory_key: 'shin_niggle',
      memory_value: 'Left shin since Aug',
      source: 'coach',
    });
    expect(fitnessTestService.scheduleTest).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        plan_id: PLAN_ID,
        test_type: '5k_time_trial',
        scheduled_date: '2026-09-10',
        source: 'coach',
      })
    );
    expect(result.scheduled_fitness_test_ids).toEqual(['test-1']);
    expect(result.memories_added).toBe(1);
  });

  it('discards a fitness test whose date is not a calendar day', async () => {
    dispatch.dispatchAiRequest.mockResolvedValue(
      providerReply({
        reply: 'Test soon.',
        schedule_fitness_test: {
          test_type: '5k_time_trial',
          title: '5K time trial',
          scheduled_date: 'next Tuesday',
        },
      })
    );

    const result = await trainingCoachService.sendMessage(
      USER_ID,
      USER_ID,
      PLAN_ID,
      COACH_SESSION_ID,
      { content: 'How fit am I?' }
    );

    expect(fitnessTestService.scheduleTest).not.toHaveBeenCalled();
    expect(result.assistant_message.content).toBe('Test soon.');
  });

  it('ignores a skip prompt for a session the athlete does not own', async () => {
    dispatch.dispatchAiRequest.mockResolvedValue(
      providerReply({
        reply: 'Why did you miss it?',
        ask_skip_for_session_id: PLAN_SESSION_ID,
      })
    );
    planRepo.getSessionById.mockResolvedValue(null);

    const result = await trainingCoachService.sendMessage(
      USER_ID,
      USER_ID,
      PLAN_ID,
      COACH_SESSION_ID,
      { content: 'I skipped Tuesday.' }
    );

    expect(result.assistant_message.parts).toBeNull();
  });

  it('attaches the skip prompt when the session is real', async () => {
    dispatch.dispatchAiRequest.mockResolvedValue(
      providerReply({
        reply: 'Why did you miss it?',
        ask_skip_for_session_id: PLAN_SESSION_ID,
      })
    );
    planRepo.getSessionById.mockResolvedValue({ id: PLAN_SESSION_ID });

    const result = await trainingCoachService.sendMessage(
      USER_ID,
      USER_ID,
      PLAN_ID,
      COACH_SESSION_ID,
      { content: 'I skipped Tuesday.' }
    );

    expect(result.assistant_message.parts).toEqual({
      ask_skip_for_session_id: PLAN_SESSION_ID,
    });
  });

  it('rejects a reply the provider returned in an unusable shape', async () => {
    dispatch.dispatchAiRequest.mockResolvedValue(
      providerReply({ memories: [] })
    );

    await expect(
      trainingCoachService.sendMessage(
        USER_ID,
        USER_ID,
        PLAN_ID,
        COACH_SESSION_ID,
        { content: 'Hi' }
      )
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it('surfaces a provider failure as a provider error', async () => {
    dispatch.dispatchAiRequest.mockResolvedValue({
      ok: false,
      category: 'upstream_error',
      detail: 'AI service returned status 500',
    });

    await expect(
      trainingCoachService.sendMessage(
        USER_ID,
        USER_ID,
        PLAN_ID,
        COACH_SESSION_ID,
        { content: 'Hi' }
      )
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it('refuses to post into a closed session', async () => {
    coachRepo.getSession.mockResolvedValue(coachSession({ status: 'closed' }));

    await expect(
      trainingCoachService.sendMessage(
        USER_ID,
        USER_ID,
        PLAN_ID,
        COACH_SESSION_ID,
        { content: 'Hi' }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(dispatch.dispatchAiRequest).not.toHaveBeenCalled();
  });

  it('refuses a session that belongs to another plan', async () => {
    coachRepo.getSession.mockResolvedValue(
      coachSession({ plan_id: '77777777-7777-4777-8777-777777777777' })
    );

    await expect(
      trainingCoachService.sendMessage(
        USER_ID,
        USER_ID,
        PLAN_ID,
        COACH_SESSION_ID,
        { content: 'Hi' }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('createSession', () => {
  it('stores the opening brief as a system message', async () => {
    coachRepo.createSession.mockResolvedValue(coachSession());

    const result = await trainingCoachService.createSession(USER_ID, PLAN_ID, {
      title: 'Weekly check-in',
      opening_brief: 'Three sessions were missed last week.',
    });

    expect(coachRepo.insertMessage).toHaveBeenCalledWith(
      USER_ID,
      COACH_SESSION_ID,
      'system',
      'Three sessions were missed last week.'
    );
    expect(result.messages).toHaveLength(1);
  });

  it('opens an empty session when there is no brief', async () => {
    coachRepo.createSession.mockResolvedValue(coachSession());

    const result = await trainingCoachService.createSession(
      USER_ID,
      PLAN_ID,
      {}
    );

    expect(coachRepo.insertMessage).not.toHaveBeenCalled();
    expect(result.messages).toEqual([]);
  });

  it('reports a missing plan as not found', async () => {
    planRepo.getPlanById.mockResolvedValue(null);

    await expect(
      trainingCoachService.createSession(USER_ID, PLAN_ID, {})
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('closeSession', () => {
  beforeEach(() => {
    coachRepo.closeSession.mockResolvedValue(
      coachSession({ status: 'closed', closed_at: '2026-08-21T00:00:00.000Z' })
    );
    coachRepo.upsertSummary.mockImplementation(
      async (
        _userId: string,
        sessionId: string,
        summary: string,
        tokenEstimate: number | null
      ) => ({
        id: '88888888-8888-4888-8888-888888888888',
        session_id: sessionId,
        summary,
        token_estimate: tokenEstimate,
        created_at: '2026-08-21T00:00:00.000Z',
        updated_at: '2026-08-21T00:00:00.000Z',
      })
    );
  });

  it('stores the AI summary and closes the session', async () => {
    dispatch.dispatchAiRequest.mockResolvedValue(
      providerReply({ summary: 'Agreed to move the long run to Sundays.' })
    );

    const result = await trainingCoachService.closeSession(
      USER_ID,
      USER_ID,
      PLAN_ID,
      COACH_SESSION_ID
    );

    expect(result.summary.summary).toBe(
      'Agreed to move the long run to Sundays.'
    );
    expect(result.session.status).toBe('closed');
  });

  it('falls back to an extractive summary when the provider fails', async () => {
    dispatch.dispatchAiRequest.mockResolvedValue({
      ok: false,
      category: 'timeout',
      detail: 'AI service did not respond before the timeout.',
    });

    const result = await trainingCoachService.closeSession(
      USER_ID,
      USER_ID,
      PLAN_ID,
      COACH_SESSION_ID
    );

    expect(result.summary.summary).toContain('I missed my long run.');
    expect(coachRepo.closeSession).toHaveBeenCalledWith(
      USER_ID,
      COACH_SESSION_ID
    );
  });

  it('still closes when no AI service is configured at all', async () => {
    chatRepo.getActiveAiServiceSetting.mockResolvedValue(null);

    const result = await trainingCoachService.closeSession(
      USER_ID,
      USER_ID,
      PLAN_ID,
      COACH_SESSION_ID
    );

    expect(dispatch.dispatchAiRequest).not.toHaveBeenCalled();
    expect(result.session.status).toBe('closed');
  });
});

describe('buildExtractiveSummary', () => {
  it('drops system briefs and keeps the newest exchanges', () => {
    const summary = buildExtractiveSummary([
      message({ id: 'a', role: 'system', content: 'Weekly check-in brief.' }),
      message({ id: 'b', role: 'user', content: 'I was sick.' }),
      message({ id: 'c', role: 'assistant', content: 'Rest this week.' }),
    ]);

    expect(summary).not.toContain('Weekly check-in brief.');
    expect(summary).toBe('Athlete: I was sick.\nCoach: Rest this week.');
  });

  it('says so when nothing was said', () => {
    expect(buildExtractiveSummary([])).toBe(
      'No conversation took place in this session.'
    );
  });
});
