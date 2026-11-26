import type { Action, Condition } from '../../src/systems/story/types';

export interface ScheduledAction {
  action: Action;
  at: number;
  where: string;
  scope: string | null;
  conditional: boolean;
}

// The story host drops late presentation and applies late state changes as the next beat enters.
export const presentation = new Set<Action['do']>(['say', 'toast', 'sound', 'card', 'prompt', 'echo', 'choice']);

export function* leaves(c: Condition, negated = false): Generator<{ leaf: Condition; negated: boolean }> {
  if ('not' in c) yield* leaves(c.not, !negated);
  else if ('all' in c || 'any' in c) {
    for (const child of 'all' in c ? c.all : c.any) yield* leaves(child, negated);
  } else yield { leaf: c, negated };
}
