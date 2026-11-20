import type { Action } from '../player/input';
import { touchName } from '../player/touchMap';
import { keyLabel } from './settings';

/** What `actionLabel` needs of the input (src/player/input.ts `Input` fits). */
export interface ActionLabelInput {
  touchMode: boolean;
  bindings: Record<Action, string[]>;
}

/**
 * The text that names how to do `action`, for `{key}` in captions, toasts and prompts:
 * the key label of binding `slot` (or `fallback` code) on desktop, the touch button's German name
 * in touch mode (`touchName`; actions without a button keep the key label).
 */
export function actionLabel(input: ActionLabelInput, action: Action, slot = 0, fallback = ''): string {
  if (input.touchMode) {
    const name = touchName(action);
    if (name) return name;
  }
  const code = input.bindings[action]?.[slot] ?? fallback;
  return code ? keyLabel(code) : '';
}
