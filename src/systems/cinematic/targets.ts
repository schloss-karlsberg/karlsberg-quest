/**
 * Look targets that no system state holds yet (`animal:<id>`: there is no animal system so far).
 * The future animal code registers a getter per animal; an unknown target makes the cinematic hold
 * its last view instead of failing.
 *
 *   import { registerTarget } from '../cinematic/targets';
 *   const off = registerTarget('animal:ricke', () => ({ x, z, y }));   // y: world height of the head (optional)
 */
export interface TargetPoint {
  x: number;
  z: number;
  /** World height (m); missing = 0.6 m above the ground. */
  y?: number;
}

const targets = new Map<string, () => TargetPoint | null>();

/** Register a look target (`animal:<id>`, or an `npc:<id>` to override the npc lookup). Returns the unregister function. */
export function registerTarget(id: string, get: () => TargetPoint | null): () => void {
  targets.set(id, get);
  return () => {
    if (targets.get(id) === get) targets.delete(id);
  };
}

/** The registered target's point now (null: none, or its getter threw). */
export function registeredTarget(id: string): TargetPoint | null {
  const g = targets.get(id);
  if (!g) return null;
  try {
    return g();
  } catch {
    return null;
  }
}
