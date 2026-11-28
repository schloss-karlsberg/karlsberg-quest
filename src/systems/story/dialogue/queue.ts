/**
 * The waiting lines behind the one on screen (pure, no DOM: tests/story-flow.test.ts). Rules so
 * that Laub never lags behind a fast player:
 * - at most MAX_QUEUE lines wait; low-priority lines (barks, hints) are dropped first, then the
 *   oldest waiting ordinary line outside a sequence that has started, then urgent lines;
 * - a low-priority line that waited longer than LOW_TTL seconds is dropped;
 * - when a beat begins, waiting lines of other beats retire: low ones at once, the rest get
 *   STALE_GRACE seconds to start (`retireBeat`); the event that completed a beat keeps its group;
 * - a sequence (same `group`) retains protection while it plays or is interrupted by an urgent line;
 * - `valid` (the host: is the player still near the place the line is about?) is asked when a
 *   line's turn comes;
 * - a line with `expired` (its `until` condition: the objective it explains is done, the beat it
 *   prepares has passed) is dropped once that holds;
 * - a 'now' line (a tutorial that blocks an action: "Leertaste – zur Seite!") can play immediately
 *   without a waiting slot. If it must wait, it jumps ahead of non-urgent lines. Low-priority
 *   lines outside protected sequences are dropped (playtest round 2: tips arrived 13 s late);
 * - playtest round 3 (lines 10 s late, lectures in fights): a beat's leftovers get STALE_GRACE (3 s);
 *   a normal line that has not started within NORMAL_TTL is dropped (its moment is gone); `lore`
 *   lines (history, long remarks) are HELD while the host says a fight is on (`held`), the lines
 *   behind them go first, and a lore line that waited longer than LORE_TTL is dropped.
 * - integration round 3: a beat's own (non-lore) line is queued ahead of lore lines that have not
 *   started (a quest's history said at turn-in must not push the beat's line past its moment).
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
  /** The reaction to a completing event keeps its place through beat retirement. */
  completesBeat?: boolean;
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
    /** Whether a group is playing or waiting to resume after an urgent line. */
    private readonly protectsGroup: (group: number) => boolean,
    private readonly valid?: (item: T) => boolean,
    private readonly onDrop?: (item: T) => void,
  ) {}

  get length(): number {
    return this.items.length;
  }

  some(test: (item: T) => boolean): boolean {
    return this.items.some(test);
  }

  tick(dt: number): void {
    this.clock += dt;
  }

  /** Queue a line, or return an urgent line that the presenter can play immediately. */
  push(item: T, playImmediately = false): T | undefined {
    item.queuedAt = this.clock;
    if (item.priority === 'now') {
      // Queue behind other urgent lines and clear unstarted barks.
      for (let i = this.items.length - 1; i >= 0; i--) {
        const waiting = this.items[i]!;
        if (waiting.priority === 'low' && !this.started(waiting)) {
          this.drop(i);
        }
      }
      let at = 0;
      while (at < this.items.length && this.items[at]!.priority === 'now') at++;
      if (playImmediately && at === 0) {
        if (this.fresh(item)) return item;
        this.dropped++;
        this.onDrop?.(item);
        return undefined;
      }
      this.items.splice(at, 0, item);
    } else if (item.priority !== 'low' && !item.lore && item.beat) {
      // a beat's own line goes ahead of waiting lore (a quest's history must not make the beat's
      // line miss its moment: K4 echo, integration round 3)
      let after = this.items.length;
      while (after > 0 && !this.items[after - 1]!.completesBeat) after--;
      const at = this.items.findIndex((q, i) => i >= after && q.lore && q.priority !== 'now' && !this.started(q));
      if (at < 0) this.items.push(item);
      else this.items.splice(at, 0, item);
    } else this.items.push(item);
    while (this.items.length > MAX_QUEUE) {
      let i = this.items.findIndex((q) => q.priority === 'low' && !this.started(q));
      if (i < 0) i = this.items.findIndex((q) => q.priority !== 'now' && q !== item && !this.started(q));
      if (i < 0 && item.priority !== 'now' && !this.started(item)) i = this.items.indexOf(item);
      if (i < 0) i = this.items.findIndex((q) => !this.started(q));
      this.drop(Math.max(0, i));
    }
    return undefined;
  }

  /** Put a line that had started back at the front (it was cut off by a fight: it plays again after). */
  unshift(item: T): void {
    this.items.unshift(item);
  }

  keepCompletingGroup(group: number): T[] {
    const waiting = this.items.filter((item) => item.group === group);
    for (const item of waiting) item.completesBeat = true;
    return waiting;
  }

  private drop(index: number): void {
    const [item] = this.items.splice(index, 1);
    this.dropped++;
    if (item) this.onDrop?.(item);
  }

  /** A beat began: waiting lines of other beats are stale (see above). */
  retireBeat(beat: string): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const q = this.items[i]!;
      if (q.beat === undefined || q.beat === null || q.beat === beat || q.completesBeat || this.started(q)) continue;
      if (q.priority === 'low') {
        this.drop(i);
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
        this.drop(i);
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

  clear(keepCompleting = false): void {
    if (!keepCompleting) {
      this.items.length = 0;
      return;
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (!this.items[i]!.completesBeat) this.items.splice(i, 1);
    }
  }

  /** The line belongs to a sequence that is playing or waiting to resume. */
  private started(q: T): boolean {
    return q.group !== undefined && this.protectsGroup(q.group);
  }

  /** Drop waiting lines whose `until` holds now (called every tick by the presenter). */
  prune(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const q = this.items[i]!;
      if (q.expired?.()) {
        this.drop(i);
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
