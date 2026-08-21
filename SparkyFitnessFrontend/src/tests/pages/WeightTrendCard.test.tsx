import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WeightTrendCard from '@/pages/Diary/WeightTrendCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue?: string | { defaultValue?: string; amount?: string }
    ) => {
      if (typeof defaultValue === 'string') return defaultValue;
      if (defaultValue?.defaultValue && defaultValue.amount) {
        return defaultValue.defaultValue.replace(
          '{{amount}}',
          defaultValue.amount
        );
      }
      return defaultValue?.defaultValue || _key;
    },
  }),
}));

jest.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'user-1' }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    goalMode: 'cut',
    goalModeCustomPercentage: 0,
    formatDateInUserTimezone: (d: string) => d,
  }),
}));

jest.mock('@/hooks/Settings/useProfile', () => ({
  useProfileQuery: () => ({ data: { target_weight: 75 } }),
}));

const mockUseRecentWeights = jest.fn();

jest.mock('@/hooks/Diary/useRecentWeights', () => ({
  useRecentWeights: (...args: unknown[]) => mockUseRecentWeights(...args),
}));

describe('WeightTrendCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows empty state when no weights', () => {
    mockUseRecentWeights.mockReturnValue({
      data: { recentDesc: [], recentAsc: [], current: null },
      isLoading: false,
      isError: false,
    });

    render(<WeightTrendCard selectedDate="2026-08-20" />);

    expect(
      screen.getByText(/No weight logged yet/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Check-In/i })).toHaveAttribute(
      'href',
      '/checkin'
    );
  });

  it('shows current weight, recent list, and on-track badge', () => {
    mockUseRecentWeights.mockReturnValue({
      data: {
        recentDesc: [
          { entry_date: '2026-08-20', weightKg: 80 },
          { entry_date: '2026-08-18', weightKg: 81 },
          { entry_date: '2026-08-16', weightKg: 82 },
        ],
        recentAsc: [
          { entry_date: '2026-08-16', weightKg: 82 },
          { entry_date: '2026-08-18', weightKg: 81 },
          { entry_date: '2026-08-20', weightKg: 80 },
        ],
        current: { entry_date: '2026-08-20', weightKg: 80 },
      },
      isLoading: false,
      isError: false,
    });

    render(<WeightTrendCard selectedDate="2026-08-20" />);

    expect(screen.getAllByText('80 kg').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/On track/i)).toBeInTheDocument();
    expect(screen.getByText('2026-08-18')).toBeInTheDocument();
    expect(screen.getByText(/above target/i)).toBeInTheDocument();
  });
});
