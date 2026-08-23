import {
  isKnownForkModuleId,
  resolveForkModuleMap,
  type ForkModuleId,
} from '@workspace/shared';
import modulePreferenceRepository from '../models/modulePreferenceRepository.js';

export class UnknownModuleError extends Error {
  constructor(moduleIds: string[]) {
    super(`Unknown module id(s): ${moduleIds.join(', ')}`);
    this.name = 'UnknownModuleError';
  }
}

async function getEffectiveModules(
  userId: string
): Promise<Record<ForkModuleId, boolean>> {
  const row = await modulePreferenceRepository.getModulePreferences(userId);
  return resolveForkModuleMap(row?.modules);
}

async function updateModules(
  userId: string,
  modules: Record<string, boolean>
): Promise<Record<ForkModuleId, boolean>> {
  const unknown = Object.keys(modules).filter((key) => !isKnownForkModuleId(key));
  if (unknown.length > 0) {
    throw new UnknownModuleError(unknown);
  }

  const existing = await modulePreferenceRepository.getModulePreferences(userId);
  const mergedStored: Record<string, boolean> = {
    ...(existing?.modules ?? {}),
    ...modules,
  };

  // Persist only known keys (drop any legacy junk).
  const toStore: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(mergedStored)) {
    if (isKnownForkModuleId(key) && typeof value === 'boolean') {
      toStore[key] = value;
    }
  }

  const row = await modulePreferenceRepository.upsertModulePreferences(
    userId,
    toStore
  );
  return resolveForkModuleMap(row.modules);
}

export default {
  getEffectiveModules,
  updateModules,
};
