import { apiCall } from '@/api/api';
import type {
  GhdCoverageResponse,
  GhdHistoryImportJobStatusResponse,
  GhdHistoryImportStartRequest,
  GhdHistoryImportStartResponse,
} from '@workspace/shared';

const GHD_BASE = '/integrations/garmin-health-data';

export interface GhdLoginPayload {
  email: string;
  password: string;
}

export interface GhdProviderData {
  id: string;
  provider_type: string;
}

export interface GhdLoginResponse {
  status?: string;
  ok?: boolean;
  needs_mfa?: boolean;
  provider?: GhdProviderData;
  /** MFA session id (contract). */
  mfa_id?: string;
  /** Alias some backends may mirror from classic Garmin. */
  client_state?: string;
  error?: string;
  message?: string;
}

export interface GhdMfaPayload {
  mfa_id: string | null;
  mfa_code: string;
}

export interface GhdMfaResponse {
  status?: string;
  ok?: boolean;
  provider?: GhdProviderData;
  message?: string;
}

export interface GhdStatusResponse {
  isLinked: boolean;
  lastUpdated: string | null;
  tokenExpiresAt: string | null;
}

export const loginGarminHealthData = async (
  payload: GhdLoginPayload
): Promise<GhdLoginResponse> => {
  return apiCall(`${GHD_BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const resumeGarminHealthDataLogin = async (
  payload: GhdMfaPayload
): Promise<GhdMfaResponse> => {
  const result = await apiCall<GhdMfaResponse>(
    `${GHD_BASE}/auth/resume_login`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );

  if (result.status !== 'success' && result.ok !== true) {
    throw new Error(
      result.message || 'Failed to submit MFA code. Please try again.'
    );
  }

  return { ...result, status: result.status ?? 'success' };
};

export const fetchGarminHealthDataStatus =
  async (): Promise<GhdStatusResponse> => {
    return apiCall(`${GHD_BASE}/auth/status`, {
      method: 'POST',
    });
  };

export const unlinkGarminHealthData = async (): Promise<void> => {
  await apiCall(`${GHD_BASE}/auth/unlink`, {
    method: 'POST',
  });
};

export const syncGarminHealthData = async (
  startDate?: string,
  endDate?: string
): Promise<void> => {
  await apiCall(`${GHD_BASE}/sync`, {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
};

export const startGhdHistoryImport = async (
  payload: GhdHistoryImportStartRequest
): Promise<GhdHistoryImportStartResponse> => {
  return apiCall(`${GHD_BASE}/history-import`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const fetchGhdHistoryImport =
  async (): Promise<GhdHistoryImportJobStatusResponse> => {
    return apiCall(`${GHD_BASE}/history-import`, {
      method: 'GET',
      suppress404Toast: true,
    });
  };

export const cancelGhdHistoryImport =
  async (): Promise<GhdHistoryImportJobStatusResponse> => {
    return apiCall(`${GHD_BASE}/history-import/cancel`, {
      method: 'POST',
    });
  };

export const pauseGhdHistoryImport =
  async (): Promise<GhdHistoryImportJobStatusResponse> => {
    return apiCall(`${GHD_BASE}/history-import/pause`, {
      method: 'POST',
    });
  };

export const resumeGhdHistoryImport =
  async (): Promise<GhdHistoryImportJobStatusResponse> => {
    return apiCall(`${GHD_BASE}/history-import/resume`, {
      method: 'POST',
    });
  };

export const fetchGhdCoverage = async (): Promise<GhdCoverageResponse> => {
  return apiCall(`${GHD_BASE}/coverage`, {
    method: 'GET',
  });
};

/** Prefer contract `mfa_id`; fall back to classic Garmin `client_state`. */
export const resolveGhdMfaId = (
  response: Pick<GhdLoginResponse, 'mfa_id' | 'client_state'>
): string | null => response.mfa_id || response.client_state || null;

export const isGhdLoginSuccess = (
  response: Pick<GhdLoginResponse, 'status' | 'ok'>
): boolean => response.status === 'success' || response.ok === true;

export const isGhdMfaRequired = (
  response: Pick<GhdLoginResponse, 'status' | 'needs_mfa'>
): boolean =>
  response.status === 'needs_mfa' || response.needs_mfa === true;
