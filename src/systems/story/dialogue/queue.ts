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
 *   line's turn comes.
 */

export interface QueuedLine {
  /** Beat the line belongs to (null / undefined = chapter-wide). */
  beat?: string | null;
  priority?: 'low' | 'normal';
  /** Queue clock when queued (set by `push`). */
  queuedAt?: number;
  /** Dropped if it has not started by this queue time. */
  staleAt?: number;
  /** Lines emitted together share a group (see above). */
  group?: number;
}

/** At most this many lines wait behind the current one. */
export const MAX_QUEUE = 6;
/** Seconds a low-priority line (bark, hint) may wait before it is dropped. */
export const LOW_TTL = 14;
/** Seconds a line of a beat that has ended may still wait for its turn. */
export const STALE_GRACE = 6;

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
    this.items.push(item);
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

  /** The next line still worth saying (stale / invalid ones are dropped on the way). */
  take(): T | undefined {
    let item = this.items.shift();
    while (item && !this.fresh(item)) {
      this.dropped++;
      item = this.items.shift();
    }
    return item;
  }

  clear(): void {
    this.items.length = 0;
  }

  /** The line's group has already begun (its first line is showing). */
  private started(q: T): boolean {
    return q.group !== undefined && this.playingGroup() === q.group;
  }

  private fresh(q: T): boolean {
    if (this.started(q)) return true;
    if (q.staleAt !== undefined && this.clock > q.staleAt) return false;
    if (q.priority === 'low' && this.clock - (q.queuedAt ?? this.clock) > LOW_TTL) return false;
    return this.valid?.(q) ?? true;
  }
}
