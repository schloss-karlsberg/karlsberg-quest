import type { EventBus } from '../core/events';
import type { Hud } from './hud';

/**
 * Scenes that take the player's input hide every HUD prompt while they run; prompts set meanwhile
 * come back afterwards (`Hud.blockPrompts`):
 * - a cinematic;
 * - a conversation: the story's „E bei Gerold: zuhören“ stood under Gerold's first line in the
 *   dialogue box (playtest 2026-11-28, TASK-093).
 */
export function blockPromptsDuringScenes(events: EventBus, hud: Pick<Hud, 'blockPrompts'>): void {
  events.on('cinematic:start', () => hud.blockPrompts('cinematic', true));
  events.on('cinematic:end', () => hud.blockPrompts('cinematic', false));
  events.on('npc:conversation', ({ open }) => hud.blockPrompts('talk', open));
}
