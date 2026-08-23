/**
 * Typed HTTP client for the SparkyFitnessGhd sidecar.
 * Sidecar holds Garmin tokens; this client only proxies auth / extract / projection.
 */

import { log } from '../../config/logging.js';

const DEFAULT_GHD_URL = 'http://sparkyfitness-ghd:8001';

function baseUrl(): string {
  return (process.env.GHD_MICROSERVICE_URL || DEFAULT_GHD_URL).replace(/\/$/, '');
}

export class GhdMicroserviceError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = 'GhdMicroserviceError';
    this.status = status;
    this.detail = detail;
  }
}

export interface GhdLoginOk {
  ok: true;
}

export interface GhdLoginNeedsMfa {
  ok?: false;
  needs_mfa: true;
  mfa_id: string;
}

export type GhdLoginResult = GhdLoginOk | GhdLoginNeedsMfa | Record<string, unknown>;

export interface GhdAuthStatusResult {
  linked: boolean;
}

export interface GhdExtractResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const url = `${baseUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log('error', `[ghdMicroserviceClient] POST ${path} network error:`, message);
    throw new GhdMicroserviceError(`GHD sidecar unreachable: ${message}`, 503, {
      error: 'sidecar_unreachable',
      message,
    });
  }

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new GhdMicroserviceError(
      `GHD sidecar ${path} failed (${response.status})`,
      response.status,
      payload
    );
  }
  return payload as T;
}

async function getJson<T>(path: string, query: Record<string, string>): Promise<T> {
  const params = new URLSearchParams(query);
  const url = `${baseUrl()}${path}?${params.toString()}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log('error', `[ghdMicroserviceClient] GET ${path} network error:`, message);
    throw new GhdMicroserviceError(`GHD sidecar unreachable: ${message}`, 503, {
      error: 'sidecar_unreachable',
      message,
    });
  }

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new GhdMicroserviceError(
      `GHD sidecar ${path} failed (${response.status})`,
      response.status,
      payload
    );
  }
  return payload as T;
}

export async function login(
  userId: string,
  email: string,
  password: string
): Promise<GhdLoginResult> {
  return postJson<GhdLoginResult>('/auth/login', {
    user_id: userId,
    email,
    password,
  });
}

export async function resumeLogin(
  userId: string,
  mfaId: string,
  mfaCode: string
): Promise<GhdLoginResult> {
  return postJson<GhdLoginResult>('/auth/resume_login', {
    user_id: userId,
    mfa_id: mfaId,
    mfa_code: mfaCode,
  });
}

export async function authStatus(userId: string): Promise<GhdAuthStatusResult> {
  return postJson<GhdAuthStatusResult>('/auth/status', { user_id: userId });
}

export async function unlink(userId: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>('/auth/unlink', { user_id: userId });
}

export async function extract(
  userId: string,
  startDate: string,
  endDate: string,
  dataTypes?: string[]
): Promise<GhdExtractResult> {
  const body: Record<string, unknown> = {
    user_id: userId,
    start_date: startDate,
    end_date: endDate,
  };
  if (dataTypes && dataTypes.length > 0) {
    body.data_types = dataTypes;
  }
  return postJson<GhdExtractResult>('/extract', body);
}

export async function getTrainingProjection(
  userId: string,
  startDate: string,
  endDate: string
): Promise<unknown> {
  return getJson<unknown>('/projection/training', {
    user_id: userId,
    start_date: startDate,
    end_date: endDate,
  });
}

const ghdMicroserviceClient = {
  login,
  resumeLogin,
  authStatus,
  unlink,
  extract,
  getTrainingProjection,
  GhdMicroserviceError,
};

export default ghdMicroserviceClient;
