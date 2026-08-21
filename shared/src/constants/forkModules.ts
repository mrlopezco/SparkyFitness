/**
 * Fork module visibility registry.
 * Known module ids for Settings toggles and nav/route gating.
 * Missing preference keys resolve to these defaults.
 */
export const FORK_MODULE_IDS = [
  "exercises",
  "medications",
  "training_plan",
] as const;

export type ForkModuleId = (typeof FORK_MODULE_IDS)[number];

export const FORK_MODULE_DEFAULTS: Record<ForkModuleId, boolean> = {
  exercises: true,
  medications: true,
  training_plan: false,
};

export function isKnownForkModuleId(id: string): id is ForkModuleId {
  return (FORK_MODULE_IDS as readonly string[]).includes(id);
}

/**
 * Merge stored sparse map with registry defaults into a full effective map.
 */
export function resolveForkModuleMap(
  stored: Record<string, boolean> | null | undefined,
): Record<ForkModuleId, boolean> {
  const result = { ...FORK_MODULE_DEFAULTS };
  if (!stored) return result;
  for (const id of FORK_MODULE_IDS) {
    if (typeof stored[id] === "boolean") {
      result[id] = stored[id];
    }
  }
  return result;
}

export function isForkModuleEnabled(
  id: ForkModuleId,
  stored: Record<string, boolean> | null | undefined,
): boolean {
  return resolveForkModuleMap(stored)[id];
}
