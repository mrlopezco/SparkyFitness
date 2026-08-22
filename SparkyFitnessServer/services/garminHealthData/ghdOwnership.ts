/**
 * Detect whether Garmin Health Data owns wearable writes for a user.
 */

import externalProviderRepository from '../../models/externalProviderRepository.js';
import { GHD_SOURCE } from './garminSourcePreference.js';

export async function isGhdActiveOwner(userId: string): Promise<boolean> {
  const provider =
    await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(
      userId,
      GHD_SOURCE
    );
  return Boolean(provider?.is_active);
}
