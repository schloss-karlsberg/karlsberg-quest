/**
 * Story feature: data-driven chapters/beats (content/story/*.story.json), the dialogue presenter,
 * objectives with Laub's compass, the home base at the Quelle, the new-game flow on the title, being
 * caught, endings and credits.
 *
 * Talks to other features only through events (contracts.ts + the story-private events below)
 * and `ctx.state`.
 */
import './story.css';
import './strings';
import { fastManualSteps } from '../../core/bullet';
import type { GameContext } from '../../core/context';
import { type Era, ERA_INFO, isEra } from '../../core/era';
import { defineSystem } from '../../core/systems';
import { hasString, t } from '../../i18n';
import { ERA_LOOKS, type EraLook } from '../../world/eraPresets';
import type { NpcPlacement, ThreatConfig, ThreatKind } from '../contracts';
import { creditSections } from '../party/creditContent';
import { isBarkLine, pickSequence } from '../../content/triggers';
import { isCleared } from '../../rpg/enemy-groups';
import { assembleEpilogue } from './endings/assemble';
import { isWrapped, newMeter, tickMeter } from './meters';
import { Voice } from './dialogue/voice';
import { VoiceClips, type VoiceClipStats } from './dialogue/voiceClips';
import { sayLineIds } from './dialogue/voiceManifest';
import { DialoguePresenter, holdSeconds, substituteName } from './dialogue/presenter';
import { speakerMeta } from './dialogue/speakers';
import { DEFAULT_VISITOR_NAME, type MeterState, StoryEngine, type StoryEnv, type StorySlice, createStorySlice, evaluate, runTeleport, runsOnResume, waitsForChapterCard } from './engine';
import { composeEpilogue, type Epilogue } from './endings/epilogue';
import { endingScenes } from './endings/scenes';
import { EndingStage } from './endings/stage';
import { EndingScreen } from './endings/ui';
import { HOME, atHome, bringHome } from './hub/home';
import { ObjectiveView, objectivePoint } from './objectives';
import { StoryOverlays, cardClockDt } from './overlays';
import { keepsOnBeatExit, retireScheduled, takeDueActions, type Scheduled } from './schedule';
import { playStorySound, playStorySoundAction } from './sfx';
import { acceptTourDeerPhoto, loadBundledStories, missingTourChestnuts, restoreTourDeerPhoto, storiesInPlay } from './stories';
import { installTitleFlow } from './title/flow';
import { ENDING_SLOT } from './title/actions';
import { pauseHooks } from '../../ui/menus';
import { h } from '../../ui/dom';
import { addPausePage } from '../../ui/pause-pages';
import { actionLabel } from '../../ui/actionLabel';
import { type Action, type Checkpoint, type ChoiceAction, type Condition, type EndingId, type FlagValue, type LookTime, type MeterAction, type NpcAction, type PromptAction, type StoryFile, isWalkAction } from './types';
import type { WalkRequest } from '../walk/types';
import type { AnimalAction } from '../animals/types';
import type { CinematicPlay } from '../cinematic/types';
import type { GameEvents } from '../../core/events';
import type { DialogueItem } from './dialogue/presenter';
import { knownPoints } from '../travel/points';

/** The nearest Vermessungspunkt the player has measured in (or knows) to x/z. */
function nearestSurveyed(travel: unknown, x: number, z: number): { name: string; x: number; z: number; d: number } | null {
  const sl = (travel ?? {}) as { activated?: string[]; announced?: string[] };
  let best: { name: string; x: number; z: number; d: number } | null = null;
  for (const p of knownPoints(sl.activated ?? [], sl.announced ?? [])) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (!best || d < best.d) best = { name: p.name, x: p.x, z: p.z, d };
  }
  return best;
}

// ---- story-private state & events (declaration merging; see contracts.ts) -------------------
declare module '../../core/state' {
  interface SystemStates {
    story: StorySlice;
  }
}
declare module '../../core/events' {
  interface GameEvents {
    /** The player was brought home to the Quelle (HOME.spawn): Q held in the past (contract C4). */
    'home:arrived': { reason: 'return' | 'caught' | 'checkpoint' };
    /** Free-form story cue for other features (e.g. { id: 'k2.fire.start' }). */
    'story:cue': { id: string; data?: Record<string, FlagValue> };
    /** The credits were closed (the story is finished). */
    'story:credits': Record<string, never>;
    /** A choice was answered (option = the option's key, or its index). */
    'story:choice': { id: string; option: string };
    /** An inline choice started or stopped accepting answers. */
    'story:inline-choice': { open: boolean };
    /** A required line is queued or playing. The phone must stay down. */
    'story:phone-block': { active: boolean };
    /** A story meter ran full (meter action `full`). */
    'story:meter-full': { id: string };
  }
}

export interface StoryHooks {
  /** Jump to a chapter (and beat). */
  goto(chapter: string, beat?: string): void;
  /** Copy of the story slice plus runtime info. */
  state(): StorySlice & { dialogue: DialogueItem | null; pendingLines: number; inHub: boolean; scheduled: number; era: Era };
  /** Ids of the lines shown on screen so far this session, oldest first (tests). */
  shown(): string[];
  /** Complete the current beat. */
  skip(): void;
  /** Start a new story (prologue) with a name. */
  start(name?: string): void;
  /** Say a line (an `id` lets a recorded clip play for it). */
  say(speaker: string, text: string, id?: string): void;
  /** Recorded voices: loader and playback counters, and preloading by line id (tests). */
  voice: {
    stats(): VoiceClipStats & { clips: number; murmured: number; lastClip: string | null; playing: boolean; ctx: string };
    preload(ids: string[]): void;
  };
  /** Complete typing of the current line (screenshots). */
  finishTyping(): void;
  /** Run all delayed actions now. */
  flush(): void;
  /** Emit player:caught; `holdMs` keeps the black curtain down longer (screenshots). */
  caught(by?: ThreatKind, holdMs?: number): void;
  ending(id?: EndingId, staged?: boolean): void;
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
  /** The staged ending playing in the engine (before the text card). */
  stage(): { active: boolean; t: number };
  /** Skip the staged ending (opens the card). */
  stageSkip(): void;
  /** Hold the staged ending at time t (screenshots; null runs on). */
  stageHold(t: number | null): void;
}
declare module '../../debug/hooks' {
  interface KqHooks {
    story?: StoryHooks;
  }
}

// ---- looks for the present day ----------------------------------------------------------------
type LookPatch = { [K in keyof EraLook]?: Partial<EraLook[K]> } & { disc?: EraLook['disc'] };
const LOOKS: Record<Exclude<LookTime, 'day'>, LookPatch> = {
  // the guided tour (tour slice v0, bible 01-prolog §9 look `tour`): mid-November, about 14:45,
  // the sun low in the south-west, golden leaves, the shade a little dusky and blue
  tour: {
    sun: { azimuth: 214, elevation: 13, color: '#ffc98a', intensity: 2.7 },
    sky: { zenith: '#4a73a2', horizon: '#e8cfa6', below: '#5a5d58', clouds: 0.55, cloudColor: '#f1dcc0', stars: 0 },
    ambient: { sky: '#8197b5', ground: '#5c442c', intensity: 0.78 },
    fog: { color: '#b3afa4', sunColor: '#f4c27e', density: 0.00072, heightDensity: 0.0034, ground: 0.0036 },
    grade: { exposure: 1.08, saturation: 1.12, contrast: 1.1, lift: '#0a0b10', gain: '#ffeed8', vignette: 0.34, grain: 0.03 },
    season: 1.15,
  },
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
    // a readable moonlit night (playtest: "nearly black, you can't read the terrain or see where
    // to go"): a brighter cool moon, blue sky fill, a lighter blue haze for depth
    sun: { azimuth: 150, elevation: 34, color: '#a9c2ee', intensity: 1.15 },
    disc: 'moon',
    sky: { zenith: '#081022', horizon: '#2b3a58', below: '#121722', clouds: 0.4, cloudColor: '#34405c', stars: 1 },
    ambient: { sky: '#4c5f8a', ground: '#262a36', intensity: 0.95 },
    fog: { color: '#26314a', sunColor: '#46557a', density: 0.0014, heightDensity: 0.006, ground: 0.011 },
    grade: { exposure: 1.75, saturation: 0.7, contrast: 1.06, lift: '#070a12', gain: '#dfe8ff', vignette: 0.5, grain: 0.05 },
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

/** The page's document when it can report visibility (absent in Node tests and their stubs). */
function pageDocument(): Document | null {
  return typeof document !== 'undefined' && typeof document.addEventListener === 'function' ? document : null;
}

const CAUGHT_KEY: Record<ThreatKind, string> = { pack: 'story.caught.pack', fire: 'story.caught.fire', oblivion: 'story.caught.oblivion', combat: 'story.caught.combat' };
/** Wrapped meter → the threat it starts (oil drives hunt's lantern via lantern:request). */
const METER_THREAT: Record<string, ThreatKind> = { smoke: 'fire', vergessen: 'oblivion' };
/** Dialogue triggered by these events belongs to the Chronik's echo scenes (it shows the subtitles). */
const ECHO_EVENTS = new Set(['echo:start', 'echo:play', 'echo:end']);
const QUIET_EVENTS = new Set(['player:step', 'dialogue:say', 'hunt:alert', 'lantern:oil', 'fire:progress', 'oblivion:progress']);
/** Pack lines of these events are never spoken by the trigger runner (assembled elsewhere). */
const ASSEMBLED_EVENTS = new Set(['epilog:line', 'story:ending']);

/** Where a run of actions belongs (RunOptions.beat / where). */
interface RunScope {
  beat: string | null;
  where: { x: number; z: number; r: number } | null;
}

/** Barks and skill remarks: low priority in the dialogue queue (hints are not: the player is stuck). */
const isLowLine = (id: string | undefined) => !!id && (isBarkLine(id) || id.startsWith('laub.skill.'));
/** Story lines about the past's dangers: dropped when the era they were said in is left. */
const ERA_BOUND_IDS = new Set(['laub.p.zurueck', 'laub.p.hinlegen']);

/** Longer lines than this (characters) are lore in a fight: held until it is over. */
const COMBAT_LINE_MAX = 120;
/** These quest gates must play again before Peter leaves the Ehrenhof. */
const PETER_REPLAY_QUESTS = ['q.k3.nachmittag', 'q.k3.buch', 'q.k3.strohmann'];

class StoryRuntime {
  readonly engine: StoryEngine;
  readonly files: StoryFile[];
  readonly layer: HTMLElement;
  readonly presenter: DialoguePresenter;
  readonly objectives: ObjectiveView;
  readonly overlays: StoryOverlays;
  readonly endings: EndingScreen;
  readonly stage: EndingStage;
  readonly voice: Voice;
  private activeSpeaker: string | null = null;
  /** Recorded clips, when browser playback is enabled. */
  readonly clips: VoiceClips | null;
  private time = 0;
  private gen = 0;
  private queue: Scheduled[] = [];
  /**
   * The opening beat's timeline while the chapter card shows (M-11): `at` relative to the beat's
   * start; scheduled from „now“ once the card has faded (`overlays.holdsLines` goes false).
   */
  private gated: Scheduled[] = [];
  /** The chapter card just went up: the next beat entered is the opening beat whose timeline waits. */
  private gatePending = false;
  private gateBeat: string | null = null;
  /** The opening beat whose timeline waits in `gated` (its clocks restart at the release). */
  private gatedAt: { chapter: string; beat: string } | null = null;
  /** Scope of the actions being executed right now (lines emitted from them are tagged with it). */
  private scope: RunScope | null = null;
  /** Lines emitted in one go (a trigger's sequence) share a group id. */
  private lineGroup = 0;
  private pendingName: string | null = null;
  private pendingAutosave = false;
  inHub = false;
  private hubToastShown = false;
  private storyPrompt = false;
  /** The story's prompt on screen (re-rendered when Touch-Steuerung switches) and the mode it was shown in. */
  private promptShown: PromptAction | null = null;
  private promptTouch = false;
  private shiftPending: { to: Era; age: number; reason?: string } | null = null;
  private qHold = 0;
  /** The walk system offers „Zur Gruppe“ (group:find): Q is its hold then. */
  private findPrompt = false;
  /** „Zur Gruppe“ under way: the teleport when the fade is black (game time; never dropped). */
  private rejoin: { t: number; x: number; z: number; yaw: number } | null = null;
  /** The pack is chasing the player (hunt:alert): holding Q does not bring you home (bible: "nicht, solange Sie jemand ansieht"). */
  private packChasing = false;
  private blockedToastAt = -99;
  /** An fx transition is running (between shift:begin and shift:done). */
  private shifting = false;
  /** A Chronik echo is playing (between echo:start and echo:end). */
  private echoHold = false;
  private caughtBusy = false;
  /** Story toasts held back until the action calms down. */
  private calmToasts: { text: string; ms?: number }[] = [];
  private lastSaid = new Map<string, number>();
  /** Dialogue that is never spoken by the trigger runner (example packs, placeholder packs). */
  private readonly mutedLines: Set<string>;
  private hooksInstalled = false;
  private quietCard = false;
  /** Seconds the caught curtain has been down (game time); hold = caughtHold / 1000. */
  private caughtT = 0;
  /** game:start has run at least once. */
  private started = false;
  /** Where and by what the player was last caught (a fight's wake goes to the nearest surveyed point). */
  private caughtAt: { x: number; z: number; by: ThreatKind; boss: boolean } | null = null;
  private caughtHoldS = 2.4;
  /** Lines triggered while the curtain is down: spoken when it lifts. */
  private wakeLines: { speaker: string; text: string; id?: string }[] = [];
  /** The open choice (for inline `when` options). */
  private choiceAction: ChoiceAction | null = null;
  /** An NPC conversation is open (npc:conversation). */
  private talking = false;
  private phoneBlocked = false;
  /** Ids of the lines shown so far (hook `shown`, tests). */
  private readonly shownIds: string[] = [];
  private stillT = 0;
  private lastPos = { x: 0, z: 0 };
  private entryFlags: Map<string, string> | null = null;
  private readonly unbindGuideVoice: () => void;
  private readonly unwatchState: () => void;
  private readonly unbindCardPause: () => void;
  private readonly syncCardPause = (): void => this.overlays.setCardPaused(this.ctx.pause.paused, pageDocument()?.hidden === true);

  constructor(private readonly ctx: GameContext, credits: ReturnType<typeof creditSections>) {
    this.files = storiesInPlay(loadBundledStories(), ctx.params);
    this.engine = new StoryEngine(this.files, () => this.slice, {
      run: (actions, o) => this.run(actions, o.resume, { beat: o.beat ?? null, where: o.where ?? null }, o.source),
      chapterEntered: (f, o) => this.chapterEntered(f, o),
      beatEntered: (ch, b, o) => {
        // the last beat's delayed lines are stale now; its delayed state changes happen at once
        this.retireScheduled(b.id);
        this.presenter.retireBeat(b.id);
        // the chapter card is up: this opening beat's timeline waits for it (M-11)
        this.gateBeat = this.gatePending && !o.resume ? b.id : null;
        this.gatePending = false;
        // the beat's spoken lines: fetch and decode their clips now (never waits)
        this.clips?.preload(sayLineIds(b).map((id) => ({ id })));
        ctx.events.emit('story:beat', { chapter: ch, beat: b.id, ...(o.resume ? { resume: true as const } : {}) });
        if (!o.resume) this.pendingAutosave = true;
        this.clearPrompt();
      },
      chapterCompleted: (f) => {
        if (f.unlocks?.length || f.next) ctx.ui.toast(t('story.chapter.done') + ': ' + f.title_de, 3500);
        if (f.chapter === 'enden') this.pendingAutosave = true;
      },
    });

    // example packs never speak; placeholder packs (content/test) only with ?placeholder
    const placeholder = ctx.params.has('placeholder');
    const hidden = ctx.content.packs.filter((p) => p.file.includes('/examples/') || (p.pack.placeholder && !placeholder));
    this.mutedLines = new Set(hidden.flatMap((p) => (p.pack.dialogue ?? []).map((d) => d.id)));
    this.layer = ctx.ui.layer('story');
    this.layer.classList.remove('kq-hidden');
    this.unbindGuideVoice = ctx.audio.bindVoiceEmitter('imhoff', () => {
      const guide = ctx.era.current === 'today' ? ctx.people?.bySpeaker('imhoff') : undefined;
      if (!guide) return undefined;
      const { x, y, z } = guide.root.position;
      return { x, y: y + guide.info.height * 0.9, z };
    });
    this.voice = new Voice(ctx.audio);
    this.clips = !fastManualSteps(ctx.params) && typeof window !== 'undefined' && typeof fetch === 'function' ? new VoiceClips(ctx.audio) : null;
    this.clips?.init();
    this.presenter = new DialoguePresenter({
      layer: this.layer,
      meta: (id) => speakerMeta(id, ctx.content),
      voice: this.voice,
      clips: this.clips,
      reducedMotion: () => ctx.settings.state.reducedMotion,
      name: () => this.slice.name,
      touch: () => ctx.input.touchMode,
      valid: (item) => this.lineStillValid(item),
      onShow: (item) => {
        if (!item.id) return;
        this.shownIds.push(item.id);
      },
      // history and long remarks wait out a fight; barks and short calls go on (playtest round 3)
      // a boss's reveal (combat: title card, camera, sting) holds everything but 'now' lines;
      // so does a chapter's title card while it shows and fades: the opening beat's own timeline
      // waits for it (run / releaseGate), this holds lines of other sources (a quest offer, barks)
      held: (item) =>
        (item.priority !== 'now' && (ctx.ui.hud.acting('reveal') || this.overlays.holdsLines)) ||
        (ctx.ui.hud.acting('combat') && item.priority !== 'now' && item.priority !== 'low' && (!!item.lore || item.text.length > COMBAT_LINE_MAX)),
    });
    this.objectives = new ObjectiveView(this.layer, ctx.ui.hud);
    // the Bussole's own cues (the needle flung round, ticking back, the lid springing open)
    ctx.events.on('story:cue', ({ id, data }) => {
      if (id.startsWith('bussole:')) this.objectives.cue(id, data ?? {}, ctx.settings.state.reducedMotion);
    });
    this.overlays = new StoryOverlays(this.layer, ctx.ui.modals, (open) => ctx.events.emit('story:inline-choice', { open }), ctx.ui.hud, () => ctx.settings.state.reducedMotion);
    this.syncCardPause();
    this.unbindCardPause = ctx.events.on('game:pause', this.syncCardPause);
    pageDocument()?.addEventListener('visibilitychange', this.syncCardPause);

    addPausePage({
      id: 'chapters',
      label: t('story.chapter.title'),
      order: 80,
      render: (el) => this.renderChapters(el),
    });

    this.stage = new EndingStage(ctx);
    this.endings = new EndingScreen({
      modals: ctx.ui.modals,
      attribution: () => ctx.data.attribution.items,
      credits,
      epilogue: (id) => this.epilogue(id) ?? { ending: id, intro: '', lines: [], object: '', outro: '', coda: '', variants: {} },
      chosen: (id) => {
        this.slice.ending = id;
        ctx.state.update((s) => (s.flags['flag.end'] = endingScenes()[id].flag), 'story');
        ctx.events.emit('story:ending', { id });
        ctx.save.autosave('ending', true);
      },
      finished: () => this.finish(),
      party: (id) => this.toParty(id),
      sound: (k) => playStorySound(ctx.audio, k, null, 'verloren'),
      reducedMotion: () => ctx.settings.state.reducedMotion,
      name: () => this.slice.name,
      stage: (id, done) => this.stage.start(id, done),
    });

    installTitleFlow({ settings: ctx.settings, modals: ctx.ui.modals, onName: (n) => (this.pendingName = n) });
    // post-game: the pause menu offers the choice at the table again (the HUD line says so too)
    pauseHooks.extraActions = () =>
      this.slice.finished && ctx.save.has(ENDING_SLOT) ? [{ label: t('ui.menu.ending_again'), testid: 'pause-ending-again', run: () => void ctx.save.load(ENDING_SLOT) }] : [];

    // ---- events
    ctx.events.onAny((name, payload) => this.onEvent(name, payload));
    ctx.events.on('dialogue:say', (p) => this.showLine(p));
    ctx.events.on('photo:open', () => this.presenter.setSuspended(true));
    ctx.events.on('photo:close', () => this.presenter.setSuspended(false));
    ctx.events.on('photo:good', (shot) => {
      // Photo has already booked this shot. Save the accepted outcome with its album entry.
      if (acceptTourDeerPhoto(this.slice, ctx.state.mutable.flags, shot)) ctx.save.autosave('tour-deer-photo', true);
    });
    ctx.events.on('game:start', ({ resumed }) => this.onStart(resumed));
    ctx.events.on('settings:change', ({ key }) => {
      if (key === 'bindings' && this.promptShown?.action) this.renderPrompt();
    });
    // the credits over the party ended (naturally, skipped, or a load while they played): the story is finished
    ctx.events.on('credits:done', () => {
      if (this.slice.ending && !this.slice.finished) this.finish();
    });
    this.unwatchState = ctx.state.subscribe((_state, reason) => {
      if (reason === 'load' || reason === 'new') this.cancelCaught();
    });
    ctx.events.on('save:loaded', () => {
      // a curtain that was down belongs to the outgoing game: no wake teleport, meter reset or
      // shift home in the loaded one
      this.cancelCaught();
      this.resync();
      this.presenter.clear();
      // a load during play (the pause menu's „Ende noch einmal wählen“) resumes the beat like a
      // boot does — e1's onResume opens the choice at the table (playtest round 4: it never came)
      if (this.started && !ctx.pause.reasons.has('title') && this.slice.active) this.resumeFromSave();
    });
    ctx.events.on('player:caught', ({ by, soft, family, boss }) => {
      const p = this.ctx.player.position;
      this.caughtAt = { x: p.x, z: p.z, by, boss: boss === true };
      const key = family ? `story.caught.combat.${family}` : '';
      this.caught(by, { soft: soft === true, ...(key && hasString(key) ? { text: t(key) } : {}), ...(by === 'combat' ? { sub: t('story.caught.sub.combat') } : {}) });
    });
    // an echo shows its own date in the era label (playtest round 3: "Heute · 2025" over 1840)
    ctx.events.on('echo:start', ({ id }) => {
      const when = this.echoDate(id);
      if (when) ctx.ui.hud.setEraLabel(when);
    });
    ctx.events.on('echo:end', () => ctx.ui.hud.setEraLabel(t(ERA_INFO[ctx.era.current].labelKey)));
    ctx.events.on('era:change', ({ to }) => {
      this.slice.room = null;
      this.dropShiftObjective(to);
      if (to === 'today' || this.slice.lookPast?.era === to) this.applyLook();
    });
    // finding the group (walk/find.ts): while „Zur Gruppe“ is offered, Q belongs to it; the hold
    // ends in a fade, the teleport behind the group, and the fade back
    ctx.events.on('group:find', ({ prompt }) => (this.findPrompt = prompt));
    ctx.events.on('group:rejoin', ({ x, z, yaw }) => {
      this.overlays.fade(1, 0.45);
      this.rejoin = { t: 0.5, x, z, yaw };
    });
    ctx.events.on('cinematic:start', () => this.clearPrompt());
    ctx.events.on('shift:begin', () => {
      this.clearPrompt();
      this.shiftPending = null;
      this.shifting = true;
    });
    ctx.events.on('shift:done', ({ to, reason }) => {
      this.shifting = false;
      // Q held in the past: home to the Quelle (WP-04); not after being caught (its own wake)
      this.homeAfterShift({ to, reason });
      // where the oil is not the chapter's timer (no oil meter), every trip into the past starts
      // with a full lantern (playtest K4: it ran dry mid-chapter and nothing refilled it)
      if (to !== 'today' && !this.slice.meters['oil']) ctx.events.emit('lantern:request', { lit: ctx.player.stats.lanternLit, refill: true });
    });
    // while the Chronik plays an echo (ghosts + its own subtitles) the presenter waits out of sight
    // (the card hold follows at once: the memory's own page is queued on echo:end and opens then)
    ctx.events.on('echo:start', () => {
      this.echoHold = true;
      ctx.ui.cards.hold('echo', true);
    });
    ctx.events.on('echo:end', () => {
      this.echoHold = false;
      ctx.ui.cards.hold('echo', false);
    });
    // readings: mirror the Chronik's reading flag into the entry's story flag (CaseEntry.flag)
    ctx.events.on('chronik:fill', ({ caseId, entryId }) => this.mirrorReading(caseId, entryId));
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
    this.started = true;
    const params = this.ctx.params;
    if (this.pendingName !== null) {
      const name = this.pendingName;
      this.pendingName = null;
      this.start(name);
      return;
    }
    if (params.has('story') && !this.slice.active && !this.slice.finished) {
      this.start(params.get('name') ?? undefined);
      return;
    }
    this.resync();
    if (resumed && this.slice.active) this.resumeFromSave();
  }

  private resumeFromSave(): void {
    this.engine.resume(false);
    const s = this.slice;
    // The modal is transient, but e2 already saved the ending and is waiting for its button.
    if (s.chapter === 'enden' && s.beat === 'e2' && s.ending && !s.finished && !this.ctx.state.state.flags['story.party']) {
      this.endings.showEpilogue(s.ending);
    }
  }

  /** Re-apply persistent presentation after a load. */
  private resync(): void {
    this.cancelScheduled();
    this.overlays.closeChoice();
    this.choiceAction = null;
    // a load never resumes in the middle of a fade (fade actions are one-shot)
    this.overlays.fade(0, 0);
    const s = this.slice;
    const freeRoam = s.finished && !s.active && s.chapter === 'enden' && (!s.objective || s.objective.id === 'end.frei')
      ? this.engine.chapters.get('enden')?.beats.flatMap((beat) => beat.exit ?? [])
        .find((action) => action.do === 'objective' && action.id === 'end.frei')
      : undefined;
    if (freeRoam) this.exec(freeRoam);
    else this.objectives.set(s.objective);
    this.applyLook();
    this.mirrorAllReadings();
    // post-game (bible 06-enden §7.2): the party stays at dusk; people are not saved, so set it again
    if (s.finished && s.ending) this.ctx.events.emit('party:set', { variant: s.ending });
  }

  /** The credits are over (the old credits page closed, or `credits:done` after the party). */
  private finish(): void {
    const ctx = this.ctx;
    // the ending card told the scene; nothing the ending queued plays again after the credits
    this.presenter.clear();
    this.slice.finished = true;
    ctx.state.update((s) => (s.flags['story.credits'] = true), 'story');
    ctx.events.emit('story:credits', {});
    ctx.save.autosave('credits', true);
  }

  /**
   * The epilogue's button (bible 06-enden §8): inside the endings chapter the flag `story.party`
   * ends beat e2 and beat e3 builds the party, plays Gerold's speech and rolls the credits (cue
   * bridge). Outside it (debug: `kq.story.ending(id)`) the party and its credits start directly.
   */
  private toParty(id: EndingId): void {
    const ctx = this.ctx;
    const s = this.slice;
    if (s.active && s.chapter === 'enden') {
      ctx.state.update((st) => (st.flags['story.party'] = id), 'story');
      return;
    }
    const off = ctx.events.on('party:ready', () => {
      off();
      ctx.events.emit('party:credits', {});
    });
    ctx.events.emit('party:set', { variant: id });
  }

  start(name = DEFAULT_VISITOR_NAME): void {
    const first = this.engine.first;
    if (!first) return;
    const s = this.slice;
    Object.assign(s, createStorySlice(), { name: name.trim() || DEFAULT_VISITOR_NAME });
    this.objectives.set(null);
    // A dev chapter behind its URL switch replaces the tour on a new game.
    const dev = this.files.find((f) => f.dev);
    this.goto(dev?.chapter ?? first.chapter);
  }

  goto(chapter: string, beat?: string, replay?: readonly string[]): void {
    this.cancelScheduled();
    this.presenter.clear();
    // jumping between beats of the running chapter: no title card
    this.quietCard = !!beat && this.slice.active && this.slice.chapter === chapter;
    try {
      this.engine.goto(chapter, beat, { replay });
    } finally {
      this.quietCard = false;
    }
  }

  private chapterEntered(f: StoryFile, { resume, replay }: { resume: boolean; replay?: readonly string[] }): void {
    const ctx = this.ctx;
    ctx.events.emit('story:chapter', { id: f.chapter, ...(resume ? { resume: true as const } : {}), ...(replay ? { replay } : {}) });
    if (resume) {
      restoreTourDeerPhoto(this.slice, ctx.state.mutable.flags);
      if (ctx.era.current === 'today') {
        for (const a of missingTourChestnuts(f, this.slice, ctx.state.state.systems.progression)) this.exec(a);
      }
      return;
    }
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
    // the chapter card holds the opening beat's timeline and other sources' lines until it has faded (M-11)
    if (!this.quietCard) {
      this.overlays.card(f.title_de, f.sub_de, f.placeholder ? t('story.placeholder') : undefined, undefined, true);
      this.gatePending = true;
    }
  }

  // ------------------------------------------------------------------------------------------
  // actions
  // ------------------------------------------------------------------------------------------

  /**
   * Run an action list: delays are relative to the previous action; spoken lines take their time
   * (lines that will not be spoken — said once already — take none, so a retry is not 18 s of silence).
   */
  private run(actions: Action[], resume: boolean, scope: RunScope = { beat: this.slice.beat, where: null }, source = ''): void {
    let at = 0;
    // the opening beat's enter list while the chapter card shows: its timeline starts after the card
    const gate = !resume && this.gateBeat !== null && scope.beat === this.gateBeat && source.endsWith(':enter') && this.overlays.holdsLines;
    if (gate) {
      this.gateBeat = null;
      if (this.slice.chapter && scope.beat) this.gatedAt = { chapter: this.slice.chapter, beat: scope.beat };
    }
    for (const [i, a] of actions.entries()) {
      if (resume && !runsOnResume(a)) continue;
      at += a.delay ?? 0;
      // measure a line BEFORE it runs: an immediate say marks itself said, and would then take no time
      const text = a.do === 'say' ? (this.sayText(a) ?? '') : '';
      const waitFor = a.do === 'say' && a.wait ? (a.id ?? a.line) : undefined;
      const rest = waitFor && i + 1 < actions.length ? actions.slice(i + 1) : null;
      const exec = () => {
        this.exec(a, resume);
        if (!waitFor || !rest) return;
        const ready = () => !this.presenter.hasLine(waitFor, scope.beat);
        const continueRun = () => this.run(rest, resume, scope);
        if (ready()) continueRun();
        else this.schedule(0, continueRun, scope, false, ready);
      };
      if (gate && waitsForChapterCard(a, at)) this.gated.push({ at, gen: this.gen, fn: () => this.withScope(scope, exec), beat: scope.beat, keep: keepsOnBeatExit(a) });
      else if (at <= 0) this.withScope(scope, exec);
      else this.schedule(at, exec, scope, keepsOnBeatExit(a));
      if (rest) return;
      if (text && a.do === 'say') at += text.length / 42 + holdSeconds(text, a.ms) + 0.4;
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

  private schedule(delay: number, fn: () => void, scope: RunScope | null = null, keep = true, ready?: () => boolean): void {
    this.queue.push({ at: this.time + delay, gen: this.gen, fn: () => this.withScope(scope, fn), beat: scope?.beat ?? null, keep, ready });
  }

  /**
   * A new beat began: delayed actions of other beats are retired. Presentation (lines, toasts,
   * sounds, cards, echoes, choices) is dropped; state changes (objective, threat, flags, animals …)
   * run now, in order, so the story's bookkeeping never depends on how fast the player was.
   */
  private retireScheduled(beat: string): void {
    // the opening beat ended under its card: its waiting timeline is retired like scheduled actions
    // (state changes run now, presentation is dropped)
    if (this.gated.length) {
      for (const q of this.gated) this.queue.push({ ...q, at: this.time + q.at });
      this.gated = [];
    }
    if (this.gatedAt && this.gatedAt.beat !== beat) this.gatedAt = null;
    retireScheduled(this.queue, beat, this.gen);
  }

  private cancelScheduled(): void {
    this.gen++;
    this.queue = [];
    this.gated = [];
    this.gatePending = false;
    this.gateBeat = null;
    this.gatedAt = null;
  }

  /** The chapter card has faded (or let go): the opening beat's timeline starts counting now. */
  private releaseGate(): void {
    // the beat's timers (the p1 prompt's 12 s) count from now, like its timeline (M-11)
    const at = this.gatedAt;
    this.gatedAt = null;
    if (at) this.engine.restartClock(at.chapter, at.beat);
    if (!this.gated.length) return;
    for (const q of this.gated) this.queue.push({ ...q, at: this.time + q.at });
    this.gated = [];
    // what was due at time 0 runs now, in order (an objective before the quest offer after it)
    const due = this.queue.filter((q) => q.at <= this.time);
    if (!due.length) return;
    this.queue = this.queue.filter((q) => q.at > this.time);
    for (const d of due.sort((a, b) => a.at - b.at)) if (d.gen === this.gen) d.fn();
  }

  /** Run every scheduled action now (debug / tests). */
  flush(): void {
    this.releaseGate();
    let guard = 0;
    while (this.queue.length && guard++ < 200) {
      const list = this.queue.sort((a, b) => a.at - b.at);
      const next = list.shift()!;
      if (next.gen === this.gen) next.fn();
    }
  }

  /** Place / remove a ghostly NPC (the npc system's placements; the tour's walk ops go elsewhere). */
  private placeNpc(a: NpcAction): void {
    const ctx = this.ctx;
    const s = this.slice;
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
    if (a.pose) p.pose = a.pose;
    if (a.watch) p.watch = { ...a.watch };
    ctx.events.emit('npc:spawn', p);
  }

  private exec(a: Action, resume = false): void {
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
        ctx.events.emit('dialogue:say', { speaker, text, ms: a.ms, id, fiction: a.echo ? true : undefined, until: a.until, phoneDown: a.phoneDown });
        return;
      }
      case 'objective': {
        // the post-game line promises the pause menu's „Ende noch einmal wählen“: only when the
        // ending's save exists (with saving off it never does — playtest round 5)
        const text = a.id === 'end.frei' && !ctx.save.has(ENDING_SLOT) ? a.text?.split(' · ')[0] : a.text;
        const { x, z } = objectivePoint(a, ctx.state.state.systems.animals);
        if (!text) s.objective = null;
        else s.objective = { text, ...(x !== undefined && z !== undefined ? { x, z } : {}), ...(a.id ? { id: a.id } : {}) };
        this.objectives.set(s.objective);
        ctx.events.emit('objective:set', { text: text ?? null, x, z, id: a.id });
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
        // tips wait while a fight or chase is on (playtest round 2: "Halte [Q] …" over a boss kill)
        if (ctx.ui.hud.inAction) this.calmToasts.push({ text: a.text, ms: a.ms });
        else ctx.ui.toast(a.text, a.ms);
        return;
      case 'teleport':
        runTeleport(a, ctx.state.mutable.flags, (x, z, yaw) => this.teleport(x, z, yaw));
        return;
      case 'card':
        this.overlays.card(a.title, a.sub, a.note, a.seconds);
        return;
      case 'sound':
        playStorySoundAction(ctx, a);
        return;
      case 'look':
        if (a.era && a.era !== 'today') s.lookPast = a.time === 'day' ? null : { era: a.era, time: a.time };
        else s.look = a.time;
        this.applyLook();
        return;
      case 'prompt':
        if (!a.key && !a.text && !a.action) {
          this.clearPrompt();
        } else {
          this.promptShown = a;
          this.renderPrompt();
          this.storyPrompt = true;
        }
        return;
      case 'cue':
        if (a.id === 'k1.enge.resume') {
          if (resume) {
            const groups = ctx.state.state.systems.combat?.groups;
            // An existing second wave already restores its survivors through combat.
            const wave = groups?.['k1.enge.2'] ?? groups?.['k1.enge'];
            // Restore only the story latch so combat and progression keep the original rewards.
            if (wave && isCleared(wave)) this.engine.onEvent('enemy:cleared', { group: wave.group, kind: wave.kind });
          }
          return;
        }
        ctx.events.emit('story:cue', { id: a.id, data: a.data });
        return;
      case 'chronik':
        ctx.events.emit('chronik:open', a.caseId ? { caseId: a.caseId } : {});
        return;
      case 'unlock':
        if (!s.unlocked.includes(a.chapter)) s.unlocked.push(a.chapter);
        return;
      case 'ending':
        // the save before the choice: "Ende noch einmal wählen" in the main menu loads it
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
        if (isWalkAction(a)) {
          // the tour group (contract C2): the walk system takes the fields minus do / delay / onResume
          const { do: _do, delay: _delay, onResume: _onResume, ...req } = a as Action & Record<string, unknown>;
          ctx.events.emit('npc:walk', req as unknown as WalkRequest);
          return;
        }
        this.placeNpc(a as NpcAction);
        return;
      }
      case 'cinematic': {
        const { do: _do, delay: _delay, onResume: _onResume, ...spec } = a;
        ctx.events.emit('cinematic:play', spec as CinematicPlay);
        return;
      }
      case 'animal': {
        const { delay: _delay, onResume: _onResume, ...req } = a;
        ctx.events.emit('animal:request', req as AnimalAction);
        return;
      }
      case 'fade':
        this.overlays.fade(a.to, a.seconds ?? 0.6);
        return;
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
        if (a.afterShift && (this.shifting || this.shiftPending)) {
          this.schedule(0, () => ctx.events.emit('quest:command', cmd), null, true, () => !this.shifting && !this.shiftPending);
        } else ctx.events.emit('quest:command', cmd);
        return;
      }
      case 'enemy': {
        if (a.op === 'despawn') {
          ctx.events.emit('enemy:despawn', { group: a.group });
          return;
        }
        if (!a.kind) return;
        const { do: _d, delay: _dl, onResume: _r, op: _op, x, z, era, near, ...rest } = a;
        let sx = x ?? ctx.player.position.x;
        let sz = z ?? ctx.player.position.z;
        // an ambush from the side the player is on: `near` m from them towards the place
        if (near !== undefined && x !== undefined && z !== undefined) {
          const px = ctx.player.position.x;
          const pz = ctx.player.position.z;
          const d = Math.hypot(x - px, z - pz);
          if (d > near) {
            sx = px + ((x - px) / d) * near;
            sz = pz + ((z - pz) / d) * near;
          }
        }
        ctx.events.emit('enemy:spawn', { ...rest, kind: a.kind, x: sx, z: sz, era: era ?? ctx.era.current });
        return;
      }
      case 'loot': {
        if (a.clear) {
          if (a.group && !a.id) ctx.events.emit('loot:clear', { quest: a.group });
          else if (a.id && !a.group) ctx.events.emit('loot:clear', { id: a.id });
          return;
        }
        if (!a.item || !a.id) return;
        const l: { id: string; item: string; x: number; z: number; era: Era; count?: number; room?: string; quest?: string } = {
          id: a.id,
          item: a.item,
          x: a.x ?? ctx.player.position.x,
          z: a.z ?? ctx.player.position.z,
          era: a.era ?? ctx.era.current,
        };
        if (a.count !== undefined) l.count = a.count;
        if (a.room) l.room = a.room;
        if (a.group) l.quest = a.group;
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
        if (before < at && m.value >= at) this.ctx.events.emit('dialogue:say', { speaker: 'laub', text: t(key), id: `laub.${key}`, priority: 'now' });
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
    } else if (!this.shifting && ctx.era.current !== to) this.shiftPending = { to, age: 0, reason };
    // no fx to finish the shift (it switched directly): home now, as shift:done would
    if (ctx.era.current === to && !ctx.systems.get('fx')) this.homeAfterShift({ to, reason });
  }

  /** A shift is done: after a Q-hold, home to the Quelle (HOME.spawn, facing the water) + `home:arrived`. */
  private homeAfterShift(e: { to: Era; reason?: string }): void {
    bringHome(e, {
      caught: this.caughtBusy,
      teleport: (x, z, yaw) => this.teleport(x, z, yaw),
      arrived: (reason) => this.ctx.events.emit('home:arrived', { reason }),
    });
  }

  private applyLook(): void {
    const ctx = this.ctx;
    const past = this.slice.lookPast;
    if (ctx.era.current === 'today') ctx.world.look = lookFor(this.slice.look);
    else if (past && past.era === ctx.era.current) ctx.world.look = lookFor(past.time, ctx.era.current);
    else return;
    ctx.world.applyLook();
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

  /**
   * The date an echo is from: a year named in its lines or card (Laub's 1840 at the Forsthaus
   * well, while the world shows 1796), else the era the echo belongs to. "Erinnerung · 1840".
   */
  echoDate(id: string): string | null {
    const c = this.ctx.content.clues.get(id);
    if (!c) return null;
    // the clue names its own date (playtest round 5: the 1840 echo said „Erinnerung · 1796“)
    if (c.echoDate_de) return t('story.echo.date', { when: c.echoDate_de });
    const lines = this.ctx.content.dialogueFor('echo:start').filter((l) => l.trigger.id === id);
    const texts = [...lines.map((l) => l.text_de), c.title_de, c.text_de ?? ''];
    for (const s of texts) {
      const m = /\b(1[78]\d\d)\b/.exec(s);
      if (m) return t('story.echo.date', { when: m[1]! });
    }
    const era = c.where?.era;
    return era && era !== 'today' && isEra(era) ? t('story.echo.date', { when: t(ERA_INFO[era].labelKey) }) : null;
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

  private showLine(p: GameEvents['dialogue:say']): void {
    const line = p.id ? this.ctx.content.dialogue.get(p.id) : undefined;
    const src = line?.sources?.[0];
    // tag the line: its beat, the place it is about, its priority (barks / hints of other features: low)
    const sc = this.scope;
    const low = isLowLine(p.id);
    const pos = this.ctx.player.position;
    const where = sc?.where ?? (low ? { x: pos.x, z: pos.z, r: 0 } : null);
    if (p.phoneDown) this.setPhoneBlocked(true);
    this.presenter.enqueue({
      id: p.id,
      speaker: p.speaker,
      text: p.text,
      ms: p.ms,
      fiction: p.fiction,
      phoneDown: p.phoneDown,
      source: src ? (src.label ?? src.url) : undefined,
      raised: this.slice.chapter === 'tour' && (sc?.beat ?? this.slice.beat) === 't6',
      beat: p.keep ? null : sc ? sc.beat : this.slice.beat,
      where,
      priority: p.priority ?? (low ? 'low' : 'normal'),
      group: sc ? this.lineGroup : ++this.lineGroup,
      expired: this.expiry(p, line?.trigger?.event),
      // sourced lines teach history: they wait out a fight (and are dropped if it lasts too long)
      lore: p.lore || !!src || undefined,
    });
  }

  private setPhoneBlocked(active: boolean): void {
    if (this.phoneBlocked === active) return;
    this.phoneBlocked = active;
    this.ctx.events.emit('story:phone-block', { active });
  }

  /**
   * When a waiting line is no longer worth saying: its `until`, and — for lines about the past's
   * dangers (the lantern, the horn, the pack, „Zurück. Jetzt.“) — the era it was said in being left
   * (playtest round 4: „Das Öl wird knapp …“ and „Das Horn …“ while walking home through 2025).
   * Oil warnings also lapse once the gauge has moved on (the half-warning played at 13 %).
   */
  private expiry(p: GameEvents['dialogue:say'], trigger?: string): (() => boolean) | undefined {
    const until = p.until ? this.latch(p.until as Condition) : null;
    const era = this.ctx.era.current;
    const bound = era !== 'today' && (ERA_BOUND_IDS.has(p.id ?? '') || /^(lantern:|hunt:|threat:)/.test(trigger ?? '') || /^laub\.(story\.oil|bark\.lantern|bark\.hounds)/.test(p.id ?? ''));
    const oil = this.slice.meters['oil'];
    const oilAt = /oil|lantern/.test(p.id ?? '') && oil ? oil.value : null;
    if (!until && !bound) return undefined;
    return () => (until?.() ?? false) || (bound && this.ctx.era.current !== era) || (oilAt !== null && !!oil && Math.abs(oil.value - oilAt) > 0.12);
  }

  /** Once a line's `until` held it stays expired (scan 1 pressed and released again). */
  private latch(c: Condition): () => boolean {
    let done = false;
    return () => done || (done = this.holds(c));
  }

  /** A line's `until` condition, evaluated now (no latches, no timers). */
  private holds(c: Condition): boolean {
    try {
      return evaluate(c, this.env(), {}, 'until', 0);
    } catch {
      return false;
    }
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
  // Home base and chapter selection
  // ------------------------------------------------------------------------------------------

  private updateHome(): void {
    const { player, era, events, ui } = this.ctx;
    const { x, z } = player.position;
    const inside = atHome(x, z, era.current, player.flying);
    if (inside === this.inHub) return;
    this.inHub = inside;
    events.emit(inside ? 'hub:enter' : 'hub:leave', {});
    if (inside && !this.hubToastShown) {
      this.hubToastShown = true;
      ui.toast(t('story.home.enterToast'), 3200);
    }
  }

  private renderChapters(el: HTMLElement): void {
    const { modals } = this.ctx.ui;
    const slice = this.slice;
    const entries = this.engine.order.map((chapter) => {
      const id = chapter.chapter;
      const unlocked = chapter === this.engine.first || slice.unlocked.includes(id);
      const current = slice.active && slice.chapter === id;
      const completed = slice.completed.includes(id);
      return h(`li${current ? '.current' : ''}${unlocked ? '' : '.locked'}`, [
        h('button.kqs-chapter', {
          disabled: !unlocked,
          'aria-current': current ? 'true' : undefined,
          'data-testid': `chapter-${id}`,
          onclick: async () => {
            if (!current && !(await modals.confirm(t('story.chapter.confirm', { title: chapter.title_de })))) return;
            modals.closeAll();
            if (!current) this.goto(id, undefined, id === 'k3' ? PETER_REPLAY_QUESTS : undefined);
          },
        }, [
          h('span.kqs-ch-title', unlocked ? chapter.title_de : t('story.chapter.locked')),
          unlocked && chapter.sub_de ? h('span.kqs-ch-sub', chapter.sub_de) : null,
          current ? h('span.kqs-ch-tag', t('story.chapter.current')) :
            completed ? h('span.kqs-ch-tag.done', t('story.chapter.done')) : null,
          chapter.placeholder && unlocked ? h('span.kqs-ch-tag.ph', t('story.placeholder')) : null,
        ]),
      ]);
    });
    el.replaceChildren(h('ol.kqs-chapters', entries));
  }

  // ------------------------------------------------------------------------------------------
  // caught → home (the Quelle)
  // ------------------------------------------------------------------------------------------

  private caughtHold = 2400;
  /** The curtain is down for a lost fight (its sub line stays on the way up). */
  private caughtCombat = false;

  /**
   * The curtain: down at once, the threats stop, the player stands still; after `caughtHold` of
   * GAME time (kq.step advances it) the player wakes at the checkpoint. `text` overrides the line
   * (meters returning the player). Brought home softly (hunt drive, `player:caught {soft}`) or under
   * the lossless rule (chronik.noLoss): "Die Meute hat dich heimgebracht …" (bible ui.homed.*).
   */
  caught(by: ThreatKind, opts: { text?: string; sub?: string; soft?: boolean } = {}): void {
    if (this.caughtBusy) return;
    this.caughtBusy = true;
    this.ctx.ui.hud.busy('caught', true);
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
    this.caughtHoldS = Math.max(this.caughtHold / 1000, by === 'combat' ? 3.2 : 0);
    this.caughtHold = 2400;
    this.caughtCombat = by === 'combat';
  }

  /** A load or new game under the curtain: drop the pending wake (teleport, meter reset, shift home, wake lines). */
  private cancelCaught(): void {
    this.wakeLines = [];
    this.caughtAt = null;
    this.caughtCombat = false;
    this.overlays.clearCurtain();
    if (this.caughtBusy) {
      this.caughtBusy = false;
      this.caughtT = 0;
      this.ctx.player.frozen = false;
      this.ctx.ui.hud.busy('caught', false, 0);
    }
  }

  private updateCaught(dt: number): void {
    const ctx = this.ctx;
    ctx.player.frozen = true;
    this.caughtT += dt;
    if (this.caughtT < this.caughtHoldS) return;
    if (ctx.era.current !== 'today') this.requestShift('today', 'caught', true);
    // where you come to: the resumed beat's wake place, else the caught beat's, else the chapter's
    // wake (home at the Quelle), else its checkpoint, else home
    // … unless the way back into the past starts somewhere else: then wake at that anchor, so the
    // player does not walk half the map back (playtest: K3 garden, K4 Ehrenhof, K2 after anchor B)
    let wake = this.wakePlace();
    const anchor = this.anchorFromFlags();
    let atAnchor = false;
    if (anchor && !anchor.anywhere && (!wake || Math.hypot(wake.x - anchor.x, wake.z - anchor.z) > 150)) {
      wake = { x: anchor.x + 3, z: anchor.z + 3, yaw: wake?.yaw ?? 0, text: t('story.caught.wakeAnchor') };
      atAnchor = true;
    }
    const chapter = this.engine.chapter();
    let cp = wake ?? chapter?.wake ?? chapter?.checkpoint ?? { x: HOME.spawn.x, z: HOME.spawn.z, yaw: HOME.spawn.yaw };
    if (!wake && chapter?.wake?.text) wake = chapter.wake;
    // undone in an ordinary fight: come to at the nearest surveyed point, not at the far end of the
    // walk (playtest round 4: death was a free fast travel to the Karlslust 1300 m on, and the K4
    // stockpile woke you 270 m away at the Westblick). Bosses and the story's threats keep their wake.
    const at = this.caughtAt;
    this.caughtAt = null;
    if (at && at.by === 'combat' && !at.boss) {
      const near = nearestSurveyed(this.ctx.state.state.systems.travel, at.x, at.z);
      if (near && near.d + 60 < Math.hypot(cp.x - at.x, cp.z - at.z)) {
        cp = { x: near.x + 2.5, z: near.z + 2.5, yaw: cp.yaw };
        wake = { ...cp, text: t('story.caught.wakePoint', { name: near.name }) };
        atAnchor = false;
      }
    }
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
    this.ctx.ui.hud.busy('caught', false, 2);
    this.engine.resume(true);
    if (atAnchor && anchor && ctx.era.current === 'today' && !this.slice.objective?.text?.includes('Q')) {
      const text = t('story.caught.backQ');
      this.slice.objective = { text, x: anchor.x, z: anchor.z, id: 'story.back' };
      this.objectives.set(this.slice.objective);
      ctx.events.emit('objective:set', { text, x: anchor.x, z: anchor.z, id: 'story.back' });
    }
    // a fight lost says so on the way up too (playtest round 9: "no visible KO card, I was just at
    // the wake spot") — the wake line under „Niedergeworfen. Nicht verloren.“
    this.overlays.curtainUp(wake?.text ?? t('story.caught.wake'), this.caughtCombat ? t('story.caught.sub.combat') : undefined);
    this.caughtCombat = false;
    const lines = this.wakeLines;
    this.wakeLines = [];
    for (const l of lines) ctx.events.emit('dialogue:say', l);
  }

  /**
   * A „Q – zurück …“ objective is done the moment the shift happens (playtest round 4: „Östlich vom
   * Schloss: Q – zurück in den Garten · 390 m“ pointed south all the way to the Zwinger). The next
   * beat sets its own; until then the tracker's quest goal leads.
   */
  private dropShiftObjective(to: Era): void {
    const o = this.slice.objective;
    if (!o?.text || !/\bQ\b/.test(o.text)) return;
    const home = /Heute|Quelle|Gegenwart/.test(o.text);
    if ((to === 'today') !== home) return;
    this.slice.objective = null;
    this.objectives.set(null);
    this.ctx.events.emit('objective:set', { text: null });
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
    // title cards run on game time (cardClockDt): they wait behind the pause menu / a modal, and a
    // headless `kq.step(n)` moves them n ticks (the chapter card holds the opening beat, M-11)
    this.overlays.tickCard(cardClockDt('update', ctx.loop.manual, ctx.pause.paused, dt));
    // presentation on game time: dialogue typing, the choice fuse, the caught curtain
    this.presenter.update(this.echoHold ? 0 : dt);
    // centre cards wait while someone is talking (a soft hold: a page asked for still opens) and
    // during an echo (playtest round 5: the level card over Laub's „Jetzt. Hinlegen …“ and over the
    // carts' echo; the hunt system holds them while a pack is out, W8 included)
    const cur = this.presenter.current;
    const speaker = cur && cur.priority !== 'low' ? cur.speaker : null;
    if (speaker !== this.activeSpeaker) {
      this.activeSpeaker = speaker;
      ctx.events.emit('dialogue:active', { speaker });
    }
    ctx.ui.cards.soft('dialogue', !!cur && cur.priority !== 'low');
    ctx.ui.cards.hold('echo', this.echoHold);
    this.overlays.tickChoice(dt);
    if (this.caughtBusy) {
      this.updateCaught(dt);
      // under the curtain the story stands still (as the paused game did before)
      if (this.caughtBusy) return;
    }
    if ((this.gated.length || this.gatedAt) && !this.overlays.holdsLines) this.releaseGate();
    if (this.queue.length) for (const d of takeDueActions(this.queue, this.time)) if (d.gen === this.gen) d.fn();
    // fx did not answer the shift request → switch directly
    if (this.shiftPending) {
      this.shiftPending.age += dt;
      if (this.shiftPending.age > 1.5) {
        const pending = this.shiftPending;
        if (ctx.era.current !== pending.to) ctx.era.set(pending.to);
        this.shiftPending = null;
        // fx never answered: the shift is done now (home after a Q-hold, as on shift:done)
        this.homeAfterShift(pending);
      }
    }
    if (this.rejoin && (this.rejoin.t -= dt) <= 0) {
      const r = this.rejoin;
      this.rejoin = null;
      ctx.player.teleport(r.x, r.z, r.yaw);
      ctx.world.forest.invalidate();
      this.overlays.fade(0, 0.8);
    }
    this.updateShiftKey(dt);
    this.updateHome();
    this.updateAfterword();
    // Refresh prompts with input-specific labels when Touch-Steuerung switches.
    if (this.storyPrompt && (this.promptShown?.touch || this.promptShown?.action) && ctx.input.touchMode !== this.promptTouch) this.renderPrompt();
    if (this.calmToasts.length && !ctx.ui.hud.inAction) {
      const tt = this.calmToasts.shift()!;
      ctx.ui.toast(tt.text, tt.ms);
    }
    const env = this.env();
    this.tickMeters(dt);
    this.updateInlineChoice(env);
    this.engine.tick(dt, env);
    // A waiting action can start the next required line in the same tick.
    this.setPhoneBlocked(this.presenter.needsPhoneDown);
    if (this.pendingAutosave) {
      this.pendingAutosave = false;
      ctx.save.autosave('beat', true);
    }
  }

  private clearPrompt(): void {
    if (this.storyPrompt) this.ctx.ui.hud.prompt(null, undefined, 'story');
    this.storyPrompt = false;
    this.promptShown = null;
  }

  /** The story's prompt in the current input mode: the `touch` text on a touch screen (mode read now). */
  private renderPrompt(): void {
    const p = this.promptShown;
    if (!p) return;
    this.promptTouch = this.ctx.input.touchMode;
    const key = p.action ? actionLabel(this.ctx.input, p.action) : p.key;
    this.ctx.ui.hud.prompt(key ?? null, this.promptTouch && p.touch ? p.touch : p.text ?? '', 'story');
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
      // „Zur Gruppe“ is on offer: the hold is the walk system's
      if (this.findPrompt || !ctx.input.wasPressed('shift')) return;
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
        // WP-04: the 'return' reason brings you home to the Quelle when the shift is done
        this.requestShift('today', 'return');
      }
    } else this.qHold = 0;
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    if (!this.hooksInstalled && window.kq) this.installHooks();
    // The chapter card has a wall-clock cap even when slow rendering starves the fixed steps.
    this.overlays.tickCard(cardClockDt('frame', ctx.loop.manual, ctx.pause.paused, dt), performance.now());
    // a modal choice pauses the game: its fuse burns on in real time (kq.step drives it headless)
    if (ctx.pause.paused && !ctx.loop.manual && this.overlays.choiceOpen && !this.overlays.choiceInline) this.overlays.tickChoice(dt);
    for (const m of Object.values(this.slice.meters)) if (!isWrapped(m.id)) this.overlays.gauge(m.id, m.label ?? m.id, m.value);
    const p = ctx.player.position;
    const heading = ((-ctx.player.yaw * 180) / Math.PI + 360) % 360;
    const hudVisible = !ctx.ui.hud.el.classList.contains('kq-hidden');
    const inv = ctx.state.state.inventory;
    const compass = inv.items.includes('item.bussole') || !!ctx.state.state.flags['story.compass'];
    const tracker = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('.kqq-tracker') : null;
    const questLed = !!tracker?.querySelector('.kqq-tq.kqq-main');
    // the headline follows the tracker: its main goal (quests puts it on the tracker) leads the Bussole
    const tx = Number(tracker?.dataset.tx), tz = Number(tracker?.dataset.tz);
    const questTarget = tracker?.dataset.tx !== undefined && Number.isFinite(tx) && Number.isFinite(tz) ? { x: tx, z: tz } : null;
    this.objectives.frame(dt, p.x, p.z, heading, { compass, visible: hudVisible, reducedMotion: ctx.settings.state.reducedMotion, questLed, questTarget });
    this.layer.classList.toggle('kqs-reduced', ctx.settings.state.reducedMotion);
    this.presenter.el.style.visibility = hudVisible && !this.echoHold && !this.talking ? '' : 'hidden';
    // a recorded line pauses with the game (pause menu, a modal) and while an echo holds it
    this.presenter.setPaused(ctx.pause.paused || this.echoHold);
    // the staged ending flies the camera (after it followed the player this frame)
    this.stage.frame();
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
      shown: () => [...this.shownIds],
      skip: () => {
        this.cancelScheduled();
        this.engine.skip();
      },
      start: (name) => this.start(name),
      say: (speaker, text, id) => this.ctx.events.emit('dialogue:say', { speaker, text, ...(id ? { id } : {}) }),
      voice: {
        stats: () => ({
          ...(this.clips?.stats() ?? { manifest: 'none' as const, lines: 0, cached: 0, loading: 0, queued: 0, failed: 0, stale: 0, opus: false, lastFormat: null }),
          ...this.presenter.voiceStats,
          playing: this.presenter.clipPlaying,
          ctx: this.ctx.audio.ctx?.state ?? 'locked',
        }),
        preload: (ids) => this.clips?.preload(ids.map((id) => ({ id }))),
      },
      finishTyping: () => this.presenter.finishTyping(),
      flush: () => this.flush(),
      caught: (by = 'pack', holdMs) => {
        if (holdMs) this.caughtHold = holdMs;
        this.ctx.events.emit('player:caught', { by });
      },
      ending: (id, staged) => this.endings.show(id, staged),
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
      stage: () => ({ active: this.stage.active, t: this.stage.time }),
      stageSkip: () => this.stage.finish(),
      stageHold: (t) => {
        this.stage.holdAt = t;
      },
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.overlays.closeChoice();
    this.unwatchState();
    this.cancelCaught();
    pageDocument()?.removeEventListener('visibilitychange', this.syncCardPause);
    this.unbindCardPause();
    this.presenter.clear();
    this.unbindGuideVoice();
    this.stage.dispose();
  }
}

let rt: StoryRuntime | null = null;

export default defineSystem({
  id: 'story',
  // A story resume can issue walk commands immediately on save:loaded. Restore the route first.
  after: ['walk'],
  async init(ctx) {
    rt = new StoryRuntime(ctx, creditSections(await ctx.assets.licences()));
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
