import { beforeEach, describe, expect, it, vi } from 'vitest';

const getExternalDataProviderByUserIdAndProviderName = vi.fn();

vi.mock('../models/externalProviderRepository.js', () => ({
  default: {
    getExternalDataProviderByUserIdAndProviderName: (...args: unknown[]) =>
      getExternalDataProviderByUserIdAndProviderName(...args),
  },
}));

import { isGhdActiveOwner } from '../services/garminHealthData/ghdOwnership.js';

describe('isGhdActiveOwner', () => {
  beforeEach(() => {
    getExternalDataProviderByUserIdAndProviderName.mockReset();
  });

  it('returns true when garmin_health_data is active', async () => {
    getExternalDataProviderByUserIdAndProviderName.mockResolvedValue({
      provider_type: 'garmin_health_data',
      is_active: true,
    });
    await expect(isGhdActiveOwner('user-1')).resolves.toBe(true);
    expect(getExternalDataProviderByUserIdAndProviderName).toHaveBeenCalledWith(
      'user-1',
      'garmin_health_data'
    );
  });

  it('returns false when GHD is inactive or missing', async () => {
    getExternalDataProviderByUserIdAndProviderName.mockResolvedValue({
      provider_type: 'garmin_health_data',
      is_active: false,
    });
    await expect(isGhdActiveOwner('user-1')).resolves.toBe(false);

    getExternalDataProviderByUserIdAndProviderName.mockResolvedValue(null);
    await expect(isGhdActiveOwner('user-1')).resolves.toBe(false);
  });
});
