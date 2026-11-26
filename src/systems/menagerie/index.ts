/**
 * Feature system "menagerie": the escaped animals of the duke's menagerie (eras 1789, 1793-07).
 *
 * - Spawned ONLY by the story: event 'menagerie:spawn' {animal, x, z, id?, heading?, count?}
 *   or story action {"do":"cue","id":"menagerie:spawn","data":{…same fields…}}; removed by
 *   'menagerie:clear' {id?} / cue "menagerie:clear". kq.menagerie.spawn() for debugging.
 * - An animal belongs to the era it was spawned in: it is only present while that era is shown
 *   (switching back brings it back). Spawns persist in the 'menagerie' state slice.
 * - Behaviour: logic.ts (pure). Visuals: models.ts (procedural low-poly rigs). Sound: audio.ts.
 * - No combat, never "caught": the cassowary's charge or the jaguar's shove KNOCK YOU DOWN for a
 *   few seconds (frozen, prone, the view tips towards the sky; reduced motion holds the view), then you
 *   get up. Dromedaries block (collision) and give way only to patience.
 * - gentleMode: slower cassowary, shorter knockdowns, the jaguar never shoves.
 *
 * Events: contract menagerie:spawn / menagerie:clear (story → here); feature-private
 * menagerie:knockdown, menagerie:seen, menagerie:yield (declared below).
 */
import './strings';
import { Color } from 'three';
import type { GameContext } from '../../core/context';
import { screenFlashScale } from '../../core/motion';
import { defineSystem } from '../../core/systems';
import { atmosphere } from '../../world/atmosphere';
import type { MenagerieAnimal } from '../contracts';
import { MenagerieAudio } from './audio';
import { type Animal, type MenagerieEvent, type MenageriePlayer, Menagerie, groupId } from './logic';
import { type AnimalRig, animalMaterial, cassowary, disposeRig, dromedary, eyeMaterial, jaguar } from './models';

/** A spawn as saved (JSON). */
export interface SavedAnimal {
  animal: MenagerieAnimal;
  x: number;
  z: number;
  id: string;
  heading?: number;
  count?: number;
  era: string;
}

export interface MenagerieSlice {
  animals: SavedAnimal[];
  /** Animals calmed by the player (combat track: never fought — calmed and led home). */
  calmed?: string[];
  /** Progress toward calming, keyed by the simulated animal's id. */
  misses?: Record<string, number>;
  flares?: Record<string, number>;
}

function calmingCount(counts: Record<string, number> | undefined, id: string): number {
  return counts && Object.hasOwn(counts, id) ? counts[id] ?? 0 : 0;
}

declare module '../../core/state' {
  interface SystemStates {
    menagerie: MenagerieSlice;
  }
}

declare module '../../core/events' {
  interface GameEvents {
    /** An animal knocked the player down (seconds lost). */
    'menagerie:knockdown': { animal: MenagerieAnimal; id: string; seconds: number };
    /** The player came into an animal's notice (cassowary) / sight of the jaguar's eyes. */
    'menagerie:seen': { animal: MenagerieAnimal; id: string };
    /** The dromedaries ambled aside (the path is free). */
    'menagerie:yield': { id: string };
  }
}

/**
 * Suggested places (local frame) — research / bible: the Kasuar at the amphitheatre rim
 * (KL-B40 1935/87), the dromedaries on the Karlsbergweiher dam, the jaguar near the Dutch
 * nursery (Holländische Gärtnerei) on the fire night.
 */
export const MENAGERIE_PLACES = {
  cassowary: { x: 1966, z: 92, heading: 1.6, era: '1789' },
  dromedary: { x: 819, z: -875, heading: 0.3, count: 2, era: '1793-07' },
  jaguar: { x: 1221, z: -1296, heading: 0, era: '1793-07' },
} as const;

export interface MenagerieHooks {
  /** Spawn an animal (as the story would) in the current era. */
  spawn(animal: MenagerieAnimal, x: number, z: number, o?: { id?: string; heading?: number; count?: number }): string;
  /** Spawn `dist` m in front of the view (angleDeg to the right), facing the player. */
  spawnInView(animal: MenagerieAnimal, dist: number, angleDeg?: number, o?: { id?: string; count?: number }): string;
  clear(id?: string): void;
  state(): { id: string; kind: MenagerieAnimal; state: string; x: number; z: number; h: number; cool: number; charges: number }[];
  /** Knockdown in progress (seconds left) or null. */
  down(): { kind: MenagerieAnimal; left: number } | null;
  /** Force an animal into a state (screenshots): e.g. 'charge', 'display', 'stalk'. */
  setState(id: string, state: string): void;
  /** Place an animal (x, z, heading in degrees: 0 north, 90 east). */
  place(id: string, x: number, z: number, yawDeg?: number): void;
  freeze(on?: boolean): void;
  events(): { name: string; payload: unknown; tick: number }[];
  places: typeof MENAGERIE_PLACES;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    menagerie?: MenagerieHooks;
  }
}

const ANIMALS: readonly MenagerieAnimal[] = ['cassowary', 'dromedary', 'jaguar'];

class MenagerieSystem {
  private readonly sim: Menagerie;
  private readonly mat = animalMaterial();
  private readonly eyeMat = eyeMaterial(new Color(0.75, 1.0, 0.45));
  private readonly rigs = new Map<string, AnimalRig>();
  private readonly audio: MenagerieAudio;
  private readonly captionAt = new Map<string, number>();
  private readonly log: { name: string; payload: unknown; tick: number }[] = [];
  private readonly flash: HTMLDivElement;
  private down: { kind: MenagerieAnimal; t: number; dur: number; pitch0: number; side: number } | null = null;
  private flashT = -1;
  private frozen = false;
  private hooksInstalled = false;
  private seen = new Set<string>();
  private eyeGlow = 0;

  constructor(readonly ctx: GameContext) {
    this.audio = new MenagerieAudio(ctx.audio);
    this.sim = new Menagerie({
      walkable: (x, z) => {
        const w = ctx.world;
        if (w.surfaceAt(x, z) === 'water') return false;
        if (w.collider.enabled && w.collider.footprintAt(x, z) >= 0) return false;
        // set solids too: the terraces KL-B43 are open ground, their rows of houses are solids
        if (w.collider.solidAt(x, z, 0.3)) return false;
        return w.heightfield.slopeDeg(x, z) < 46;
      },
    });
    const layer = ctx.ui.layer('menagerie');
    this.flash = document.createElement('div');
    this.flash.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;';
    layer.append(this.flash);
    const ev = ctx.events;
    ev.onAny((name, payload) => {
      if (name.startsWith('menagerie:')) {
        this.log.push({ name, payload, tick: ctx.loop.tick });
        if (this.log.length > 200) this.log.shift();
      }
    });
    ev.on('menagerie:spawn', (s) => this.spawn(s));
    ev.on('menagerie:clear', ({ id }) => this.clear(id));
    ev.on('story:cue', ({ id, data }) => {
      if (id === 'menagerie:spawn' && data) {
        const animal = data['animal'];
        const x = data['x'];
        const z = data['z'];
        if (typeof animal !== 'string' || !(ANIMALS as readonly string[]).includes(animal) || typeof x !== 'number' || typeof z !== 'number') {
          console.warn('[menagerie] cue menagerie:spawn needs data {animal, x, z}', data);
          return;
        }
        const num = (k: string) => (typeof data[k] === 'number' ? (data[k] as number) : undefined);
        this.spawn({ animal: animal as MenagerieAnimal, x, z, id: typeof data['id'] === 'string' ? (data['id'] as string) : undefined, heading: num('heading'), count: num('count') });
      } else if (id === 'menagerie:clear') this.clear(typeof data?.['id'] === 'string' ? (data['id'] as string) : undefined);
    });
    // calming (docs/ACTION-RPG.md §4.6): a cassowary that charged past you three times can be led
    // home; a jaguar driven back by three Bannlicht flares slinks off for good
    ev.on('combat:bann', ({ x, z, yaw, range, angle }) => {
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const cosHalf = Math.cos(((angle / 2) * Math.PI) / 180);
      for (const a of this.sim.animals) {
        if (a.kind !== 'jaguar') continue;
        const dx = a.x - x;
        const dz = a.z - z;
        const d = Math.hypot(dx, dz);
        if (d > range + 4 || (d > 1.5 && (dx * fx + dz * fz) / d < cosHalf * 0.8)) continue;
        const sl = this.slice();
        const n = calmingCount(sl.flares, a.id) + 1;
        sl.flares = { ...sl.flares, [a.id]: n };
        a.state = 'retreat' as Animal['state'];
        this.audio.hiss(this.pos3(a.x, a.z, 0.6), true);
        if (n >= 3) this.calm(a.id, 'jaguar');
        else this.caption('jag-flare', ctx.t('menagerie.jaguar.flare'), 2, 2400);
      }
    });
    ev.on('era:change', () => {
      this.endDown();
      this.rebuild();
    });
    ev.on('save:loaded', () => {
      this.endDown();
      this.rebuild();
    });
    this.rebuild();
  }

  private slice(): MenagerieSlice {
    const s = this.ctx.state.slice('menagerie', () => ({ animals: [] as SavedAnimal[] }));
    if (!Array.isArray(s.animals)) s.animals = [];
    return s;
  }

  spawn(s: { animal: MenagerieAnimal; x: number; z: number; id?: string; heading?: number; count?: number }): string {
    const id = s.id ?? `${s.animal}-${Math.round(s.x)}-${Math.round(s.z)}`;
    const sl = this.slice();
    sl.animals = sl.animals.filter((a) => a.id !== id);
    const saved: SavedAnimal = { animal: s.animal, x: s.x, z: s.z, id, era: this.ctx.era.current };
    if (s.heading !== undefined) saved.heading = s.heading;
    if (s.count !== undefined) saved.count = s.count;
    sl.animals.push(saved);
    this.rebuild();
    return id;
  }

  clear(id?: string): void {
    const sl = this.slice();
    sl.animals = id === undefined ? [] : sl.animals.filter((a) => a.id !== id);
    this.rebuild();
  }

  /** The animals of the current era, at their spots (positions are not saved). */
  private rebuild(): void {
    for (const r of this.rigs.values()) {
      r.root.removeFromParent();
      disposeRig(r);
    }
    this.rigs.clear();
    this.sim.remove();
    this.seen.clear();
    const era = this.ctx.era.current;
    const calmed = new Set(this.slice().calmed ?? []);
    for (const s of this.slice().animals) {
      if (s.era !== era) continue;
      if (calmed.has(s.id)) continue;
      const list = this.sim.add({ kind: s.animal, x: s.x, z: s.z, id: s.id, heading: s.heading }, s.count ?? (s.animal === 'dromedary' ? 2 : 1));
      for (const a of list) {
        const rig = a.kind === 'cassowary' ? cassowary(this.mat) : a.kind === 'dromedary' ? dromedary(this.mat, a.idx % 2) : jaguar(this.mat, this.eyeMat);
        this.ctx.scene.add(rig.root);
        this.rigs.set(a.id, rig);
      }
    }
  }

  private playerView(): MenageriePlayer {
    const pl = this.ctx.player;
    return {
      x: pl.position.x,
      z: pl.position.z,
      speed: pl.stats.speed,
      stance: pl.stance,
      lanternLit: pl.stats.lanternLit,
      lightRadius: pl.stats.lanternLit ? (atmosphere.uLanternRadius.value as number) : 4,
      down: this.down !== null || pl.frozen,
      flying: pl.flying,
    };
  }

  private pos3(x: number, z: number, up = 0.8) {
    return { x, y: this.ctx.world.heightAt(x, z) + up, z };
  }

  private caption(key: string, text: string, throttle = 8, ms = 3200): void {
    const now = this.ctx.loop.time;
    const last = this.captionAt.get(key);
    if (last !== undefined && now - last < throttle) return;
    this.captionAt.set(key, now);
    if (this.ctx.settings.state.subtitles === false) return;
    this.ctx.ui.hud.subtitle(null, text, ms);
  }

  update(dt: number): void {
    this.installHooks();
    if (this.down) {
      this.down.t += dt;
      if (this.down.t >= this.down.dur) this.endDown();
    }
    this.updateLeadHome();
    if (!this.sim.animals.length) return;
    // eyeshine: bright when the lantern is lit (the eyes catch it), faint in the dark
    this.eyeGlow += ((this.ctx.player.stats.lanternLit ? 1 : 0.35) - this.eyeGlow) * Math.min(1, dt * 3);
    this.sim.gentle = this.ctx.settings.state.gentleMode;
    const evs = this.frozen ? [] : this.sim.update(dt, this.playerView());
    for (const e of evs) this.onEvent(e);
    // bodies are solid: the player cannot walk through a dromedary (or a cassowary)
    const pl = this.ctx.player;
    if (!pl.flying) {
      const r = this.sim.collide(pl.position.x, pl.position.z, 0.35);
      if (r.hit) {
        pl.position.x = r.x;
        pl.position.z = r.z;
        pl.position.y = Math.max(pl.position.y, this.ctx.world.heightAt(r.x, r.z));
        if (r.hit.kind === 'dromedary') this.caption('drom-wait', this.ctx.t('menagerie.dromedary.wait'), 40, 3600);
      }
    }
  }

  private leadPrompt = false;

  /** A tired cassowary (3 charges past you) lets itself be led home: E within 3 m. */
  private updateLeadHome(): void {
    const ctx = this.ctx;
    const pl = ctx.player.position;
    const misses = this.slice().misses;
    let near: Animal | null = null;
    for (const a of this.sim.animals) {
      if (a.kind !== 'cassowary' || calmingCount(misses, a.id) < 3) continue;
      if (Math.hypot(a.x - pl.x, a.z - pl.z) < 3.5) near = a;
    }
    if (near && !ctx.player.frozen) {
      if (!this.leadPrompt) ctx.ui.hud.prompt('E', ctx.t('menagerie.cassowary.lead'), 'menagerie');
      this.leadPrompt = true;
      if (ctx.input.wasPressed('listen')) {
        this.calm(near.id, 'cassowary');
        this.caption('cas-home', ctx.t('menagerie.cassowary.home'), 2, 3600);
      }
    } else if (this.leadPrompt) {
      this.leadPrompt = false;
      ctx.ui.hud.prompt(null, undefined, 'menagerie');
    }
  }

  /** Calmed for good: menagerie:calmed, remembered in the slice, gone from the world. */
  calm(animalId: string, animal: MenagerieAnimal): void {
    const sl = this.slice();
    const id = groupId(animalId);
    sl.calmed = [...new Set([...(sl.calmed ?? []), id])];
    delete sl.misses?.[animalId];
    delete sl.flares?.[animalId];
    if (animal === 'jaguar') this.caption('jag-calm', this.ctx.t('menagerie.jaguar.calmed'), 2, 3600);
    this.ctx.events.emit('menagerie:calmed', { id, animal });
    if (this.leadPrompt) {
      this.leadPrompt = false;
      this.ctx.ui.hud.prompt(null, undefined, 'menagerie');
    }
    this.rebuild();
  }

  private onEvent(e: MenagerieEvent): void {
    const ctx = this.ctx;
    const t = ctx.t;
    switch (e.type) {
      case 'notice':
        if (!this.seen.has(e.id)) {
          this.seen.add(e.id);
          ctx.events.emit('menagerie:seen', { animal: e.kind, id: e.id });
        }
        break;
      case 'boom':
        this.audio.boom(this.pos3(e.x, e.z, 1));
        this.caption('cas-boom', t('menagerie.cassowary.boom'), 10);
        break;
      case 'charge':
        this.audio.hiss(this.pos3(e.x, e.z, 1.2));
        this.caption('cas-charge', t('menagerie.cassowary.charge'), 4, 2400);
        break;
      case 'miss': {
        const sl = this.slice();
        const n = calmingCount(sl.misses, e.id) + 1;
        sl.misses = { ...sl.misses, [e.id]: n };
        if (n >= 3) this.caption('cas-tired', t('menagerie.cassowary.tired'), 4, 3200);
        else this.caption('cas-miss', t('menagerie.cassowary.miss'), 4, 2000);
        break;
      }
      case 'bored':
        this.caption('cas-bored', t('menagerie.cassowary.bored'), 20);
        break;
      case 'grumble': {
        const a = this.sim.animals.find((x) => x.id === e.id);
        this.audio.grumble(this.pos3(e.x, e.z, 1.9), a && a.idx % 2 ? 0.85 : 1);
        this.caption('drom-grumble', t('menagerie.dromedary.grumble'), 6);
        break;
      }
      case 'yield': {
        const g = groupId(e.id);
        if (!this.seen.has(`yield:${g}`)) {
          this.seen.add(`yield:${g}`);
          ctx.events.emit('menagerie:yield', { id: g });
          this.caption('drom-yield', t('menagerie.dromedary.yield'), 20);
        }
        break;
      }
      case 'seen':
        if (!this.seen.has(e.id)) {
          this.seen.add(e.id);
          ctx.events.emit('menagerie:seen', { animal: e.kind, id: e.id });
          this.audio.saw(this.pos3(e.x, e.z, 0.6));
          this.caption('jag-saw', t('menagerie.jaguar.saw'), 30, 3600);
        }
        break;
      case 'growl':
        this.audio.saw(this.pos3(e.x, e.z, 0.6), true);
        this.caption('jag-growl', t('menagerie.jaguar.growl'), 8);
        break;
      case 'hiss':
        this.audio.hiss(this.pos3(e.x, e.z, 0.6), true);
        this.caption('jag-hiss', t('menagerie.jaguar.hiss'), 8);
        break;
      case 'step':
        this.audio.step(this.pos3(e.x, e.z, 0.1), e.heavy);
        break;
      case 'knockdown':
        this.knockdown(e.kind, e.id, e.seconds, e.dx, e.dz);
        break;
    }
  }

  /** You go down: frozen, prone, looking at the sky; a few seconds lost, nothing else. */
  private knockdown(kind: MenagerieAnimal, id: string, seconds: number, dx: number, dz: number): void {
    const ctx = this.ctx;
    const pl = ctx.player;
    if (this.down || pl.frozen) return;
    pl.frozen = true;
    pl.lookLocked = true;
    pl.setStance('prone');
    // thrown a step along the charge (if the ground allows it)
    const nx = pl.position.x + dx * 0.9;
    const nz = pl.position.z + dz * 0.9;
    const w = ctx.world;
    if (w.surfaceAt(nx, nz) !== 'water' && !(w.collider.enabled && w.collider.footprintAt(nx, nz) >= 0) && !w.collider.solidAt(nx, nz, 0.3)) {
      pl.position.x = nx;
      pl.position.z = nz;
      pl.position.y = w.heightAt(nx, nz);
    }
    // which side you fall to: the charge comes from the left or right of the view
    const right = dx * Math.cos(pl.yaw) + dz * -Math.sin(pl.yaw);
    this.down = { kind, t: 0, dur: seconds, pitch0: pl.pitch, side: right >= 0 ? 1 : -1 };
    this.flashT = 0;
    this.audio.thud(this.pos3(pl.position.x, pl.position.z, 0.3));
    this.caption('down', ctx.t(kind === 'jaguar' ? 'menagerie.jaguar.down' : 'menagerie.cassowary.down'), 2, Math.round(seconds * 1000));
    ctx.events.emit('menagerie:knockdown', { animal: kind, id, seconds });
  }

  private endDown(): void {
    const d = this.down;
    if (!d) return;
    this.down = null;
    const pl = this.ctx.player;
    pl.frozen = false;
    pl.lookLocked = false;
    pl.setStance('crouch');
    pl.pitch = Math.max(-0.4, Math.min(0.4, d.pitch0));
    this.ctx.camera.rotation.z = 0;
    this.caption('up', this.ctx.t('menagerie.up'), 2, 1800);
  }

  // ---- frame ---------------------------------------------------------------------------------

  frame(dt: number): void {
    this.installHooks();
    const ctx = this.ctx;
    const reduced = ctx.settings.state.reducedMotion;
    // knockdown view: tip over towards the sky, roll to the falling side, then come back up
    const d = this.down;
    if (d) {
      const k = d.t < 0.35 ? d.t / 0.35 : d.t > d.dur - 0.6 ? Math.max(0, (d.dur - d.t) / 0.6) : 1;
      const e = k * k * (3 - 2 * k);
      ctx.player.pitch = reduced ? d.pitch0 : d.pitch0 + (0.85 - d.pitch0) * e;
      if (!reduced) {
        ctx.camera.rotation.set(ctx.player.pitch, ctx.player.yaw, 0.45 * d.side * e, 'YXZ');
        if (d.t < 0.5) {
          const amp = 0.02 * (1 - d.t / 0.5);
          ctx.camera.position.x += Math.sin(d.t * 70) * amp;
          ctx.camera.position.y += Math.sin(d.t * 53) * amp;
        }
      }
    }
    if (this.flashT >= 0) {
      this.flashT += dt;
      const peak = 0.85 * screenFlashScale(reduced, ctx.settings.state.reducedFlash);
      const f = this.flashT < 0.08 ? (this.flashT / 0.08) * peak : Math.max(0, peak * (1 - (this.flashT - 0.08) / 0.7));
      this.flash.style.opacity = f.toFixed(3);
      if (this.flashT > 0.8) {
        this.flashT = -1;
        this.flash.style.opacity = '0';
      }
    }
    if (!this.sim.animals.length) return;
    const cam = ctx.camera.position;
    const time = ctx.loop.time;
    for (const a of this.sim.animals) {
      const r = this.rigs.get(a.id);
      if (r) this.pose(r, a, time, reduced, cam);
    }
  }

  private pose(r: AnimalRig, a: Animal, time: number, reduced: boolean, cam: { x: number; y: number; z: number }): void {
    const w = this.ctx.world;
    const y = w.heightAt(a.x, a.z);
    r.root.position.set(a.x, y, a.z);
    r.root.rotation.y = a.h;
    const ph = a.phase * Math.PI * 2;
    const gait = Math.min(1, a.speed / (a.kind === 'cassowary' ? 5 : a.kind === 'jaguar' ? 3.5 : 1.5));
    const swing = (a.kind === 'cassowary' ? 0.95 : a.kind === 'jaguar' ? 0.7 : 0.45) * Math.max(gait, a.speed > 0.15 ? 0.35 : 0);
    if (r.legs.length === 2) {
      r.legs[0]!.rotation.x = Math.sin(ph) * swing;
      r.legs[1]!.rotation.x = -Math.sin(ph) * swing;
    } else {
      // dromedaries pace (same side together), the jaguar trots (diagonal pairs)
      const pace = a.kind === 'dromedary';
      const s = Math.sin(ph) * swing;
      r.legs[0]!.rotation.x = s; // front left
      r.legs[1]!.rotation.x = -s; // front right
      r.legs[2]!.rotation.x = pace ? s : -s; // hind left
      r.legs[3]!.rotation.x = pace ? -s : s; // hind right
    }
    const bob = Math.abs(Math.sin(ph)) * 0.05 * gait;
    const breathe = reduced ? 0 : Math.sin(time * 1.7 + a.idx) * 0.01;
    switch (a.kind) {
      case 'cassowary': {
        const charging = a.state === 'charge';
        r.body.position.y = 0.95 + bob + breathe;
        r.body.rotation.x = charging ? -0.22 : -0.05 * gait;
        // display: puffed up, neck straight and tall; charge: neck low and forward
        const puff = 1 + 0.14 * a.pose;
        r.body.scale.set(puff, puff, 1 + 0.06 * a.pose);
        let neck = charging ? -0.75 : -0.1 * gait + 0.2 * a.pose;
        // idle / bored: pecking at the ground now and then
        if ((a.state === 'idle' || a.state === 'bored') && a.speed < 0.3) neck -= Math.max(0, Math.sin(time * 0.9 + a.idx * 2) - 0.4) * 2.2;
        if (a.state === 'notice' && !reduced) neck += Math.sin(a.t * 10) * 0.05; // the boom
        r.neck.rotation.x += (neck - r.neck.rotation.x) * 0.25;
        break;
      }
      case 'dromedary': {
        r.body.position.y = 1.55 + bob * 0.6 + breathe;
        r.body.rotation.z = Math.sin(ph) * 0.03 * gait; // the pacing roll
        const grumble = a.state === 'grumble' ? 1 : 0;
        r.neck.rotation.x += (0.12 * grumble - 0.08 + Math.sin(time * 0.3 + a.idx) * 0.06 - r.neck.rotation.x) * 0.1;
        if (r.head) {
          r.head.rotation.y = reduced ? 0 : Math.sin(time * 4.2 + a.idx) * 0.06 * (1 - grumble); // chewing
          r.head.rotation.x = -0.35 * grumble;
        }
        if (r.tail) r.tail.rotation.z = Math.sin(time * 1.3 + a.idx) * 0.3;
        break;
      }
      case 'jaguar': {
        const crouch = a.pose;
        r.body.position.y = 0.58 - 0.16 * crouch + bob * 0.5 + breathe;
        r.body.rotation.x = 0.05 * crouch;
        r.neck.rotation.x = -0.15 * crouch;
        // the head keeps looking at you while it circles
        if (r.head) {
          const p = this.ctx.player.position;
          const want = Math.atan2(-(p.x - a.x), -(p.z - a.z)) - a.h;
          const turn = Math.max(-0.9, Math.min(0.9, Math.atan2(Math.sin(want), Math.cos(want))));
          r.head.rotation.y += (turn - r.head.rotation.y) * 0.15;
        }
        if (r.tail) r.tail.rotation.y = Math.sin(time * (a.state === 'creep' ? 3 : 1.1)) * 0.5;
        // eyes: only when they face the camera (and a slow blink)
        const hx = -Math.sin(a.h + (r.head?.rotation.y ?? 0));
        const hz = -Math.cos(a.h + (r.head?.rotation.y ?? 0));
        const cx = cam.x - a.x;
        const cz = cam.z - a.z;
        const cl = Math.hypot(cx, cz) || 1;
        const facing = Math.max(0, (hx * cx + hz * cz) / cl);
        const blink = Math.sin(time * 0.6 + a.idx * 3) > 0.985 ? 0 : 1;
        this.eyeMat.uniforms.uGlow!.value = this.eyeGlow * Math.pow(facing, 1.5) * blink;
        break;
      }
    }
  }

  // ---- debug hooks ---------------------------------------------------------------------------

  private installHooks(): void {
    if (this.hooksInstalled || typeof window === 'undefined' || !window.kq) return;
    this.hooksInstalled = true;
    const ctx = this.ctx;
    const self = this;
    window.kq.menagerie = {
      spawn(animal, x, z, o = {}) {
        return self.spawn({ animal, x, z, ...o });
      },
      spawnInView(animal, dist, angleDeg = 0, o = {}) {
        const pl = ctx.player;
        const h = pl.yaw - (angleDeg * Math.PI) / 180;
        const x = pl.position.x - Math.sin(h) * dist;
        const z = pl.position.z - Math.cos(h) * dist;
        // facing the player (dromedaries: standing across the line of sight)
        const heading = Math.atan2(-(pl.position.x - x), -(pl.position.z - z));
        return self.spawn({ animal, x, z, heading, ...o });
      },
      clear(id) {
        self.clear(id);
      },
      state() {
        return self.sim.animals.map((a) => ({ id: a.id, kind: a.kind, state: a.state, x: a.x, z: a.z, h: a.h, cool: a.cool, charges: a.charges }));
      },
      down() {
        return self.down ? { kind: self.down.kind, left: self.down.dur - self.down.t } : null;
      },
      setState(id, state) {
        const a = self.sim.animals.find((x) => x.id === id);
        if (!a) return;
        a.state = state as Animal['state'];
        a.t = 0;
        a.cool = 0;
        if (state === 'charge') a.from = { x: a.x, z: a.z };
      },
      place(id, x, z, yawDeg) {
        const a = self.sim.animals.find((q) => q.id === id);
        if (!a) return;
        a.x = x;
        a.z = z;
        if (yawDeg !== undefined) a.h = (-yawDeg * Math.PI) / 180;
      },
      freeze(on = true) {
        self.frozen = on;
      },
      events() {
        return self.log.slice();
      },
      places: MENAGERIE_PLACES,
    };
  }

  dispose(): void {
    for (const r of this.rigs.values()) {
      r.root.removeFromParent();
      disposeRig(r);
    }
    this.rigs.clear();
    this.mat.dispose();
    this.eyeMat.dispose();
    this.flash.remove();
  }
}

let sys: MenagerieSystem | null = null;

export default defineSystem({
  id: 'menagerie',
  init(ctx) {
    sys = new MenagerieSystem(ctx);
  },
  update(dt) {
    sys?.update(dt);
  },
  frame(dt) {
    sys?.frame(dt);
  },
  dispose() {
    sys?.dispose();
    sys = null;
  },
});
