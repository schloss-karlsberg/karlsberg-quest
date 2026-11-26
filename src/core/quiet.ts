/**
 * The world's "quiet" switch ('world:quiet' {on, reason}): a scene such as the end-of-game party
 * asks the world to hold still. Systems that own world markers (travel tripods, chronik clue
 * markers, quest beacons) hide them, travel holds the survey-point activation. Reasons stack, so
 * two scenes overlapping do not wake the world early. Nothing here touches a save: a held point
 * activates normally once the world is loud again. The phone also hides marker roots while
 * leaving world triggers active.
 */
import type { EventBus } from './events';

export class QuietGate {
  private readonly reasons = new Set<string>();
  private readonly offs: (() => void)[];
  private photo = false;

  constructor(
    events: Pick<EventBus, 'on'>,
    private readonly onChange?: (hidden: boolean) => void,
    hideInPhoto = false,
  ) {
    this.offs = [events.on('world:quiet', (p) => this.apply(p))];
    if (hideInPhoto) this.offs.push(
      events.on('photo:open', () => this.setPhoto(true)),
      events.on('photo:close', () => this.setPhoto(false)),
    );
  }

  /** Any reason is on. */
  get quiet(): boolean {
    return this.reasons.size > 0;
  }

  get photoOpen(): boolean {
    return this.photo;
  }

  private apply(p: { on: boolean; reason: string } | undefined): void {
    if (!p || typeof p.reason !== 'string') return;
    const was = this.hidden;
    if (p.on) this.reasons.add(p.reason);
    else this.reasons.delete(p.reason);
    if (this.hidden !== was) this.onChange?.(this.hidden);
  }

  private get hidden(): boolean {
    return this.quiet || this.photo;
  }

  private setPhoto(on: boolean): void {
    const was = this.hidden;
    this.photo = on;
    if (this.hidden !== was) this.onChange?.(this.hidden);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.reasons.clear();
    this.photo = false;
  }
}

/** Hide these marker roots while the world is quiet or the phone is up. */
export function hideWhileQuiet(events: Pick<EventBus, 'on'>, ...objects: { visible: boolean }[]): QuietGate {
  return new QuietGate(events, (hidden) => {
    for (const o of objects) o.visible = !hidden;
  }, true);
}
