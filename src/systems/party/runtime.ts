/**
 * The party's runtime, headless (no three.js, no DOM, no GameContext): requests, people and dogs,
 * the set handle, the credits clock with its spotlights, the camera request, the save slice.
 * index.ts wires it to the game; tests/party.test.ts drives it with fakes.
 */
import type { CinematicPlay } from '../cinematic/types';
import { type CreditsPlan, SKIP_GRACE, creditLines, creditsPlan, stripAt } from './credits';
import { type Activity, MARLENE_SPEC, MARLENE_STANDIN, type PartyLayout, type Placement, TF01, type XZ, faceYaw, partyLayout } from './placements';
import type { PartySetHandle } from './set';
import { PARTY_VARIANTS, type PartySlice, type PartyVariant } from './types';

/** The cinematic id of the credits' camera way. */
export const CREDITS_CINEMATIC = 'party-credits';
/** The party exists only in this era (today's plateau). */
export const PARTY_ERA = 'today';
/** Seconds between two one-shot gestures of an `interact` person (seeded within). */
const INTERACT_EVERY: [number, number] = [4, 8];

export interface PartyBus {
  on(name: string, fn: (p: never) => void): void;
  emit(name: string, payload: unknown): void;
}

/** The parts of a people-API Person the party uses. */
export interface PersonLike {
  readonly id: string;
  readonly specId: string;
  readonly root: { position: { x: number; y: number; z: number } };
  play(clip: Activity | 'idle', o?: { loop?: boolean; fade?: number }): void;
  face(yaw: number): void;
  setVisible(v: boolean): void;
  dispose(): void;
}
export interface PeopleLike {
  spawn(specId: string, o: { x: number; z: number; y?: number; yaw?: number; seed?: number; name?: string; speaker?: string }): PersonLike;
  specs(): readonly string[];
}

/** The credits strip (DOM in the game, a fake in tests). */
export interface StripLike {
  show(lines: readonly string[], reduced: boolean): void;
  /** Crawl 0..1 / the line index with reduced motion. */
  render(crawl: number, line: number): void;
  hide(): void;
}

export interface PartyDeps {
  bus: PartyBus;
  people(): PeopleLike | undefined;
  /** Build the set for a layout (null: no scene, e.g. headless). */
  buildSet(layout: PartyLayout, variant: PartyVariant): PartySetHandle | null;
  world: {
    heightAt(x: number, z: number): number;
    player(): XZ;
    era(): string;
  };
  slice(): PartySlice;
  /** content/party/credits.json (`{lines}`), undefined when the file does not exist. */
  creditsFile(): unknown;
  reduced(): boolean;
  strip?: StripLike;
  cinematic: {
    /** The cinematic system is there (it answers cinematic:play). */
    available(): boolean;
    playing(): string | null;
    /** End the playing cinematic (skipped). */
    stop(): void;
  };
  log?: (msg: string) => void;
}

interface Member {
  pl: Placement;
  spec: string;
  person: PersonLike | null;
  /** Seconds until the next interact one-shot (interact people only), and how many went out. */
  next: number;
  n: number;
  /** In a conversation (the npc system owns the body until it ends). */
  talking: boolean;
}

interface Party {
  variant: PartyVariant;
  layout: PartyLayout;
  set: PartySetHandle | null;
  members: Member[];
  dogs: string[];
  visible: boolean;
}

interface Credits {
  lines: string[];
  plan: CreditsPlan;
  t: number;
  /** Index of the next spotlight to emit. */
  spot: number;
  /** The camera: asked for, playing, or not (rejected / ended / no cinematic system). */
  cam: 'pending' | 'on' | 'off';
  reduced: boolean;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class PartyRuntime {
  party: Party | null = null;
  credits: Credits | null = null;
  /** Spotlights emitted in the current / last credits run (who, in order). */
  readonly spotlights: string[] = [];
  private readonly log: (m: string) => void;

  constructor(private readonly deps: PartyDeps) {
    this.log = deps.log ?? ((m) => console.warn(m));
    const bus = deps.bus;
    bus.on('party:set', (p: unknown) => void this.set(p));
    bus.on('party:credits', (p: unknown) => void this.startCredits(p));
    bus.on('party:clear', () => this.clear());
    bus.on('story:cue', (c: { id?: string; data?: unknown }) => {
      if (!c || typeof c.id !== 'string') return;
      if (c.id === 'party:set') this.set(c.data);
      else if (c.id === 'party:credits') this.startCredits(c.data ?? {});
      else if (c.id === 'party:clear') this.clear();
    });
    bus.on('cinematic:start', (p: { id: string }) => {
      if (p?.id === CREDITS_CINEMATIC && this.credits?.cam === 'pending') this.credits.cam = 'on';
    });
    bus.on('cinematic:end', (p: { id: string; skipped: boolean }) => {
      const c = this.credits;
      if (p?.id !== CREDITS_CINEMATIC || !c) return;
      const was = c.cam;
      c.cam = 'off';
      // rejected before it started (the camera is held): the credits run on without the orbit;
      // reduced motion's two stills end on their own (not skipped): the strip runs on
      if (was === 'on' && p.skipped) this.finish(true);
    });
    bus.on('npc:conversation', (p: { npc: string; open: boolean }) => this.conversation(p?.npc, p?.open === true));
    bus.on('era:change', () => this.applyVisible());
    bus.on('game:start', () => this.resumeCheck());
    bus.on('save:loaded', () => this.afterLoad());
  }

  private get slice(): PartySlice {
    return this.deps.slice();
  }

  // ---- party:set ------------------------------------------------------------------------------

  /** Build the party for an ending variant; false when the request is bad. */
  set(raw: unknown): boolean {
    const variant = isObj(raw) ? raw.variant : undefined;
    if (typeof variant !== 'string' || !PARTY_VARIANTS.includes(variant as PartyVariant)) {
      this.log(`[party] bad party:set ${JSON.stringify(raw)}`);
      return false;
    }
    const v = variant as PartyVariant;
    const atRaw = isObj(raw) && isObj(raw.at) ? raw.at : null;
    const at: XZ = atRaw && fin(atRaw.x) && fin(atRaw.z) ? { x: atRaw.x, z: atRaw.z } : TF01;
    this.dropParty();
    const layout = partyLayout(v, at);
    let set: PartySetHandle | null = null;
    try {
      set = this.deps.buildSet(layout, v);
    } catch (err) {
      this.log(`[party] the set failed: ${String(err)}`);
    }
    const party: Party = { variant: v, layout, set, members: [], dogs: [], visible: true };
    this.party = party;
    const people = this.deps.people();
    const specs = people ? new Set(people.specs()) : new Set<string>();
    const player = this.deps.world.player();
    for (const pl of layout.people) {
      let spec = pl.spec;
      let seed = pl.seed ?? hash(pl.who);
      if (spec === MARLENE_SPEC && !specs.has(MARLENE_SPEC)) {
        spec = MARLENE_STANDIN.spec;
        seed = MARLENE_STANDIN.seed;
      }
      const m: Member = { pl, spec, person: null, next: this.interval(pl.who, 0), n: 0, talking: false };
      if (people) {
        try {
          m.person = people.spawn(spec, { x: pl.x, z: pl.z, y: this.deps.world.heightAt(pl.x, pl.z), yaw: faceYaw(pl, layout, player), seed, name: `party:${pl.who}`, speaker: pl.speaker });
          this.cue(m);
        } catch (err) {
          this.log(`[party] people.spawn failed for '${pl.who}': ${String(err)}`);
        }
      }
      party.members.push(m);
    }
    // the dogs (animals system): A by Jost, B far from the fire asleep, C at the player's feet with a glint
    const d = layout.dogs;
    const jost = layout.people.find((p) => p.who === 'double.jost');
    ['diane', 'bijou'].forEach((id, i) => {
      const spot = d.at?.[i] ?? (d.follow === 'player' ? { x: player.x + (i ? 0.8 : -0.8), z: player.z + 0.9 } : { x: (jost?.x ?? at.x) + (i ? 1.1 : -0.9), z: (jost?.z ?? at.z) + 0.9 });
      this.deps.bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: id, id, x: spot.x, z: spot.z, era: 'today' });
      this.deps.bus.emit('animal:request', d.at ? { op: 'lie', id, x: spot.x, z: spot.z } : { op: 'lie', id, follow: d.follow });
      if (d.shine > 0) this.deps.bus.emit('animal:request', { op: 'shine', id, k: d.shine });
      party.dogs.push(id);
    });
    if (v === 'burn') set?.burst();
    this.slice.variant = v;
    this.applyVisible();
    this.deps.bus.emit('party:ready', { variant: v });
    return true;
  }

  private interval(who: string, n: number): number {
    const [a, b] = INTERACT_EVERY;
    return a + ((hash(`${who}:${n}`) % 1000) / 1000) * (b - a);
  }

  /** Put a member's looping clip on (interact people idle between their one-shots). */
  private cue(m: Member): void {
    const p = m.person;
    if (!p || m.talking) return;
    const a = m.pl.activity;
    if (a === 'interact') {
      p.play('idle');
      p.play('interact');
    } else p.play(a);
  }

  private conversation(npc: string | undefined, open: boolean): void {
    const m = this.party?.members.find((q) => q.pl.speaker && q.pl.speaker === npc);
    if (!m) return;
    m.talking = open;
    // the npc system plays 'idle' at the end; the party's activity takes the body back
    if (!open) this.cue(m);
  }

  private applyVisible(): void {
    const p = this.party;
    if (!p) return;
    const on = this.deps.world.era() === PARTY_ERA;
    p.visible = on;
    p.set?.setVisible(on);
    for (const m of p.members) m.person?.setVisible(on);
  }

  // ---- party:clear ----------------------------------------------------------------------------

  /** Remove everything (credits still running end skipped). */
  clear(): void {
    if (this.credits) this.finish(true);
    this.dropParty();
    this.slice.variant = null;
  }

  private dropParty(): void {
    const p = this.party;
    if (!p) return;
    this.party = null;
    for (const m of p.members) m.person?.dispose();
    p.set?.dispose();
    for (const id of p.dogs) this.deps.bus.emit('animal:request', { op: 'despawn', id });
  }

  // ---- party:credits --------------------------------------------------------------------------

  /** Start the credits; false when they already run or the request is bad. */
  startCredits(raw: unknown): boolean {
    if (this.credits) {
      this.log('[party] credits already running');
      return false;
    }
    const override = isObj(raw) ? raw.lines : undefined;
    const lines = creditLines(override, this.deps.creditsFile());
    const doubles = (this.party?.layout.people ?? []).filter((p) => p.double).map((p) => ({ who: p.who, x: p.x, z: p.z }));
    const centre = this.party?.layout.centre ?? TF01;
    const plan = creditsPlan(centre, doubles, lines.length);
    const reduced = this.deps.reduced();
    const c: Credits = { lines, plan, t: 0, spot: 0, cam: 'off', reduced };
    this.credits = c;
    this.spotlights.length = 0;
    this.slice.credits = 'playing';
    this.deps.strip?.show(lines, reduced);
    this.deps.strip?.render(0, reduced ? 0 : -1);
    this.deps.bus.emit('credits:start', { seconds: plan.seconds });
    if (this.deps.cinematic.available() && plan.keys.length >= 2) {
      c.cam = 'pending';
      const spec: CinematicPlay = { id: CREDITS_CINEMATIC, keys: plan.keys, skippable: true, lockInput: false, reduced: 'stills' };
      this.deps.bus.emit('cinematic:play', spec);
      // the system answered synchronously: a 'pending' left means nobody played it
      if (this.credits === c && c.cam === 'pending') c.cam = 'off';
    }
    return true;
  }

  /** Skip the credits (debug, the strip's own keys). */
  skip(): void {
    if (this.credits) this.finish(true);
  }

  /** A key from the player while the strip runs without a camera of ours (the cinematic owns its own skip). */
  userSkip(): boolean {
    const c = this.credits;
    if (!c || c.cam === 'on' || c.t < SKIP_GRACE) return false;
    this.finish(true);
    return true;
  }

  private finish(skipped: boolean): void {
    const c = this.credits;
    if (!c) return;
    this.credits = null;
    this.deps.strip?.hide();
    if (this.deps.cinematic.playing() === CREDITS_CINEMATIC) this.deps.cinematic.stop();
    this.slice.credits = 'done';
    this.deps.bus.emit('credits:done', { skipped });
  }

  // ---- save / resume --------------------------------------------------------------------------

  /** The game started on a save whose credits were playing: they are not replayed. */
  private resumeCheck(): void {
    if (this.credits || this.slice.credits !== 'playing') return;
    this.slice.credits = 'done';
    this.deps.bus.emit('credits:done', { skipped: true });
  }

  /** A load: live credits end (skipped), the loaded save's playing credits too, once; no party in the save → none here. */
  private afterLoad(): void {
    const live = this.credits;
    if (live) {
      this.credits = null;
      this.deps.strip?.hide();
      if (this.deps.cinematic.playing() === CREDITS_CINEMATIC) this.deps.cinematic.stop();
    }
    const s = this.slice;
    const held = s.credits === 'playing';
    if (held) s.credits = 'done';
    if (live || held) this.deps.bus.emit('credits:done', { skipped: true });
    if (!s.variant) this.dropParty();
  }

  // ---- step -----------------------------------------------------------------------------------

  /** Fixed step: gestures, the credits clock, spotlights, the natural end. */
  update(dt: number): void {
    const d = fin(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    const p = this.party;
    if (p?.visible) {
      for (const m of p.members) {
        if (m.pl.activity !== 'interact' || !m.person || m.talking) continue;
        m.next -= d;
        if (m.next <= 0) {
          m.person.play('interact');
          m.next = this.interval(m.pl.who, ++m.n);
        }
      }
    }
    const c = this.credits;
    if (!c) return;
    c.t += d;
    const spots = c.plan.spots;
    while (c.spot < spots.length && spots[c.spot]!.t <= c.t) {
      const s = spots[c.spot]!;
      c.spot++;
      this.spotlights.push(s.who);
      this.deps.bus.emit('party:spotlight', { who: s.who, i: s.i });
      if (this.credits !== c) return;
    }
    if (c.t >= c.plan.seconds) this.finish(false);
  }

  /** Drawn frame: the set's flames, the strip. */
  frame(dt: number): void {
    this.party?.set?.update(dt);
    const c = this.credits;
    if (c && this.deps.strip) {
      const s = stripAt(c.t, c.plan.seconds, c.lines.length, c.reduced);
      this.deps.strip.render(s.crawl, s.line);
    }
  }

  /** Drop everything without events (system dispose). */
  dispose(): void {
    if (this.credits) {
      this.credits = null;
      this.deps.strip?.hide();
    }
    this.dropParty();
  }
}
