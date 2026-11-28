/**
 * Feature "forage" (docs/ACTION-RPG.md §7.1): throw chestnuts, cut small plants with the staff.
 *
 *  - Throw (action `throw`, F / the touch button „Kastanie“): hold shows the arc and where it
 *    lands, letting go throws one chestnut there. The landing point is where the view points
 *    (2–22 m), or the body of the locked / soft target. One chestnut leaves the pack per throw.
 *    It stings an enemy (`combat:pelt`), bounces off trunks, walls and people (`world:pelt`), makes
 *    a noise where it lands (`world:noise`: the deer prick up, a calm pack sends a hound to look, a
 *    court watcher walks over) and is gone.
 *  - Cut: where the staff comes down (`combat:arc`), ferns, flower clumps and low bushes are cut
 *    to a stub and grass is mown; they grow back in steps (src/world/vegetation/cuts.ts). A fresh
 *    plant sometimes hides a chestnut (logic.ts `rollDrop`: seeded, with bad-luck protection),
 *    placed as an ordinary pickup. On Niedrig, where the forest-floor props are not drawn, the
 *    nearest of the same plants show as broad-leaved clumps (`GroundCover.setBrush`).
 *
 * State `systems.forage` (ForageSlice: counters and the hints shown). Cut plants and chestnuts in
 * flight are not saved. Hooks `kq.forage.*`.
 */
import './strings';
import './forage.css';
import { Vector3 } from 'three';
import type { GameContext } from '../../core/context';
import type { GameEvents } from '../../core/events';
import { defineSystem } from '../../core/systems';
import { t } from '../../i18n';
import { actionLabel } from '../../ui/actionLabel';
import { h, svg } from '../../ui/dom';
import { addControlKeys } from '../../ui/menus';
import { segmentCylinderEntry } from '../../world/collision';
import { CROWD_LEVEL_TOLERANCE, DOG_RADIUS } from '../../world/crowd';
import { CUT, plantCuts } from '../../world/vegetation/cuts';
import { BRUSH_MAX } from '../../world/vegetation/groundcover';
import { hash2 } from '../../world/vegetation/scatter';
import { forageOnly, segmentHitsBody } from '../combat/rules';
import { iconFor } from '../progression/icons';
import { cutSound, findSound, landSound, splashSound, swishSound, throwSound } from './audio';
import { type ForageSlice, NUT, type Nut, THROW, type V3, arcPoints, clampAim, createForageSlice, createNut, deflectNut, mowCircle, normalizeForage, plantKey, rollDrop, solveThrow, stepNut } from './logic';
import { type BurstKind, ForageVisuals } from './visuals';

declare module '../../core/state' {
  interface SystemStates {
    forage: ForageSlice;
  }
}

declare module '../../core/events' {
  interface GameEvents {
    /** A chestnut left the hand towards t; `left` are still in the pack. */
    'forage:throw': { x: number; y: number; z: number; tx: number; ty: number; tz: number; left: number };
    /** A thrown chestnut struck something (its first impact). */
    'forage:impact': { x: number; y: number; z: number; on: 'ground' | 'water' | 'enemy' | 'body' | 'wood' | 'wall'; /** The placed person it struck ('body'). */ npc?: string };
    /** The staff cut plants in a circle: how many, and how many chestnuts lay under them. */
    'forage:cut': { x: number; z: number; r: number; plants: number; drops: number };
    /** Chestnuts in the pack (the touch button and the HUD chip follow it). */
    'forage:nuts': { count: number };
  }
}

export interface ForagePlant {
  kind: string;
  x: number;
  y: number;
  z: number;
  height: number;
  /** 1 = standing, below: cut and growing back. */
  factor: number;
}

export interface ForageHooks {
  state(): ForageSlice & { nuts: number; flying: number; circles: number; leaves: number; holding: boolean; brush: number };
  /** Throw one chestnut at the view's aim now (as a tap on the key). False: none, or not allowed. */
  throw(): boolean;
  /** The hand and the landing point a throw would take now. */
  aim(): { from: V3; to: V3 };
  /** Plants the staff can cut within `r` m of the player (default 20), nearest first. */
  plants(r?: number): ForagePlant[];
  /** Cut a circle as a swing would (tests; needs the staff like a swing). */
  cut(x: number, z: number, r: number): { plants: number; drops: number };
  /** Tests: the next `n` freshly cut plants drop a chestnut for sure. */
  rig(n: number): void;
  /** Chestnuts in flight: position and state. */
  flying(): { x: number; y: number; z: number; resting: boolean }[];
}

declare module '../../debug/hooks' {
  interface KqHooks {
    forage?: ForageHooks;
  }
}

const ARC_N = 20;
/** Niedrig: stand-in clumps are rebuilt after this many metres. */
const BRUSH_STEP = 4;
const BRUSH_R = 20;
/** Seconds of quiet before the staff hint, and the longest wait for a pause in speech. */
const HINT_QUIET = 2.5;
const HINT_WAIT = 12;
const THROW_HINT_SECONDS = 7;
/** A tap this long before the cooldown ends still throws (s). */
const THROW_BUFFER = 0.4;

class Forage {
  private slice: ForageSlice;
  private readonly visuals = new ForageVisuals();
  private readonly nuts: Nut[] = [];
  private cooldown = 0;
  private holding = false;
  private buffered = 0;
  private time = 0;
  private count = -1;
  private rigged = 0;
  private talking = false;
  private speaking = false;
  private quiet = 0;
  private hintWait = 0;
  private cutHintPending = false;
  private throwHintUntil = 0;
  private refusedAt = -99;
  // Niedrig stand-ins
  private readonly brush = new Float32Array(BRUSH_MAX * 6);
  private brushX = Infinity;
  private brushZ = Infinity;
  private brushVersion = -1;
  private brushShown = 0;
  private brushT = 0;
  // HUD chip
  private readonly chip: HTMLElement;
  private readonly throwHint: HTMLElement;
  private readonly chipKey: HTMLElement;
  private readonly chipCount: HTMLElement;
  // scratch
  private readonly from: V3 = { x: 0, y: 0, z: 0 };
  private readonly dir = new Vector3();
  private readonly arc = new Float32Array(ARC_N * 3);
  private readonly offs: (() => void)[] = [];

  constructor(private readonly ctx: GameContext) {
    this.slice = this.load();
    ctx.scene.add(this.visuals.group);
    addControlKeys({ id: 'throw', actions: ['throw'] });
    this.chipKey = h('kbd.kqp-q-key', 'F');
    this.chipCount = h('span.kqp-q-count', '×0');
    this.chip = h('div.kqp-quick.kqf-nut', { 'data-testid': 'hud-nuts', hidden: true }, [
      this.chipKey,
      h('span.kqp-q-icon', svg(iconFor(NUT))),
      h('span.kqp-q-text', [h('span.kqp-q-name', t('forage.hud.name')), this.chipCount]),
    ]);
    this.throwHint = h('div.kqf-throw-hint', { 'data-testid': 'first-throw-hint', role: 'status', hidden: true });
    ctx.ui.hud.dock('vitals', this.throwHint, 44);
    ctx.ui.hud.dock('vitals', this.chip, 45);
    this.wire();
    this.syncCount(true);
  }

  private load(): ForageSlice {
    const s = normalizeForage(this.ctx.state.slice('forage', createForageSlice));
    (this.ctx.state.mutable.systems as { forage?: ForageSlice }).forage = s;
    return s;
  }

  private wire(): void {
    const { ctx } = this;
    const ev = ctx.events;
    const reset = (): void => {
      this.slice = this.load();
      this.nuts.length = 0;
      this.holding = false;
      this.cooldown = 0;
      this.cutHintPending = false;
      this.quiet = 0;
      this.hintWait = 0;
      this.throwHintUntil = 0;
      this.throwHint.hidden = true;
      plantCuts.clear();
      this.visuals.clear();
      this.brushVersion = -1;
      this.syncCount(true);
    };
    this.offs.push(
      ev.on('game:start', reset),
      ev.on('save:loaded', reset),
      ctx.state.subscribe((_s, reason) => {
        if (reason === 'new' || reason === 'replace' || reason === 'load') reset();
      }),
      ev.on('era:change', () => {
        this.nuts.length = 0;
        this.holding = false;
        plantCuts.clear();
        this.visuals.clear();
        this.brushVersion = -1;
      }),
      ev.on('item:pickup', ({ item, reason }) => {
        if (item !== NUT) return;
        this.syncCount();
        if (reason !== 'debug') this.showThrowHint();
      }),
      ev.on('equip:change', ({ slot, item }) => {
        if (slot === 'weapon' && item && !this.slice.hints.includes('cut')) this.cutHintPending = true;
      }),
      ev.on('combat:arc', (a) => this.mow(a.x, a.z, a.yaw, a.reach, a.arcDeg, a.heavy)),
      ev.on('npc:conversation', ({ open }) => (this.talking = open)),
      ev.on('dialogue:active', ({ speaker }) => (this.speaking = speaker !== null)),
      ev.on('settings:change', ({ key }) => {
        if (key === 'bindings' || key === 'touchControls') this.syncKey();
        if (key === 'graphics') this.brushVersion = -1;
      }),
    );
    ctx.quality.listeners.push(() => (this.brushVersion = -1));
  }

  // ---- the pack -----------------------------------------------------------------------------

  private inPack(): number {
    return this.ctx.state.state.systems.progression?.inventory?.[NUT] ?? 0;
  }

  private syncKey(): void {
    const input = this.ctx.input;
    const key = actionLabel(input, 'throw');
    this.chipKey.textContent = key;
    if (!this.throwHint.hidden) this.throwHint.textContent = input.touchMode ? t('forage.hint.throw.touch') : t('forage.hint.throw', { key });
  }

  private syncCount(force = false): void {
    const n = this.inPack();
    if (n === this.count && !force) return;
    this.count = n;
    this.chip.hidden = n <= 0;
    this.chipCount.textContent = `×${n}`;
    this.syncKey();
    this.ctx.events.emit('forage:nuts', { count: n });
  }

  // ---- hints --------------------------------------------------------------------------------

  private showThrowHint(): void {
    if (this.slice.hints.includes('throw') || this.inPack() <= 0) return;
    this.throwHintUntil = this.time + THROW_HINT_SECONDS;
    this.throwHint.hidden = false;
    this.syncKey();
    this.slice.hints.push('throw');
    this.ctx.save.autosave('forage-hint');
  }

  private tickHints(dt: number): void {
    if (!this.throwHint.hidden && (this.time >= this.throwHintUntil || this.inPack() <= 0)) this.throwHint.hidden = true;
    if (!this.cutHintPending) return;
    const { ctx } = this;
    if (ctx.ui.modals.count > 0 || ctx.player.frozen || this.talking) {
      this.quiet = 0;
      return;
    }
    // Let the staff hint wait for a gap in the tour, up to HINT_WAIT seconds.
    this.quiet = this.speaking ? 0 : this.quiet + dt;
    this.hintWait += dt;
    if (this.quiet < HINT_QUIET && this.hintWait < HINT_WAIT) return;
    this.cutHintPending = false;
    this.slice.hints.push('cut');
    ctx.ui.toast(t('forage.hint.cut'), 7000);
    ctx.save.autosave('forage-hint');
  }

  // ---- throwing -----------------------------------------------------------------------------

  /** May a chestnut be thrown now (the pack's count aside)? */
  private allowed(): boolean {
    const { ctx } = this;
    const pl = ctx.player;
    const f = ctx.state.state.flags;
    if (!ctx.input.enabled || ctx.input.muted.has('throw') || ctx.ui.modals.count > 0 || pl.flying || pl.frozen || this.talking || pl.stance === 'prone') return false;
    if (f['tools.measuring'] === true) return false;
    // a scene that lowers the staff keeps the hands still too; the guided tour does not
    return f['combat.disabled'] !== true || forageOnly(f);
  }

  private hand(out: V3): V3 {
    const pl = this.ctx.player;
    const p = pl.position;
    const s = Math.sin(pl.yaw);
    const c = Math.cos(pl.yaw);
    out.x = p.x - s * THROW.handFwd + c * THROW.handRight;
    out.y = p.y + (pl.stance === 'stand' ? THROW.handUp : THROW.handUpLow);
    out.z = p.z - c * THROW.handFwd - s * THROW.handRight;
    return out;
  }

  /** Where a throw from `from` lands: the target's body, else where the view meets the ground. */
  private aimAt(from: V3): V3 {
    const { ctx } = this;
    const w = ctx.world;
    const cam = ctx.camera;
    const dir = cam.getWorldDirection(this.dir);
    const o = cam.position;
    const q = { receipt: { found: false, x: 0, y: 0, z: 0 } };
    ctx.events.emit('combat:aim', q);
    if (q.receipt.found) {
      const dx = q.receipt.x - from.x;
      const dz = q.receipt.z - from.z;
      const d = Math.hypot(dx, dz);
      const hl = Math.hypot(dir.x, dir.z) || 1;
      // in front of the view (±45°) and in range: go for it
      if (d <= THROW.range && d > 0.5 && (dx * dir.x + dz * dir.z) / (d * hl) > 0.7) return { x: q.receipt.x, y: q.receipt.y, z: q.receipt.z };
    }
    // march the view ray, starting level with the player (the ground between the lens and the
    // character is not the aim)
    const t0 = Math.max(0, (from.x - o.x) * dir.x + (from.y - o.y) * dir.y + (from.z - o.z) * dir.z);
    let hit: V3 | null = null;
    let prev = t0;
    for (let s = t0 + 0.5; s <= t0 + 45; s += 0.5) {
      const x = o.x + dir.x * s;
      const z = o.z + dir.z * s;
      if (o.y + dir.y * s <= w.heightAt(x, z)) {
        let a = prev;
        let b = s;
        for (let i = 0; i < 5; i++) {
          const m = (a + b) / 2;
          if (o.y + dir.y * m <= w.heightAt(o.x + dir.x * m, o.z + dir.z * m)) b = m;
          else a = m;
        }
        hit = { x: o.x + dir.x * b, y: 0, z: o.z + dir.z * b };
        break;
      }
      prev = s;
    }
    if (!hit) {
      // into the sky: as far as it goes, along the view
      let hx = dir.x;
      let hz = dir.z;
      const hl = Math.hypot(hx, hz);
      if (hl < 1e-3) {
        hx = -Math.sin(ctx.player.yaw);
        hz = -Math.cos(ctx.player.yaw);
      } else {
        hx /= hl;
        hz /= hl;
      }
      hit = { x: from.x + hx * THROW.range, y: 0, z: from.z + hz * THROW.range };
    }
    const to = clampAim(from, hit);
    to.y = w.heightAt(to.x, to.z) + THROW.radius;
    return to;
  }

  private refuse(): void {
    if (this.time - this.refusedAt < 4) return;
    this.refusedAt = this.time;
    this.ctx.ui.toast(t('forage.none'), 1800);
  }

  private throwNow(): boolean {
    const { ctx } = this;
    if (this.cooldown > 0 || !this.allowed()) return false;
    const receipt = { amount: 0 };
    ctx.events.emit('item:take', { item: NUT, count: 1, reason: 'throw', receipt });
    if (receipt.amount < 1) {
      this.syncCount();
      this.refuse();
      return false;
    }
    const from = this.hand({ x: 0, y: 0, z: 0 });
    const to = this.aimAt(from);
    const v = solveThrow(from, to);
    // at most four in the air: the oldest gives way
    const live = this.nuts.filter((n) => n.alive);
    if (live.length >= 4) live[0]!.alive = false;
    let slot = this.nuts.findIndex((n) => !n.alive);
    if (slot < 0) slot = this.nuts.length;
    this.nuts[slot] = createNut(from, v);
    this.cooldown = THROW.cooldown;
    this.slice.thrown++;
    this.syncCount();
    throwSound(ctx.audio);
    ctx.events.emit('forage:throw', { x: from.x, y: from.y, z: from.z, tx: to.x, ty: to.y, tz: to.z, left: this.count });
    return true;
  }

  private tickThrow(dt: number): void {
    const inp = this.ctx.input;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (inp.wasCancelled('throw') || !this.allowed()) {
      this.holding = false;
      this.buffered = 0;
      return;
    }
    if (this.holding) {
      if (!inp.isDown('throw')) {
        this.holding = false;
        if (this.cooldown > 0) this.buffered = THROW_BUFFER;
        else this.throwNow();
      }
      return;
    }
    // a tap just before the arm is free again is kept and thrown as soon as it is
    this.buffered = Math.max(0, this.buffered - dt);
    const pressed = inp.wasPressed('throw');
    if (!pressed) {
      if (this.buffered > 0 && this.cooldown <= 0) {
        this.buffered = 0;
        this.throwNow();
      }
      return;
    }
    if (this.inPack() <= 0) {
      this.refuse();
      return;
    }
    // a tap that was already let go throws at once; a hold aims until it is let go
    if (inp.isDown('throw')) this.holding = true;
    else if (this.cooldown > 0) this.buffered = THROW_BUFFER;
    else this.throwNow();
  }

  // ---- chestnuts in flight --------------------------------------------------------------------

  private pan(x: number, z: number): { pan: number; level: number } {
    const p = this.ctx.player;
    const dx = x - p.position.x;
    const dz = z - p.position.z;
    const d = Math.hypot(dx, dz);
    const side = d > 0.01 ? (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / d : 0;
    return { pan: side * 0.8, level: Math.max(0.25, 1 - d / 40) };
  }

  private impact(n: Nut, on: 'ground' | 'water' | 'enemy' | 'body' | 'wood' | 'wall', npc?: string): void {
    const { ctx } = this;
    const reduced = ctx.settings.state.reducedMotion;
    const { pan, level } = this.pan(n.x, n.z);
    if (on === 'water') {
      splashSound(ctx.audio, pan, level);
      if (!reduced) this.visuals.burst('splash', n.x, n.y, n.z, 7, 1.1);
    } else {
      landSound(ctx.audio, on === 'enemy' ? 'body' : on, pan, level);
      if (!reduced) {
        this.visuals.burst('shell', n.x, n.y, n.z, 4, 0.8);
        if (on === 'ground' && ctx.world.surfaceAt(n.x, n.z) !== 'gravel') this.visuals.burst('grass', n.x, n.y - THROW.radius, n.z, 3, 0.6);
      }
    }
    ctx.events.emit('forage:impact', { x: n.x, y: n.y, z: n.z, on, ...(npc ? { npc } : {}) });
    // a chestnut on a coat is a dull thud, one in the water a plop: both carry less far
    const loud = on === 'body' ? THROW.loud * 0.5 : on === 'water' ? THROW.loud * 0.7 : THROW.loud;
    ctx.events.emit('world:noise', { x: n.x, z: n.z, loud, by: 'kastanie' });
  }

  /** Something upright on the way from a to the chestnut's new place? It turns back and is spent. */
  private strike(n: Nut, ax: number, ay: number, az: number): boolean {
    const { ctx } = this;
    const { x: bx, y: by, z: bz } = n;
    let first: { at: number; on: 'wall' | 'wood' | 'body'; x?: number; z?: number; npc?: string } | undefined;
    const col = ctx.world.collider;
    if (col.enabled && !ctx.state.state.flags['interior.room']) {
      const at = col.footprintEntry(ax, az, bx, bz);
      if (at !== null) first = { at, on: 'wall' };
    }
    ctx.world.forest.trunksNear(bx, bz, Math.hypot(bx - ax, bz - az) + THROW.radius, (x, z, r, top) => {
      const at = segmentCylinderEntry(ax, ay, az, bx, by, bz, x, z, r + THROW.radius, -Infinity, top);
      if (at !== null && at < (first?.at ?? Infinity)) first = { at, on: 'wood', x, z };
    });
    const who: GameEvents['world:pelt'] = { ax, ay, az, bx, by, bz, receipt: { hit: false } };
    ctx.events.emit('world:pelt', who);
    const { at, x, z, npc } = who.receipt;
    if (who.receipt.hit && at !== undefined && at < (first?.at ?? Infinity)) first = { at, on: 'body', x, z, npc };
    if (ctx.era.current === 'today') {
      for (const [list, top] of [[ctx.tourCrowd.visitors?.(), 1.75], [ctx.tourCrowd.dogs?.(), 0.65]] as const) {
        for (const c of list ?? []) {
          if (Math.abs(c.y - ay) > CROWD_LEVEL_TOLERANCE + 2) continue;
          const at = segmentHitsBody(ax, ay, az, bx, by, bz, c.x, c.y, c.z, Math.max(c.radius, DOG_RADIUS) + THROW.radius, top);
          if (at !== null && at < (first?.at ?? Infinity)) first = { at, on: 'body', x: c.x, z: c.z };
        }
      }
    }

    // Combat applies damage when queried, so it can only hit before the nearest other contact.
    const q: GameEvents['combat:pelt'] = { ax, ay, az, bx, by, bz, before: first?.at, receipt: { hit: false } };
    ctx.events.emit('combat:pelt', q);
    const speed = Math.hypot(n.vx, n.vz) || 1;
    if (q.receipt.hit) {
      n.x = q.receipt.x ?? bx;
      n.y = q.receipt.y ?? by;
      n.z = q.receipt.z ?? bz;
      deflectNut(n, n.x + n.vx / speed, n.z + n.vz / speed);
      this.impact(n, 'enemy');
      return true;
    }
    if (!first) return false;
    n.x = ax + (bx - ax) * first.at;
    n.y = ay + (by - ay) * first.at;
    n.z = az + (bz - az) * first.at;
    deflectNut(n, first.x ?? n.x + n.vx / speed, first.z ?? n.z + n.vz / speed);
    this.impact(n, first.on, first.npc);
    return true;
  }

  private tickNuts(dt: number): void {
    const w = this.ctx.world;
    for (const n of this.nuts) {
      if (!n.alive) continue;
      const ax = n.x;
      const ay = n.y;
      const az = n.z;
      const flying = n.rest < 0;
      const ev = stepNut(n, dt, (x, z) => w.heightAt(x, z), (x, z) => w.surfaceAt(x, z) === 'water');
      if (ev === 'splash') {
        if (!n.spent) this.impact(n, 'water');
        continue;
      }
      if (flying && !n.spent && n.alive && this.strike(n, ax, ay, az)) continue;
      if (ev === 'bounce' || ev === 'rest') {
        if (!n.spent) {
          n.spent = true;
          this.impact(n, 'ground');
        } else {
          const { pan, level } = this.pan(n.x, n.z);
          landSound(this.ctx.audio, 'ground', pan, level, true);
        }
      }
    }
  }

  // ---- cutting plants -------------------------------------------------------------------------

  private armed(): boolean {
    const gear = this.ctx.state.state.systems.progression;
    const weapon = gear?.equipped?.weapon;
    return !!weapon && (gear?.inventory?.[weapon] ?? 0) > 0;
  }

  /** The staff came down: cut what stands in its circle. */
  mow(x: number, z: number, yaw: number, reach: number, arcDeg: number, heavy: boolean): { plants: number; drops: number } {
    const { ctx } = this;
    const none = { plants: 0, drops: 0 };
    if (!this.armed() || ctx.player.flying || ctx.state.state.flags['interior.room']) return none;
    const c = mowCircle(x, z, yaw, reach, arcDeg);
    const reduced = ctx.settings.state.reducedMotion;
    const fx = -Math.sin(yaw) * 0.7;
    const fz = -Math.cos(yaw) * 0.7;
    const era = ctx.era.current;
    const low = ctx.quality.level === 'low';
    let plants = 0;
    let fresh = 0;
    let drops = 0;
    ctx.world.nature.props.forEachCuttable(c.x, c.z, c.r, (kind, px, py, pz, height) => {
      const grown = plantCuts.factorAt(px, pz);
      if (grown <= CUT.stub + 0.01) return;
      plants++;
      const whole = grown >= 1;
      // (Niedrig draws the plants as straw-coloured clumps: their leaves are straw too)
      if (!reduced && plants <= 6) this.visuals.burst(low ? 'grass' : (kind as BurstKind), px, py + height * 0.25, pz, whole ? (heavy ? 16 : 12) : 4, heavy ? 1.35 : 1, fx, fz);
      if (!whole) return;
      fresh++;
      const sure = this.rigged > 0;
      const found = rollDrop(this.slice, plantKey(px, pz), ctx.world.coverAt(px, pz));
      if (!found && !sure) return;
      if (sure) {
        this.rigged--;
        if (!found) this.slice.found++;
        this.slice.dry = 0;
      }
      // it rolls out a step beyond the plant, clear of the walk-over radius, so it is seen first
      const dx = px - x;
      const dz = pz - z;
      const d = Math.hypot(dx, dz) || 1;
      const out = Math.max(d + 0.5, 2.4) + 0.35 * drops;
      const lx = x + (dx / d) * out;
      const lz = z + (dz / d) * out;
      drops++;
      ctx.events.emit('loot:place', { id: `forage.${this.slice.cuts}`, item: NUT, x: lx, z: lz, era, drop: true });
    });
    // grass and meadow flowers are mown with it; a spot already mown stays as it is
    const mown = plantCuts.factorAt(c.x, c.z) <= CUT.stub + 0.01;
    const surface = ctx.world.surfaceAt(c.x, c.z);
    const grassy = surface !== 'water' && surface !== 'gravel' && ctx.world.nature.cover.stats.grass > 0;
    if (!plants && (mown || !grassy)) return none;
    plantCuts.add(c.x, c.z, c.r);
    if (plants) cutSound(ctx.audio, plants, heavy);
    else {
      swishSound(ctx.audio);
      if (!reduced) this.visuals.burst('grass', c.x, ctx.world.heightAt(c.x, c.z) + 0.1, c.z, 5, 0.9, fx, fz);
    }
    if (drops) findSound(ctx.audio);
    if (fresh) ctx.save.autosave('forage-cut');
    ctx.events.emit('forage:cut', { x: c.x, z: c.z, r: c.r, plants, drops });
    return { plants, drops };
  }

  // ---- Niedrig: the plants show as clumps -------------------------------------------------------

  private tickBrush(dt: number): void {
    const { ctx } = this;
    const cover = ctx.world.nature.cover;
    if (ctx.quality.level !== 'low') {
      if (this.brushShown) cover.setBrush(this.brush, (this.brushShown = 0));
      this.brushVersion = -1;
      return;
    }
    this.brushT -= dt;
    if (this.brushT > 0) return;
    this.brushT = 0.2;
    const p = ctx.player.position;
    if (this.brushVersion === plantCuts.version && Math.hypot(p.x - this.brushX, p.z - this.brushZ) < BRUSH_STEP) return;
    this.brushVersion = plantCuts.version;
    this.brushX = p.x;
    this.brushZ = p.z;
    const near = this.plantsNear(BRUSH_R).slice(0, BRUSH_MAX);
    near.forEach((q, i) => {
      const v = hash2(Math.round(q.x * 10), Math.round(q.z * 10), 311);
      this.brush.set([q.x, q.y - 0.03, q.z, Math.max(0.3, q.height) * q.factor, v * Math.PI * 2, v], i * 6);
    });
    this.brushShown = near.length;
    cover.setBrush(this.brush, near.length);
  }

  plantsNear(r: number): ForagePlant[] {
    const p = this.ctx.player.position;
    const out: (ForagePlant & { d: number })[] = [];
    this.ctx.world.nature.props.forEachCuttable(p.x, p.z, r, (kind, x, y, z, height) => {
      out.push({ kind, x, y, z, height, factor: plantCuts.factorAt(x, z), d: Math.hypot(x - p.x, z - p.z) });
    });
    return out.sort((a, b) => a.d - b.d);
  }

  // ---- loop -----------------------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    plantCuts.tick(this.time);
    this.syncCount();
    this.tickThrow(dt);
    this.tickNuts(dt);
    this.visuals.tick(this.nuts);
    this.tickHints(dt);
    this.tickBrush(dt);
    // leaves fly on game time (bullet time and `kq.step` move them like everything else)
    this.visuals.frame(dt);
  }

  frame(): void {
    const { ctx } = this;
    const reduced = ctx.settings.state.reducedMotion;
    this.visuals.setNuts(this.nuts, reduced);
    if (this.holding && this.allowed() && this.inPack() > 0) {
      const from = this.hand(this.from);
      const to = this.aimAt(from);
      const v = solveThrow(from, to);
      arcPoints(from, v, v.t, ARC_N, this.arc);
      this.visuals.aim(this.arc, ARC_N, to, ctx.loop.time, reduced);
    } else this.visuals.aim(null, 0, null, 0, reduced);
  }

  hooks(): ForageHooks {
    return {
      state: () => ({
        ...structuredClone(this.slice),
        nuts: this.inPack(),
        flying: this.nuts.filter((n) => n.alive).length,
        circles: plantCuts.count,
        leaves: this.visuals.leafCount,
        holding: this.holding,
        brush: this.brushShown,
      }),
      throw: () => this.throwNow(),
      aim: () => {
        const from = this.hand({ x: 0, y: 0, z: 0 });
        return { from, to: this.aimAt(from) };
      },
      plants: (r = BRUSH_R) => this.plantsNear(r).map(({ kind, x, y, z, height, factor }) => ({ kind, x, y, z, height, factor })),
      cut: (x, z, r) => this.mow(x, z, 0, r, 360, false),
      rig: (n) => (this.rigged = Math.max(0, Math.floor(n))),
      flying: () => this.nuts.filter((n) => n.alive).map((n) => ({ x: n.x, y: n.y, z: n.z, resting: n.rest >= 0 })),
    };
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.chip.remove();
    this.throwHint.remove();
    plantCuts.clear();
    this.visuals.dispose();
  }
}

let sys: Forage | null = null;
let hooks: ForageHooks | null = null;

export default defineSystem({
  id: 'forage',
  init(ctx: GameContext) {
    sys = new Forage(ctx);
    hooks = sys.hooks();
  },
  update(dt) {
    sys?.update(dt);
  },
  frame() {
    if (hooks && typeof window !== 'undefined' && window.kq && window.kq.forage !== hooks) window.kq.forage = hooks;
    sys?.frame();
  },
  dispose() {
    sys?.dispose();
    sys = null;
    hooks = null;
  },
});
