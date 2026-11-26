/**
 * Feature "animals" (tour C5, docs/design/tour/systems.md §4): the roe doe Ricke with her fawn Kitz
 * (shy: notice meter, the 1.5 s tell, bound away, settle; no fail state) and Jost's dogs Diane and
 * Bijou (follow, sniff, sit, the t5 bolt with bark and return, the party lie). Exists only in era
 * `today`: elsewhere the animals are hidden and their behaviour pauses.
 *
 * Story → animals: 'animal:request' AnimalAction (spawn / despawn / run / lie / follow); also
 *                  'story:cue' {id: 'animal', data: AnimalAction} until the story's dispatch lands.
 * animals → world: 'animal:alert' {id}, 'animal:fled' {id, by, dist}, 'animal:settled' {id},
 *                  'animal:returned' {id}.
 * Behaviour:       the pure core (deer.ts, dogs.ts) against the player's stance and ground speed,
 *                  `hunt/perception.ts` lineOfSight at 5 Hz, the world's walkable ground.
 * Bodies:          `ctx.fauna` (kq-characters' fauna contract v0); animals are re-spawned from
 *                  the slice after a load. bark / shake cues play as one-shots (no dog SFX yet).
 * Calm:            script-only (`kq.animals.calm` or a story cue); photo mode does NOT calm the
 *                  deer (design decision: sneaking is the skill).
 * Targets:         photo mode (`reh.ricke`, `reh.kitz`) and the cinematic (`animal:<id>`) through
 *                  optional bridges (photoBridge.ts) that activate when those systems land.
 * Persistent:      slice `animals` (AnimalSave).
 * Debug/test API:  window.kq.animals (AnimalsHooks).
 */
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { TARGET_HEIGHT, lineOfSight, type SenseWorld } from '../hunt/perception';
import { AnimalsRuntime, type AnimalsBus } from './runtime';
import type { AnimalAction, AnimalSave } from './types';

declare module '../../core/state' {
  interface SystemStates {
    animals: AnimalSave;
  }
}

export interface AnimalsHooks {
  /** true once the `animal:request` listener is attached (kq-story's temporary stand-in checks it). */
  readonly ready: true;
  /** Spawn (or any other op): a flat C5 action, `op` defaults to 'spawn'. */
  spawn(op: Partial<AnimalAction> & { id: string }): boolean;
  /** Any C5 action, as the story sends it. */
  request(a: AnimalAction): boolean;
  list(): { id: string; kind: string; state: string; x: number; z: number; dist: number }[];
  state(id: string): Record<string, unknown> | null;
  /** Scripted bolt away from the player now (deer). */
  startle(id: string): boolean;
  /** Script-only calm for `s` seconds: the meter is capped below the flight. */
  calm(id: string, s: number): boolean;
  /** Walk calmly away (after the photo) and end as 'gone'. */
  leave(id: string): boolean;
  clear(): void;
  /** Deer pair about 40 m off the player's right in a clearing, both dogs following the player. */
  demo(): { ricke: { x: number; z: number }; kitz: { x: number; z: number } | null; dogs: string[] };
  stats(): ReturnType<AnimalsRuntime['stats']> & { ms: number };
  /** Rebuild from the slice (as after a load). */
  restore(): void;
  /** The current save slice. */
  save(): AnimalSave;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    animals?: AnimalsHooks;
  }
}

/** Ground a deer may stand on: no buildings, no water, no cliffs. */
function walkableFor(ctx: GameContext): (x: number, z: number) => boolean {
  const w = ctx.world;
  return (x, z) => {
    if (w.surfaceAt(x, z) === 'water') return false;
    if (w.collider.enabled && w.collider.footprintAt(x, z) >= 0) return false;
    return w.heightfield.slopeDeg(x, z) < 35;
  };
}

class AnimalsSystem {
  readonly rt: AnimalsRuntime;
  private hooks = false;
  private ms = 0;

  constructor(private readonly ctx: GameContext) {
    const w = ctx.world;
    const sense: SenseWorld = {
      heightAt: (x, z) => w.heightAt(x, z),
      surfaceAt: (x, z) => w.surfaceAt(x, z),
      coverAt: (x, z) => w.coverAt(x, z),
    };
    const DEER_EYE = 0.95;
    this.rt = new AnimalsRuntime({
      bus: ctx.events as unknown as AnimalsBus,
      fauna: () => ctx.fauna,
      load: () => (ctx.state.state.systems as { animals?: AnimalSave }).animals,
      save: (s) => {
        (ctx.state.mutable.systems as { animals?: AnimalSave }).animals = s;
      },
      world: {
        heightAt: (x, z) => w.heightAt(x, z),
        era: () => ctx.era.current,
        player: () => {
          const pl = ctx.player;
          return { x: pl.position.x, y: pl.position.y, z: pl.position.z, speed: pl.stats.speed, stance: pl.stance, flying: pl.flying };
        },
        walkable: walkableFor(ctx),
        tourVisitors: () => ctx.tourCrowd.visitors?.() ?? [],
        los: (ax, az, bx, bz, stance) =>
          lineOfSight(sense, ax, w.heightAt(ax, az) + DEER_EYE, az, bx, w.heightAt(bx, bz) + TARGET_HEIGHT[stance], bz) > 0.15,
        people: () => ctx.people?.list() ?? [],
        npcs: () => {
          try {
            return window.kq?.npc?.list() ?? [];
          } catch {
            return [];
          }
        },
      },
    });
    ctx.tourCrowd.dogs = () => this.rt.tourDogs();
    this.rt.restore();
  }

  update(dt: number): void {
    if (!this.hooks && window.kq) this.installHooks();
    const t0 = performance.now();
    this.rt.update(dt);
    this.ms = performance.now() - t0;
  }

  frame(): void {
    if (!this.hooks && window.kq) this.installHooks();
    this.rt.sync();
  }

  /** A spot about `dist` m to the player's right with little tree cover, walkable, no trunk within 4 m. */
  private clearing(dist: number): { x: number; z: number } {
    const ctx = this.ctx;
    const pl = ctx.player;
    const walk = walkableFor(ctx);
    const rx = Math.cos(pl.yaw);
    const rz = -Math.sin(pl.yaw);
    const base = Math.atan2(rx, rz);
    let best: { x: number; z: number; score: number } | null = null;
    for (const da of [0, 12, -12, 24, -24, 36, -36, 50, -50, 70, -70]) {
      for (const r of [dist, dist - 4, dist + 4]) {
        const a = base + (da * Math.PI) / 180;
        const x = pl.position.x + Math.sin(a) * r;
        const z = pl.position.z + Math.cos(a) * r;
        if (!walk(x, z)) continue;
        let trunks = 0;
        ctx.world.forest.trunksNear(x, z, 4, () => trunks++);
        let cover = 0;
        for (const [ox, oz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]] as const) cover += ctx.world.coverAt(x + ox, z + oz);
        const score = cover + trunks * 2 + Math.abs(da) / 200;
        if (!best || score < best.score) best = { x, z, score };
        if (score < 0.05) return { x, z };
      }
    }
    return best ?? { x: pl.position.x + rx * dist, z: pl.position.z + rz * dist };
  }

  private installHooks(): void {
    const kq = window.kq;
    if (!kq) return;
    this.hooks = true;
    const rt = this.rt;
    const ctx = this.ctx;
    // the runtime attached its animal:request listener in its constructor, before these hooks
    kq.animals = {
      ready: true,
      spawn: (op) => rt.request({ op: 'spawn', ...op } as AnimalAction),
      request: (a) => rt.request(a),
      list: () => rt.list(),
      state: (id) => rt.state(id),
      startle: (id) => rt.startle(id),
      calm: (id, s) => rt.calm(id, s),
      leave: (id) => rt.leave(id),
      clear: () => rt.clear(),
      demo: () => {
        const c = this.clearing(40);
        const pl = ctx.player;
        // graze broadside to the player
        const yawDeg = ((Math.atan2(-(pl.position.x - c.x), -(pl.position.z - c.z)) + Math.PI / 2) * 180) / Math.PI;
        rt.request({ op: 'spawn', kind: 'reh', look: 'ricke', id: 'ricke', x: c.x, z: c.z, yaw: yawDeg, era: 'today', shy: { notice: 30, flee: 20, settle: 25 } });
        rt.request({ op: 'spawn', kind: 'reh', look: 'kitz', id: 'kitz', follow: 'animal:ricke', spacing: 1.5, era: 'today' });
        rt.request({ op: 'spawn', kind: 'hund', look: 'diane', id: 'diane', follow: 'player', era: 'today' });
        rt.request({ op: 'spawn', kind: 'hund', look: 'bijou', id: 'bijou', follow: 'player', era: 'today' });
        const k = rt.deer.find((d) => d.id === 'kitz');
        return { ricke: c, kitz: k ? { x: k.x, z: k.z } : null, dogs: ['diane', 'bijou'] };
      },
      stats: () => ({ ...rt.stats(), ms: this.ms }),
      restore: () => rt.restore(),
      save: () => rt.snapshot(),
    };
  }

  dispose(): void {
    delete this.ctx.tourCrowd.dogs;
    this.rt.dispose();
  }
}

let sys: AnimalsSystem | null = null;

export default defineSystem({
  id: 'animals',
  after: ['fauna', 'people'],
  init(ctx) {
    sys = new AnimalsSystem(ctx);
  },
  update(dt) {
    sys?.update(dt);
  },
  frame() {
    sys?.frame();
  },
  dispose() {
    sys?.dispose();
    sys = null;
  },
});
