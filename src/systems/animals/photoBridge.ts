/**
 * Optional bridges to systems that may not be on this branch yet: kq-mobile's photo mode
 * (`src/systems/photo/index.ts` → `attachTarget`, contract C3) and the cinematic system
 * (`src/systems/cinematic/targets.ts` → `registerTarget`, contract C1). Each bridge looks the module
 * up with an eager `import.meta.glob`: when the file is absent the glob is empty and the bridge is
 * dormant (every call a no-op); when the branch lands, the bridge activates on its own.
 *
 * The factories take the module record as a parameter so tests can hand in a fake (or nothing).
 */

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** What photo mode asks of a live target (kq-mobile, `tour/photo`). */
export interface PhotoTargetHooks {
  at: () => P3 | null;
  /** false = the subject is spooked (photo mode judges the shot accordingly). */
  calm?: () => boolean;
  state?: () => string;
  /**
   * The drawn body (a three.js Object3D; opaque here): photo mode measures at the shutter how much
   * of it the lens really sees (`registerSubject`, src/systems/photo/visibility.ts).
   */
  body?: () => object | null;
}

export interface PhotoBridge {
  readonly active: boolean;
  /** Attach a target; returns its undo (a no-op while dormant). */
  attach(id: string, hooks: PhotoTargetHooks): () => void;
}

export interface CinematicBridge {
  readonly active: boolean;
  /** Register a camera target getter; returns its undo (a no-op while dormant or when the module returns none). */
  register(id: string, getter: () => P3 | null): () => void;
}

const PHOTO_MODS: Record<string, unknown> = import.meta.glob('../photo/index.ts', { eager: true });
const CINEMATIC_MODS: Record<string, unknown> = import.meta.glob('../cinematic/targets.ts', { eager: true });

const noop = (): void => {};

function findFn(mods: Record<string, unknown>, name: string): ((...a: never[]) => unknown) | null {
  for (const m of Object.values(mods)) {
    const f = m && typeof m === 'object' ? (m as Record<string, unknown>)[name] : undefined;
    if (typeof f === 'function') return f as (...a: never[]) => unknown;
  }
  return null;
}

function asUndo(r: unknown): () => void {
  return typeof r === 'function' ? (r as () => void) : noop;
}

export function createPhotoBridge(mods: Record<string, unknown> = PHOTO_MODS): PhotoBridge {
  const fn = findFn(mods, 'attachTarget') as ((id: string, t: PhotoTargetHooks) => unknown) | null;
  const subject = findFn(mods, 'registerSubject') as ((id: string, body: () => object | null) => unknown) | null;
  if (!fn) return { active: false, attach: () => noop };
  return {
    active: true,
    attach(id, hooks) {
      try {
        const { body, ...live } = hooks;
        const off = asUndo(fn(id, live));
        if (!body || !subject) return off;
        const offBody = asUndo(subject(id, body));
        return () => {
          off();
          offBody();
        };
      } catch (err) {
        console.warn(`[animals] photo attachTarget('${id}') failed`, err);
        return noop;
      }
    },
  };
}

export function createCinematicBridge(mods: Record<string, unknown> = CINEMATIC_MODS): CinematicBridge {
  const fn = findFn(mods, 'registerTarget') as ((id: string, g: () => P3 | null) => unknown) | null;
  if (!fn) return { active: false, register: () => noop };
  return {
    active: true,
    register(id, getter) {
      try {
        return asUndo(fn(id, getter));
      } catch (err) {
        console.warn(`[animals] cinematic registerTarget('${id}') failed`, err);
        return noop;
      }
    },
  };
}
