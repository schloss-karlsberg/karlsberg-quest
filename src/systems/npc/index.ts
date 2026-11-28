/**
 * Feature "npc": the people of the story (Marlene today; Hanne, Kanzlist Soll, the kennel boy
 * Jost, Peter … in their own years), placed by the story and spoken to. They are solid, living
 * people (./solid.ts); a placement that asks for `look: 'ghost'` is a translucent silhouette of
 * smoke and light instead (./figure.ts, ./look.ts).
 *
 * Story → npc:  'npc:spawn' {npc, x, z, era?, yaw?, chapter?, topics?, mood?}, 'npc:despawn' {npc}
 *               (story action { "do": "npc", "op": "spawn" | "despawn", … }).
 * npc → world:  E near a figure opens the conversation (field-book panel; the game pauses).
 *               Greeting, questions (pack lines trigger { event: 'npc:talk', npc, chapter, topic,
 *               step? }, see ./logic.ts), "Auf Wiedersehen". Emits 'npc:talk' {npc, chapter, topic}
 *               per question, 'npc:conversation' {npc, open}, 'bark:npc-near' {npc, era} when the
 *               player lingers nearby, and on the first talk 'clue:grant' {id: clue.<chapter>.<npc>}
 *               plus the flags talked.<chapter>.<npc>[.<topic>].
 * Talking to people (people contract v0.1, ./bind.ts): a placement whose speaker has a live Person
 *               (`ctx.people.bySpeaker`) is bound to it: no figure of its own, range / prompt /
 *               glyph / framing follow the person, who faces the player and talks in the conversation.
 * Persistent: placements and spoken once-lines (slice `npc`).
 * Debug/test API: window.kq.npc (see NpcHooks).
 */
import { Vector3 as _V3 } from 'three';
import { cameraHints } from '../../player/camera';
import '../contracts';
import './npc.css';
import { addStrings, t } from '../../i18n';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import type { DialogueLine } from '../../content/types';
import type { TriggerContext } from '../../content/triggers';
import type { NpcPlacement } from '../contracts';
import type { GiverMark, QuestLine, QuestTopic } from '../../rpg/types';
import { speakerDative, speakerMeta } from '../story/dialogue/speakers';
import { Voice } from '../story/dialogue/voice';
import type { LoadedModel } from '../../assets/loader';
import { modelFor } from '../characters/catalog';
import { GhostFigure, type NpcFigure } from './figure';
import { figureLook, kneels, loadedPlacement } from './look';
import { RiggedNpc } from './rigged';
import { SolidFigure } from './solid';
import { BYE, GREET, IDLE_TURN_S, NEAR_TURN_S, TALK_TURN_S, answer, approachYaw, askedTopics, availableTopics, clueFor, hasWords, sweepYaw, talkLines, talkedFlag, yawToward } from './logic';
import { lookFor, topicLabel } from './roster';
import { ConversationView, questCardEl, type TalkLine, type TalkTopic } from './ui';
import { GiverGlyphs } from './glyphs';
import type { Person } from '../people/types';
import { type BodySpot, bodySpot, faceYaw, talkCues } from './bind';
import { segmentHitsBody } from '../combat/rules';

addStrings('de', {
  'npc.prompt': 'Mit {name} sprechen',
  'npc.next': 'weiter',
  'npc.tag.fiction': 'erfunden',
  'npc.tag.historical': 'historisch',
  'npc.source': 'Quelle',
  'npc.bye': 'Auf Wiedersehen',
  'npc.silent': '(Schweigt und sieht dich an.)',
  'npc.nothing': '(Mehr weiß sie dazu nicht.)',
  'npc.later': 'Später.',
  'npc.thanks': '(Nickt dir zu.)',
  'npc.codex': 'Codex: {title}',
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
  /** y = the floor the figure stands on (its storey inside the palace). */
  list(): { npc: string; x: number; z: number; y: number; era: string; visible: boolean; alpha: number; dist: number; bound: string | null; look: 'solid' | 'ghost' }[];
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
  /** Quest glyph over an NPC (from npc:marker) and whether it is on screen. */
  mark(npc: string): { mark: GiverMark; shown: boolean };
  /** Choose an answer button by id (qa:<quest>, qd:<quest>, qs:<value>) or index. */
  choose(id: string | number): boolean;
  /** Turn an NPC's idle heading (degrees, 0 = north; null = back to its placement / sweep), as 'npc:yaw'. */
  setYaw(npc: string, yaw: number | null): void;
  /** The idle heading an NPC turns to now (degrees: override, else sweep, else placement yaw). */
  yaw(npc: string): number | null;
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
  fig: NpcFigure;
  yaw: number;
  nearT: number;
  barked: boolean;
  /** 0..1 down on one knee (pose 'kneel'). */
  kneel?: number;
  /** Seconds left of a hand scratching the hound at his knee (topic 'namen'). */
  scratch?: number;
  /** Seconds left of facing the player for a story line this person speaks (`dialogue:say`). */
  faceT?: number;
  /** Idle heading set by 'npc:yaw' (degrees; the court's head turns), over the sweep / placement yaw. */
  yawOverride?: number;
  /** Metres off the placement for now ('npc:offset': a watcher walking to a noise). Never saved. */
  off?: { x: number; z: number };
}

class NpcRuntime {
  private readonly figs = new Map<string, Placed>();
  private readonly view: ConversationView;
  private readonly voice: Voice;
  private talking: { npc: string; chapter: string; lines: DialogueLine[] } | null = null;
  /** Seconds left of easing the view onto the speaker after a conversation opens. */
  private frameT = 0;
  /** Quest topics per NPC (quests → npc:topics), shown first in the menu. */
  private readonly questTopics = new Map<string, QuestTopic[]>();
  /** Glyph over the head per NPC (quests → npc:marker). */
  private readonly marks = new Map<string, GiverMark>();
  /** Escorted NPCs walking after the player (quests → npc:follow). */
  private readonly follow = new Set<string>();
  private readonly glyphs: GiverGlyphs;
  /** Inside a quest exchange (accept / hand-over buttons): topic updates wait. */
  private inQuest = false;
  private near: string | null = null;
  private prompt: string | null = null;
  /** Who has something to say (TASK-076), re-checked a few times a second: npc → [checked at, yes]. */
  private readonly words = new Map<string, [number, boolean]>();
  private clock = 0;
  private hooks = false;
  /** The bound person told to talk in the open conversation (people contract v0.1). */
  private talker: Person | null = null;

  constructor(private readonly ctx: GameContext) {
    this.voice = new Voice(ctx.audio);
    this.view = new ConversationView(ctx.ui.modals, this.voice, () => ctx.settings.state.reducedMotion, ctx.input);
    const ev = ctx.events;
    ev.on('npc:spawn', (p) => this.spawn(p));
    ev.on('npc:despawn', ({ npc }) => this.despawn(npc));
    ev.on('npc:yaw', ({ npc, yaw }) => this.setYaw(npc, yaw));
    ev.on('npc:offset', ({ npc, dx, dz }) => {
      const f = this.figs.get(npc);
      if (!f) return;
      if (dx === 0 && dz === 0) delete f.off;
      else f.off = { x: dx, z: dz };
    });
    // a thrown chestnut (src/systems/forage) bounces off whoever stands in its way; nobody is hurt
    ev.on('world:pelt', (q) => {
      if (q.receipt.hit) return;
      let best: string | null = null;
      let bestT = Infinity;
      let bx = 0;
      let bz = 0;
      for (const [id, f] of this.figs) {
        if (!this.visible(f)) continue;
        const b = this.spot(id, f);
        const at = segmentHitsBody(q.ax, q.ay, q.az, q.bx, q.by, q.bz, b.x, b.floor, b.z, 0.36, b.tall);
        if (at !== null && at < bestT) {
          bestT = at;
          best = id;
          bx = b.x;
          bz = b.z;
        }
      }
      if (best) Object.assign(q.receipt, { hit: true, npc: best, at: bestT, x: bx, z: bz });
    });
    // a kneeling figure asked about the hounds' names scratches the one at his knee
    ev.on('npc:talk', ({ npc, topic }) => {
      const f = this.figs.get(npc);
      if (f && kneels(f.p) && topic === 'namen') f.scratch = 7;
    });
    // a story line spoken by a placed person (outside the conversation panel, same turn): it
    // faces the player for the line when the player stands close (frame: d < 10 m)
    ev.on('dialogue:say', ({ speaker, ms, text }) => {
      const f = this.figs.get(speaker);
      if (f && this.visible(f)) f.faceT = Math.max(f.faceT ?? 0, (ms ?? 1500 + text.length * 45) / 1000 + 1);
    });
    ev.on('era:change', ({ to }) => {
      for (const f of this.figs.values()) f.fig.setEra(to);
    });
    ev.on('save:loaded', () => {
      this.words.clear();
      this.rebuild();
    });
    ev.on('player:caught', () => this.view.close());
    ev.on('npc:topics', ({ npc, topics }) => {
      if (topics.length) this.questTopics.set(npc, topics);
      else this.questTopics.delete(npc);
      // an open menu with this NPC shows the new topics at once
      if (this.talking?.npc === npc && this.view.open && !this.view.busy && !this.inQuest) this.menu();
    });
    ev.on('npc:marker', ({ npc, mark }) => {
      this.marks.set(npc, mark);
      this.glyphs.set(npc, mark);
    });
    ev.on('npc:follow', ({ npc, follow }) => {
      if (follow) this.follow.add(npc);
      else this.follow.delete(npc);
    });
    this.glyphs = new GiverGlyphs(ctx.ui.layer('npc-glyphs'));
    // a ghost's rigged body from medium quality up (the low tier and the e2e run keep the procedural
    // one); a solid person is the rigged body on every tier
    this.onQuality = (_p, level) => {
      for (const [id, f] of this.figs) {
        if (level === 'low' && f.fig.kind === 'ghost') f.fig.setRigged(null);
        else this.rigFor(id, f.fig);
      }
    };
    ctx.quality.listeners.push(this.onQuality);
    this.rebuild();
  }

  private readonly onQuality: (p: unknown, level: string) => void;

  /** Give a figure its rigged CC0 body once the model is there (characters area, lazy). */
  private rigFor(id: string, fig: NpcFigure): void {
    const procedural = () => fig.kind === 'ghost' && this.ctx.quality.level === 'low';
    if (procedural() || fig.isRigged) return;
    const model = modelFor(fig.look);
    const live = () => this.figs.get(id)?.fig === fig && !fig.isRigged;
    const build = (m: LoadedModel) => {
      if (!live() || procedural()) return;
      fig.setRigged(new RiggedNpc(fig.look, m, fig.tint, fig.kind));
      this.ctx.loop.requestRender(2);
    };
    const ready = this.ctx.assets.peek<LoadedModel>(model);
    if (ready) build(ready);
    else
      this.ctx.assets.model(model).then(build, (e: unknown) => {
        console.warn('[npc] model failed', e);
        if (live()) fig.fail?.();
      });
  }

  get slice(): NpcSlice {
    const s = this.ctx.state.slice('npc', () => ({ placed: {}, said: [] }));
    if (!s.placed) s.placed = {};
    if (!Array.isArray(s.said)) s.said = [];
    return s;
  }

  // ---- placement ----------------------------------------------------------------------------

  spawn(p: NpcPlacement): void {
    if (!p.npc) return;
    // inside the palace: stand in that room, on its storey (interiors' room anchor)
    const anchor = p.room ? this.ctx.world.roomAnchor?.(p.room) ?? null : null;
    const x = Number.isFinite(p.x) ? p.x : anchor?.x;
    const z = Number.isFinite(p.z) ? p.z : anchor?.z;
    if (x === undefined || z === undefined || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const placed: NpcPlacement & { era: string } = { ...p, x, z, era: p.era ?? this.ctx.era.current };
    if (placed.y === undefined && anchor) placed.y = anchor.y;
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
      if (old.fig.look.mood !== (p.mood ?? lookFor(p.npc).mood) || old.fig.kind !== figureLook(p)) {
        old.fig.dispose();
        this.figs.delete(p.npc);
      } else return;
    }
    // people are solid; a ghost only where the placement asks for one (./look.ts)
    const look = lookFor(p.npc, p.mood);
    const fig: NpcFigure = figureLook(p) === 'ghost' ? new GhostFigure(look, this.ctx.era.current) : new SolidFigure(look);
    fig.alpha = 0;
    this.ctx.scene.add(fig.object);
    this.figs.set(p.npc, { p, fig, yaw: yawRad(p.yaw), nearT: 0, barked: false, kneel: kneels(p) ? 1 : 0 });
    this.rigFor(p.npc, fig);
  }

  /** Floor under the figure; a placement with a storey hint (`y`, rooms upstairs) keeps its storey. */
  private figY(f: Placed): number {
    return this.ctx.world.heightAt(f.p.x + (f.off?.x ?? 0), f.p.z + (f.off?.z ?? 0), f.p.y);
  }

  /** The live person bound to this speaker's placement (people contract v0.1), if any. */
  private person(id: string): Person | undefined {
    return this.ctx.people?.bySpeaker(id);
  }

  /** Where a placement's body is now: the bound person, else the placement (./bind.ts). */
  private spot(id: string, f: Placed): BodySpot & { floor: number; tall: number } {
    const s = bodySpot(f.p, this.person(id));
    // a figure of its own may stand off its placement for a while ('npc:offset')
    if (!s.bound && f.off) {
      s.x += f.off.x;
      s.z += f.off.z;
    }
    return { ...s, floor: s.y ?? this.figY(f), tall: s.height ?? f.fig.look.height };
  }

  private rebuild(): void {
    for (const f of this.figs.values()) f.fig.dispose();
    this.figs.clear();
    for (const p of Object.values(this.slice.placed)) this.place(loadedPlacement(p));
  }

  private visible(f: Placed): boolean {
    return f.p.era === this.ctx.era.current;
  }

  /** Idle heading override (court head turns); null hands it back to the placement / sweep. */
  setYaw(npc: string, yaw: number | null): void {
    const f = this.figs.get(npc);
    if (!f) return;
    if (yaw === null || !Number.isFinite(yaw)) delete f.yawOverride;
    else f.yawOverride = yaw;
  }

  /** The idle heading in degrees: the override, else the watch sweep, else the placement yaw. */
  idleYaw(f: Placed): number {
    return f.yawOverride ?? sweepYaw(f.p.watch, f.p.yaw, this.ctx.loop.time);
  }

  // ---- conversation -------------------------------------------------------------------------

  /** Has this person anything to say now (a greeting, a topic, a quest topic)? Without it no talk prompt. */
  private canTalk(npc: string, chapter: string): boolean {
    const hit = this.words.get(npc);
    if (hit && this.clock - hit[0] < 0.25) return hit[1];
    const ctx = this.ctx;
    const s = ctx.state.state;
    const c: TriggerContext = { era: ctx.era.current, flags: s.flags, chapter, beat: null, clues: s.inventory.clues };
    const ok = hasWords(talkLines(ctx.content.dialogue.values(), npc, chapter), npc, chapter, c, new Set(this.slice.said), this.questTopics.get(npc)?.length ?? 0);
    this.words.set(npc, [this.clock, ok]);
    return ok;
  }

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
    this.words.clear();
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
    this.frameT = 1.1;
    const meta = speakerMeta(npc, ctx.content);
    this.view.show(meta.name, () => this.closed(), meta);
    // no centre card (reward, clue, level) over a person talking (src/ui/cards.ts)
    ctx.ui.cards.hold('talk', true);
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
    // never an empty box: no greeting, no topic, no quest topic → the silent look (TASK-076)
    if (!say.length && !availableTopics(lines, npc, chapter, this.trig()).length && !this.questTopics.get(npc)?.length) say.push({ id: 'npc.silent', speaker: meta, text: t('npc.silent') });
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
    const quest: TalkTopic[] = (this.questTopics.get(c.npc) ?? []).map((q) => ({
      id: `q:${q.quest}`,
      label: q.label,
      asked: false,
      mark: q.kind === 'turnin' ? 'ready' : q.kind === 'progress' ? 'active' : q.kind === 'more' ? 'more' : q.main ? 'offer-main' : 'offer',
    }));
    const list: TalkTopic[] = [...quest, ...topics.map((id) => ({ id, label: topicLabel(id), asked: asked.has(id) }))];
    list.push({ id: BYE, label: t('npc.bye'), asked: false });
    this.view.setTopics(list, (id) => this.ask(id));
  }

  private questLine(l: QuestLine, i: number, extra: Partial<TalkLine> = {}): TalkLine {
    const src = l.sources?.[0];
    const out: TalkLine = { id: `quest.${i}`, speaker: speakerMeta(l.speaker, this.ctx.content), text: l.text, ...extra };
    if (src) out.source = src.label ?? src.url;
    return out;
  }

  /**
   * A quest topic: offer (the giver's words, then the quest card: Annehmen / Später), progress,
   * the turn-in (the giver's thanks, the turn-in card: Übergeben → the reward card, then one
   * history line as the moment of it), or "Erzähl mehr" (the rest of the history, when wanted).
   */
  private askQuest(questId: string): boolean {
    const c = this.talking;
    if (!c) return false;
    const tp = (this.questTopics.get(c.npc) ?? []).find((x) => x.quest === questId);
    if (!tp) return false;
    const ev = this.ctx.events;
    const lines = tp.lines.map((l, i) => this.questLine(l, i));
    const facts = this.ctx.content.facts;
    const hist = (l: QuestLine, i: number) => {
      const f = 'fact' in l && typeof l.fact === 'string' ? facts.get(l.fact) : undefined;
      return this.questLine(l, 100 + i, { history: true, note: f ? t('npc.codex', { title: f.title_de }) : undefined });
    };
    if (tp.kind === 'progress') {
      this.view.say(lines.length ? lines : [{ id: 'npc.nothing', speaker: speakerMeta(c.npc, this.ctx.content), text: t('npc.nothing') }], () => this.menu());
      return true;
    }
    if (tp.kind === 'more') {
      this.view.say(tp.lines.map(hist), () => {
        ev.emit('quest:told', { id: questId, npc: c.npc });
        this.menu();
      });
      return true;
    }
    if (tp.kind === 'offer') {
      this.inQuest = true;
      this.view.say(lines, () => {
        const opts: TalkTopic[] = [{ id: `qa:${questId}`, label: tp.accept ? `${t('quest.card.accept')}: „${tp.accept}“` : t('quest.card.accept'), asked: false, mark: 'accept' }];
        if (tp.declinable) opts.push({ id: `qd:${questId}`, label: t('npc.later'), asked: false, mark: 'decline' });
        if (tp.card) this.view.setCard(questCardEl(tp.card, 'offer'));
        this.view.setTopics(opts, (id) => {
          this.inQuest = false;
          this.view.setCard(null);
          if (id.startsWith('qa:')) ev.emit('quest:accept', { id: questId, npc: c.npc });
          else ev.emit('quest:decline', { id: questId, npc: c.npc });
          this.menu();
        });
      });
      return true;
    }
    // turn-in: thanks, the card, hand over (reward card), then the history as a short moment
    this.inQuest = true;
    const told = (tp.history ?? []).slice(0, 1).map(hist);
    this.view.say(lines.length ? lines : [{ id: 'npc.thanks', speaker: speakerMeta(c.npc, this.ctx.content), text: t('npc.thanks') }], () => {
      if (tp.card) this.view.setCard(questCardEl(tp.card, 'turnin'));
      this.view.setTopics([{ id: `qt:${questId}`, label: t('quest.card.hand'), asked: false, mark: 'accept' }], () => {
        this.inQuest = false;
        this.view.setCard(null);
        ev.emit('quest:turnin', { id: questId, npc: c.npc });
        if (told.length) this.view.say(told, () => this.menu());
        else this.menu();
      });
    });
    return true;
  }

  ask(topic: string): boolean {
    const c = this.talking;
    if (!c || !this.view.open || this.view.busy) return false;
    // answers inside a quest exchange (accept / later / hand over) go through the open buttons
    if (/^q[adt]:/.test(topic)) return this.view.chooseId(topic);
    if (topic.startsWith('q:')) return this.askQuest(topic.slice(2));
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
    this.ctx.ui.cards.hold('talk', false);
    const c = this.talking;
    this.talking = null;
    this.inQuest = false;
    if (!c) return;
    this.ctx.events.emit('npc:conversation', { npc: c.npc, open: false });
    this.ctx.save.autosave('npc');
  }

  // ---- per tick / frame ---------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    if (!this.hooks && window.kq) this.installHooks();
    const p = ctx.player.position;
    this.clock += dt;
    for (const id of this.follow) this.followStep(id, dt);
    let best: string | null = null;
    let bestD = TALK_R;
    for (const [id, f] of this.figs) {
      // placed in a room before the interiors could answer: move to the room once they can
      if (f.p.room && f.p.y === undefined) {
        const a = ctx.world.roomAnchor?.(f.p.room);
        if (a) {
          f.p.x = a.x;
          f.p.z = a.z;
          f.p.y = a.y;
        }
      }
      if (!this.visible(f)) {
        f.nearT = 0;
        continue;
      }
      // another storey (the Festsaal above the Kabinett) is not "near"; a bound person is where it walks
      const body = this.spot(id, f);
      const dy = Math.abs(p.y - body.floor);
      // `npc.hush` = id: this ghost does not take E (the Festsaal: the handle in Hanne's hand is the choice)
      const d = dy > 2.4 || ctx.state.state.flags['npc.hush'] === id ? Infinity : Math.hypot(p.x - body.x, p.z - body.z);
      // nothing to say (the guide at the later tour stops, TASK-076): no prompt, E stays free
      if (d < bestD && this.canTalk(id, f.p.chapter ?? '')) {
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
    // a ghost within talk range owns E: the Chronik leaves its examine prompt to the conversation
    if ((ctx.state.state.flags['npc.near'] ?? '') !== (best ?? '')) {
      if (best) ctx.state.mutable.flags['npc.near'] = best;
      else delete ctx.state.mutable.flags['npc.near'];
    }
    const show = !!best && !this.view.open && ctx.ui.modals.count === 0;
    if (show) {
      // E belongs to the nearest ghost: (re)claim the prompt when it changes or another owner took it
      // the name in the dative: „Mit dem Hofgärtner sprechen“, not „Mit Der Hofgärtner“ (TASK-078)
      const who = speakerDative(best!, ctx.content);
      if (this.prompt !== best || ctx.ui.hud.el.querySelector('.kq-prompt')?.textContent?.indexOf(who) === -1) {
        ctx.ui.hud.prompt('E', t('npc.prompt', { name: who }), 'npc');
        this.prompt = best;
      }
      if (ctx.input.wasPressed('listen')) this.open(best!);
    } else if (this.prompt) {
      ctx.ui.hud.prompt(null, undefined, 'npc');
      this.prompt = null;
    }
  }

  /** Escort: walk after the player (2.4 m behind, a little faster than walking), into their era. */
  private followStep(id: string, dt: number): void {
    const f = this.figs.get(id);
    // a bound person is moved by whoever spawned it
    if (!f || this.person(id)) return;
    const ctx = this.ctx;
    const p = ctx.player.position;
    if (f.p.era !== ctx.era.current) f.p.era = ctx.era.current;
    const dx = p.x - f.p.x;
    const dz = p.z - f.p.z;
    const d = Math.hypot(dx, dz);
    if (d > 40) {
      // left far behind (a shift, a run): catch up out of sight
      f.p.x = p.x - (dx / d) * 3;
      f.p.z = p.z - (dz / d) * 3;
    } else if (d > 2.4) {
      const step = Math.min(d - 2.4, dt * (d > 8 ? 6.5 : 4.2));
      f.p.x += (dx / d) * step;
      f.p.z += (dz / d) * step;
    }
    delete f.p.y;
    delete f.p.room;
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    if (!this.hooks && window.kq) this.installHooks();
    this.view.tick(dt);
    const cam = ctx.camera;
    const px = ctx.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const p = ctx.player.position;
    const reduced = ctx.settings.state.reducedMotion;
    // a conversation frames its speaker (playtest: talking to Soll with the camera on a bookshelf):
    // the view eases onto the face for a second, then the mouse is free again
    if (this.talking && this.frameT > 0) {
      this.frameT -= dt;
      const f = this.figs.get(this.talking.npc);
      const pl = ctx.player;
      const body = f ? this.spot(this.talking.npc, f) : null;
      if (f && body && !pl.flying) {
        const dx = body.x - p.x;
        const dz = body.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.4) {
          const k = reduced ? 1 : Math.min(1, dt * 6);
          const wantYaw = Math.atan2(-dx, -dz);
          let dy = wantYaw - pl.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          pl.yaw += dy * k;
          const head = body.floor + body.tall * 0.9;
          const eyeY = cam.position.y;
          const wantPitch = Math.max(-0.5, Math.min(0.4, Math.atan2(head - eyeY, dist))) - 0.06;
          pl.pitch += (wantPitch - pl.pitch) * k;
        }
      }
    }
    // the third-person camera turns a conversation into an over-the-shoulder two-shot (src/player/camera.ts)
    const tf = this.talking ? this.figs.get(this.talking.npc) : undefined;
    const tb = tf ? this.spot(this.talking!.npc, tf) : null;
    cameraHints.focus = tb && !ctx.player.flying && Math.hypot(tb.x - p.x, tb.z - p.z) < 8 ? { x: tb.x, y: tb.floor + tb.tall * 0.88, z: tb.z } : null;
    // NPCs look at the player's face (over the shoulder the camera is not where the eyes are)
    const face = ctx.player.thirdPerson ? _face.set(p.x, p.y + ctx.player.eyeHeight, p.z) : cam.position;
    // people contract v0.1: a bound person turns to the player, looks at the eyes and talks while the
    // conversation is open, then goes back to idle (locomotion by itself when it walks on)
    const talker = (this.talking && this.person(this.talking.npc)) || null;
    const cue = talkCues(this.talker, talker);
    if (cue.end) {
      cue.end.play('idle');
      cue.end.lookAt(null);
    }
    if (cue.start) cue.start.play('talk');
    this.talker = talker;
    if (talker) {
      talker.face(faceYaw(talker.root.position.x, talker.root.position.z, p.x, p.z), reduced);
      talker.lookAt(face);
    }
    for (const [id, f] of this.figs) {
      // bound to a person: the figure fades away at its placement (and comes back when unbound)
      const vis = this.visible(f) && !this.person(id);
      f.fig.target = vis ? 1 : 0;
      const o = f.fig.object;
      const fx = f.p.x + (f.off?.x ?? 0);
      const fz = f.p.z + (f.off?.z ?? 0);
      o.position.set(fx, this.figY(f), fz);
      // in a conversation (or while it speaks a story line to the player close by) the person turns
      // round to the player in ~0.4 s (F-33), then back to its idle heading; the rigged head keeps
      // looking at a player who comes close, the procedural figure (no head look) turns slowly instead
      const d = Math.hypot(p.x - fx, p.z - fz);
      f.faceT = Math.max(0, (f.faceT ?? 0) - dt);
      const talkTo = this.talking?.npc === id || (f.faceT > 0 && d < 10);
      const nearTo = !talkTo && d < 8 && !f.fig.isRigged;
      // a watcher (court) keeps its own heading close up: it turns its head by 'npc:yaw', not by proximity
      const watching = !!f.p.watch && !talkTo;
      const want = talkTo || (nearTo && !watching) ? yawToward(fx, fz, p.x, p.z) : yawRad(this.idleYaw(f));
      f.yaw = approachYaw(f.yaw, want, dt, talkTo ? TALK_TURN_S : nearTo ? NEAR_TURN_S : IDLE_TURN_S, reduced);
      o.rotation.y = f.yaw;
      // kneeling: lower and leaning forward over what lies before him; a scratching hand rocks him
      const kn = (f.kneel = (f.kneel ?? 0) + ((kneels(f.p) ? 1 : 0) - (f.kneel ?? 0)) * Math.min(1, dt * 2.2));
      if (kn > 0.001) {
        f.scratch = Math.max(0, (f.scratch ?? 0) - dt);
        const sc = f.scratch > 0 && !reduced ? Math.sin(ctx.loop.time * 9) * 0.04 * Math.min(1, f.scratch) : 0;
        o.rotation.order = 'YXZ';
        f.fig.kneel = kn;
        o.position.y -= f.fig.look.height * 0.27 * kn;
        o.rotation.x = (0.12 + sc) * kn;
        // while talking he looks up at you, otherwise down at the hound
        if (!(talkTo || nearTo) || f.scratch > 0) o.rotation.y = yawRad(f.p.yaw);
      } else {
        o.rotation.x = 0;
        f.fig.kneel = 0;
      }
      f.fig.talk = this.talking?.npc === id && this.view.busy ? 1 : 0;
      f.fig.frame(dt, { reducedMotion: reduced, reducedFlash: ctx.settings.state.reducedFlash, px, face: 0, lookAt: d < 9 || this.talking?.npc === id ? face : null, dist: cam.position.distanceTo(o.position) });
    }
    // quest glyphs over the heads (hidden while that conversation is open)
    this.glyphs.frame(
      dt,
      cam,
      [...this.figs.entries()].map(([id, f]) => {
        const b = this.spot(id, f);
        return { npc: id, x: b.x, y: b.floor, z: b.z, visible: this.visible(f) && (b.bound || f.fig.alpha > 0.2) && this.talking?.npc !== id };
      }),
      p,
      reduced,
    );
  }

  private installHooks(): void {
    const kq = window.kq;
    if (!kq) return;
    this.hooks = true;
    kq.npc = {
      list: () =>
        [...this.figs.entries()].map(([npc, f]) => {
          const b = this.spot(npc, f);
          return {
            npc,
            x: b.x,
            z: b.z,
            y: b.floor,
            era: f.p.era,
            visible: this.visible(f),
            alpha: f.fig.alpha,
            dist: Math.hypot(this.ctx.player.position.x - b.x, this.ctx.player.position.z - b.z),
            bound: this.person(npc)?.id ?? null,
            look: f.fig.kind,
          };
        }),
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
      mark: (n) => ({ mark: this.marks.get(n) ?? null, shown: this.glyphs.shown(n) }),
      choose: (id) => (typeof id === 'number' ? this.view.choose(id) : this.view.chooseId(id)),
      setYaw: (n, yaw) => this.setYaw(n, yaw),
      yaw: (n) => {
        const f = this.figs.get(n);
        return f ? this.idleYaw(f) : null;
      },
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
    const i = this.ctx.quality.listeners.indexOf(this.onQuality);
    if (i >= 0) this.ctx.quality.listeners.splice(i, 1);
    this.view.close();
    this.glyphs.dispose();
    for (const f of this.figs.values()) f.fig.dispose();
    this.figs.clear();
  }
}

/** Placement yaw (degrees, 0 = north, 90 = east) → object rotation (the figure faces +z). */
const _face = new _V3();

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
