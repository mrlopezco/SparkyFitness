import {
  type DispatchErrorCategory,
  type ProviderConfig,
} from '../ai/providerDispatch.js';
import { deriveAiNetworkPolicy } from '../utils/outboundUrlPolicy.js';
import chatRepository from '../models/chatRepository.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';

/**
 * Shared plumbing for the fork's training AI features (planner, adjuster,
 * coach): the domain error types the routes map to error codes, the
 * dispatch-category translation, and provider-config resolution. Lives apart
 * from the individual services so all three throw the same errors and a route
 * `instanceof` check keeps working regardless of which one raised.
 */

export class NoAiServiceError extends Error {
  constructor(message = 'No AI service configured for this user.') {
    super(message);
    this.name = 'NoAiServiceError';
  }
}

export class AiTrainingPlanDisabledError extends Error {
  constructor(message = 'AI features are disabled for this user.') {
    super(message);
    this.name = 'AiTrainingPlanDisabledError';
  }
}

export class ProviderResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderResponseError';
  }
}

export class PrivateNetworkAiUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivateNetworkAiUrlError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConfirmFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfirmFailedError';
  }
}

export const DISPATCH_ERROR_TO_THROW = {
  api_key_missing: () => new NoAiServiceError(),
  custom_url_missing: () => new NoAiServiceError(),
  unsupported_provider: (d: string) => new ProviderResponseError(d),
  unsupported_media: (d: string) => new ProviderResponseError(d),
  private_network_forbidden: (d: string) => new PrivateNetworkAiUrlError(d),
  timeout: (d: string) => new ProviderResponseError(d),
  upstream_error: (d: string) => new ProviderResponseError(d),
  refused: (d: string) => new ProviderResponseError(d),
  truncated: (d: string) => new ProviderResponseError(d),
  no_content: (d: string) => new ProviderResponseError(d),
  parse_error: (d: string) => new ProviderResponseError(d),
} satisfies Record<DispatchErrorCategory, (detail: string) => Error>;

export function dispatchErrorToThrow(
  category: DispatchErrorCategory,
  detail: string
): Error {
  return DISPATCH_ERROR_TO_THROW[category](detail);
}

export interface ResolvedProvider {
  provider: ProviderConfig;
  networkPolicy: ReturnType<typeof deriveAiNetworkPolicy>;
}

export async function loadProviderConfig(
  userId: string,
  serviceConfigId: string | undefined,
  actorIsAdmin: boolean
): Promise<ResolvedProvider> {
  const userAiConfigAllowed =
    await globalSettingsRepository.isUserAiConfigAllowed();
  if (!userAiConfigAllowed) {
    throw new AiTrainingPlanDisabledError();
  }

  let settingId = serviceConfigId;
  if (!settingId) {
    const active = await chatRepository.getActiveAiServiceSetting(userId);
    if (!active) {
      throw new NoAiServiceError();
    }
    settingId = active.id;
  }

  if (!settingId) {
    throw new NoAiServiceError();
  }

  const aiService = await chatRepository.getAiServiceSettingForBackend(
    settingId,
    userId
  );
  if (!aiService) {
    throw new NoAiServiceError();
  }

  return {
    provider: {
      service_type: aiService.service_type,
      api_key: aiService.api_key ?? undefined,
      model_name: aiService.model_name ?? undefined,
      custom_url: aiService.custom_url ?? undefined,
      timeout: aiService.timeout ?? undefined,
    },
    networkPolicy: deriveAiNetworkPolicy(aiService, actorIsAdmin),
  };
}
