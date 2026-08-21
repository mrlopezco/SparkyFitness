import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FitnessTestsPanel from '@/pages/Training/components/FitnessTestsPanel';

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

const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const TEST_ID = '22222222-2222-4222-8222-222222222222';

const mockCreate = jest.fn();
const mockReport = jest.fn();

const mockIdleMutation = () => ({
  mutate: jest.fn(),
  mutateAsync: jest.fn(),
  isPending: false,
  reset: jest.fn(),
});

const mockScheduledTest = {
  id: TEST_ID,
  plan_id: PLAN_ID,
  user_id: '33333333-3333-4333-8333-333333333333',
  test_type: '5k_time_trial',
  title: 'Mid-block 5K check',
  scheduled_date: '2026-08-25',
  status: 'scheduled',
  prescription: { instructions: '15 min warm-up, then 5 km hard' },
  result: null,
  source: 'coach',
  due_interval_days: 28,
  notes: null,
  created_at: '2026-08-18T00:00:00.000Z',
  updated_at: '2026-08-18T00:00:00.000Z',
  completed_at: null,
};

jest.mock('@/hooks/Training/useFitnessTests', () => ({
  useFitnessTests: () => ({ data: [mockScheduledTest], isLoading: false }),
  useCreateFitnessTestMutation: () => ({
    mutateAsync: mockCreate,
    isPending: false,
    reset: jest.fn(),
  }),
  useReportFitnessTestMutation: () => ({
    mutateAsync: mockReport,
    isPending: false,
    reset: jest.fn(),
  }),
  useDeleteFitnessTestMutation: () => mockIdleMutation(),
}));

describe('FitnessTestsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({});
    mockReport.mockResolvedValue({});
  });

  it('lists the scheduled tests with their instructions', () => {
    render(<FitnessTestsPanel planId={PLAN_ID} />);

    expect(screen.getByText('Mid-block 5K check')).toBeTruthy();
    expect(screen.getByText('15 min warm-up, then 5 km hard')).toBeTruthy();
  });

  it('schedules a test with the typed title and date', async () => {
    render(<FitnessTestsPanel planId={PLAN_ID} />);

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Cooper check' },
    });
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Schedule test/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        plan_id: PLAN_ID,
        test_type: '5k_time_trial',
        title: 'Cooper check',
        scheduled_date: '2026-09-01',
        prescription: { instructions: null },
        source: 'user',
      });
    });
  });

  it('reports results as a duration in seconds', async () => {
    render(<FitnessTestsPanel planId={PLAN_ID} />);

    fireEvent.click(screen.getByRole('button', { name: /Report results/i }));

    fireEvent.change(screen.getByLabelText('Minutes'), {
      target: { value: '21' },
    });
    fireEvent.change(screen.getByLabelText('Seconds'), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByLabelText('RPE (1-10)'), {
      target: { value: '9' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save results/i }));

    await waitFor(() => {
      expect(mockReport).toHaveBeenCalledWith({
        testId: TEST_ID,
        payload: {
          status: 'completed',
          result: {
            distance_km: null,
            duration_seconds: 1305,
            avg_heart_rate: null,
            perceived_effort: 9,
            notes: null,
          },
        },
      });
    });
  });
});
