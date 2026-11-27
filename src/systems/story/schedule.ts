import type { Action } from './types';

export interface Scheduled {
  at: number;
  gen: number;
  fn: () => void;
  ready?: () => boolean;
  /** Chapter-wide actions have no beat scope. */
  beat: string | null;
  /** Run this state change immediately when its beat ends. */
  keep: boolean;
  /** Set for `sameEra` reactions: dropped (not run) when the player leaves this era visit. */
  eraVisit?: number;
}

const PRESENTATION = new Set<Action['do']>(['say', 'toast', 'sound', 'card', 'prompt', 'echo', 'choice']);

export function keepsOnBeatExit(action: Action): boolean {
  return !PRESENTATION.has(action.do);
}

/** Remove the selected actions before any of their callbacks can enqueue more work. */
function takeScheduled(queue: Scheduled[], matches: (action: Scheduled) => boolean): Scheduled[] {
  const selected = queue.filter(matches);
  if (selected.length) {
    const taken = new Set(selected);
    queue.splice(0, queue.length, ...queue.filter((action) => !taken.has(action)));
  }
  return selected.sort((a, b) => a.at - b.at);
}

export function retireScheduled(queue: Scheduled[], beat: string, gen: number): void {
  const stale = takeScheduled(queue, (q) => q.gen === gen && q.beat !== null && q.beat !== beat);
  for (const action of stale) if (action.keep) action.fn();
}

export function takeDueActions(queue: Scheduled[], time: number): Scheduled[] {
  return takeScheduled(queue, (q) => q.at <= time && (q.ready?.() ?? true));
}
