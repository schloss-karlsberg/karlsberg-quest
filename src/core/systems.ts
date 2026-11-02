import type { GameContext } from './context';

/**
 * The extension contract for feature systems (hunt, chronik, fire, …).
 * Each feature lives in `src/systems/<feature>/index.ts`, default-exports `defineSystem({...})`
 * and is enabled by ONE line in `src/systems/index.ts`.
 */
export interface GameSystem {
  /** Unique id, also the key of the feature's state slice (`ctx.state.slice(id, …)`). */
  id: string;
  /** Ids of systems that must be initialised before this one. */
  after?: string[];
  /** Called once after the world, player, UI and audio exist (audio may still be locked). */
  init?(ctx: GameContext): void | Promise<void>;
  /** Fixed-step update (60 Hz, deterministic; not called while paused). */
  update?(dt: number, ctx: GameContext): void;
  /** Once per rendered frame, before rendering (visual-only work; dt = real frame time). */
  frame?(dt: number, ctx: GameContext): void;
  dispose?(): void;
}

export type SystemModule = { default: GameSystem };
export type SystemLoader = () => Promise<SystemModule>;

/** Identity helper that gives feature modules type checking and autocompletion. */
export function defineSystem<S extends GameSystem>(s: S): S {
  return s;
}

interface Entry {
  sys: GameSystem;
  failed: boolean;
  /** Smoothed update time in ms (debug panel, perf overlay). */
  ms: number;
  /** Smoothed frame (visuals) time in ms. */
  frameMs: number;
}

export class SystemRegistry {
  private readonly entries: Entry[] = [];
  private ordered: Entry[] = [];
  private initialised = false;

  registerSystem(sys: GameSystem): void {
    if (this.entries.some((e) => e.sys.id === sys.id)) throw new Error(`system '${sys.id}' registered twice`);
    this.entries.push({ sys, failed: false, ms: 0, frameMs: 0 });
    this.ordered = sortByDeps(this.entries);
  }

  get(id: string): GameSystem | undefined {
    return this.entries.find((e) => e.sys.id === id)?.sys;
  }

  ids(): string[] {
    return this.ordered.map((e) => e.sys.id);
  }

  stats(): { id: string; failed: boolean; ms: number; frameMs: number }[] {
    return this.ordered.map((e) => ({ id: e.sys.id, failed: e.failed, ms: e.ms, frameMs: e.frameMs }));
  }

  async initAll(ctx: GameContext): Promise<void> {
    for (const e of this.ordered) {
      try {
        await e.sys.init?.(ctx);
      } catch (err) {
        e.failed = true;
        console.error(`[systems] '${e.sys.id}' failed to init and is disabled`, err);
      }
    }
    this.initialised = true;
  }

  /** Register + init a system after boot (e.g. lazy chapter systems). */
  async add(sys: GameSystem, ctx: GameContext): Promise<void> {
    this.registerSystem(sys);
    if (this.initialised) {
      const e = this.entries.find((x) => x.sys === sys)!;
      try {
        await sys.init?.(ctx);
      } catch (err) {
        e.failed = true;
        console.error(`[systems] '${sys.id}' failed to init and is disabled`, err);
      }
    }
  }

  update(dt: number, ctx: GameContext): void {
    for (const e of this.ordered) {
      if (e.failed || !e.sys.update) continue;
      const t0 = performance.now();
      try {
        e.sys.update(dt, ctx);
      } catch (err) {
        e.failed = true;
        console.error(`[systems] '${e.sys.id}' threw in update and is disabled`, err);
      }
      e.ms = e.ms * 0.95 + (performance.now() - t0) * 0.05;
    }
  }

  frame(dt: number, ctx: GameContext): void {
    for (const e of this.ordered) {
      if (e.failed || !e.sys.frame) continue;
      const t0 = performance.now();
      try {
        e.sys.frame(dt, ctx);
      } catch (err) {
        e.failed = true;
        console.error(`[systems] '${e.sys.id}' threw in frame and is disabled`, err);
      }
      e.frameMs = e.frameMs * 0.95 + (performance.now() - t0) * 0.05;
    }
  }

  disposeAll(): void {
    for (const e of [...this.ordered].reverse()) {
      try {
        e.sys.dispose?.();
      } catch (err) {
        console.error(`[systems] '${e.sys.id}' threw in dispose`, err);
      }
    }
  }
}

/** Stable topological sort: registration order, but each system after its `after` deps. */
export function sortByDeps<T extends { sys: GameSystem }>(entries: T[]): T[] {
  const byId = new Map(entries.map((e) => [e.sys.id, e]));
  const out: T[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (e: T, chain: string[]) => {
    const s = state.get(e.sys.id);
    if (s === 'done') return;
    if (s === 'visiting') throw new Error(`system dependency cycle: ${[...chain, e.sys.id].join(' -> ')}`);
    state.set(e.sys.id, 'visiting');
    for (const dep of e.sys.after ?? []) {
      const d = byId.get(dep);
      if (d) visit(d, [...chain, e.sys.id]);
    }
    state.set(e.sys.id, 'done');
    out.push(e);
  };
  for (const e of entries) visit(e, []);
  return out;
}
