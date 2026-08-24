import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TrainingPage from '@/pages/Training/TrainingPage';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string | { defaultValue?: string }) =>
      typeof defaultValue === 'string'
        ? defaultValue
        : defaultValue?.defaultValue || _key,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: 'UTC', firstDayOfWeek: 0 }),
}));

const mockPropose = jest.fn();
const mockAdjust = jest.fn();
const mockCreatePlannerSession = jest.fn();
const mockSendPlannerMessage = jest.fn();
const mockDraftPlannerSession = jest.fn();

const mockIdleMutation = () => ({
  mutate: jest.fn(),
  mutateAsync: jest.fn(),
  isPending: false,
  reset: jest.fn(),
});

const mockPlan = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  name: 'Spring 10K build',
  description: null,
  sport_focus: 'running',
  start_date: '2026-08-01',
  target_date: '2026-10-24',
  status: 'active',
  notes: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

const mockSnapshot = {
  id: '44444444-4444-4444-8444-444444444444',
  user_id: mockPlan.user_id,
  plan_id: mockPlan.id,
  as_of_date: '2026-08-20',
  token_estimate: 400,
  created_at: '2026-08-20T00:00:00.000Z',
  payload: {
    as_of_date: '2026-08-20',
    window_days: 28,
    running: {
      session_count: 12,
      total_distance_km: 140,
      total_duration_minutes: 800,
      avg_distance_km: 11.6,
      recent_long_run_km: 20,
    },
    running_science: {
      race_prediction_5k_seconds: 1290,
      race_prediction_10k_seconds: 2680,
      race_prediction_half_marathon_seconds: 5940,
      estimated_easy_pace_min_per_km: 6.25,
      estimated_tempo_pace_min_per_km: 4.75,
      estimated_threshold_pace_min_per_km: 4.5,
    },
  },
};

const mockCompletedTest = {
  id: '55555555-5555-4555-8555-555555555555',
  plan_id: mockPlan.id,
  user_id: mockPlan.user_id,
  test_type: '5k_time_trial',
  title: 'Mid-block 5K check',
  scheduled_date: '2026-08-15',
  status: 'completed',
  prescription: {},
  result: { duration_seconds: 1305 },
  source: 'user',
  due_interval_days: null,
  notes: null,
  created_at: '2026-08-10T00:00:00.000Z',
  updated_at: '2026-08-15T00:00:00.000Z',
  completed_at: '2026-08-15T00:00:00.000Z',
};

const plannerSessionId = '66666666-6666-4666-8666-666666666666';

jest.mock('@/hooks/Training/useTrainingPlans', () => ({
  useTrainingPlans: () => ({ data: [mockPlan], isLoading: false }),
  useTrainingPlanDetail: () => ({
    data: {
      ...mockPlan,
      goals: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          plan_id: mockPlan.id,
          type: 'race',
          title: 'Sub-45 10K',
          target_date: '2026-10-24',
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-01T00:00:00.000Z',
        },
      ],
      commitments: [],
    },
  }),
  useLatestAthleteSnapshot: () => ({ data: mockSnapshot }),
  useTrainingCalendar: () => ({ data: { days: [] }, isLoading: false }),
  useCreateTrainingPlanMutation: () => mockIdleMutation(),
  useUpdateTrainingPlanMutation: () => mockIdleMutation(),
  useDeleteTrainingPlanMutation: () => mockIdleMutation(),
  useSaveTrainingGoalsMutation: () => mockIdleMutation(),
  useSaveTrainingCommitmentsMutation: () => mockIdleMutation(),
  useConfirmTrainingPlanMutation: () => mockIdleMutation(),
  useCreateAthleteSnapshotMutation: () => mockIdleMutation(),
  useMatchTrainingAdherenceMutation: () => mockIdleMutation(),
  useSkipTrainingSessionMutation: () => mockIdleMutation(),
  useReportTrainingSessionExecutionMutation: () => mockIdleMutation(),
  useExportTrainingPlanMutation: () => mockIdleMutation(),
  useImportTrainingPlanMutation: () => mockIdleMutation(),
  useProposeTrainingPlanMutation: () => ({
    mutateAsync: mockPropose,
    isPending: false,
    reset: jest.fn(),
  }),
  useAdjustTrainingPlanMutation: () => ({
    mutateAsync: mockAdjust,
    isPending: false,
    reset: jest.fn(),
  }),
  useTrainingPlanFeasibility: () => ({ data: undefined }),
  useTrainingPlanHealth: () => ({ data: undefined }),
}));

jest.mock('@/hooks/Training/useTrainingPlanPlanner', () => ({
  usePlannerChangeHistory: () => ({ data: [], isLoading: false }),
  usePlannerSessions: () => ({ data: [], isLoading: false }),
  usePlannerSessionDetail: () => ({ data: undefined, isLoading: false }),
  useCreatePlannerSessionMutation: () => ({
    mutateAsync: mockCreatePlannerSession,
    isPending: false,
  }),
  useSendPlannerMessageMutation: () => ({
    mutateAsync: mockSendPlannerMessage,
    isPending: false,
  }),
  useDraftPlannerSessionMutation: () => ({
    mutateAsync: mockDraftPlannerSession,
    isPending: false,
  }),
  useCancelPlannerSessionMutation: () => mockIdleMutation(),
}));

jest.mock('@/hooks/Training/useFitnessTests', () => ({
  useFitnessTests: () => ({ data: [mockCompletedTest], isLoading: false }),
  useCreateFitnessTestMutation: () => mockIdleMutation(),
  useReportFitnessTestMutation: () => mockIdleMutation(),
  useDeleteFitnessTestMutation: () => mockIdleMutation(),
}));

jest.mock('@/hooks/Training/useTrainingCoach', () => ({
  useCoachSessions: () => ({ data: [], isLoading: false }),
  useCoachSession: () => ({ data: undefined, isLoading: false }),
  useCoachMemories: () => ({ data: [], isLoading: false }),
  useCreateCoachSessionMutation: () => mockIdleMutation(),
  useSendCoachMessageMutation: () => mockIdleMutation(),
  useCloseCoachSessionMutation: () => mockIdleMutation(),
  useUpsertCoachMemoryMutation: () => mockIdleMutation(),
  useDeleteCoachMemoryMutation: () => mockIdleMutation(),
}));

describe('TrainingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreatePlannerSession.mockResolvedValue({
      session: {
        id: plannerSessionId,
        plan_id: mockPlan.id,
        user_id: mockPlan.user_id,
        mode: 'generate',
        status: 'active',
        summary: null,
        adjust_from: null,
        adjust_to: null,
        created_at: '2026-08-20T00:00:00.000Z',
        updated_at: '2026-08-20T00:00:00.000Z',
        confirmed_at: null,
        cancelled_at: null,
      },
      messages: [
        {
          role: 'assistant',
          content: 'Tell me about your training week.',
        },
      ],
    });
  });

  it('renders the plan list, goals and create form', () => {
    render(<TrainingPage />);

    expect(screen.getByText('Spring 10K build')).toBeTruthy();
    expect(screen.getByText('Sub-45 10K')).toBeTruthy();
    expect(screen.getByLabelText('Plan name')).toBeTruthy();
  });

  it('opens the review dialog with the proposed sessions', async () => {
    mockSendPlannerMessage.mockResolvedValue({
      reply: 'Got it — I will keep long runs on Sunday.',
      ready_for_draft: true,
    });
    mockDraftPlannerSession.mockResolvedValue({
      plan_id: mockPlan.id,
      summary: 'Eight-week build with two quality sessions a week.',
      sessions: [
        {
          client_id: 'session-1',
          scheduled_date: '2026-08-21',
          session_type: 'easy_run',
          prescription: { title: 'Easy 5 km', distance_km: 5 },
        },
      ],
    });

    render(<TrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'AI Chats' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate plan' })
    );

    await waitFor(() => {
      expect(mockCreatePlannerSession).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByLabelText('Your message'), {
      target: { value: 'Two quality days, long run Sunday.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(mockSendPlannerMessage).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Draft proposal' }));

    await waitFor(() => {
      expect(mockDraftPlannerSession).toHaveBeenCalled();
      expect(
        screen.getByText('Eight-week build with two quality sessions a week.')
      ).toBeTruthy();
      expect(screen.getByDisplayValue('Easy 5 km')).toBeTruthy();
    });
  });

  it('shows derived running paces and recent tests on the overview', () => {
    render(<TrainingPage />);

    expect(screen.getByText('6:15 /km')).toBeTruthy();
    expect(screen.getByText('4:45 /km')).toBeTruthy();
    expect(screen.getByText('4:30 /km')).toBeTruthy();
    expect(screen.getByText('Mid-block 5K check')).toBeTruthy();
  });

  it('renders the training plan, AI chats and fitness test tabs', () => {
    render(<TrainingPage />);

    expect(screen.getByRole('button', { name: 'Training plan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'AI Chats' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fitness tests' })).toBeTruthy();
  });
});
