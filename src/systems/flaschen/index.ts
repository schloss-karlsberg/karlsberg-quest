/**
 * Fläschchen (docs/IDEAS-ROUND11.md §4, docs/ACTION-RPG.md §7): 24 small bottles hidden at the
 * places people love, in every year. Hard to find on purpose:
 *
 *  - no glow, no map mark, no Bussole marker, not shown by the Spürsinn talent (it only senses the
 *    progression system's world pickups; the bottles are not among them);
 *  - a soft glass clink within 6 m every 8–12 s, captioned with its side; a glint only while the
 *    camera faces a bottle within 15° and 12 m, and the spot is lit (day or the lantern);
 *  - some need a verb (spots.ts): a Wuchthieb shakes one out of a tree / the ice, one is only seen
 *    with the lantern lit at night, one only with the lantern OFF (the fire's reflection);
 *  - E „Fläschchen aufheben“ within 1.5 m, facing it.
 *
 * Built only for the current era within 60 m. Hidden while a memorial or a story threat (a pack's
 * arena, a boss fight) holds the place. Rewards: the count (toast, Journal → Sammlungen row, the
 * field station's Regal), Marlene at 8, Laub at 16; at 24 the lantern glass „Flaschengrün“ and the
 * FIKTION card cx.47 „Treibgut“. No XP per bottle and no talent point (the chapter level bands
 * have no room for it: tests/quests-content-a.test.ts, prologue margin 4 XP).
 *
 * State `systems.flaschen` { found, dropped, said }; hooks `kq.flaschen.*`.
 * The label on the glass is ONE texture from content/collectibles/flaschen.json (label.ts).
 */
import { Group, Vector3 } from 'three';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { FLASCHENGRUEN, cosmetics } from '../../player/cosmetics';
import { h } from '../../ui/dom';
import { addJournalSection, addShelfItem } from '../../ui/journal';
import type { Solid } from '../../world/collision';
import { basinBase, wallBase, lookFor } from '../quelle/layout';
import { clink } from './audio';
import { disposeLabel, labelCanvas } from './label';
import { registerEraMaterials } from '../fx/shift/prewarm';
import { type BottleVisual, buildBottle, buildCover, disposeCover } from './model';
import { FLASCHEN, FLASCHEN_TOTAL, type FlaschenBase, type FlaschenSpot, MILESTONES, countByEra } from './spots';
import { FLASCHEN_DE } from './strings';

export interface FlaschenSlice {
  /** Bottles picked up. */
  found: string[];
  /** `wucht` bottles already shaken down. */
  dropped: string[];
  /** Milestone lines said / rewards given ('marlene', 'laub', 'all', 'past'). */
  said: string[];
}

declare module '../../core/state' {
  interface SystemStates {
    flaschen: FlaschenSlice;
  }
}

declare module '../../core/events' {
  interface GameEvents {
    /** A Fläschchen was picked up (count = found so far). */
    'flaschen:found': { id: string; count: number; total: number };
  }
}

export interface FlaschenHooks {
  state(): FlaschenSlice & { count: number; total: number };
  /** The table (tests, screenshots): id, era, x/y/z where it is now, built / visible / hanging. */
  spots(): { id: string; era: string; x: number; y: number; z: number; built: boolean; visible: boolean; hanging: boolean; verb: string }[];
  /** Nearest unfound bottle of the current era (debug). */
  nearest(): { id: string; d: number } | null;
  /** Pick one up now (tests; no reach check). */
  pick(id: string): boolean;
  /** Shake a hanging one down (tests). */
  drop(id: string): void;
  /** Whether the E prompt is up, and for which bottle. */
  prompt(): string | null;
  /** Glint opacity of a built bottle (tests). */
  glint(id: string): number;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    flaschen?: FlaschenHooks;
  }
}

const BUILD = 60;
const DROP = 75;
const REACH = 1.5;
const CLINK_R = 6;
const GLINT_R = 12;
const GLINT_COS = Math.cos((15 * Math.PI) / 180);
const WUCHT_R = 3.5;
const OWNER = 'flaschen';

interface Live {
  spot: FlaschenSpot;
  vis: BottleVisual;
  cover: Group | null;
  coverR: number;
  restY: number;
  hangY: number;
  /** 0 hanging … 1 landed (the fall animates on game time). */
  fall: number;
  vy: number;
  y: number;
  shown: boolean;
}

class Flaschen {
  slice: FlaschenSlice;
  readonly root = new Group();
  private readonly live = new Map<string, Live>();
  private memorials = new Map<string, { x: number; z: number; r: number; era?: string }>();
  private threat: { x: number; z: number; r: number } | null = null;
  private bossUp = false;
  private clinkT = 4;
  private promptFor: string | null = null;
  private solidsKey = '';
  private readonly tmp = new Vector3();
  private readonly fwd = new Vector3();
  private readonly offs: (() => void)[] = [];

  constructor(private readonly ctx: GameContext) {
    this.slice = this.loadSlice();
    this.root.name = 'flaschen';
    ctx.scene.add(this.root);
  }

  loadSlice(): FlaschenSlice {
    const s = this.ctx.state.slice('flaschen', () => ({ found: [], dropped: [], said: [] }));
    s.found ??= [];
    s.dropped ??= [];
    s.said ??= [];
    return s;
  }

  // ---- heights -------------------------------------------------------------------------------

  private baseY(base: FlaschenBase | undefined, x: number, z: number): number {
    const w = this.ctx.world;
    if (base === 'quelle-wall' || base === 'quelle-basin') {
      const hf = (px: number, pz: number) => w.heightfield.heightAt(px, pz);
      return base === 'quelle-wall' ? wallBase(hf, lookFor(this.ctx.era.current)) : basinBase(hf);
    }
    return w.heightAt(x, z);
  }

  // ---- build / drop ---------------------------------------------------------------------------

  private build(s: FlaschenSpot): Live {
    const restY = this.baseY(s.base, s.x, s.z) + (s.dy ?? 0) + 0.005;
    const hanging = s.hang && !this.slice.dropped.includes(s.id);
    const hangY = s.hang ? this.baseY(s.hang.base, s.hang.x, s.hang.z) + s.hang.dy : restY;
    const vis = buildBottle(hanging ? false : !!s.lie, s.yaw ?? 0);
    if (hanging) vis.group.position.set(s.hang!.x, hangY, s.hang!.z);
    else vis.group.position.set(s.x, restY, s.z);
    this.root.add(vis.group);
    let cover: Group | null = null;
    let coverR = 0;
    if (s.cover) {
      const c = buildCover(s.cover.kind, s.cover.yaw ?? 0, s.id.length);
      c.group.position.set(s.cover.x, this.ctx.world.heightAt(s.cover.x, s.cover.z) - 0.03, s.cover.z);
      this.root.add(c.group);
      cover = c.group;
      coverR = c.r;
    }
    const l: Live = { spot: s, vis, cover, coverR, restY, hangY, fall: hanging ? 0 : 1, vy: 0, y: hanging ? hangY : restY, shown: true };
    this.live.set(s.id, l);
    this.solidsKey = '';
    return l;
  }

  private unbuild(id: string): void {
    const l = this.live.get(id);
    if (!l) return;
    l.vis.group.removeFromParent();
    (l.vis.glint.material as { dispose(): void }).dispose();
    if (l.cover) {
      l.cover.removeFromParent();
      disposeCover(l.cover);
    }
    this.live.delete(id);
    this.solidsKey = '';
  }

  dropAll(): void {
    for (const id of [...this.live.keys()]) this.unbuild(id);
    this.setPrompt(null);
  }

  /** The cover props are solid (a barrel, a woodpile): one owner on the shared collider. */
  private syncSolids(): void {
    const key = [...this.live.values()].filter((l) => l.coverR > 0).map((l) => l.spot.id).join(',');
    if (key === this.solidsKey) return;
    this.solidsKey = key;
    const solids: Solid[] = [];
    for (const l of this.live.values()) if (l.coverR > 0 && l.spot.cover) solids.push({ kind: 'circle', x: l.spot.cover.x, z: l.spot.cover.z, r: l.coverR });
    this.ctx.world.collider.setSolids(OWNER, solids);
  }

  // ---- rules ------------------------------------------------------------------------------------

  private hanging(l: Live): boolean {
    return l.fall < 1;
  }

  private night(): boolean {
    return this.ctx.world.look.disc === 'moon';
  }

  /** Is the place held by a memorial, a pack's arena or a boss fight? */
  private held(s: FlaschenSpot): boolean {
    if (this.bossUp) return true;
    for (const m of this.memorials.values()) {
      if (m.era && m.era !== this.ctx.era.current) continue;
      if (Math.hypot(m.x - s.x, m.z - s.z) < m.r + 6) return true;
    }
    const t = this.threat;
    return !!t && t.r <= 100 && Math.hypot(t.x - s.x, t.z - s.z) < t.r;
  }

  private seen(s: FlaschenSpot): boolean {
    const lit = this.ctx.player.stats.lanternLit;
    if (s.verb === 'dark') return !lit;
    if (s.verb === 'lantern') return lit || !this.night();
    return true;
  }

  // ---- per step -----------------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    const era = ctx.era.current;
    const p = ctx.player.position;
    for (const s of FLASCHEN) {
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      const want = s.era === era && !this.slice.found.includes(s.id);
      const l = this.live.get(s.id);
      if (l && (!want || d > DROP)) this.unbuild(s.id);
      else if (!l && want && d < BUILD) this.build(s);
    }
    this.syncSolids();
    let best: Live | null = null;
    let bestD = Infinity;
    let clinkFrom: Live | null = null;
    let clinkD = Infinity;
    for (const l of this.live.values()) {
      const s = l.spot;
      // the fall out of the tree / the ice
      if (l.fall < 1 && this.slice.dropped.includes(s.id)) this.stepFall(l, dt);
      const shown = !this.held(s) && this.seen(s);
      l.shown = shown;
      l.vis.group.visible = shown;
      if (!shown) continue;
      const bx = l.vis.group.position.x;
      const bz = l.vis.group.position.z;
      const d = Math.hypot(p.x - bx, p.z - bz);
      if (d < clinkD && d < CLINK_R) {
        clinkD = d;
        clinkFrom = l;
      }
      if (this.hanging(l) || d > REACH || Math.abs(p.y - l.y) > 1.9) continue;
      const fx = -Math.sin(ctx.player.yaw);
      const fz = -Math.cos(ctx.player.yaw);
      const facing = d < 0.7 || ((bx - p.x) * fx + (bz - p.z) * fz) / d > 0.35;
      if (facing && d < bestD) {
        best = l;
        bestD = d;
      }
    }
    // the clink
    this.clinkT -= dt;
    if (clinkFrom && this.clinkT <= 0) {
      this.clinkT = 8 + Math.random() * 4;
      this.playClink(clinkFrom, clinkD);
    } else if (!clinkFrom && this.clinkT < 2) this.clinkT = 2;
    const can = !!best && !ctx.player.flying && !ctx.player.frozen && ctx.input.enabled && ctx.ui.modals.count === 0 && this.eFree();
    this.setPrompt(can ? best!.spot.id : null);
    if (can && ctx.input.wasPressed('listen')) this.pick(best!.spot.id);
  }

  private stepFall(l: Live, dt: number): void {
    l.vy -= 9.81 * dt;
    l.y += l.vy * dt;
    const s = l.spot;
    const t = Math.min(1, (l.hangY - l.y) / Math.max(0.01, l.hangY - l.restY));
    const hx = s.hang?.x ?? s.x;
    const hz = s.hang?.z ?? s.z;
    l.vis.group.position.set(hx + (s.x - hx) * t, Math.max(l.y, l.restY), hz + (s.z - hz) * t);
    if (l.y <= l.restY) {
      l.fall = 1;
      l.y = l.restY;
      // lie down where it landed
      const at = l.vis.group.position.clone();
      this.unbuild(s.id);
      const nl = this.build(s);
      nl.vis.group.position.copy(at);
      clink(this.ctx.audio, 0, 0.8);
    }
  }

  /** E is not someone else's (an NPC in talk range, a thing that owns E). */
  private eFree(): boolean {
    const f = this.ctx.state.state.flags;
    return !f['npc.near'] && (!f['e.owner'] || f['e.owner'] === OWNER);
  }

  private setPrompt(id: string | null): void {
    if (id === this.promptFor) return;
    this.promptFor = id;
    this.ctx.ui.hud.prompt(id ? 'E' : null, id ? FLASCHEN_DE.prompt : undefined, OWNER);
    const flags = this.ctx.state.mutable.flags;
    if (id) flags['e.owner'] = OWNER;
    else if (flags['e.owner'] === OWNER) delete flags['e.owner'];
  }

  private playClink(l: Live, d: number): void {
    const ctx = this.ctx;
    const p = ctx.player.position;
    const dx = l.vis.group.position.x - p.x;
    const dz = l.vis.group.position.z - p.z;
    const yaw = ctx.player.yaw;
    const fwd = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / Math.max(0.01, d);
    const right = (dx * Math.cos(yaw) + dz * -Math.sin(yaw)) / Math.max(0.01, d);
    clink(ctx.audio, right, 0.5 + 0.5 * (1 - d / CLINK_R));
    if (ctx.settings.state.subtitles === false) return;
    const S = FLASCHEN_DE.side;
    const side = Math.abs(right) > Math.abs(fwd) ? (right > 0 ? S.right : S.left) : fwd > 0 ? S.front : S.back;
    ctx.ui.hud.subtitle(null, FLASCHEN_DE.clink(side), 2200);
  }

  /** Shake down a hanging bottle (a Wuchthieb within reach). */
  drop(id: string): void {
    const s = FLASCHEN.find((x) => x.id === id);
    if (!s?.hang || this.slice.dropped.includes(id)) return;
    this.slice.dropped.push(id);
    const l = this.live.get(id);
    if (l) l.vy = 0.6;
  }

  pick(id: string): boolean {
    const ctx = this.ctx;
    const s = FLASCHEN.find((x) => x.id === id);
    if (!s || this.slice.found.includes(id)) return false;
    this.slice.found.push(id);
    if (s.hang && !this.slice.dropped.includes(id)) this.slice.dropped.push(id);
    this.unbuild(id);
    this.setPrompt(null);
    const n = this.slice.found.length;
    clink(ctx.audio, 0, 1);
    ctx.ui.toast(FLASCHEN_DE.toast(n, FLASCHEN_TOTAL), 2600);
    if (n === 1) ctx.ui.hud.subtitle(null, FLASCHEN_DE.card, 5200);
    ctx.events.emit('flaschen:found', { id, count: n, total: FLASCHEN_TOTAL });
    this.milestones(s);
    ctx.save.autosave('flaschen');
    return true;
  }

  private say(key: string, speaker: string, text: string): void {
    if (this.slice.said.includes(key)) return;
    this.slice.said.push(key);
    this.ctx.events.emit('dialogue:say', { speaker, text, keep: true, priority: 'low' });
  }

  private milestones(s: FlaschenSpot): void {
    const n = this.slice.found.length;
    if (s.era !== 'today' && !this.slice.said.includes('past')) this.say('past', 'laub', FLASCHEN_DE.laub1789);
    if (n >= MILESTONES.marlene) this.say('marlene', 'marlene', FLASCHEN_DE.marlene);
    if (n >= MILESTONES.laub) this.say('laub', 'laub', FLASCHEN_DE.laub);
    if (n >= MILESTONES.all && !this.slice.said.includes('all')) {
      this.slice.said.push('all');
      this.applyCosmetics();
      this.ctx.ui.toast(FLASCHEN_DE.all, 5000);
      const facts = this.ctx.state.mutable.codex.facts;
      if (!facts.includes('cx.47')) {
        facts.push('cx.47');
        this.ctx.events.emit('codex:unlocked', { factId: 'cx.47' });
      }
    }
  }

  /** The lantern glass follows the reward; the avatar (src/player/avatar.ts) listens for the event. */
  applyCosmetics(): void {
    cosmetics.lanternGlass = this.slice.said.includes('all') ? FLASCHENGRUEN : null;
    this.ctx.events.emit('player:lantern-tint', { hex: cosmetics.lanternGlass });
  }

  // ---- per frame: the glint ------------------------------------------------------------------------

  frame(dt: number): void {
    const ctx = this.ctx;
    const cam = ctx.camera;
    cam.getWorldDirection(this.fwd);
    const lit = !this.night() || ctx.player.stats.lanternLit;
    for (const l of this.live.values()) {
      const m = l.vis.glint.material as { opacity: number };
      let target = 0;
      if (l.shown) {
        const g = l.vis.glint.getWorldPosition(this.tmp).sub(cam.position);
        const d = g.length();
        const cos = d > 0 ? g.dot(this.fwd) / d : 0;
        const litHere = l.spot.verb === 'dark' ? !ctx.player.stats.lanternLit : lit;
        if (d < GLINT_R && cos > GLINT_COS && litHere) target = 0.35 + 0.35 * Math.sin(ctx.loop.time * 5 + l.spot.x);
      }
      m.opacity += (target - m.opacity) * Math.min(1, dt * 8);
      l.vis.glint.visible = m.opacity > 0.01;
    }
  }

  // ---- wiring -----------------------------------------------------------------------------------

  wire(): void {
    const ev = this.ctx.events;
    this.offs.push(
      ev.on('era:change', () => {
        this.dropAll();
        this.bossUp = false;
        this.threat = null;
      }),
      ev.on('memorial:set', (m) => {
        if (m.active === false) this.memorials.delete(m.id);
        else if (typeof m.x === 'number' && typeof m.z === 'number') this.memorials.set(m.id, { x: m.x, z: m.z, r: m.r ?? 20, era: m.era });
      }),
      ev.on('threat:configure', (t) => {
        if (!t.active) this.threat = null;
        else if (t.center) this.threat = { x: t.center.x, z: t.center.z, r: t.radius ?? 60 };
      }),
      ev.on('boss:phase', () => (this.bossUp = true)),
      ev.on('enemy:killed', (e) => {
        if (e.boss) this.bossUp = false;
      }),
      ev.on('player:caught', () => (this.bossUp = false)),
      ev.on('combat:swing', ({ x, z, reach }) => {
        if (reach < 3) return;
        for (const s of FLASCHEN) {
          if (!s.hang || s.era !== this.ctx.era.current || this.slice.dropped.includes(s.id)) continue;
          if (Math.hypot(s.hang.x - x, s.hang.z - z) < WUCHT_R) this.drop(s.id);
        }
      }),
    );
    const reload = (): void => {
      this.slice = this.loadSlice();
      this.dropAll();
      this.applyCosmetics();
    };
    this.offs.push(ev.on('game:start', reload), ev.on('save:loaded', reload));
    this.ctx.state.subscribe((_s, reason) => {
      if (reason === 'new' || reason === 'replace') reload();
    });
  }

  hooks(): FlaschenHooks {
    return {
      state: () => ({ ...structuredClone(this.slice), count: this.slice.found.length, total: FLASCHEN_TOTAL }),
      spots: () =>
        FLASCHEN.map((s) => {
          const l = this.live.get(s.id);
          const pos = l?.vis.group.position;
          return { id: s.id, era: s.era, x: pos?.x ?? s.x, y: pos?.y ?? Number.NaN, z: pos?.z ?? s.z, built: !!l, visible: !!l?.shown, hanging: !!l && l.fall < 1, verb: s.verb };
        }),
      nearest: () => {
        const p = this.ctx.player.position;
        let best: { id: string; d: number } | null = null;
        for (const s of FLASCHEN) {
          if (s.era !== this.ctx.era.current || this.slice.found.includes(s.id)) continue;
          const d = Math.hypot(s.x - p.x, s.z - p.z);
          if (!best || d < best.d) best = { id: s.id, d };
        }
        return best;
      },
      pick: (id) => this.pick(id),
      drop: (id) => this.drop(id),
      prompt: () => this.promptFor,
      glint: (id) => (this.live.get(id)?.vis.glint.material as { opacity: number } | undefined)?.opacity ?? 0,
    };
  }

  // ---- Journal row and the Regal --------------------------------------------------------------------

  renderRow(): HTMLElement {
    const n = this.slice.found.length;
    return h('section.kqj-set.kqf-row', { dataset: { testid: 'flaschen-row' } }, [
      h('header', [h('h4', FLASCHEN_DE.name), h('span.kqj-n', `${n}/${FLASCHEN_TOTAL}`)]),
      h('p.kqj-itxt', FLASCHEN_DE.row(n, FLASCHEN_TOTAL, countByEra(this.slice.found))),
      h('p.kqj-note', FLASCHEN_DE.rowNote),
    ]);
  }

  renderShelf(): HTMLElement {
    const n = this.slice.found.length;
    const src = n > 0 ? labelCanvas().toDataURL() : '';
    const bottles = Array.from({ length: n }, () =>
      h('span.kqf-shelf-bottle', [h('span.kqf-shelf-neck'), h('img.kqf-shelf-label', { src, alt: '' })]),
    );
    return h('div.kqf-shelf', { dataset: { testid: 'flaschen-shelf' } }, [
      h('div.kqs-shelf-row', [h('span', FLASCHEN_DE.shelfTitle), h('span.kqs-shelf-val', FLASCHEN_DE.shelfCount(n, FLASCHEN_TOTAL))]),
      n ? h('div.kqf-shelf-board', bottles) : h('p.kqj-note', FLASCHEN_DE.shelfEmpty),
    ]);
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.dropAll();
    this.ctx.world.collider.setSolids(OWNER, []);
    this.root.removeFromParent();
    disposeLabel();
  }
}

const CSS = `
.kqf-shelf{margin-top:.6rem}
.kqf-shelf-board{display:flex;flex-wrap:wrap;gap:4px;align-items:flex-end;padding:6px 4px 3px;border-bottom:3px solid #5a3c22;margin-top:.3rem}
.kqf-shelf-bottle{position:relative;display:inline-flex;flex-direction:column;align-items:center;justify-content:flex-end;width:16px;height:48px;background:linear-gradient(90deg,#3a1a06,#6a3410 45%,#3a1a06);border-radius:5px 5px 3px 3px;margin-top:10px}
.kqf-shelf-neck{position:absolute;top:-10px;left:5px;width:6px;height:12px;background:#4a2208;border-radius:2px 2px 0 0}
.kqf-shelf-label{width:16px;height:16px;object-fit:cover;margin-bottom:9px}
.kqf-row .kqj-itxt{display:block;margin:.2rem 0}
`;

let sys: Flaschen | null = null;
let hooks: FlaschenHooks | null = null;

export default defineSystem({
  id: 'flaschen',
  after: ['travel', 'quests', 'story', 'scenery', 'combat'],
  init(ctx) {
    const style = document.createElement('style');
    style.dataset.kq = 'flaschen';
    style.textContent = CSS;
    document.head.append(style);
    sys = new Flaschen(ctx);
    registerEraMaterials('flaschen.bottle', '*', () => [buildBottle(true, 0).group]);
    sys.wire();
    sys.applyCosmetics();
    hooks = sys.hooks();
    addJournalSection({ id: 'flaschen', tab: 'sets', order: 10, render: () => sys?.renderRow() ?? null });
    addShelfItem({ id: 'flaschen', order: 10, render: () => sys?.renderShelf() ?? null });
  },
  update(dt) {
    if (hooks && window.kq && window.kq.flaschen !== hooks) window.kq.flaschen = hooks;
    sys?.update(dt);
  },
  frame(dt) {
    if (hooks && window.kq && window.kq.flaschen !== hooks) window.kq.flaschen = hooks;
    sys?.frame(dt);
  },
  dispose() {
    sys?.dispose();
    sys = null;
    document.head.querySelector('style[data-kq="flaschen"]')?.remove();
  },
});
