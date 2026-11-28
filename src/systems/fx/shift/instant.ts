/**
 * The instant era shift (no transition effect): begin → era switch → midpoint → done, with the
 * request's reason passed through to 'shift:midpoint' and 'shift:done' (tour C4). Kept apart from the effect so it can
 * be unit-tested without a renderer.
 */
import type { GameContext } from '../../../core/context';
import type { Era } from '../../../core/era';
import type { ShiftReason } from '../../contracts';

export type InstantShiftCtx = Pick<GameContext, 'events' | 'era' | 'state'>;

export function instantShift(ctx: InstantShiftCtx, to: Era, reason?: ShiftReason): void {
  const from = ctx.era.current;
  ctx.events.emit('shift:begin', { from, to });
  ctx.era.set(to);
  ctx.events.emit('shift:midpoint', { from, to, reason });
  // being carried home after a capture is not a shift the player made (round 2)
  if (reason !== 'caught') ctx.state.mutable.meta.shifts++;
  ctx.events.emit('shift:done', { from, to, reason });
}
