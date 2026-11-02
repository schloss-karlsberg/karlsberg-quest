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
import type { ThreatConfig, ThreatKind } from '../contracts';
import { Voice } from './dialogue/voice';
import { DialoguePresenter, holdSeconds } from './dialogue/presenter';
import { speakerMeta } from './dialogue/speakers';
import { pickLine } from './dialogue/triggers';
import { StoryEngine, type StoryEnv, type StorySlice, createStorySlice, runsOnResume } from './engine';
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
import type { Action, EndingId, FlagValue, HubItem, StoryFile } from './types';
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
  look(time: 'day' | 'dusk' | 'night'): void;
}
declare module '../../debug/hooks' {
  interface KqHooks {
    story?: StoryHooks;
  }
}

// ---- looks for the present day at the field station -----------------------------------------
type LookPatch = { [K in keyof EraLook]?: Partial<EraLook[K]> } & { disc?: EraLook['disc'] };
const LOOKS: Record<'dusk' | 'night', LookPatch> = {
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

export function lookFor(time: 'day' | 'dusk' | 'night'): EraLook {
  const base = structuredClone(ERA_LOOKS.today);
  if (time === 'day') return base;
  const p = LOOKS[time];
  const out = base as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(p)) {
    if (v && typeof v === 'object') out[k] = { ...(out[k] as object), ...v };
    else out[k] = v;
  }
  return base;
}

const CAUGHT_KEY: Record<ThreatKind, string> = { pack: 'story.caught.pack', fire: 'story.caught.fire', oblivion: 'story.caught.oblivion' };
/** Dialogue triggered by these events belongs to the Chronik's echo scenes (it shows the subtitles). */
const ECHO_EVENTS = new Set(['echo:start', 'echo:play', 'echo:end']);
const QUIET_EVENTS = new Set(['player:step', 'dialogue:say', 'hunt:alert', 'lantern:oil', 'fire:progress', 'oblivion:progress']);

interface Scheduled {
  at: number;
  gen: number;
  fn: () => void;
}

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
  private pendingName: string | null = null;
  private pendingAutosave = false;
  inHub = false;
  private hubToastShown = false;
  private storyPrompt = false;
  private hubPrompt = false;
  private shiftPending: { to: Era; age: number } | null = null;
  private qHold = 0;
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

  constructor(private readonly ctx: GameContext) {
    const bundled = loadBundledStories();
    this.files = bundled.map((b) => b.story);
    this.engine = new StoryEngine(this.files, () => this.slice, {
      run: (actions, o) => this.run(actions, o.resume),
      chapterEntered: (f, o) => this.chapterEntered(f, o.resume),
      beatEntered: (ch, b, o) => {
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
    this.mutedLines = new Set(
      ctx.content.packs
        .filter((p) => p.file.includes('/examples/') || (p.pack.placeholder && !placeholder))
        .flatMap((p) => (p.pack.dialogue ?? []).map((d) => d.id)),
    );
    this.layer = ctx.ui.layer('story');
    this.layer.classList.remove('kq-hidden');
    this.voice = new Voice(ctx.audio);
    this.presenter = new DialoguePresenter({
      layer: this.layer,
      meta: (id) => speakerMeta(id, ctx.content),
      voice: this.voice,
      reducedMotion: () => ctx.settings.state.reducedMotion,
      name: () => this.slice.name,
    });
    this.objectives = new ObjectiveView(this.layer, ctx.ui.hud);
    this.overlays = new StoryOverlays(this.layer, ctx.ui.modals);

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
        return { codex: s.codex.facts.length, codexTotal: ctx.content.facts.size, clues: s.inventory.clues.length, nouns: s.inventory.nouns.length, items: s.inventory.items.length, confirmed };
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

    // ---- events
    ctx.events.onAny((name, payload) => this.onEvent(name, payload));
    ctx.events.on('dialogue:say', (p) => this.showLine(p));
    ctx.events.on('game:start', ({ resumed }) => this.onStart(resumed));
    ctx.events.on('save:loaded', () => this.resync());
    ctx.events.on('player:caught', ({ by }) => this.caught(by));
    ctx.events.on('era:change', ({ to }) => {
      if (to === 'today') {
        this.placeStation();
        this.applyLook();
      }
    });
    ctx.events.on('shift:begin', () => {
      this.shiftPending = null;
      this.shifting = true;
    });
    ctx.events.on('shift:done', () => (this.shifting = false));
    // while the Chronik plays an echo (ghosts + its own subtitles) the presenter waits out of sight
    ctx.events.on('echo:start', () => (this.echoHold = true));
    ctx.events.on('echo:end', () => (this.echoHold = false));
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
    return this.ctx.state.slice('story', createStorySlice);
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
    // switch threats of the previous chapter off
    for (const [kind, cfg] of Object.entries(this.slice.threats)) {
      if (cfg.active) this.configureThreat({ kind: kind as ThreatKind, active: false });
    }
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

  /** Run an action list: delays are relative to the previous action; spoken lines take their time. */
  private run(actions: Action[], resume: boolean): void {
    let at = 0;
    for (const a of actions) {
      if (resume && !runsOnResume(a)) continue;
      at += a.delay ?? 0;
      if (at <= 0) this.exec(a);
      else this.schedule(at, () => this.exec(a));
      if (a.do === 'say') {
        const text = a.text ?? (a.line ? this.ctx.content.dialogue.get(a.line)?.text_de : '') ?? '';
        if (!(a.id && this.slice.said.includes(a.id) && !a.repeat)) at += text.length / 42 + holdSeconds(text, a.ms) + 0.4;
      }
    }
  }

  private schedule(delay: number, fn: () => void): void {
    this.queue.push({ at: this.time + delay, gen: this.gen, fn });
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
        const text = a.text ?? line?.text_de;
        const speaker = a.speaker ?? line?.speaker;
        if (!text || !speaker) return;
        const id = a.id ?? a.line;
        if (id) {
          if (s.said.includes(id) && !a.repeat) return;
          if (!s.said.includes(id)) s.said.push(id);
        }
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
      case 'threat':
        this.configureThreat({ kind: a.kind, active: a.active, intensity: a.intensity, center: a.center, radius: a.radius, seconds: a.seconds });
        return;
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
        if (a.toast) ctx.ui.toast(a.toast);
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
        s.look = a.time;
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
        this.endings.show();
        return;
      case 'autosave':
        ctx.save.autosave('story', true);
        return;
      case 'choice':
        this.overlays.openChoice(a, (set) => ctx.state.update((st) => Object.assign(st.flags, set), 'story'));
        return;
    }
  }

  private configureThreat(c: ThreatConfig): void {
    const clean: ThreatConfig = { kind: c.kind, active: c.active };
    if (c.intensity !== undefined) clean.intensity = c.intensity;
    if (c.center) clean.center = c.center;
    if (c.radius !== undefined) clean.radius = c.radius;
    if (c.seconds !== undefined) clean.seconds = c.seconds;
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
    } else this.shiftPending = { to, age: 0 };
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
    if (ctx.era.current !== 'today') return;
    ctx.world.look = lookFor(this.slice.look);
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
    this.engine.onEvent(name, payload);
    // ContentDB dialogue triggers (echo lines are played by the Chronik's echo director itself)
    if (ECHO_EVENTS.has(name)) return;
    const lines = this.ctx.content.dialogueFor(name).filter((l) => !this.mutedLines.has(l.id));
    if (!lines.length) return;
    const s = this.slice;
    const line = pickLine(lines, name, payload, { era: this.ctx.era.current, flags: this.ctx.state.state.flags, chapter: s.chapter, beat: s.beat }, new Set(s.said), this.lastSaid, this.time);
    if (!line) return;
    this.lastSaid.set(line.id, this.time);
    if (line.once && !s.said.includes(line.id)) s.said.push(line.id);
    this.ctx.events.emit('dialogue:say', { speaker: line.speaker, text: line.text_de, id: line.id });
  }

  private showLine(p: { speaker: string; text: string; ms?: number; fiction?: boolean; id?: string }): void {
    const line = p.id ? this.ctx.content.dialogue.get(p.id) : undefined;
    const src = line?.sources?.[0];
    this.presenter.enqueue({ id: p.id, speaker: p.speaker, text: p.text, ms: p.ms, fiction: p.fiction, source: src ? (src.label ?? src.url) : undefined });
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
    this.ctx.events.emit('hub:use', { item });
    if (item === 'chronik') this.ctx.events.emit('chronik:open', {});
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

  caught(by: ThreatKind): void {
    if (this.caughtBusy) return;
    this.caughtBusy = true;
    const ctx = this.ctx;
    this.cancelScheduled();
    this.presenter.clear();
    this.overlays.curtainDown(t(CAUGHT_KEY[by] ?? CAUGHT_KEY.pack), t('story.caught.sub'));
    ctx.pause.push('story-caught');
    window.setTimeout(() => {
      for (const [kind, cfg] of Object.entries(this.slice.threats)) if (cfg.active) this.configureThreat({ kind: kind as ThreatKind, active: false });
      if (ctx.era.current !== 'today') this.requestShift('today', 'caught', true);
      const cp = this.engine.chapter()?.checkpoint ?? { x: STATION.spawn.x, z: STATION.spawn.z, yaw: STATION.spawn.yaw };
      this.teleport(cp.x, cp.z, cp.yaw);
      this.applyLook();
      ctx.pause.pop('story-caught');
      this.engine.resume(true);
      this.overlays.curtainUp(t('story.caught.wake'));
      this.caughtBusy = false;
    }, this.caughtHold);
    this.caughtHold = 2400;
  }

  epilogue(id: EndingId): Epilogue | null {
    const f = this.files.find((x) => x.epilogue);
    if (!f?.epilogue) return null;
    const s = this.ctx.state.state;
    return composeEpilogue(f.epilogue, id, { chronik: s.chronik, flags: s.flags });
  }

  // ------------------------------------------------------------------------------------------
  // per tick / frame
  // ------------------------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    this.time += dt;
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
    const s = ctx.state.state;
    const env: StoryEnv = {
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
    };
    this.engine.tick(dt, env);
    if (this.pendingAutosave) {
      this.pendingAutosave = false;
      ctx.save.autosave('beat', true);
    }
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
    const paused = ctx.pause.paused;
    this.presenter.update(paused || this.echoHold ? 0 : dt);
    this.overlays.tickChoice(dt);
    const p = ctx.player.position;
    const heading = ((-ctx.player.yaw * 180) / Math.PI + 360) % 360;
    const hudVisible = !ctx.ui.hud.el.classList.contains('kq-hidden');
    const inv = ctx.state.state.inventory;
    const compass = inv.items.includes('item.bussole') || !!ctx.state.state.flags['story.compass'];
    this.objectives.frame(dt, p.x, p.z, heading, { compass, visible: hudVisible, reducedMotion: ctx.settings.state.reducedMotion });
    const today = ctx.era.current === 'today';
    this.station.setVisible(today);
    if (today) this.station.frame(dt, ctx.settings.state.reducedMotion);
    this.layer.classList.toggle('kqs-reduced', ctx.settings.state.reducedMotion);
    this.presenter.el.style.visibility = hudVisible && !this.echoHold ? '' : 'hidden';
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
      look: (time) => {
        this.slice.look = time;
        this.applyLook();
      },
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
