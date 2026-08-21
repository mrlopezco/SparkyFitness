import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AiMealLogDialog from '@/pages/Diary/AiMealLogDialog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string | { defaultValue?: string }) =>
      typeof defaultValue === 'string'
        ? defaultValue
        : defaultValue?.defaultValue || _key,
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

const mockMutateAnalyze = jest.fn();
const mockMutateConfirm = jest.fn();

jest.mock('@/hooks/AI/useAIServiceSettings', () => ({
  useActiveAIService: () => ({
    data: { id: 'setting-1', service_type: 'google', is_active: true },
    isLoading: false,
  }),
  useAIServices: () => ({
    data: [{ id: 'setting-1', service_type: 'google', is_active: true }],
    isLoading: false,
  }),
}));

jest.mock('@/hooks/Diary/useAiMealLog', () => ({
  useAnalyzeAiMealLogMutation: () => ({
    mutateAsync: mockMutateAnalyze,
    isPending: false,
    reset: jest.fn(),
  }),
  useConfirmAiMealLogMutation: () => ({
    mutateAsync: mockMutateConfirm,
    isPending: false,
    reset: jest.fn(),
  }),
}));

describe('AiMealLogDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('analyzes text and shows review rows', async () => {
    mockMutateAnalyze.mockResolvedValue({
      items: [
        {
          client_id: 'c1',
          name: 'Chicken',
          quantity: 200,
          unit: 'g',
          source: 'usda',
          nutrients: { calories: 220, protein: 40, carbs: 0, fat: 5 },
          warning: null,
        },
      ],
    });

    render(
      <AiMealLogDialog
        isOpen
        onClose={jest.fn()}
        mealType="lunch"
        mealTypeId="meal-1"
        selectedDate="2026-08-20"
      />
    );

    fireEvent.change(screen.getByLabelText(/What did you eat/i), {
      target: {
        value: '200g chicken',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Analyze & Review/i }));

    await waitFor(() => {
      expect(mockMutateAnalyze).toHaveBeenCalled();
      expect(screen.getByDisplayValue('Chicken')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Log Meal/i })).toBeTruthy();
    });
  });
});
