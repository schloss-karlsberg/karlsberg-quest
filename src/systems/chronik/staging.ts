/**
 * Echo staging options (playtest round 4: "climaxes are told in captions, not shown"). A set
 * piece that plays a memory in the world (src/systems/fx/stage/*) registers how the echo director
 * should pace that memory: tighter intro / outro, faster subtitles, a minimum length so the
 * picture has time, speakers that are voices only (no smoke figure), and where the stage stands.
 * The set piece itself listens to echo:start / echo:line / echo:end.
 */
export interface EchoStaging {
  /** Seconds before the first line (default 1.9). */
  intro?: number;
  /** Seconds after the last line (default 2.4). */
  outro?: number;
  /** Subtitle time multiplier (default 1; < 1 = faster, never below the 2 s floor). */
  pace?: number;
  /** The memory lasts at least this long (s) — the set piece needs the time. */
  minSeconds?: number;
  /** Speakers heard but not shown as smoke figures (a voice from the fog; the set piece draws its own). */
  voices?: string[];
  /** Place the figures at the clue (behind a door) instead of 5 m before the player. */
  atClue?: boolean;
  /** Walk-away radius (m) from the stage before the memory fades (default max(16, r + 10)). */
  leash?: number;
  /**
   * Where a speaker's figure stands (world x/z), where it walks to, what it looks at (it never
   * turns to the listener: the scene does not know you are there) and whether it sits.
   */
  marks?: Record<string, EchoMark>;
}

export interface EchoMark {
  x: number;
  z: number;
  to?: { x: number; z: number };
  face?: { x: number; z: number };
  sit?: boolean;
  /** Seconds into the memory before it starts walking to `to` (default: walks all scene). */
  walkAt?: number;
}

const registry = new Map<string, EchoStaging>();

/** Register (or replace) the staging of echo `id` (a clue id). */
export function stageEcho(id: string, o: EchoStaging): void {
  registry.set(id, o);
}

export function echoStaging(id: string): EchoStaging | undefined {
  return registry.get(id);
}

/** Speakers that are never a smoke figure: sounds ("geraeusch") and the compass voice. */
export const NO_FIGURE = ['laub', 'geraeusch'] as const;
