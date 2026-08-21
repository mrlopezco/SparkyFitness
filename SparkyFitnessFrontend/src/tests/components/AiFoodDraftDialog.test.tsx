import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AiFoodDraftDialog from '@/components/FoodSearch/AiFoodDraftDialog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) =>
      typeof defaultValue === 'string' ? defaultValue : _key,
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

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: 'UTC' }),
}));

const mockMutateAnalyze = jest.fn();

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
}));

describe('AiFoodDraftDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('analyzes text and applies the first proposed food to the form', async () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    mockMutateAnalyze.mockResolvedValue({
      items: [
        {
          client_id: 'c1',
          name: 'Chicken, grilled',
          brand: null,
          quantity: 100,
          unit: 'g',
          source: 'usda',
          serving_size: 100,
          serving_unit: 'g',
          nutrients: {
            calories: 165,
            protein: 31,
            carbs: 0,
            fat: 3.6,
          },
        },
      ],
    });

    render(
      <AiFoodDraftDialog isOpen onClose={onClose} onApply={onApply} />
    );

    fireEvent.change(screen.getByLabelText(/What food is this/i), {
      target: { value: '100g grilled chicken' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fill Form/i }));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Chicken, grilled',
          serving_size: 100,
          serving_unit: 'g',
          source: 'imported',
          nutrients: expect.objectContaining({ calories: 165, protein: 31 }),
        })
      );
      expect(onClose).toHaveBeenCalled();
    });
  });
});
