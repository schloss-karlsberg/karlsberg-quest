/**
 * The historical twins outside a conversation: Johann Christian von Mannlich and Duke Karl II.
 * August (roster.ts `TWINS`, docs/ART-DIRECTION.md §21). API only for now: their own figures are
 * being rebuilt as authored models.
 *
 * `twinEcho()` is the hook for the Chronik's echo director (chronik/echo.ts): for a twin speaker it
 * will return a figure with the same public surface as the smoke silhouette (`EchoFigureLike`), so
 * the director can draw the real person in a memory. Until the authored models land it returns
 * null, and the director keeps its smoke silhouette.
 */
import type { Group } from 'three';
import type { GameContext } from '../../core/context';

/** The public surface of the Chronik's smoke silhouette (chronik/world/ghosts.ts) that the echo director drives. */
export interface EchoFigureLike {
  readonly object: Group;
  walk: number;
  walkAmt: number;
  talk: number;
  gesture: number;
  fade: number;
  alpha: number;
  apply(): void;
  dispose(): void;
}

/**
 * A historical twin as an echo figure: the director drives the public fields like the smoke
 * silhouette and calls `apply()` once per frame. The figure never turns to the listener (the
 * director sets its yaw); it walks when the director moves it. `sit` puts it on a chair (the
 * director lowers the object by the seat height).
 */
export interface EchoTwin extends EchoFigureLike {
  sit: boolean;
}

/**
 * An echo figure for a speaker if it is one of the historical twins (id or alias), else null: keep
 * the smoke silhouette. Returns null for every speaker until the authored twin models land; then it
 * returns their figure (`o.mode`: ghost by default, or solid).
 */
export function twinEcho(ctx: GameContext, speaker: string, o: { mode?: 'ghost' | 'solid' } = {}): EchoTwin | null {
  // the authored models will build the figure here when `isTwin(speaker)` (roster.ts)
  void ctx;
  void speaker;
  void o;
  return null;
}
