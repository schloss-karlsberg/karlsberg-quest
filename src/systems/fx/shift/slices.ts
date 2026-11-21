/**
 * Time-sliced background jobs (pure, no three.js): the era-shift warm-up (fx/shift/warm.ts) runs
 * its work as generators that yield between small steps. Each frame the runner steps the queued
 * jobs until the frame's budget is spent, so a multi-million-triangle pass or a row of texture
 * uploads never lands in one frame. A job may yield a promise (an async shader compile): it then
 * waits, without blocking the jobs behind it, until the promise settles.
 */
export type SliceJob = Iterator<unknown, unknown, undefined>;

/**
 * Yield this to end the runner's work for the current frame (whatever budget is left): for a step
 * whose real cost lands later, out of the runner's sight (a first draw makes the GPU process build
 * a pipeline; the next synchronous GL call waits for it).
 */
export const NEXT_FRAME: unique symbol = Symbol('next-frame');

interface Entry {
  job: SliceJob;
  waiting: boolean;
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';
}

export class SliceRunner {
  private readonly queue: Entry[] = [];

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Queue a job (runs after the jobs already queued). */
  add(job: SliceJob): void {
    this.queue.push({ job, waiting: false });
  }

  /** Jobs not finished yet (waiting ones included). */
  get pending(): number {
    return this.queue.length;
  }

  /**
   * Step jobs in queue order until `budgetMs` is spent or every job is done or waiting. At least
   * one step runs per call when a job can step (a single step may overrun the budget: keep steps
   * small). Returns the number of steps taken.
   */
  run(budgetMs: number): number {
    const t0 = this.now();
    let steps = 0;
    for (;;) {
      const e = this.queue.find((q) => !q.waiting);
      if (!e) return steps;
      if (steps > 0 && this.now() - t0 >= budgetMs) return steps;
      let r: IteratorResult<unknown, unknown>;
      try {
        r = e.job.next();
      } catch (err) {
        console.warn('[warm] job failed', err);
        this.remove(e);
        continue;
      } finally {
        steps++;
      }
      if (r.done) {
        this.remove(e);
        continue;
      }
      if (r.value === NEXT_FRAME) return steps;
      if (isThenable(r.value)) {
        e.waiting = true;
        const wake = () => (e.waiting = false);
        r.value.then(wake, (err: unknown) => {
          console.warn('[warm] job step failed', err);
          wake();
        });
      }
    }
  }

  /** Drop every queued job. */
  clear(): void {
    this.queue.length = 0;
  }

  private remove(e: Entry): void {
    const i = this.queue.indexOf(e);
    if (i >= 0) this.queue.splice(i, 1);
  }
}
