/**
 * The world's "quiet" switch ('world:quiet' {on, reason}): a scene such as the end-of-game party
 * asks the world to hold still. Systems that own world markers (travel tripods, chronik clue
 * markers, quest beacons) hide them, travel holds the survey-point activation. Reasons stack, so
 * two scenes overlapping do not wake the world early. Nothing here touches a save: a held point
 * activates normally once the world is loud again.
 */
import type { EventBus } from './events';

export class QuietGate {
  private readonly reasons = new Set<string>();
  private readonly off: () => void;

  constructor(
    events: Pick<EventBus, 'on'>,
    private readonly onChange?: (quiet: boolean) => void,
  ) {
    this.off = events.on('world:quiet', (p) => this.apply(p));
  }

  /** Any reason is on. */
  get quiet(): boolean {
    return this.reasons.size > 0;
  }

  private apply(p: { on: boolean; reason: string } | undefined): void {
    if (!p || typeof p.reason !== 'string') return;
    const was = this.quiet;
    if (p.on) this.reasons.add(p.reason);
    else this.reasons.delete(p.reason);
    if (this.quiet !== was) this.onChange?.(this.quiet);
  }

  dispose(): void {
    this.off();
    this.reasons.clear();
  }
}

/** Hide these objects (a system's marker root) while the world is quiet; shown again after. */
export function hideWhileQuiet(events: Pick<EventBus, 'on'>, ...objects: { visible: boolean }[]): QuietGate {
  return new QuietGate(events, (q) => {
    for (const o of objects) o.visible = !q;
  });
}
