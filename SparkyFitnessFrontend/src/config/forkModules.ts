import {
  FORK_MODULE_DEFAULTS,
  FORK_MODULE_IDS,
  isForkModuleEnabled,
  resolveForkModuleMap,
  type ForkModuleId,
} from '@workspace/shared';

export type { ForkModuleId };

export interface ForkModuleDefinition {
  id: ForkModuleId;
  /** Route path prefixes this module owns (leading slash). */
  routePrefixes: string[];
  /** Values used in MainLayout Add sheet items. */
  addCompValues: string[];
  /** Whether the Settings toggle is shown. */
  showInSettings: boolean;
}

/**
 * Frontend nav/route metadata for fork modules.
 * Defaults and known ids live in `@workspace/shared`.
 */
export const FORK_MODULE_DEFINITIONS: ForkModuleDefinition[] = [
  {
    id: 'exercises',
    routePrefixes: ['/exercises', '/workout-playback'],
    addCompValues: ['exercises'],
    showInSettings: true,
  },
  {
    id: 'medications',
    routePrefixes: ['/medications'],
    addCompValues: ['medications'],
    showInSettings: true,
  },
  {
    id: 'training_plan',
    routePrefixes: ['/training'],
    addCompValues: ['training'],
    showInSettings: true,
  },
];

export {
  FORK_MODULE_DEFAULTS,
  FORK_MODULE_IDS,
  isForkModuleEnabled,
  resolveForkModuleMap,
};

export function getModuleIdForPath(pathname: string): ForkModuleId | undefined {
  const normalized =
    pathname.endsWith('/') && pathname.length > 1
      ? pathname.slice(0, -1)
      : pathname;
  for (const def of FORK_MODULE_DEFINITIONS) {
    for (const prefix of def.routePrefixes) {
      if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
        return def.id;
      }
    }
  }
  return undefined;
}

export function isPathAllowedByModules(
  pathname: string,
  modules: Record<string, boolean> | null | undefined
): boolean {
  const moduleId = getModuleIdForPath(pathname);
  if (!moduleId) return true;
  return isForkModuleEnabled(moduleId, modules);
}
