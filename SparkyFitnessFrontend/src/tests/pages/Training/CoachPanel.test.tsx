import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CoachPanel from '@/pages/Training/components/CoachPanel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string | { defaultValue?: string }) =>
      typeof defaultValue === 'string'
        ? defaultValue
        : defaultValue?.defaultValue || _key,
  }),
}));

const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';

const mockSendMessage = jest.fn();
const mockUpsertMemory = jest.fn();

const mockIdleMutation = () => ({
  mutate: jest.fn(),
  mutateAsync: jest.fn(),
  isPending: false,
  reset: jest.fn(),
});

const mockSession = {
  id: SESSION_ID,
  plan_id: PLAN_ID,
  user_id: '33333333-3333-4333-8333-333333333333',
  status: 'open',
  title: 'Weekly check-in',
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
  closed_at: null,
};

jest.mock('@/hooks/Training/useTrainingCoach', () => ({
  useCoachSessions: () => ({ data: [mockSession], isLoading: false }),
  useCoachSession: () => ({
    data: {
      session: mockSession,
      summary: null,
      messages: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          session_id: SESSION_ID,
          role: 'user',
          content: 'I missed Tuesday intervals.',
          created_at: '2026-08-20T01:00:00.000Z',
        },
        {
          id: '55555555-5555-4555-8555-555555555555',
          session_id: SESSION_ID,
          role: 'assistant',
          content: 'Move the quality session to Thursday.',
          created_at: '2026-08-20T01:00:05.000Z',
        },
      ],
    },
    isLoading: false,
  }),
  useCoachMemories: () => ({
    data: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        plan_id: PLAN_ID,
        user_id: '33333333-3333-4333-8333-333333333333',
        memory_key: 'injury_history',
        memory_value: 'Left knee flares up on back-to-back speed days',
        source: 'user',
        created_at: '2026-08-19T00:00:00.000Z',
        updated_at: '2026-08-19T00:00:00.000Z',
      },
    ],
    isLoading: false,
  }),
  useCreateCoachSessionMutation: () => mockIdleMutation(),
  useSendCoachMessageMutation: () => ({
    mutateAsync: mockSendMessage,
    isPending: false,
    reset: jest.fn(),
  }),
  useCloseCoachSessionMutation: () => mockIdleMutation(),
  useUpsertCoachMemoryMutation: () => ({
    mutateAsync: mockUpsertMemory,
    isPending: false,
    reset: jest.fn(),
  }),
  useDeleteCoachMemoryMutation: () => mockIdleMutation(),
}));

jest.mock('@/hooks/Training/useTrainingPlanPlanner', () => ({
  usePlannerSessions: () => ({ data: [], isLoading: false }),
  usePlannerSessionDetail: () => ({ data: undefined, isLoading: false }),
  useCreatePlannerSessionMutation: () => mockIdleMutation(),
  useSendPlannerMessageMutation: () => mockIdleMutation(),
  useDraftPlannerSessionMutation: () => mockIdleMutation(),
}));

describe('CoachPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMessage.mockResolvedValue({});
    mockUpsertMemory.mockResolvedValue({});
  });

  it('asks for a plan when none is selected', () => {
    render(<CoachPanel planId={undefined} />);

    expect(screen.getByText('Select or create a plan first.')).toBeTruthy();
  });

  it('renders the conversation list and thread', () => {
    render(<CoachPanel planId={PLAN_ID} />);

    expect(screen.getByText('I missed Tuesday intervals.')).toBeTruthy();
    expect(
      screen.getByText('Move the quality session to Thursday.')
    ).toBeTruthy();
    expect(screen.getByText('Conversations')).toBeTruthy();
  });

  it('sends a message to the active session', async () => {
    render(<CoachPanel planId={PLAN_ID} />);

    fireEvent.change(screen.getByLabelText('Your message'), {
      target: { value: 'Should I still race on Sunday?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith({
        planId: PLAN_ID,
        sessionId: SESSION_ID,
        payload: { content: 'Should I still race on Sunday?' },
      });
    });
  });
});
