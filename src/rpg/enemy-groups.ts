import type { EnemyGroupState } from './types';

/** Whether the saved group has no enemies left to defeat. */
export function isCleared(group: Pick<EnemyGroupState, 'count' | 'killed'>): boolean {
  return group.killed >= group.count;
}
