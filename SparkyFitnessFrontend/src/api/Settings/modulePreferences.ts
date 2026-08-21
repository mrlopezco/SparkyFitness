import { apiCall } from '@/api/api';
import type { ForkModuleId } from '@workspace/shared';

export type ModulePreferencesMap = Record<ForkModuleId, boolean>;

export interface ModulePreferencesResponse {
  modules: ModulePreferencesMap;
}

export const getModulePreferences =
  async (): Promise<ModulePreferencesResponse> => {
    return apiCall('/module-preferences');
  };

export const updateModulePreferences = async (
  modules: Partial<Record<ForkModuleId, boolean>>
): Promise<ModulePreferencesResponse> => {
  return apiCall('/module-preferences', {
    method: 'PUT',
    body: JSON.stringify({ modules }),
  });
};
