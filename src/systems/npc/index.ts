/**
 * Feature "npc": the ghostly people of the past (Hanne, Kanzlist Soll, the kennel boy Jost,
 * Peter …) as translucent silhouettes of smoke and light, placed by the story and spoken to.
 *
 * Story → npc:  'npc:spawn' {npc, x, z, era?, yaw?, chapter?, topics?, mood?}, 'npc:despawn' {npc}
 *               (story action { "do": "npc", "op": "spawn" | "despawn", … }).
 * npc → world:  E near a figure opens the conversation (field-book panel; the game pauses).
 *               Greeting, questions (pack lines trigger { event: 'npc:talk', npc, chapter, topic,
 *               step? }, see ./logic.ts), "Auf Wiedersehen". Emits 'npc:talk' {npc, chapter, topic}
 *               per question, 'npc:conversation' {npc, open}, 'bark:npc-near' {npc, era} when the
 *               player lingers nearby, and on the first talk 'clue:grant' {id: clue.<chapter>.<npc>}
 *               plus the flags talked.<chapter>.<npc>[.<topic>].
 * Persistent: placements and spoken once-lines (slice `npc`).
 * Debug/test API: window.kq.npc (see NpcHooks).
 */
import '../contracts';
import './npc.css';
import { addStrings, t } from '../../i18n';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import type { DialogueLine } from '../../content/types';
import type { TriggerContext } from '../../content/triggers';
import type { NpcPlacement } from '../contracts';
import { speakerMeta } from '../story/dialogue/speakers';
import { Voice } from '../story/dialogue/voice';
import { GhostFigure } from './figure';
import { BYE, GREET, answer, askedTopics, availableTopics, clueFor, talkLines, talkedFlag } from './logic';
import { lookFor, topicLabel } from './roster';
import { ConversationView, type TalkLine } from './ui';

addStrings('de', {
  'npc.prompt': 'Mit {name} sprechen',
  'npc.next': 'weiter',
  'npc.tag.fiction': 'erfunden',
  'npc.tag.historical': 'historisch',
  'npc.source': 'Quelle',
  'npc.bye': 'Auf Wiedersehen',
  'npc.silent': '(Schweigt und sieht dich an.)',
  'npc.nothing': '(Mehr weiß sie dazu nicht.)',
});

export interface NpcSlice {
  placed: Record<string, NpcPlacement & { era: string }>;
  /** Once-lines already spoken in conversations. */
  said: string[];
}

declare module '../../core/state' {
  interface SystemStates {
    npc: NpcSlice;
  }
}

export interface NpcHooks {
  list(): { npc: string; x: number; z: number; era: string; visible: boolean; alpha: number; dist: number }[];
  spawn(p: NpcPlacement): void;
  despawn(npc: string): void;
  /** Open the conversation with an NPC (ignores the distance). */
  talk(npc: string): boolean;
  /** Ask a topic in the open conversation ('bye' ends it). */
  ask(topic: string): boolean;
  /** Finish typing / next line. */
  advance(): void;
  finish(): void;
  /** Read every queued line (advance until the menu shows). */
  drain(): void;
  close(): void;
  state(): { open: boolean; npc: string | null; chapter: string | null; line: { id: string; speaker: string; text: string } | null; topics: string[]; busy: boolean; near: string | null };
}

declare module '../../debug/hooks' {
  interface KqHooks {
    npc?: NpcHooks;
  }
}

/** Talk radius (m), linger radius for the near-bark (m), time to linger (s). */
const TALK_R = 2.8;
const NEAR_R = 9;
const NEAR_T = 2.5;

interface Placed {
  p: NpcPlacement & { era: string };
  fig: GhostFigure;
  yaw: number;
  nearT: number;
  barked: boolean;
}

class NpcRuntime {
  private readonly figs = new Map<string, Placed>();
  private readonly view: ConversationView;
  private readonly voice: Voice;
  private talking: { npc: string; chapter: string; lines: DialogueLine[] } | null = null;
  private near: string | null = null;
  private prompt: string | null = null;
  private hooks = false;

  constructor(private readonly ctx: GameContext) {
    this.voice = new Voice(ctx.audio);
    this.view = new ConversationView(ctx.ui.modals, this.voice, () => ctx.settings.state.reducedMotion);
    const ev = ctx.events;
    ev.on('npc:spawn', (p) => this.spawn(p));
    ev.on('npc:despawn', ({ npc }) => this.despawn(npc));
    ev.on('era:change', ({ to }) => {
      for (const f of this.figs.values()) f.fig.setEra(to);
    });
    ev.on('save:loaded', () => this.rebuild());
    ev.on('player:caught', () => this.view.close());
    this.rebuild();
  }

  get slice(): NpcSlice {
    const s = this.ctx.state.slice('npc', () => ({ placed: {}, said: [] }));
    if (!s.placed) s.placed = {};
    if (!Array.isArray(s.said)) s.said = [];
    return s;
  }

  // ---- placement ----------------------------------------------------------------------------

  spawn(p: NpcPlacement): void {
    if (!p.npc || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    const placed = { ...p, era: p.era ?? this.ctx.era.current };
    const prev = this.slice.placed[p.npc];
    if (prev) this.own(prev, false);
    this.slice.placed[p.npc] = placed;
    this.own(placed, true);
    this.place(placed);
  }

  /**
   * While an NPC stands in the world its talk clue (clue.<chapter>.<npc>) belongs to the
   * conversation: flag `npc.owns.<clueId>` tells the Chronik to hide its marker / E.
   */
  private own(p: NpcPlacement, on: boolean): void {
    if (!p.chapter) return;
    const clue = clueFor(p.chapter, p.npc);
    if (!this.ctx.content.clues.has(clue)) return;
    this.ctx.state.update((s) => {
      if (on) s.flags[`npc.owns.${clue}`] = true;
      else delete s.flags[`npc.owns.${clue}`];
    }, 'npc');
  }

  despawn(npc: string): void {
    const s = this.slice;
    for (const id of npc === '*' ? Object.keys(s.placed) : [npc]) {
      const p = s.placed[id];
      if (p) this.own(p, false);
      delete s.placed[id];
      const f = this.figs.get(id);
      if (f) {
        f.fig.dispose();
        this.figs.delete(id);
      }
      if (this.talking?.npc === id) this.view.close();
    }
  }

  private place(p: NpcPlacement & { era: string }): void {
    const old = this.figs.get(p.npc);
    if (old) {
      // same figure, new spot / chapter (a resumed beat re-sends its spawn)
      old.p = p;
      old.yaw = yawRad(p.yaw);
      old.barked = false;
      if (old.fig.look.mood !== (p.mood ?? lookFor(p.npc).mood)) {
        old.fig.dispose();
        this.figs.delete(p.npc);
      } else return;
    }
    const fig = new GhostFigure(lookFor(p.npc, p.mood), this.ctx.era.current);
    fig.alpha = 0;
    this.ctx.scene.add(fig.object);
    this.figs.set(p.npc, { p, fig, yaw: yawRad(p.yaw), nearT: 0, barked: false });
  }

  private rebuild(): void {
    for (const f of this.figs.values()) f.fig.dispose();
    this.figs.clear();
    for (const p of Object.values(this.slice.placed)) this.place(p);
  }

  private visible(f: Placed): boolean {
    return f.p.era === this.ctx.era.current;
  }

  // ---- conversation -------------------------------------------------------------------------

  private trig(): TriggerContext {
    const s = this.ctx.state.state;
    return { era: this.ctx.era.current, flags: s.flags, chapter: this.talking?.chapter ?? null, beat: null, clues: s.inventory.clues };
  }

  private toTalk(l: DialogueLine): TalkLine {
    const src = l.sources?.[0];
    const out: TalkLine = { id: l.id, speaker: speakerMeta(l.speaker, this.ctx.content), text: l.text_de };
    if (src) out.source = src.label ?? src.url;
    return out;
  }

  private remember(lines: DialogueLine[]): void {
    const s = this.slice;
    for (const l of lines) if (l.once && !s.said.includes(l.id)) s.said.push(l.id);
  }

  open(npc: string): boolean {
    const f = this.figs.get(npc);
    if (!f || this.view.open || this.ctx.ui.modals.count > 0) return false;
    const ctx = this.ctx;
    const chapter = f.p.chapter ?? '';
    const lines = talkLines(ctx.content.dialogue.values(), npc, chapter);
    this.talking = { npc, chapter, lines };
    const meta = speakerMeta(npc, ctx.content);
    this.view.show(meta.name, () => this.closed());
    ctx.ui.hud.prompt(null, undefined, 'npc');
    this.prompt = null;
    // first talk: the flag and the Chronik clue (clue.<chapter>.<npc>)
    const first = !ctx.state.state.flags[talkedFlag(chapter, npc)];
    ctx.state.update((s) => (s.flags[talkedFlag(chapter, npc)] = true), 'npc');
    ctx.events.emit('npc:conversation', { npc, open: true });
    ctx.events.emit('npc:talk', { npc, chapter, topic: GREET });
    if (first) {
      const clue = clueFor(chapter, npc);
      if (ctx.content.clues.has(clue)) ctx.events.emit('clue:grant', { id: clue });
    }
    const greet = answer(lines, npc, chapter, GREET, this.trig(), new Set(this.slice.said));
    this.remember(greet);
    const say = greet.map((l) => this.toTalk(l));
    if (!say.length && !lines.length) say.push({ id: 'npc.silent', speaker: meta, text: t('npc.silent') });
    if (say.length) this.view.say(say, () => this.menu());
    else this.menu();
    return true;
  }

  private menu(): void {
    const c = this.talking;
    if (!c || !this.view.open) return;
    const order = this.figs.get(c.npc)?.p.topics;
    const topics = availableTopics(c.lines, c.npc, c.chapter, this.trig(), order);
    const asked = askedTopics(this.ctx.state.state.flags, c.chapter, c.npc, topics);
    const list = topics.map((id) => ({ id, label: topicLabel(id), asked: asked.has(id) }));
    list.push({ id: BYE, label: t('npc.bye'), asked: false });
    this.view.setTopics(list, (id) => this.ask(id));
  }

  ask(topic: string): boolean {
    const c = this.talking;
    if (!c || !this.view.open || this.view.busy) return false;
    const ctx = this.ctx;
    ctx.state.update((s) => (s.flags[talkedFlag(c.chapter, c.npc, topic)] = true), 'npc');
    ctx.events.emit('npc:talk', { npc: c.npc, chapter: c.chapter, topic });
    const lines = answer(c.lines, c.npc, c.chapter, topic, this.trig(), new Set(this.slice.said));
    this.remember(lines);
    const say = lines.map((l) => this.toTalk(l));
    if (topic === BYE) {
      if (say.length) this.view.say(say, () => this.view.close());
      else this.view.close();
      return true;
    }
    if (!say.length) say.push({ id: 'npc.nothing', speaker: speakerMeta(c.npc, ctx.content), text: t('npc.nothing') });
    this.view.say(say, () => this.menu());
    return true;
  }

  private closed(): void {
    const c = this.talking;
    this.talking = null;
    if (!c) return;
    this.ctx.events.emit('npc:conversation', { npc: c.npc, open: false });
    this.ctx.save.autosave('npc');
  }

  // ---- per tick / frame ---------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    if (!this.hooks && window.kq) this.installHooks();
    const p = ctx.player.position;
    let best: string | null = null;
    let bestD = TALK_R;
    for (const [id, f] of this.figs) {
      if (!this.visible(f)) {
        f.nearT = 0;
        continue;
      }
      const d = Math.hypot(p.x - f.p.x, p.z - f.p.z);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
      // lingering nearby (not talking): one bark per approach
      if (d < NEAR_R && !this.talking) {
        f.nearT += dt;
        if (f.nearT > NEAR_T && !f.barked) {
          f.barked = true;
          ctx.events.emit('bark:npc-near', { npc: id, era: ctx.era.current });
        }
      } else if (d > NEAR_R * 1.6) {
        f.nearT = 0;
        f.barked = false;
      }
    }
    this.near = best;
    const show = !!best && !this.view.open && ctx.ui.modals.count === 0;
    if (show) {
      // E belongs to the nearest ghost: (re)claim the prompt when it changes or another owner took it
      if (this.prompt !== best || ctx.ui.hud.el.querySelector('.kq-prompt')?.textContent?.indexOf(speakerMeta(best!, ctx.content).name) === -1) {
        ctx.ui.hud.prompt('E', t('npc.prompt', { name: speakerMeta(best!, ctx.content).name }), 'npc');
        this.prompt = best;
      }
      if (ctx.input.wasPressed('listen')) this.open(best!);
    } else if (this.prompt) {
      ctx.ui.hud.prompt(null, undefined, 'npc');
      this.prompt = null;
    }
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    if (!this.hooks && window.kq) this.installHooks();
    this.view.tick(dt);
    const cam = ctx.camera;
    const px = ctx.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const p = ctx.player.position;
    const reduced = ctx.settings.state.reducedMotion;
    for (const [id, f] of this.figs) {
      const vis = this.visible(f);
      f.fig.target = vis ? 1 : 0;
      const o = f.fig.object;
      o.position.set(f.p.x, ctx.world.heightAt(f.p.x, f.p.z), f.p.z);
      // turn towards the player who comes close (and while talking)
      const d = Math.hypot(p.x - f.p.x, p.z - f.p.z);
      const want = d < 8 || this.talking?.npc === id ? Math.atan2(p.x - f.p.x, p.z - f.p.z) : yawRad(f.p.yaw);
      let diff = want - f.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      f.yaw += diff * Math.min(1, dt * (reduced ? 8 : 1.6));
      o.rotation.y = f.yaw;
      f.fig.talk = this.talking?.npc === id && this.view.busy ? 1 : 0;
      f.fig.frame(dt, { reducedMotion: reduced, px, face: 0 });
    }
  }

  private installHooks(): void {
    const kq = window.kq;
    if (!kq) return;
    this.hooks = true;
    kq.npc = {
      list: () =>
        [...this.figs.entries()].map(([npc, f]) => ({
          npc,
          x: f.p.x,
          z: f.p.z,
          era: f.p.era,
          visible: this.visible(f),
          alpha: f.fig.alpha,
          dist: Math.hypot(this.ctx.player.position.x - f.p.x, this.ctx.player.position.z - f.p.z),
        })),
      spawn: (p) => this.spawn(p),
      despawn: (n) => this.despawn(n),
      talk: (n) => this.open(n),
      ask: (tp) => this.ask(tp),
      advance: () => this.view.advance(),
      finish: () => this.view.finish(),
      drain: () => {
        for (let i = 0; i < 50 && this.view.busy; i++) {
          this.view.finish();
          this.view.advance();
        }
      },
      close: () => this.view.close(),
      state: () => {
        const l = this.view.current;
        return {
          open: this.view.open,
          npc: this.talking?.npc ?? null,
          chapter: this.talking?.chapter ?? null,
          line: l ? { id: l.id, speaker: l.speaker.id, text: l.text } : null,
          topics: [...document.querySelectorAll<HTMLElement>('[data-testid^="npc-topic-"]')].map((e) => e.dataset.testid!.slice('npc-topic-'.length)),
          busy: this.view.busy,
          near: this.near,
        };
      },
    };
  }

  dispose(): void {
    this.view.close();
    for (const f of this.figs.values()) f.fig.dispose();
    this.figs.clear();
  }
}

/** Placement yaw (degrees, 0 = north, 90 = east) → object rotation (the figure faces +z). */
function yawRad(deg?: number): number {
  return Math.PI - ((deg ?? 180) * Math.PI) / 180;
}

let rt: NpcRuntime | null = null;

export default defineSystem({
  id: 'npc',
  init(ctx) {
    rt = new NpcRuntime(ctx);
  },
  update(dt) {
    rt?.update(dt);
  },
  frame(dt) {
    rt?.frame(dt);
  },
  dispose() {
    rt?.dispose();
    rt = null;
  },
});
