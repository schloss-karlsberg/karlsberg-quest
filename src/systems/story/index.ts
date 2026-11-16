/**
 * Story feature: data-driven chapters/beats (content/story/*.story.json), the dialogue presenter,
 * objectives with Laub's compass, the field station hub, the new-game flow on the title, being
 * caught, endings and credits.
 *
 * Talks to other features only through events (contracts.ts + the story-private events below)
 * and `ctx.state`.
 */
import './story.css';
import { RADIO_LINES } from './strings';
import type { GameContext } from '../../core/context';
import { type Era, isEra } from '../../core/era';
import { defineSystem } from '../../core/systems';
import { t } from '../../i18n';
import { ERA_LOOKS, type EraLook } from '../../world/eraPresets';
import type { NpcPlacement, ThreatConfig, ThreatKind } from '../contracts';
import { isBarkLine, pickSequence } from '../../content/triggers';
import { assembleEpilogue } from './endings/assemble';
import { isWrapped, newMeter, tickMeter } from './meters';
import { Voice } from './dialogue/voice';
import { DialoguePresenter, holdSeconds, substituteName } from './dialogue/presenter';
import { speakerMeta } from './dialogue/speakers';
import { type MeterState, StoryEngine, type StoryEnv, type StorySlice, createStorySlice, evaluate, runsOnResume } from './engine';
import { composeEpilogue, type Epilogue } from './endings/epilogue';
import { endingScenes } from './endings/scenes';
import { EndingScreen } from './endings/ui';
import { HubOverlay } from './hub/overlay';
import { FieldStation, STATION } from './hub/station';
import { ObjectiveView, bearingDeg } from './objectives';
import { StoryOverlays } from './overlays';
import { playStorySound } from './sfx';
import { loadBundledStories } from './stories';
import { installTitleFlow } from './title/flow';
import { titleHooks } from '../../ui/title';
import type { Action, Checkpoint, ChoiceAction, EndingId, FlagValue, HubItem, LookTime, MeterAction, StoryFile } from './types';
import type { DialogueItem } from './dialogue/presenter';

// ---- story-private state & events (declaration merging; see contracts.ts) -------------------
declare module '../../core/state' {
  interface SystemStates {
    story: StorySlice;
  }
}
declare module '../../core/events' {
  interface GameEvents {
    /** A field-station item was used (hub overlay). */
    'hub:use': { item: HubItem };
    /** Free-form story cue for other features (e.g. { id: 'k2.fire.start' }). */
    'story:cue': { id: string; data?: Record<string, FlagValue> };
    /** The credits were closed (the story is finished). */
    'story:credits': Record<string, never>;
    /** A choice was answered (option = the option's key, or its index). */
    'story:choice': { id: string; option: string };
    /** A story meter ran full (meter action `full`). */
    'story:meter-full': { id: string };
  }
}

export interface StoryHooks {
  /** Jump to a chapter (and beat). */
  goto(chapter: string, beat?: string): void;
  /** Copy of the story slice plus runtime info. */
  state(): StorySlice & { dialogue: DialogueItem | null; pendingLines: number; inHub: boolean; scheduled: number; era: Era };
  /** Complete the current beat. */
  skip(): void;
  /** Start a new story (prologue) with a name. */
  start(name?: string): void;
  say(speaker: string, text: string): void;
  /** Complete typing of the current line (screenshots). */
  finishTyping(): void;
  /** Run all delayed actions now. */
  flush(): void;
  /** Emit player:caught; `holdMs` keeps the black curtain down longer (screenshots). */
  caught(by?: ThreatKind, holdMs?: number): void;
  hub(open?: boolean): void;
  ending(id?: EndingId): void;
  credits(): void;
  epilogue(id: EndingId): Epilogue | null;
  choose(index: number): boolean;
  /** Time of day today, or (with `era`) of that past era like the `look` action. */
  look(time: LookTime, era?: Era): void;
  /** Story meters (copy; value 0 empty … 1 full). */
  meters(): Record<string, MeterState>;
  /** Set a meter's value (tests). */
  meter(id: string, value: number): void;
  /** Stand-in for the interiors feature: emit room:enter (id) / room:leave (null). */
  room(id: string | null): void;
  /** Id of the open choice, or null. */
  choice(): string | null;
}
declare module '../../debug/hooks' {
  interface KqHooks {
    story?: StoryHooks;
  }
}

// ---- looks for the present day at the field station -----------------------------------------
type LookPatch = { [K in keyof EraLook]?: Partial<EraLook[K]> } & { disc?: EraLook['disc'] };
const LOOKS: Record<Exclude<LookTime, 'day'>, LookPatch> = {
  // Morgengrauen: the sun just up in the east, pink horizon, mist lying in the valleys
  dawn: {
    sun: { azimuth: 104, elevation: 3, color: '#ffb07e', intensity: 1.25 },
    sky: { zenith: '#2c3856', horizon: '#e2a088', below: '#3d3a3e', clouds: 0.5, cloudColor: '#d3978e', stars: 0.2 },
    ambient: { sky: '#6a7795', ground: '#37322f', intensity: 0.6 },
    fog: { color: '#8a8792', sunColor: '#f2b48e', density: 0.0012, heightDensity: 0.011, ground: 0.016 },
    grade: { exposure: 1.16, saturation: 0.76, contrast: 1.05, lift: '#0c0b12', gain: '#ffe9dc', vignette: 0.42 },
  },
  dusk: {
    sun: { azimuth: 238, elevation: 3.5, color: '#ff9455', intensity: 1.5 },
    sky: { zenith: '#25304a', horizon: '#d58a5c', below: '#3a3430', clouds: 0.6, cloudColor: '#c98a6e', stars: 0.15 },
    ambient: { sky: '#5d6b8a', ground: '#3a3028', intensity: 0.62 },
    fog: { color: '#6f6672', sunColor: '#e59a6c', density: 0.0011, ground: 0.009 },
    grade: { exposure: 1.18, saturation: 0.82, contrast: 1.07, lift: '#0b0a10', gain: '#ffe4c8', vignette: 0.45 },
  },
  night: {
    sun: { azimuth: 150, elevation: 34, color: '#9fb6e0', intensity: 0.62 },
    disc: 'moon',
    sky: { zenith: '#04070e', horizon: '#1b2234', below: '#0c0e13', clouds: 0.4, cloudColor: '#29324a', stars: 1 },
    ambient: { sky: '#3a4868', ground: '#1c1e26', intensity: 0.55 },
    fog: { color: '#1b2130', sunColor: '#38445e', density: 0.0016, heightDensity: 0.006, ground: 0.012 },
    grade: { exposure: 1.6, saturation: 0.62, contrast: 1.08, lift: '#04060b', gain: '#dfe8ff', vignette: 0.55, grain: 0.05 },
  },
};

export function lookFor(time: LookTime, era: Era = 'today'): EraLook {
  const base = structuredClone(ERA_LOOKS[era]);
  if (time === 'day') return base;
  const p = LOOKS[time];
  const out = base as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(p)) {
    if (v && typeof v === 'object') out[k] = { ...(out[k] as object), ...v };
    else out[k] = v;
  }
  return base;
}

/** Save slot with the state before the ending was chosen (bible 06-enden §7.3). */
export const ENDING_SLOT = 'ending';

const CAUGHT_KEY: Record<ThreatKind, string> = { pack: 'story.caught.pack', fire: 'story.caught.fire', oblivion: 'story.caught.oblivion', combat: 'story.caught.combat' };
/** Wrapped meter → the threat it starts (oil drives hunt's lantern via lantern:request). */
const METER_THREAT: Record<string, ThreatKind> = { smoke: 'fire', vergessen: 'oblivion' };
/** Dialogue triggered by these events belongs to the Chronik's echo scenes (it shows the subtitles). */
const ECHO_EVENTS = new Set(['echo:start', 'echo:play', 'echo:end']);
const QUIET_EVENTS = new Set(['player:step', 'dialogue:say', 'hunt:alert', 'lantern:oil', 'fire:progress', 'oblivion:progress']);
/** Pack lines of these events are never spoken by the trigger runner (assembled elsewhere). */
const ASSEMBLED_EVENTS = new Set(['epilog:line']);

interface Scheduled {
  at: number;
  gen: number;
  fn: () => void;
  /** Beat the action belongs to (null = chapter-wide); retired when another beat begins. */
  beat: string | null;
  /** Changes state (objective, threat, flags …): run at once when its beat ends instead of dropped. */
  keep: boolean;
}

/** Where a run of actions belongs (RunOptions.beat / where). */
interface RunScope {
  beat: string | null;
  where: { x: number; z: number; r: number } | null;
}

/** Presentation actions: dropped with their beat; everything else changes state and runs early instead. */
const PRESENTATION = new Set(['say', 'toast', 'sound', 'card', 'prompt', 'echo', 'choice']);
/** Barks and skill remarks: low priority in the dialogue queue (hints are not: the player is stuck). */
const isLowLine = (id: string | undefined) => !!id && (isBarkLine(id) || id.startsWith('laub.skill.'));

class StoryRuntime {
  readonly engine: StoryEngine;
  readonly files: StoryFile[];
  readonly layer: HTMLElement;
  readonly presenter: DialoguePresenter;
  readonly objectives: ObjectiveView;
  readonly overlays: StoryOverlays;
  readonly station = new FieldStation();
  readonly hub: HubOverlay;
  readonly endings: EndingScreen;
  readonly voice: Voice;
  private time = 0;
  private gen = 0;
  private queue: Scheduled[] = [];
  /** Scope of the actions being executed right now (lines emitted from them are tagged with it). */
  private scope: RunScope | null = null;
  /** Lines emitted in one go (a trigger's sequence) share a group id. */
  private lineGroup = 0;
  private pendingName: string | null = null;
  private pendingAutosave = false;
  inHub = false;
  private hubToastShown = false;
  private storyPrompt = false;
  private hubPrompt = false;
  private shiftPending: { to: Era; age: number } | null = null;
  private qHold = 0;
  /** The pack is chasing the player (hunt:alert): holding Q does not bring you home (bible: "nicht, solange Sie jemand ansieht"). */
  private packChasing = false;
  private blockedToastAt = -99;
  /** An fx transition is running (between shift:begin and shift:done). */
  private shifting = false;
  /** A Chronik echo is playing (between echo:start and echo:end). */
  private echoHold = false;
  private caughtBusy = false;
  private radioIndex = 0;
  private lastSaid = new Map<string, number>();
  /** Dialogue that is never spoken by the trigger runner (example packs, placeholder packs). */
  private readonly mutedLines: Set<string>;
  private stationPlaced = false;
  private hooksInstalled = false;
  private quietCard = false;
  /** Seconds the caught curtain has been down (game time); hold = caughtHold / 1000. */
  private caughtT = 0;
  private caughtHoldS = 2.4;
  /** Lines triggered while the curtain is down: spoken when it lifts. */
  private wakeLines: { speaker: string; text: string; id?: string }[] = [];
  /** The Chronik was opened from the hub's Pinnwand: reopen the hub when it closes. */
  private reopenHub = false;
  /** The open choice (for inline `when` options). */
  private choiceAction: ChoiceAction | null = null;
  /** An NPC conversation is open (npc:conversation). */
  private talking = false;
  private stillT = 0;
  private lastPos = { x: 0, z: 0 };
  /** Facts of hidden packs (examples, placeholders without ?placeholder): not counted in the hub. */
  private readonly hiddenFacts: Set<string>;
  private entryFlags: Map<string, string> | null = null;

  constructor(private readonly ctx: GameContext) {
    const bundled = loadBundledStories();
    // test chapters (content/story/99-test.story.json, "test": true) only with ?storytest
    const tests = ctx.params.has('storytest');
    this.files = bundled.map((b) => b.story).filter((f) => !f.test || tests);
    this.engine = new StoryEngine(this.files, () => this.slice, {
      run: (actions, o) => this.run(actions, o.resume, { beat: o.beat ?? null, where: o.where ?? null }),
      chapterEntered: (f, o) => this.chapterEntered(f, o.resume),
      beatEntered: (ch, b, o) => {
        // the last beat's delayed lines are stale now; its delayed state changes happen at once
        this.retireScheduled(b.id);
        this.presenter.retireBeat(b.id);
        ctx.events.emit('story:beat', { chapter: ch, beat: b.id });
        if (!o.resume) this.pendingAutosave = true;
        if (this.storyPrompt) {
          ctx.ui.hud.prompt(null, undefined, 'story');
          this.storyPrompt = false;
        }
      },
      chapterCompleted: (f) => {
        if (f.unlocks?.length || f.next) ctx.ui.toast(t('story.hub.map.done') + ': ' + f.title_de, 3500);
      },
    });

    // example packs never speak; placeholder packs (content/test) only with ?placeholder
    const placeholder = ctx.params.has('placeholder');
    const hidden = ctx.content.packs.filter((p) => p.file.includes('/examples/') || (p.pack.placeholder && !placeholder));
    this.mutedLines = new Set(hidden.flatMap((p) => (p.pack.dialogue ?? []).map((d) => d.id)));
    this.hiddenFacts = new Set(hidden.flatMap((p) => (p.pack.facts ?? []).map((f) => f.id)));
    this.layer = ctx.ui.layer('story');
    this.layer.classList.remove('kq-hidden');
    this.voice = new Voice(ctx.audio);
    this.presenter = new DialoguePresenter({
      layer: this.layer,
      meta: (id) => speakerMeta(id, ctx.content),
      voice: this.voice,
      reducedMotion: () => ctx.settings.state.reducedMotion,
      name: () => this.slice.name,
      valid: (item) => this.lineStillValid(item),
    });
    this.objectives = new ObjectiveView(this.layer, ctx.ui.hud);
    this.overlays = new StoryOverlays(this.layer, ctx.ui.modals, ctx.ui.hud);

    // field station in the world (today only) + a clearing in the forest around it
    this.station.addTo(ctx.scene);
    ctx.world.forest.addClearing(STATION.x, STATION.z, 18);
    this.placeStation();

    this.hub = new HubOverlay({
      modals: ctx.ui.modals,
      use: (item) => this.useHub(item),
      chapters: () =>
        this.engine.order.map((f) => ({
          id: f.chapter,
          title: f.title_de,
          sub: f.sub_de ?? '',
          unlocked: f === this.engine.first || this.slice.unlocked.includes(f.chapter),
          completed: this.slice.completed.includes(f.chapter),
          current: this.slice.active && this.slice.chapter === f.chapter,
          placeholder: !!f.placeholder,
        })),
      currentBeatTitle: () => this.engine.beat()?.title_de ?? '—',
      goto: (ch) => this.goto(ch),
      rest: () => {
        const ok = ctx.save.save('auto', 'bed');
        return ok;
      },
      counts: () => {
        const s = ctx.state.state;
        let confirmed = 0;
        for (const c of Object.values(s.chronik)) confirmed += c.confirmed.length;
        const codexTotal = [...ctx.content.facts.keys()].filter((id) => !this.hiddenFacts.has(id)).length;
        const codex = s.codex.facts.filter((id) => !this.hiddenFacts.has(id)).length;
        return { codex, codexTotal, clues: s.inventory.clues.length, nouns: s.inventory.nouns.length, items: s.inventory.items.length, confirmed };
      },
      radioLine: () => RADIO_LINES[this.radioIndex++ % RADIO_LINES.length] ?? null,
      drawerState: () => (ctx.state.state.inventory.items.includes('item.bussole') ? 'empty' : 'full'),
      blip: () => this.voice.blip(speakerMeta('marlene', ctx.content).voice),
      reducedMotion: () => ctx.settings.state.reducedMotion,
      onClose: () => {},
    });

    this.endings = new EndingScreen({
      modals: ctx.ui.modals,
      attribution: () => ctx.data.attribution.items,
      epilogue: (id) => this.epilogue(id) ?? { ending: id, intro: '', lines: [], object: '', outro: '', coda: '', variants: {} },
      chosen: (id) => {
        this.slice.ending = id;
        ctx.state.update((s) => (s.flags['flag.end'] = endingScenes()[id].flag), 'story');
        ctx.events.emit('story:ending', { id });
        ctx.save.autosave('ending', true);
      },
      finished: () => {
        this.slice.finished = true;
        ctx.state.update((s) => (s.flags['story.credits'] = true), 'story');
        ctx.events.emit('story:credits', {});
        ctx.save.autosave('credits', true);
      },
      sound: (k) => playStorySound(ctx.audio, k, null, 'verloren'),
      reducedMotion: () => ctx.settings.state.reducedMotion,
      name: () => this.slice.name,
    });

    installTitleFlow({ settings: ctx.settings, modals: ctx.ui.modals, onName: (n) => (this.pendingName = n) });
    // bible 06-enden §2 / §7.3: once an ending was reached, the main menu offers the choice again
    // (the field book as it was before the table: slot 'ending', written when the choice opened)
    titleHooks.extraActions = () => {
      const auto = ctx.save.peek('auto')?.systems['story'] as Partial<StorySlice> | undefined;
      if (!auto?.ending || !ctx.save.has(ENDING_SLOT)) return [];
      return [{ label: t('ui.menu.ending_again'), testid: 'title-ending-again', run: () => ctx.save.load(ENDING_SLOT) }];
    };

    // ---- events
    ctx.events.onAny((name, payload) => this.onEvent(name, payload));
    ctx.events.on('dialogue:say', (p) => this.showLine(p));
    ctx.events.on('game:start', ({ resumed }) => this.onStart(resumed));
    ctx.events.on('save:loaded', () => this.resync());
    ctx.events.on('player:caught', ({ by, soft }) => this.caught(by, { soft: soft === true }));
    ctx.events.on('era:change', ({ to }) => {
      if (to === 'today') this.placeStation();
      if (to === 'today' || this.slice.lookPast?.era === to) this.applyLook();
    });
    ctx.events.on('shift:begin', () => {
      this.shiftPending = null;
      this.shifting = true;
    });
    ctx.events.on('shift:done', ({ to }) => {
      this.shifting = false;
      // where the oil is not the chapter's timer (no oil meter), every trip into the past starts
      // with a full lantern (playtest K4: it ran dry mid-chapter and nothing refilled it)
      if (to !== 'today' && !this.slice.meters['oil']) ctx.events.emit('lantern:request', { lit: ctx.player.stats.lanternLit, refill: true });
    });
    // while the Chronik plays an echo (ghosts + its own subtitles) the presenter waits out of sight
    ctx.events.on('echo:start', () => (this.echoHold = true));
    ctx.events.on('echo:end', () => (this.echoHold = false));
    // readings: mirror the Chronik's reading flag into the entry's story flag (CaseEntry.flag)
    ctx.events.on('chronik:fill', ({ caseId, entryId }) => this.mirrorReading(caseId, entryId));
    // Chronik opened from the Pinnwand → back to the hub overlay when it closes
    ctx.events.on('chronik:closed', () => {
      if (!this.reopenHub) return;
      this.reopenHub = false;
      if (this.inHub && !this.caughtBusy) queueMicrotask(() => this.ctx.ui.modals.count === 0 && this.hub.show());
    });
    ctx.events.on('npc:conversation', ({ open }) => (this.talking = open));
    ctx.events.on('hunt:alert', ({ state }) => (this.packChasing = state === 'chasing'));
    ctx.events.on('hunt:end', () => (this.packChasing = false));
    // wrapped meters mirror their feature's value
    ctx.events.on('lantern:oil', ({ oil }) => this.mirrorMeter('oil', 1 - oil));
    ctx.events.on('fire:progress', ({ t: v }) => this.mirrorMeter('smoke', v));
    ctx.events.on('oblivion:progress', ({ t: v }) => this.mirrorMeter('vergessen', v));
    ctx.events.on('lantern:empty', () => {
      const m = this.slice.meters.oil;
      if (m && ctx.era.current !== 'today') this.meterFull(m);
    });
    window.addEventListener('keydown', this.onKey);
    // window.kq appears right after all systems are initialised
    const iv = window.setInterval(() => {
      if (window.kq) {
        if (!this.hooksInstalled) this.installHooks();
        window.clearInterval(iv);
      }
    }, 25);
  }

  get slice(): StorySlice {
    const s = this.ctx.state.slice('story', createStorySlice);
    // saves from before round 2
    if (!s.meters) s.meters = {};
    if (s.room === undefined) s.room = null;
    return s;
  }

  // ------------------------------------------------------------------------------------------
  // lifecycle
  // ------------------------------------------------------------------------------------------

  private onStart(resumed: boolean): void {
    this.cancelScheduled();
    this.presenter.clear();
    const params = this.ctx.params;
    if (this.pendingName !== null) {
      const name = this.pendingName;
      this.pendingName = null;
      this.start(name);
      return;
    }
    if (params.has('story') && !this.slice.active && !this.slice.finished) {
      this.start(params.get('name') ?? t('story.name.suggest'));
      return;
    }
    this.resync();
    if (resumed && this.slice.active) this.engine.resume(false);
  }

  /** Re-apply persistent presentation after a load. */
  private resync(): void {
    this.cancelScheduled();
    const s = this.slice;
    this.objectives.set(s.objective);
    this.applyLook();
    this.mirrorAllReadings();
  }

  start(name: string): void {
    const first = this.engine.first;
    if (!first) return;
    const s = this.slice;
    Object.assign(s, createStorySlice(), { name: name.trim() || t('story.name.suggest') });
    this.objectives.set(null);
    this.goto(first.chapter);
  }

  goto(chapter: string, beat?: string): void {
    this.cancelScheduled();
    this.presenter.clear();
    // jumping between beats of the running chapter: no title card
    this.quietCard = !!beat && this.slice.active && this.slice.chapter === chapter;
    try {
      this.engine.goto(chapter, beat);
    } finally {
      this.quietCard = false;
    }
  }

  private chapterEntered(f: StoryFile, resume: boolean): void {
    const ctx = this.ctx;
    ctx.events.emit('story:chapter', { id: f.chapter });
    if (resume) return;
    // the previous chapter's queued lines and delayed actions end with it: the new title card
    // starts clean (in a campaign Laub's prologue rules ran on into "Der Hof")
    this.cancelScheduled();
    this.presenter.clear();
    // a new chapter (a new day) starts on your feet, not still prone from the last chase
    if (ctx.player.stance !== 'stand') ctx.player.setStance('stand');
    // … and with the new chapter's own objective, not the last one of the previous chapter
    this.slice.objective = null;
    this.objectives.set(null);
    // switch threats of the previous chapter off
    for (const [kind, cfg] of Object.entries(this.slice.threats)) {
      if (cfg.active) this.configureThreat({ kind: kind as ThreatKind, active: false });
    }
    // meters, choices and the lossless rule belong to their chapter
    for (const id of Object.keys(this.slice.meters)) this.stopMeter(id);
    this.overlays.closeChoice();
    this.choiceAction = null;
    if (ctx.state.state.flags['chronik.noLoss'] !== undefined) ctx.state.update((st) => delete st.flags['chronik.noLoss'], 'story');
    const cp = f.checkpoint;
    if (cp) {
      if (cp.era && ctx.era.current !== cp.era) ctx.era.set(cp.era);
      const p = ctx.player.position;
      if (Math.hypot(p.x - cp.x, p.z - cp.z) > 30) this.teleport(cp.x, cp.z, cp.yaw);
    }
    if (!this.quietCard) this.overlays.card(f.title_de, f.sub_de, f.placeholder ? t('story.placeholder') : undefined);
  }

  // ------------------------------------------------------------------------------------------
  // actions
  // ------------------------------------------------------------------------------------------

  /**
   * Run an action list: delays are relative to the previous action; spoken lines take their time
   * (lines that will not be spoken — said once already — take none, so a retry is not 18 s of silence).
   */
  private run(actions: Action[], resume: boolean, scope: RunScope = { beat: this.slice.beat, where: null }): void {
    let at = 0;
    for (const a of actions) {
      if (resume && !runsOnResume(a)) continue;
      at += a.delay ?? 0;
      if (at <= 0) this.withScope(scope, () => this.exec(a));
      else this.schedule(at, () => this.exec(a), scope, !PRESENTATION.has(a.do));
      if (a.do === 'say') {
        const text = this.sayText(a) ?? '';
        if (text) at += text.length / 42 + holdSeconds(text, a.ms) + 0.4;
      }
    }
  }

  /** The text a say action would speak now, or null if it stays silent (said once, variants used up). */
  private sayText(a: Extract<Action, { do: 'say' }>): string | null {
    const id = a.id ?? a.line;
    if (a.variants?.length) {
      const n = this.slice.sayCount?.[a.id ?? ''] ?? 0;
      if (n >= a.variants.length && !a.repeat) return null;
      return a.variants[Math.min(n, a.variants.length - 1)] ?? null;
    }
    if (id && this.slice.said.includes(id) && !a.repeat) return null;
    const line = a.line ? this.ctx.content.dialogue.get(a.line) : undefined;
    return a.text_by_era?.[this.ctx.era.current] ?? a.text ?? line?.text_de ?? null;
  }

  private withScope(scope: RunScope | null, fn: () => void): void {
    const prev = this.scope;
    this.scope = scope;
    try {
      fn();
    } finally {
      this.scope = prev;
    }
  }

  private schedule(delay: number, fn: () => void, scope: RunScope | null = null, keep = true): void {
    this.queue.push({ at: this.time + delay, gen: this.gen, fn: () => this.withScope(scope, fn), beat: scope?.beat ?? null, keep });
  }

  /**
   * A new beat began: delayed actions of other beats are retired. Presentation (lines, toasts,
   * sounds, cards, echoes, choices) is dropped; state changes (objective, threat, flags, animals …)
   * run now, in order, so the story's bookkeeping never depends on how fast the player was.
   */
  private retireScheduled(beat: string): void {
    const stale = this.queue.filter((q) => q.gen === this.gen && q.beat !== null && q.beat !== beat);
    if (!stale.length) return;
    this.queue = this.queue.filter((q) => !stale.includes(q));
    for (const q of stale.sort((a, b) => a.at - b.at)) if (q.keep) q.fn();
  }

  private cancelScheduled(): void {
    this.gen++;
    this.queue = [];
  }

  /** Run every scheduled action now (debug / tests). */
  flush(): void {
    let guard = 0;
    while (this.queue.length && guard++ < 200) {
      const list = this.queue.sort((a, b) => a.at - b.at);
      const next = list.shift()!;
      if (next.gen === this.gen) next.fn();
    }
  }

  private exec(a: Action): void {
    const ctx = this.ctx;
    const s = this.slice;
    switch (a.do) {
      case 'say': {
        const line = a.line ? ctx.content.dialogue.get(a.line) : undefined;
        const text = this.sayText(a);
        const speaker = a.speaker ?? line?.speaker;
        if (!text || !speaker) return;
        const id = a.id ?? a.line;
        if (a.variants?.length && a.id) {
          // a running joke: count how often it was told
          s.sayCount = { ...(s.sayCount ?? {}), [a.id]: (s.sayCount?.[a.id] ?? 0) + 1 };
        } else if (id && !s.said.includes(id)) s.said.push(id);
        ctx.events.emit('dialogue:say', { speaker, text, ms: a.ms, id, fiction: a.echo ? true : undefined });
        return;
      }
      case 'objective': {
        if (!a.text) s.objective = null;
        else s.objective = { text: a.text, ...(a.x !== undefined && a.z !== undefined ? { x: a.x, z: a.z } : {}), ...(a.id ? { id: a.id } : {}) };
        this.objectives.set(s.objective);
        ctx.events.emit('objective:set', { text: a.text ?? null, x: a.x, z: a.z, id: a.id });
        return;
      }
      case 'threat': {
        // every ThreatConfig field passes through (feature-declared extras: pack mode, target …)
        const { do: _do, delay: _delay, onResume: _onResume, ...cfg } = a;
        this.configureThreat(cfg);
        return;
      }
      case 'flag':
        ctx.state.update((st) => {
          for (const [k, v] of Object.entries(a.set)) {
            if (v === null) delete st.flags[k];
            else st.flags[k] = v;
          }
        }, 'story');
        return;
      case 'shift':
        this.requestShift(a.to, a.reason, a.instant);
        return;
      case 'anchor':
        this.setAnchor(a.to === null ? null : { to: a.to, x: a.x ?? ctx.player.position.x, z: a.z ?? ctx.player.position.z, r: a.r ?? 30 });
        return;
      case 'skill':
        ctx.state.update((st) => (st.skills[a.id] = Math.max(st.skills[a.id] ?? 0, a.tier)), 'story');
        // the skills system shows its unlock card for every raise: the toast would say it twice
        if (a.toast && !ctx.systems.get('skills')) ctx.ui.toast(a.toast);
        return;
      case 'give':
        this.give(a.clue, a.noun, a.item, a.kind);
        if (a.toast) ctx.ui.toast(a.toast, 4200);
        return;
      case 'toast':
        ctx.ui.toast(a.text, a.ms);
        return;
      case 'teleport':
        this.teleport(a.x, a.z, a.yaw);
        return;
      case 'card':
        this.overlays.card(a.title, a.sub, a.note, a.seconds);
        return;
      case 'sound':
        this.sound(a.sound, a.x, a.z, a.caption, a.signal);
        return;
      case 'look':
        if (a.era && a.era !== 'today') s.lookPast = a.time === 'day' ? null : { era: a.era, time: a.time };
        else s.look = a.time;
        this.applyLook();
        return;
      case 'prompt':
        if (!a.key && !a.text) {
          if (this.storyPrompt) ctx.ui.hud.prompt(null, undefined, 'story');
          this.storyPrompt = false;
        } else {
          ctx.ui.hud.prompt(a.key ?? null, a.text ?? '', 'story');
          this.storyPrompt = true;
        }
        return;
      case 'cue':
        ctx.events.emit('story:cue', { id: a.id, data: a.data });
        return;
      case 'chronik':
        ctx.events.emit('chronik:open', a.caseId ? { caseId: a.caseId } : {});
        return;
      case 'unlock':
        if (!s.unlocked.includes(a.chapter)) s.unlocked.push(a.chapter);
        return;
      case 'ending':
        // the field book before the choice: "Ende noch einmal wählen" in the main menu loads it
        if (!s.ending) ctx.save.save(ENDING_SLOT, 'ending-choice');
        this.overlays.dropCard();
        this.endings.show();
        return;
      case 'autosave':
        ctx.save.autosave('story', true);
        return;
      case 'choice':
        this.choiceAction = a;
        this.overlays.openChoice(a, (i) => this.applyChoice(a, i));
        return;
      case 'npc': {
        if (a.op === 'despawn') {
          ctx.events.emit('npc:despawn', { npc: a.npc });
          return;
        }
        // in a room: its centre and storey (resolved by the npc system); else at the player, on the player's storey
        const anchor = a.room ? ctx.world.roomAnchor?.(a.room) ?? null : null;
        const atPlayer = a.x === undefined && a.z === undefined && !anchor;
        const p: NpcPlacement = { npc: a.npc, x: a.x ?? anchor?.x ?? ctx.player.position.x, z: a.z ?? anchor?.z ?? ctx.player.position.z, era: a.era ?? ctx.era.current };
        if (a.room) p.room = a.room;
        if (atPlayer) p.y = ctx.player.position.y;
        else if (anchor && a.x === undefined) p.y = anchor.y;
        const chapter = a.chapter ?? s.chapter;
        if (chapter) p.chapter = chapter;
        if (a.yaw !== undefined) p.yaw = a.yaw;
        if (a.topics) p.topics = a.topics;
        if (a.mood) p.mood = a.mood;
        ctx.events.emit('npc:spawn', p);
        return;
      }
      case 'meter':
        if (a.active) this.startMeter(a);
        else this.stopMeter(a.id);
        return;
      case 'echo':
        ctx.events.emit('echo:play', { id: a.id });
        return;
      case 'memorial': {
        const m: { id: string; active: boolean; x?: number; z?: number; r?: number; era?: string; room?: string } = { id: a.id, active: a.active ?? true };
        if (a.x !== undefined) m.x = a.x;
        if (a.z !== undefined) m.z = a.z;
        if (a.r !== undefined) m.r = a.r;
        if (a.era) m.era = a.era;
        if (a.room) m.room = a.room;
        ctx.events.emit('memorial:set', m);
        return;
      }
      case 'readings':
        this.fillReadings(a.cases);
        return;
      // ---- Action-RPG requests (docs/ACTION-RPG.md §9.3): the RPG systems do the work ----
      case 'quest': {
        const cmd: { op: typeof a.op; id: string; objective?: string; n?: number } = { op: a.op, id: a.id };
        if (a.objective) cmd.objective = a.objective;
        if (a.n !== undefined) cmd.n = a.n;
        ctx.events.emit('quest:command', cmd);
        return;
      }
      case 'enemy': {
        if (a.op === 'despawn') {
          ctx.events.emit('enemy:despawn', { group: a.group });
          return;
        }
        if (!a.kind) return;
        const { do: _d, delay: _dl, onResume: _r, op: _op, x, z, era, ...rest } = a;
        ctx.events.emit('enemy:spawn', { ...rest, kind: a.kind, x: x ?? ctx.player.position.x, z: z ?? ctx.player.position.z, era: era ?? ctx.era.current });
        return;
      }
      case 'loot': {
        if (a.clear) {
          ctx.events.emit('loot:clear', { id: a.id });
          return;
        }
        if (!a.item) return;
        const l: { id: string; item: string; x: number; z: number; era: Era; count?: number; room?: string } = {
          id: a.id,
          item: a.item,
          x: a.x ?? ctx.player.position.x,
          z: a.z ?? ctx.player.position.z,
          era: a.era ?? ctx.era.current,
        };
        if (a.count !== undefined) l.count = a.count;
        if (a.room) l.room = a.room;
        ctx.events.emit('loot:place', l);
        return;
      }
      case 'xp':
        ctx.events.emit('xp:grant', { amount: a.amount, reason: a.reason ?? `story:${s.chapter ?? ''}` });
        return;
      case 'item': {
        const g: { item: string; count?: number; reason: string; quiet?: boolean } = { item: a.item, reason: `story:${s.chapter ?? ''}` };
        if (a.count !== undefined) g.count = a.count;
        if (a.quiet) g.quiet = true;
        ctx.events.emit('item:grant', g);
        return;
      }
      case 'grant': {
        if (ctx.systems.get('chronik') && ctx.content.clues.has(a.clue)) ctx.events.emit('clue:grant', a.card ? { id: a.clue, card: true } : { id: a.clue });
        // nobody discovered it (no Chronik, or a Chronik on placeholder content): the story keeps it itself
        if (!ctx.state.state.inventory.clues.includes(a.clue)) this.give(a.clue, undefined, undefined, ctx.content.clues.get(a.clue)?.kind);
        return;
      }
    }
  }

  // ---- choices ------------------------------------------------------------------------------

  private applyChoice(a: ChoiceAction, i: number): void {
    if (this.choiceAction === a) this.choiceAction = null;
    const o = a.options[i];
    if (!o) return;
    const key = o.key ?? String(i);
    this.ctx.state.update((st) => {
      for (const [k, v] of Object.entries(o.set ?? {})) {
        if (v === null) delete st.flags[k];
        else st.flags[k] = v;
      }
      st.flags[`choice.${a.id}`] = o.key ?? i;
    }, 'story');
    this.ctx.events.emit('story:choice', { id: a.id, option: key });
    if (o.then?.length) this.run(o.then, false, { beat: this.slice.beat, where: null });
  }

  /** Inline choices: take the first option whose `when` holds. */
  private updateInlineChoice(env: StoryEnv): void {
    const a = this.choiceAction;
    if (!a || !this.overlays.choiceInline || this.overlays.choiceId !== a.id) return;
    for (let i = 0; i < a.options.length; i++) {
      const w = a.options[i]!.when;
      if (w && evaluate(w, env, {}, `choice.${a.id}.${i}`, 0)) {
        this.overlays.pickChoice(i);
        return;
      }
    }
  }

  // ---- readings -----------------------------------------------------------------------------

  private entryFlag(entryId: string): string | null {
    if (!this.entryFlags) {
      this.entryFlags = new Map();
      for (const cs of this.ctx.content.cases.values()) for (const e of cs.entries) if (e.flag) this.entryFlags.set(e.id, e.flag);
    }
    return this.entryFlags.get(entryId) ?? null;
  }

  private mirrorReading(caseId: string, entryId: string): void {
    const e = this.ctx.content.cases.get(caseId)?.entries.find((x) => x.id === entryId);
    if (!e?.flag) return;
    const flag = e.flag;
    const v = this.ctx.state.state.flags[`reading.${caseId}.${entryId}`];
    this.ctx.state.update((st) => {
      if (v === undefined) delete st.flags[flag];
      else st.flags[flag] = v;
    }, 'story');
  }

  private mirrorAllReadings(): void {
    const flags = this.ctx.state.state.flags;
    const set: Record<string, FlagValue> = {};
    for (const cs of this.ctx.content.cases.values())
      for (const e of cs.entries) {
        const v = flags[`reading.${cs.id}.${e.id}`];
        if (e.flag && v !== undefined && flags[e.flag] !== v) set[e.flag] = v;
      }
    if (Object.keys(set).length) this.ctx.state.update((st) => Object.assign(st.flags, set), 'story');
  }

  /** "Leer lassen": every reading without an answer becomes 'offen' (bible 06-enden §6). */
  private fillReadings(cases?: string[]): void {
    const flags = this.ctx.state.state.flags;
    const set: Record<string, FlagValue> = {};
    for (const cs of this.ctx.content.cases.values()) {
      if (cases && !cases.includes(cs.id)) continue;
      for (const e of cs.entries) if (e.kind === 'reading' && e.flag && flags[e.flag] === undefined) set[e.flag] = 'offen';
    }
    if (Object.keys(set).length) this.ctx.state.update((st) => Object.assign(st.flags, set), 'story');
  }

  // ---- meters -------------------------------------------------------------------------------

  private startMeter(a: MeterAction): void {
    const ctx = this.ctx;
    const s = this.slice;
    const era = ctx.era.current;
    const m = newMeter(a.id, { seconds: a.seconds, label: a.label, full: a.full, text: a.text, lossless: a.lossless, still: a.still, era: era === 'today' ? undefined : era });
    const prev = s.meters[a.id];
    // a resumed beat re-runs its meter action: keep the running value
    // (an emptied lantern does not count as running: the next trip starts with a full one)
    if (prev && !prev.done && prev.seconds === m.seconds && !(a.id === 'oil' && prev.value >= 0.98)) m.value = prev.value;
    s.meters[a.id] = m;
    if (a.lossless) ctx.state.update((st) => (st.flags['chronik.noLoss'] = true), 'story');
    if (a.id === 'oil') {
      // hunt's lantern burns `seconds`; the pack (if any) keeps its configuration
      const pack = s.threats.pack;
      if (a.seconds) this.configureThreat(pack?.active ? { ...pack, seconds: a.seconds } : { kind: 'pack', active: false, seconds: a.seconds });
      ctx.events.emit('lantern:request', { lit: true, refill: m.value === 0 });
    } else if (METER_THREAT[a.id]) {
      this.configureThreat({ kind: METER_THREAT[a.id]!, active: true, intensity: a.intensity, center: a.center, radius: a.radius, seconds: a.seconds });
    }
  }

  private stopMeter(id: string): void {
    const s = this.slice;
    if (!s.meters[id]) return;
    delete s.meters[id];
    this.overlays.gauge(id, '', null);
    const kind = METER_THREAT[id];
    if (kind && s.threats[kind]?.active) this.configureThreat({ kind, active: false });
  }

  private mirrorMeter(id: string, v: number): void {
    const m = this.slice.meters[id];
    if (!m || !Number.isFinite(v)) return;
    const before = m.value;
    m.value = Math.max(0, Math.min(1, v));
    // Laub warns while the lantern burns down (half left, a fifth left), once per filling
    if (id === 'oil' && this.ctx.era.current !== 'today' && m.full !== 'none' && !this.caughtBusy) {
      for (const [at, key] of [[0.5, 'story.oil.half'], [0.8, 'story.oil.low']] as const)
        if (before < at && m.value >= at) this.ctx.events.emit('dialogue:say', { speaker: 'laub', text: t(key), id: `laub.${key}` });
    }
  }

  /** A meter ran full (custom gauge filled, lantern empty in the past). */
  private meterFull(m: MeterState): void {
    this.ctx.events.emit('story:meter-full', { id: m.id });
    if (m.full === 'none' || this.caughtBusy) return;
    if (m.full === 'caught') this.ctx.events.emit('player:caught', { by: 'pack' });
    else this.caught('pack', { text: m.text ?? t('story.meter.return'), sub: t('story.meter.returnSub') });
  }

  private tickMeters(dt: number): void {
    const ctx = this.ctx;
    const s = this.slice;
    const p = ctx.player.position;
    const speed = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z) / Math.max(1e-4, dt);
    this.lastPos = { x: p.x, z: p.z };
    this.stillT = speed < 0.3 ? this.stillT + dt : 0;
    const st = ctx.settings.state;
    const e = { era: ctx.era.current, still: this.stillT > 0.5, hold: this.echoHold || this.talking || this.caughtBusy || this.shifting, gentle: st.gentleMode, rauhnacht: st.rauhnacht === true || ctx.state.state.flags['rauhnacht'] === true };
    for (const m of Object.values(s.meters)) if (tickMeter(m, dt, e)) this.meterFull(m);
  }


  private configureThreat(c: ThreatConfig): void {
    const clean: ThreatConfig = { kind: c.kind, active: c.active };
    // all defined fields, incl. feature extras (hunt: mode, target, via, from, hounds …); JSON-safe
    for (const [k, v] of Object.entries(c)) if (v !== undefined && k !== 'kind' && k !== 'active') (clean as unknown as Record<string, unknown>)[k] = v;
    this.slice.threats[c.kind] = clean;
    this.ctx.events.emit('threat:configure', clean);
  }

  private give(clue?: string, noun?: string, item?: string, kind?: string): void {
    const ctx = this.ctx;
    const inv = ctx.state.mutable.inventory;
    if (clue && !inv.clues.includes(clue)) {
      inv.clues.push(clue);
      ctx.events.emit('clue:found', { id: clue, kind: kind ?? 'story' });
    }
    if (noun && !inv.nouns.includes(noun)) {
      inv.nouns.push(noun);
      ctx.events.emit('noun:learned', { id: noun });
    }
    if (item && !inv.items.includes(item)) inv.items.push(item);
    ctx.state.notify('story');
  }

  private teleport(x: number, z: number, yawDeg?: number): void {
    this.ctx.player.teleport(x, z, yawDeg === undefined ? undefined : (-yawDeg * Math.PI) / 180);
    this.ctx.world.forest.invalidate();
  }

  private setAnchor(a: { to: Era; x: number; z: number; r: number } | null): void {
    this.ctx.state.update((st) => {
      if (!a) {
        for (const k of ['shift.allowed', 'shift.target', 'shift.x', 'shift.z', 'shift.r']) delete st.flags[k];
        return;
      }
      st.flags['shift.allowed'] = true;
      st.flags['shift.target'] = a.to;
      st.flags['shift.x'] = a.x;
      st.flags['shift.z'] = a.z;
      st.flags['shift.r'] = a.r;
    }, 'story');
  }

  /** Ask fx for an era shift; without an fx feature (or if it does not react) switch directly. */
  private requestShift(to: Era, reason?: string, instant?: boolean): void {
    const ctx = this.ctx;
    if (ctx.era.current === to) return;
    ctx.events.emit('shift:request', { to, reason, instant });
    if (!ctx.systems.get('fx') || instant) {
      // fx may have switched synchronously
      if (ctx.era.current !== to) ctx.era.set(to);
      this.shiftPending = null;
      // fx answered synchronously ('shift:begin' already ran): no fallback timer, or Q stays
      // dead for 1.5 s after every shift
    } else if (!this.shifting && ctx.era.current !== to) this.shiftPending = { to, age: 0 };
  }

  private sound(kind: Parameters<typeof playStorySound>[1], x?: number, z?: number, caption?: string, signal?: Parameters<typeof playStorySound>[3]): void {
    const ctx = this.ctx;
    let dest: AudioNode | null = null;
    let dispose: (() => void) | null = null;
    if (x !== undefined && z !== undefined) {
      const src = ctx.audio.createSource3D('sfx', { refDistance: 90, maxDistance: 4000, rolloff: 0.5 });
      if (src) {
        src.setPosition(x, ctx.world.heightAt(x, z) + 3, z);
        dest = src.input;
        dispose = () => src.dispose();
      }
      // visual cue on the compass strip for directional (threat) sounds
      if (kind === 'howl' || kind === 'horn') {
        const p = ctx.player.position;
        ctx.ui.hud.setMarker('story-sound', bearingDeg(p.x, p.z, x, z), '#b0402a');
        window.setTimeout(() => ctx.ui.hud.setMarker('story-sound', null), 6000);
      }
    }
    const dur = playStorySound(ctx.audio, kind, dest, signal ?? 'anblasen');
    if (dispose) window.setTimeout(dispose, (dur + 6) * 1000);
    if (caption) ctx.ui.hud.subtitle(null, caption, Math.max(3500, dur * 1000 + 1500));
  }

  private applyLook(): void {
    const ctx = this.ctx;
    const past = this.slice.lookPast;
    if (ctx.era.current === 'today') ctx.world.look = lookFor(this.slice.look);
    else if (past && past.era === ctx.era.current) ctx.world.look = lookFor(past.time, ctx.era.current);
    else return;
    ctx.world.applyLook();
  }

  private placeStation(): void {
    if (this.stationPlaced) return;
    const hf = this.ctx.world.heightfields['2025'];
    this.station.place((x, z) => hf.heightAt(x, z));
    this.stationPlaced = true;
  }

  // ------------------------------------------------------------------------------------------
  // events, dialogue
  // ------------------------------------------------------------------------------------------

  private onEvent(name: string, payload: unknown): void {
    if (QUIET_EVENTS.has(name)) return;
    if (name === 'room:enter' || name === 'room:leave') this.onRoom(name, payload);
    this.engine.onEvent(name, payload);
    // ContentDB dialogue triggers (echo lines are played by the Chronik's echo director itself)
    if (ECHO_EVENTS.has(name) || ASSEMBLED_EVENTS.has(name)) return;
    const sys = this.ctx.systems;
    // the npc feature plays its conversations, the barks feature its barks (rules: barks/rules.ts)
    if (name === 'npc:talk' && sys.get('npc')) return;
    const barks = !!sys.get('barks');
    if (barks && name.startsWith('bark:')) return;
    const lines = this.ctx.content.dialogueFor(name).filter((l) => !this.mutedLines.has(l.id) && !(barks && isBarkLine(l.id)));
    if (!lines.length) return;
    const s = this.slice;
    const st = this.ctx.state.state;
    const seq = pickSequence(lines, name, payload, { era: this.ctx.era.current, flags: st.flags, chapter: s.chapter, beat: s.beat, clues: st.inventory.clues }, new Set(s.said), this.lastSaid, this.time);
    // a trigger's lines are about what just happened, here: one group, bound to this spot
    const p = this.ctx.player.position;
    const scope: RunScope = { beat: s.beat, where: { x: p.x, z: p.z, r: 0 } };
    this.lineGroup++;
    for (const line of seq) {
      this.lastSaid.set(line.id, this.time);
      if (line.once && !s.said.includes(line.id)) s.said.push(line.id);
      const say = { speaker: line.speaker, text: line.text_de, id: line.id };
      // lines about being caught wait until the curtain lifts
      if (this.caughtBusy) this.wakeLines.push(say);
      else this.withScope(scope, () => this.ctx.events.emit('dialogue:say', say));
    }
    if (seq.length) this.lineGroup++;
  }

  /** room:enter / room:leave { roomId } from the interiors feature (not declared here). */
  private onRoom(name: string, payload: unknown): void {
    const p = (payload ?? {}) as { roomId?: unknown; id?: unknown };
    const id = typeof p.roomId === 'string' ? p.roomId : typeof p.id === 'string' ? p.id : null;
    if (!id) return;
    const s = this.slice;
    if (name === 'room:enter') s.room = id;
    else if (s.room === id) s.room = null;
  }

  private showLine(p: { speaker: string; text: string; ms?: number; fiction?: boolean; id?: string }): void {
    const line = p.id ? this.ctx.content.dialogue.get(p.id) : undefined;
    const src = line?.sources?.[0];
    // tag the line: its beat, the place it is about, its priority (barks / hints of other features: low)
    const sc = this.scope;
    const low = isLowLine(p.id);
    const pos = this.ctx.player.position;
    const where = sc?.where ?? (low ? { x: pos.x, z: pos.z, r: 0 } : null);
    this.presenter.enqueue({
      id: p.id,
      speaker: p.speaker,
      text: p.text,
      ms: p.ms,
      fiction: p.fiction,
      source: src ? (src.label ?? src.url) : undefined,
      beat: sc ? sc.beat : this.slice.beat,
      where,
      priority: low ? 'low' : 'normal',
      group: sc ? this.lineGroup : ++this.lineGroup,
    });
  }

  /**
   * A waiting line is still worth saying: the player has not left the place it is about (its
   * reaction's circle + 45 m, or 45 m from where it was triggered).
   */
  private lineStillValid(item: DialogueItem): boolean {
    const w = item.where;
    if (!w) return true;
    const p = this.ctx.player.position;
    return Math.hypot(p.x - w.x, p.z - w.z) <= w.r + 45;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if ((e.code !== 'Enter' && e.code !== 'NumpadEnter') || !this.presenter.busy || this.ctx.ui.modals.count > 0) return;
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'BUTTON')) return;
    e.preventDefault();
    this.presenter.skip();
  };

  // ------------------------------------------------------------------------------------------
  // hub
  // ------------------------------------------------------------------------------------------

  private useHub(item: HubItem): void {
    const ctx = this.ctx;
    const modals = ctx.ui.modals.count;
    const chapter = this.slice.chapter;
    ctx.events.emit('hub:use', { item });
    // the hub pauses the game: let the beat react now, so a clue card (grant {card}) opens on top
    // of the hub instead of after it has been closed
    if (this.slice.active && !this.caughtBusy) this.engine.tick(0, this.env());
    if (this.slice.chapter !== chapter) {
      // the item ended the chapter (the prologue's field bed): out of the trailer, into the next one
      this.hub.close();
      return;
    }
    // something to read at the Pinnwand first (a card opened): the Chronik board waits for the next visit
    if (item === 'chronik' && ctx.ui.modals.count <= modals) {
      // the Chronik closes every modal (the hub too) when it opens: come back here afterwards
      this.reopenHub = !!ctx.systems.get('chronik');
      ctx.events.emit('chronik:open', {});
    }
  }

  private updateHub(): void {
    const ctx = this.ctx;
    const p = ctx.player.position;
    const inside = ctx.era.current === 'today' && Math.hypot(p.x - STATION.x, p.z - STATION.z) < STATION.r && !ctx.player.flying;
    if (inside !== this.inHub) {
      this.inHub = inside;
      ctx.events.emit(inside ? 'hub:enter' : 'hub:leave', {});
      if (inside && !this.hubToastShown) {
        this.hubToastShown = true;
        ctx.ui.toast(t('story.hub.enterToast'), 3200);
      }
    }
    const showPrompt = inside && !this.storyPrompt && !this.hub.open;
    if (showPrompt !== this.hubPrompt) {
      this.hubPrompt = showPrompt;
      if (showPrompt) ctx.ui.hud.prompt('E', t('story.hub.prompt'), 'story');
      else if (!this.storyPrompt) ctx.ui.hud.prompt(null, undefined, 'story');
    }
    if (inside && ctx.input.wasPressed('listen') && ctx.ui.modals.count === 0) this.hub.show();
  }

  // ------------------------------------------------------------------------------------------
  // caught → field station
  // ------------------------------------------------------------------------------------------

  private caughtHold = 2400;

  /**
   * The curtain: down at once, the threats stop, the player stands still; after `caughtHold` of
   * GAME time (kq.step advances it) the player wakes at the checkpoint. `text` overrides the line
   * (meters returning the player). Brought home softly (hunt drive, `player:caught {soft}`) or under
   * the lossless rule (chronik.noLoss): "Die Meute hat dich heimgebracht …" (bible ui.homed.*).
   */
  caught(by: ThreatKind, opts: { text?: string; sub?: string; soft?: boolean } = {}): void {
    if (this.caughtBusy) return;
    this.caughtBusy = true;
    const ctx = this.ctx;
    this.cancelScheduled();
    this.presenter.clear();
    this.overlays.closeChoice();
    this.choiceAction = null;
    this.wakeLines = [];
    const noLoss = ctx.state.state.flags['chronik.noLoss'] === true;
    const homed = opts.soft === true || (noLoss && by === 'pack');
    const line = opts.text ?? (homed ? t('ui.homed.title') : t(CAUGHT_KEY[by] ?? CAUGHT_KEY.pack));
    this.overlays.curtainDown(line, opts.sub ?? (homed ? t('ui.homed.body') : t('story.caught.sub')));
    for (const [kind, cfg] of Object.entries(this.slice.threats)) if (cfg.active) this.configureThreat({ kind: kind as ThreatKind, active: false });
    ctx.player.frozen = true;
    this.caughtT = 0;
    this.caughtHoldS = this.caughtHold / 1000;
    this.caughtHold = 2400;
  }

  private updateCaught(dt: number): void {
    const ctx = this.ctx;
    ctx.player.frozen = true;
    this.caughtT += dt;
    if (this.caughtT < this.caughtHoldS) return;
    if (ctx.era.current !== 'today') this.requestShift('today', 'caught', true);
    // where you come to: the resumed beat's wake place, else the caught beat's, else the chapter's checkpoint
    // … unless the way back into the past starts somewhere else: then wake at that anchor, so the
    // player does not walk half the map back (playtest: K3 garden, K4 Ehrenhof, K2 after anchor B)
    let wake = this.wakePlace();
    const anchor = this.anchorFromFlags();
    let atAnchor = false;
    // (not in the prologue: there the station is the lesson, and the way back is short and taught)
    const prolog = this.engine.chapter()?.chapter === 'prolog';
    if (anchor && !anchor.anywhere && !prolog && (!wake || Math.hypot(wake.x - anchor.x, wake.z - anchor.z) > 150)) {
      wake = { x: anchor.x + 3, z: anchor.z + 3, yaw: wake?.yaw ?? 0, text: t('story.caught.wakeAnchor') };
      atAnchor = true;
    }
    const cp = wake ?? this.engine.chapter()?.checkpoint ?? { x: STATION.spawn.x, z: STATION.spawn.z, yaw: STATION.spawn.yaw };
    this.teleport(cp.x, cp.z, cp.yaw);
    this.applyLook();
    ctx.player.frozen = false;
    // full meters start over
    for (const m of Object.values(this.slice.meters)) {
      // wrapped meters too: an emptied lantern is refilled when its meter restarts (startMeter)
      m.value = 0;
      m.done = false;
    }
    if (this.slice.meters['oil']) ctx.events.emit('lantern:request', { lit: false, refill: true });
    this.caughtBusy = false;
    this.engine.resume(true);
    if (atAnchor && anchor && ctx.era.current === 'today' && !this.slice.objective?.text?.includes('Q')) {
      const text = t('story.caught.backQ');
      this.slice.objective = { text, x: anchor.x, z: anchor.z, id: 'story.back' };
      this.objectives.set(this.slice.objective);
      ctx.events.emit('objective:set', { text, x: anchor.x, z: anchor.z, id: 'story.back' });
    }
    this.overlays.curtainUp(wake?.text ?? t('story.caught.wake'));
    const lines = this.wakeLines;
    this.wakeLines = [];
    for (const l of lines) ctx.events.emit('dialogue:say', l);
  }

  /** The `wake` place for being caught now: the checkpoint beat's (where the story resumes), else the running beat's. */
  private wakePlace(): (Checkpoint & { text?: string }) | null {
    const f = this.engine.chapter();
    const b = this.engine.beat();
    if (!f || !b) return null;
    const cpBeat = b.checkpoint ? f.beats.find((x) => x.id === b.checkpoint) : undefined;
    return cpBeat?.wake ?? b.wake ?? null;
  }

  epilogue(id: EndingId): Epilogue | null {
    const s = this.ctx.state.state;
    // the endings pack (epilog:line blocks, bible 06-enden §6) wins; the story file's data is the fallback
    const lines = [...this.ctx.content.dialogue.values()].filter((l) => !this.mutedLines.has(l.id));
    const name = this.slice.name;
    const fromPack = assembleEpilogue(lines, id, s.flags, { fill: (x) => substituteName(x, name) });
    if (fromPack) return fromPack;
    const f = this.files.find((x) => x.epilogue);
    if (!f?.epilogue) return null;
    return composeEpilogue(f.epilogue, id, { chronik: s.chronik, flags: s.flags });
  }

  // ------------------------------------------------------------------------------------------
  // per tick / frame
  // ------------------------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    this.time += dt;
    // presentation on game time: dialogue typing, the choice fuse, the caught curtain
    this.presenter.update(this.echoHold ? 0 : dt);
    this.overlays.tickChoice(dt);
    if (this.caughtBusy) {
      this.updateCaught(dt);
      // under the curtain the story stands still (as the paused game did before)
      if (this.caughtBusy) return;
    }
    if (this.queue.length) {
      const due = this.queue.filter((q) => q.at <= this.time);
      if (due.length) {
        this.queue = this.queue.filter((q) => q.at > this.time);
        for (const d of due.sort((a, b) => a.at - b.at)) if (d.gen === this.gen) d.fn();
      }
    }
    // fx did not answer the shift request → switch directly
    if (this.shiftPending) {
      this.shiftPending.age += dt;
      if (this.shiftPending.age > 1.5) {
        if (ctx.era.current !== this.shiftPending.to) ctx.era.set(this.shiftPending.to);
        this.shiftPending = null;
      }
    }
    this.updateShiftKey(dt);
    // station: solid walls
    if (ctx.era.current === 'today' && !ctx.player.flying) {
      const p = ctx.player.position;
      const o = FieldStation.pushOut(p.x, p.z);
      if (o) {
        p.x = o.x;
        p.z = o.z;
      }
    }
    this.updateHub();
    this.updateAfterword();
    const env = this.env();
    this.tickMeters(dt);
    this.updateInlineChoice(env);
    this.engine.tick(dt, env);
    if (this.pendingAutosave) {
      this.pendingAutosave = false;
      ctx.save.autosave('beat', true);
    }
  }

  /** The follow pack of ending C is out (in the era it was configured in). */
  private followEra: Era | null = null;

  /**
   * Ending C ("Behalten", bible 06-enden §5/§7.2): after the credits Q stays open, the past is at
   * night and the five hounds follow you there at a distance — hunt mode 'follow', harmless.
   */
  private updateAfterword(): void {
    const s = this.slice;
    const ctx = this.ctx;
    if (s.ending !== 'keep' || !s.finished) return;
    const era = ctx.era.current;
    if (era === 'today') {
      this.followEra = null;
      return;
    }
    if (s.lookPast?.era !== era || s.lookPast.time !== 'night') {
      s.lookPast = { era, time: 'night' };
      this.applyLook();
    }
    // the pack lives in one era (hunt stops it on every change): bring it back after each Wechsel
    if (this.followEra === era || this.shifting) return;
    this.followEra = era;
    const p = ctx.player.position;
    this.configureThreat({ kind: 'pack', active: true, mode: 'follow', hounds: 5, pikeur: false, intensity: 0.3, sight: 30, center: { x: p.x, z: p.z }, radius: 300 });
  }

  /** What the story's conditions may look at right now. */
  private env(): StoryEnv {
    const ctx = this.ctx;
    const s = ctx.state.state;
    return {
      era: ctx.era.current,
      x: ctx.player.position.x,
      z: ctx.player.position.z,
      flags: s.flags,
      inventory: s.inventory,
      chronik: s.chronik,
      scan: ctx.world.scanMode,
      map: ctx.world.mapMix > 0.5,
      stance: ctx.player.stance,
      lantern: ctx.player.stats.lanternLit,
      caseFacts: (id) => ctx.content.cases.get(id)?.entries.filter((e) => e.kind === 'fact').map((e) => e.id) ?? null,
      room: this.slice.room,
      meters: Object.fromEntries(Object.values(this.slice.meters).map((m) => [m.id, m.value])),
      readingFlag: (id) => this.entryFlag(id),
      speed: ctx.player.flying ? 0 : ctx.player.stats.speed,
    };
  }

  /**
   * The shift anchor lives in the state flags (persisted; the same protocol fx documents):
   * shift.allowed === true, shift.target = era, optional shift.x/z/r (no x/z: anywhere).
   */
  private anchorFromFlags(): { to: Era; x: number; z: number; r: number; anywhere: boolean } | null {
    const f = this.ctx.state.state.flags;
    const to = f['shift.target'];
    if (f['shift.allowed'] !== true || !isEra(to)) return null;
    const x = f['shift.x'] === undefined ? NaN : Number(f['shift.x']);
    const z = f['shift.z'] === undefined ? NaN : Number(f['shift.z']);
    return { to, x, z, r: Number(f['shift.r']) || 30, anywhere: !Number.isFinite(x) || !Number.isFinite(z) };
  }

  /**
   * Q (the story owns the key; fx only performs the transition): press at the anchor to cross,
   * hold in the past to return.
   */
  private updateShiftKey(dt: number): void {
    const ctx = this.ctx;
    if (this.caughtBusy || this.shiftPending || this.shifting) {
      this.qHold = 0;
      return;
    }
    const era = ctx.era.current;
    const p = ctx.player.position;
    if (era === 'today') {
      this.qHold = 0;
      if (!ctx.input.wasPressed('shift')) return;
      const a = this.anchorFromFlags();
      if (a && (a.anywhere || Math.hypot(p.x - a.x, p.z - a.z) <= a.r)) this.requestShift(a.to, 'anchor');
      else if (a || ctx.state.state.flags['shift.allowed'] === false) ctx.ui.toast(t('story.shift.notHere'), 2200);
      return;
    }
    if (ctx.input.isDown('shift')) {
      // bible rule (Laub, prologue): "Es geht nicht, solange Sie jemand ansieht" — no way home
      // while the pack is on you: chasing state from hunt:alert, or alert ≥ 0.8 (mid-catch);
      // a breather or hiding opens it again
      const hunt = ctx.state.state.systems['hunt'] as { alert?: unknown } | undefined;
      if (this.packChasing || (typeof hunt?.alert === 'number' && hunt.alert >= 0.8)) {
        this.qHold = 0;
        if (this.time - this.blockedToastAt > 3) {
          this.blockedToastAt = this.time;
          ctx.ui.toast(t('ui.hud.return_blocked'), 2200);
        }
        return;
      }
      this.qHold += dt;
      if (this.qHold > 1.2) {
        this.qHold = 0;
        this.requestShift('today', 'return');
      }
    } else this.qHold = 0;
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    if (!this.hooksInstalled && window.kq) this.installHooks();
    // a modal choice pauses the game: its fuse burns on in real time (kq.step drives it headless)
    if (ctx.pause.paused && !ctx.loop.manual && this.overlays.choiceOpen && !this.overlays.choiceInline) this.overlays.tickChoice(dt);
    // title cards run on game time: they wait behind the pause menu / a modal
    this.overlays.tickCard(ctx.pause.paused ? 0 : Math.min(dt, 0.1));
    for (const m of Object.values(this.slice.meters)) if (!isWrapped(m.id)) this.overlays.gauge(m.id, m.label ?? m.id, m.value);
    const p = ctx.player.position;
    const heading = ((-ctx.player.yaw * 180) / Math.PI + 360) % 360;
    const hudVisible = !ctx.ui.hud.el.classList.contains('kq-hidden');
    const inv = ctx.state.state.inventory;
    const compass = inv.items.includes('item.bussole') || !!ctx.state.state.flags['story.compass'];
    const questLed = typeof document !== 'undefined' && !!document.querySelector('.kqq-tracker .kqq-tq.kqq-main');
    this.objectives.frame(dt, p.x, p.z, heading, { compass, visible: hudVisible, reducedMotion: ctx.settings.state.reducedMotion, questLed });
    const today = ctx.era.current === 'today';
    this.station.setVisible(today);
    if (today) this.station.frame(dt, ctx.settings.state.reducedMotion);
    this.layer.classList.toggle('kqs-reduced', ctx.settings.state.reducedMotion);
    this.presenter.el.style.visibility = hudVisible && !this.echoHold && !this.talking ? '' : 'hidden';
  }

  private installHooks(): void {
    const kq = window.kq;
    if (!kq) return;
    this.hooksInstalled = true;
    kq.story = {
      goto: (chapter, beat) => this.goto(chapter, beat),
      state: () => ({
        ...structuredClone(this.slice),
        dialogue: this.presenter.current,
        pendingLines: this.presenter.pending,
        inHub: this.inHub,
        scheduled: this.queue.length,
        era: this.ctx.era.current,
      }),
      skip: () => {
        this.cancelScheduled();
        this.engine.skip();
      },
      start: (name) => this.start(name ?? t('story.name.suggest')),
      say: (speaker, text) => this.ctx.events.emit('dialogue:say', { speaker, text }),
      finishTyping: () => this.presenter.finishTyping(),
      flush: () => this.flush(),
      caught: (by = 'pack', holdMs) => {
        if (holdMs) this.caughtHold = holdMs;
        this.ctx.events.emit('player:caught', { by });
      },
      hub: (open = true) => (open ? this.hub.show() : this.hub.close()),
      ending: (id) => this.endings.show(id),
      credits: () => this.endings.credits(),
      epilogue: (id) => this.epilogue(id),
      choose: (i) => this.overlays.pickChoice(i),
      look: (time, era) => {
        if (era && era !== 'today') this.slice.lookPast = time === 'day' ? null : { era, time };
        else this.slice.look = time;
        this.applyLook();
      },
      meters: () => structuredClone(this.slice.meters),
      meter: (id, value) => {
        const m = this.slice.meters[id];
        if (m) m.value = Math.max(0, Math.min(1, value));
      },
      room: (id) => {
        const cur = this.slice.room;
        const ev = this.ctx.events as unknown as { emit(n: string, p: unknown): void };
        const full = (r: string) => {
          const building = `KB-${r.split('.')[0] ?? ''}`;
          return { roomId: r, building, id: `${building}/${r}` };
        };
        if (cur && cur !== id) ev.emit('room:leave', full(cur));
        if (id) ev.emit('room:enter', { ...full(id), name: id });
      },
      choice: () => this.overlays.choiceId,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.station.object.removeFromParent();
  }
}

let rt: StoryRuntime | null = null;

export default defineSystem({
  id: 'story',
  init(ctx) {
    rt = new StoryRuntime(ctx);
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
