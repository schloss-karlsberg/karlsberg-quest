/**
 * The waiting lines behind the one on screen (pure, no DOM: tests/story-flow.test.ts). Rules so
 * that Laub never lags behind a fast player:
 * - at most MAX_QUEUE lines wait; low-priority lines (barks, hints) are dropped first, then the
 *   oldest waiting line that is not part of the sequence already playing;
 * - a low-priority line that waited longer than LOW_TTL seconds is dropped;
 * - when a beat begins, waiting lines of other beats retire: low ones at once, the rest get
 *   STALE_GRACE seconds to start (`retireBeat`);
 * - the rest of a sequence (same `group`) whose first line is showing is never dropped;
 * - `valid` (the host: is the player still near the place the line is about?) is asked when a
 *   line's turn comes;
 * - a line with `expired` (its `until` condition: the objective it explains is done, the beat it
 *   prepares has passed) is dropped once that holds;
 * - a 'now' line (a tutorial that blocks an action: "Leertaste – zur Seite!") jumps the queue, and
 *   the waiting lines of other groups that are low priority are dropped (playtest round 2: tips
 *   arrived 13 s after the moment);
 * - playtest round 3 (lines 10 s late, lectures in fights): a beat's leftovers get STALE_GRACE (3 s);
 *   a normal line that has not started within NORMAL_TTL is dropped (its moment is gone); `lore`
 *   lines (history, long remarks) are HELD while the host says a fight is on (`held`), the lines
 *   behind them go first, and a lore line that waited longer than LORE_TTL is dropped.
 */

export interface QueuedLine {
  /** Beat the line belongs to (null / undefined = chapter-wide). */
  beat?: string | null;
  priority?: 'low' | 'normal' | 'now';
  /** The line is no longer worth saying (checked while it waits, and while it shows). */
  expired?: () => boolean;
  /** Queue clock when queued (set by `push`). */
  queuedAt?: number;
  /** Dropped if it has not started by this queue time. */
  staleAt?: number;
  /** Lines emitted together share a group (see above). */
  group?: number;
  /** History / lore: held while a fight is on (see above), never a reason to lag. */
  lore?: boolean;
}

/** At most this many lines wait behind the current one. */
export const MAX_QUEUE = 6;
/** Seconds a low-priority line (bark, hint) may wait before it is dropped. */
export const LOW_TTL = 14;
/** Seconds a line of a beat that has ended may still wait for its turn. */
export const STALE_GRACE = 3;
/** Seconds a normal line may wait for its turn (its moment is gone after that). */
export const NORMAL_TTL = 20;
/** Seconds a lore line may wait (held through a fight), then it is dropped. */
export const LORE_TTL = 50;

export class LineQueue<T extends QueuedLine> {
  private readonly items: T[] = [];
  /** Queue clock (game seconds, advanced by `tick`). */
  clock = 0;
  /** Lines dropped (cap, stale, invalid): tests / debug. */
  dropped = 0;

  constructor(
    /** Group of the line now on screen (its sequence is never cut off). */
    private readonly playingGroup: () => number | undefined,
    private readonly valid?: (item: T) => boolean,
  ) {}

  get length(): number {
    return this.items.length;
  }

  tick(dt: number): void {
    this.clock += dt;
  }

  push(item: T): void {
    item.queuedAt = this.clock;
    if (item.priority === 'now') {
      // ahead of everything but other 'now' lines; waiting low lines are stale already
      for (let i = this.items.length - 1; i >= 0; i--) {
        if (this.items[i]!.priority === 'low') {
          this.items.splice(i, 1);
          this.dropped++;
        }
      }
      let at = 0;
      while (at < this.items.length && this.items[at]!.priority === 'now') at++;
      this.items.splice(at, 0, item);
    } else this.items.push(item);
    while (this.items.length > MAX_QUEUE) {
      let i = this.items.findIndex((q) => q.priority === 'low' && q !== item);
      if (i < 0) i = this.items.findIndex((q) => !this.started(q) && q !== item);
      this.items.splice(Math.max(0, i), 1);
      this.dropped++;
    }
  }

  /** A beat began: waiting lines of other beats are stale (see above). */
  retireBeat(beat: string): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const q = this.items[i]!;
      if (q.beat === undefined || q.beat === null || q.beat === beat || this.started(q)) continue;
      if (q.priority === 'low') {
        this.items.splice(i, 1);
        this.dropped++;
      } else q.staleAt = Math.min(q.staleAt ?? Infinity, this.clock + STALE_GRACE);
    }
  }

  /**
   * The next line still worth saying (stale / invalid ones are dropped on the way). `held`: lines
   * that must wait now (lore in a fight) stay in the queue; the first line that may play is taken.
   */
  take(held?: (item: T) => boolean): T | undefined {
    for (let i = 0; i < this.items.length; ) {
      const item = this.items[i]!;
      if (!this.fresh(item)) {
        this.items.splice(i, 1);
        this.dropped++;
        continue;
      }
      if (held?.(item)) {
        i++;
        continue;
      }
      this.items.splice(i, 1);
      return item;
    }
    return undefined;
  }

  /** Lines waiting that may not play now (`held`). */
  heldCount(held: (item: T) => boolean): number {
    return this.items.filter(held).length;
  }

  clear(): void {
    this.items.length = 0;
  }

  /** The line's group has already begun (its first line is showing). */
  private started(q: T): boolean {
    return q.group !== undefined && this.playingGroup() === q.group;
  }

  /** Drop waiting lines whose `until` holds now (called every tick by the presenter). */
  prune(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const q = this.items[i]!;
      if (q.expired?.()) {
        this.items.splice(i, 1);
        this.dropped++;
      }
    }
  }

  /** The next waiting line is a 'now' line (the presenter cuts the current one short). */
  get urgent(): boolean {
    return this.items[0]?.priority === 'now';
  }

  private fresh(q: T): boolean {
    if (q.expired?.()) return false;
    if (this.started(q)) return true;
    if (q.staleAt !== undefined && this.clock > q.staleAt) return false;
    const waited = this.clock - (q.queuedAt ?? this.clock);
    if (q.priority === 'low' && waited > LOW_TTL) return false;
    if (q.lore ? waited > LORE_TTL : q.priority !== 'now' && q.beat !== null && waited > NORMAL_TTL) return false;
    return this.valid?.(q) ?? true;
  }
}
