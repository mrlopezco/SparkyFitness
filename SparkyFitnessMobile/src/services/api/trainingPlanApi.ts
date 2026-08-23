import type {
  TrainingCalendarResponse,
  TrainingFitnessTest,
  TrainingFitnessTestReportRequest,
  TrainingPlan,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE_NAME = 'Training Plan API';

interface TrainingPlanListResponse {
  plans: TrainingPlan[];
}

interface FitnessTestListResponse {
  tests: TrainingFitnessTest[];
}

export interface TrainingCalendarRange {
  startDate: string;
  endDate: string;
  planId?: string;
}

export const listPlans = async (): Promise<TrainingPlan[]> => {
  const response = await apiFetch<TrainingPlanListResponse>({
    endpoint: '/api/training-plans',
    serviceName: SERVICE_NAME,
    operation: 'list training plans',
  });
  return response.plans;
};

/** `startDate`/`endDate` stay calendar-day strings; the server owns the timezone. */
export const getCalendar = async ({
  startDate,
  endDate,
  planId,
}: TrainingCalendarRange): Promise<TrainingCalendarResponse> => {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });
  if (planId) {
    params.set('plan_id', planId);
  }
  return apiFetch<TrainingCalendarResponse>({
    endpoint: `/api/training-plans/calendar?${params.toString()}`,
    serviceName: SERVICE_NAME,
    operation: 'fetch training calendar',
  });
};

export const listFitnessTests = async (
  planId?: string,
): Promise<TrainingFitnessTest[]> => {
  const params = new URLSearchParams();
  if (planId) {
    params.set('plan_id', planId);
  }
  const query = params.toString();
  const response = await apiFetch<FitnessTestListResponse>({
    endpoint: `/api/training-plans/fitness-tests${query ? `?${query}` : ''}`,
    serviceName: SERVICE_NAME,
    operation: 'list fitness tests',
  });
  return response.tests;
};

export const reportFitnessTest = async (
  testId: string,
  body: TrainingFitnessTestReportRequest,
): Promise<TrainingFitnessTest> => {
  return apiFetch<TrainingFitnessTest>({
    endpoint: `/api/training-plans/fitness-tests/${testId}/report`,
    method: 'POST',
    body,
    serviceName: SERVICE_NAME,
    operation: 'report fitness test',
  });
};
