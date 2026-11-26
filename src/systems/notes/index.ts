/**
 * F8 feedback notes and passive telemetry (docs/NEXT-SESSION.md §3.3, docs/ARCHITECTURE.md
 * "Notizen & Telemetrie").
 *
 * - **F8** opens "Notiz an die Entwickler" (a modal: the game pauses, the mouse is freed). Enter or
 *   "Speichern" stores the note in IndexedDB with a small JPEG of the view, where the player stands
 *   and looks, era, story chapter / beat, the quest the HUD leads to, HP / level, quality / fps and
 *   the last 30 s of game events. Esc cancels.
 * - **Telemetry** (always on, local): time per quest (accept → turn-in, active play seconds),
 *   deaths / KOs with place and who did it, and stuck episodes (≥ 3 min of active play with an
 *   objective but no progress).
 * - Pause menu: "Notizen exportieren (n)" downloads one JSON (notes + telemetry), "Notizen löschen".
 * - `kq.notes.list()` / `kq.notes.export()` (promises), `kq.telemetry.state()`.
 *
 * Nothing here ever touches the network.
 */
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { addStrings, t } from '../../i18n';
import { h } from '../../ui/dom';
import { addControlKeys, notesPauseHooks } from '../../ui/menus';
import type { ModalHandle } from '../../ui/modal';
import { type DeathRecord, EventRing, type RingEvent, type Situation, Telemetry, type TelemetryState, normaliseTelemetry } from './logic';
import { type NoteStore, openNoteStore } from './store';
import { captureView } from './capture';

addStrings('de', {
  'notes.title': 'Notiz an die Entwickler',
  'notes.placeholder': 'Was ist dir aufgefallen? (Fehler, Frust, eine Idee …)',
  'notes.hint': 'Enter: speichern · Umschalt+Enter: neue Zeile · Esc: abbrechen. Ein Bild der Szene, der Ort und die letzten 30 Sekunden werden mitgespeichert, nur auf diesem Rechner.',
  'notes.save': 'Speichern',
  'notes.cancel': 'Abbrechen',
  'notes.saved': 'Notiz gespeichert ({n})',
  'notes.empty': 'Die Notiz ist leer.',
  'notes.export': 'Notizen exportieren ({n})',
  'notes.clear': 'Notizen löschen',
  'notes.clear.confirm': 'Alle {n} Notizen und die gesammelten Spielzeiten löschen? Das lässt sich nicht rückgängig machen.',
  'notes.cleared': 'Notizen gelöscht',
  'ui.keys.notes': 'Notiz an die Entwickler (mit Bild und Ort, bleibt auf diesem Rechner)',
  'ui.keys.notes.key': '[F8]',
});

/** One stored note (the export's `notes[]`). */
export interface Note {
  id?: number;
  /** ISO time. */
  at: string;
  text: string;
  /** JPEG data URL (≈ 480 px wide), null if the canvas could not be read. */
  screenshot: string | null;
  pos: { x: number; y: number; z: number };
  /** View yaw in radians (Player.yaw) and as a compass heading (0 = north, 90 = east). */
  yaw: number;
  heading: number;
  pitch: number;
  era: string;
  story: { active: boolean; chapter: string | null; beat: string | null };
  quest: { id: string | null; objective: string | null; label: string | null; tracked: string[]; storyObjective: string | null };
  player: { hp: number | null; maxHp: number | null; level: number | null; stance: string; flying: boolean; camera: string };
  quality: { level: string; fps: number; frameMs: number };
  playSeconds: number;
  /** The last ≈ 30 s of game events (t in seconds before the note, payload JSON cut short). */
  events: RingEvent[];
}

export interface NotesExport {
  format: 'kq-notes';
  version: 1;
  exportedAt: string;
  notes: Note[];
  telemetry: TelemetryState & { summary: TelemetrySummary };
}

export interface TelemetrySummary {
  questsDone: number;
  avgQuestSeconds: number;
  deaths: number;
  stuckEpisodes: number;
  stuckSeconds: number;
}

export interface NotesHooks {
  /** Stored notes (oldest first). */
  list(): Promise<Note[]>;
  /** The export object (what "Notizen exportieren" downloads). */
  export(): Promise<NotesExport>;
  /** Number of stored notes (cached). */
  count(): number;
  /** Open the F8 field (as the key does). */
  open(): boolean;
  /** Is the F8 field open? */
  isOpen(): boolean;
  /** Save a note now without the field (tests, bots). Resolves to the new note count. */
  save(text: string): Promise<number>;
  /** Download the export as a file (as the pause menu does). */
  download(): Promise<void>;
  clear(): Promise<void>;
  /** 'idb' or 'memory'. */
  storage(): string;
}

export interface TelemetryHooks {
  /** Deep copy of the telemetry (with the summary). */
  state(): TelemetryState & { summary: TelemetrySummary };
  /** Tests: pretend `seconds` of active play passed without progress. */
  idle(seconds: number): void;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    notes?: NotesHooks;
    telemetry?: TelemetryHooks;
  }
}

/** Screenshot width (px) and JPEG quality. */
const SHOT_W = 480;
const SHOT_Q = 0.72;
/** Telemetry is written to IndexedDB at most this often (s) while it changes. */
const SAVE_EVERY = 5;
/** A KO 'caught' this soon after a 'died' is the same KO (combat sends both). */
const SAME_KO = 3;

const now = () => performance.now() / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;

function summary(s: TelemetryState): TelemetrySummary {
  const done = s.quests.length;
  return {
    questsDone: done,
    avgQuestSeconds: done ? Math.round(s.quests.reduce((a, q) => a + q.seconds, 0) / done) : 0,
    deaths: s.deaths.length,
    stuckEpisodes: s.stuck.length,
    stuckSeconds: Math.round(s.stuck.reduce((a, e) => a + e.seconds, 0)),
  };
}

class Notes {
  private store: NoteStore | null = null;
  private readonly ready: Promise<void>;
  private readonly ring = new EventRing();
  readonly tele = new Telemetry();
  private n = 0;
  private modal: ModalHandle | null = null;
  private storyObjective: string | null = null;
  private tickAcc = 0;
  private saveT = 0;
  private lastDied: { rec: DeathRecord; t: number } | null = null;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly ctx: GameContext) {
    this.ready = openNoteStore().then(async (s) => {
      this.store = s;
      try {
        this.tele.s = normaliseTelemetry(await s.getMeta('telemetry'));
        this.n = (await s.all()).length;
      } catch (err) {
        console.warn('[notes] could not read the stored notes', err);
      }
    });
    const ev = ctx.events;
    // the story repeats the slot's saved objective when it resumes: that is no progress either
    const savedObjective = () => (this.storyObjective = ctx.state.state.systems.story?.objective?.text ?? null);
    savedObjective();
    this.offs.push(ctx.state.subscribe((_s, reason) => (reason === 'load' || reason === 'new' || reason === 'replace') && savedObjective()));
    this.offs.push(ev.onAny((name, payload) => this.ring.push(now(), name, payload)));
    const play = () => ctx.state.state.meta.playSeconds;
    this.offs.push(
      // a new game starts the quest clocks over (playSeconds is back at 0)
      ev.on('game:start', ({ resumed }) => !resumed && this.tele.newGame()),
      ev.on('quest:accepted', ({ id }) => this.tele.questAccepted(id, play())),
      ev.on('quest:completed', ({ id, main }) => void this.tele.questCompleted(id, main, play(), new Date().toISOString())),
      ev.on('quest:failed', ({ id }) => this.tele.questDropped(id)),
      ev.on('quest:progress', () => this.tele.progress()),
      ev.on('quest:objective', () => this.tele.progress()),
      ev.on('quest:ready', () => this.tele.progress()),
      // a beat or chapter entered again (a load, a boot, a wake) is no progress
      ev.on('story:beat', ({ resume }) => !resume && this.tele.progress()),
      ev.on('story:chapter', ({ resume }) => !resume && this.tele.progress()),
      ev.on('objective:set', ({ text }) => {
        if (text !== this.storyObjective) this.tele.progress();
        this.storyObjective = text;
      }),
      ev.on('player:died', ({ by }) => {
        this.lastDied = { rec: this.tele.death('died', by, this.situation()), t: now() };
      }),
      ev.on('player:caught', ({ by, family, boss }) => {
        const d = this.lastDied;
        if (d && now() - d.t < SAME_KO) {
          if (family) d.rec.family = family;
          if (boss) d.rec.boss = true;
          this.tele.dirty = true;
          return;
        }
        this.tele.death('caught', by, this.situation(), { family, boss });
      }),
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'F8' || e.repeat) return;
      e.preventDefault();
      this.open();
    };
    window.addEventListener('keydown', onKey);
    this.offs.push(() => window.removeEventListener('keydown', onKey));
    const onHide = () => document.hidden && void this.saveTelemetry();
    document.addEventListener('visibilitychange', onHide);
    this.offs.push(() => document.removeEventListener('visibilitychange', onHide));
    notesPauseHooks.count = () => this.n;
    notesPauseHooks.exportAll = () => void this.download();
    notesPauseHooks.clearAll = () => this.clear();
    addControlKeys({ id: 'notes' });
  }

  /** The quest the HUD leads to (null without the quests system). */
  private lead() {
    try {
      return window.kq?.quests?.lead() ?? null;
    } catch {
      return null;
    }
  }

  private situation(): Situation {
    const p = this.ctx.player.position;
    const l = this.lead();
    return { x: p.x, z: p.z, era: this.ctx.era.current, quest: l?.quest ?? null, objective: l?.label ?? this.storyObjective, play: this.ctx.state.state.meta.playSeconds, at: new Date().toISOString() };
  }

  update(dt: number): void {
    // active play only (the loop does not step while paused, but the title also counts as paused)
    if (this.ctx.pause.paused) return;
    this.tickAcc += dt;
    if (this.tickAcc >= 1) {
      const s = this.situation();
      this.tele.tick(this.tickAcc, s, s.quest !== null || s.objective !== null);
      this.tickAcc = 0;
    }
  }

  frame(dt: number): void {
    const kq = window.kq;
    if (kq && !kq.notes) this.installHooks();
    this.saveT += dt;
    if (this.tele.dirty && this.saveT >= SAVE_EVERY) void this.saveTelemetry();
  }

  private async saveTelemetry(): Promise<void> {
    this.saveT = 0;
    if (!this.store || !this.tele.dirty) return;
    this.tele.dirty = false;
    try {
      await this.store.setMeta('telemetry', this.tele.s);
    } catch (err) {
      console.warn('[notes] telemetry not saved', err);
    }
  }

  /** Render the current view once more and read it back (preserveDrawingBuffer is off). */
  private screenshot(): string | null {
    return captureView(this.ctx, SHOT_W, SHOT_Q);
  }

  /** Everything about this moment except the text. */
  private snapshot(screenshot: string | null): Omit<Note, 'text'> {
    const ctx = this.ctx;
    const pl = ctx.player;
    const sys = ctx.state.state.systems as Record<string, unknown>;
    const story = (sys.story ?? {}) as { active?: boolean; chapter?: string | null; beat?: string | null };
    const combat = sys.combat as { hp?: number } | undefined;
    const prog = sys.progression as { level?: number } | undefined;
    const kq = window.kq;
    const l = this.lead();
    let maxHp: number | null = null;
    let tracked: string[] = [];
    try {
      maxHp = kq?.progression?.stats().maxHp ?? null;
      tracked = kq?.quests?.tracked() ?? [];
    } catch {
      /* systems missing in a stripped build */
    }
    const perf = ctx.perf.summary();
    return {
      at: new Date().toISOString(),
      screenshot,
      pos: { x: r2(pl.position.x), y: r2(pl.position.y), z: r2(pl.position.z) },
      yaw: r2(pl.yaw),
      heading: Math.round((((-pl.yaw * 180) / Math.PI) % 360 + 360) % 360),
      pitch: r2(pl.pitch),
      era: ctx.era.current,
      story: { active: story.active === true, chapter: story.chapter ?? null, beat: story.beat ?? null },
      quest: { id: l?.quest ?? null, objective: l?.objective ?? null, label: l?.label ?? null, tracked, storyObjective: this.storyObjective },
      player: { hp: typeof combat?.hp === 'number' ? Math.round(combat.hp) : null, maxHp, level: prog?.level ?? null, stance: pl.stance, flying: pl.flying, camera: pl.cameraMode },
      quality: { level: ctx.quality.level, fps: Math.round(perf.fps), frameMs: r2(perf.frameAvg) },
      playSeconds: Math.round(ctx.state.state.meta.playSeconds),
      events: this.ring.snapshot(now()),
    };
  }

  /** F8: the note field over the game. */
  open(): boolean {
    if (this.modal && !this.modal.closed) return false;
    // not on the title screen (nothing to note about yet)
    if (this.ctx.pause.reasons.has('title')) return false;
    // the moment is taken when F8 is pressed, not when the note is done
    const snap = this.snapshot(this.screenshot());
    const area = h('textarea.kq-notes-text', { 'aria-label': t('notes.title'), 'data-testid': 'notes-text', rows: '4', maxlength: '4000', placeholder: t('notes.placeholder'), style: 'width:100%;box-sizing:border-box;font:inherit;resize:vertical;min-height:6em' });
    const status = h('p.kq-notes-status', { style: 'min-height:1.2em;margin:0.3em 0 0;opacity:0.8' });
    const body = [
      area,
      status,
      h('p', { style: 'font-size:0.85em;opacity:0.75;margin-top:0.4em' }, t('notes.hint')),
      ...(snap.screenshot ? [h('img', { src: snap.screenshot, alt: '', style: 'display:block;width:160px;margin-top:0.5em;border-radius:3px;opacity:0.9' })] : []),
    ];
    const commit = (): boolean => {
      const text = area.value.trim();
      if (!text) {
        status.textContent = t('notes.empty');
        area.focus();
        return false;
      }
      void this.add({ ...snap, text }).then((n) => this.ctx.ui.toast(t('notes.saved', { n: String(n) }), 2600));
      return true;
    };
    const m = this.ctx.ui.modals.open({
      title: t('notes.title'),
      body,
      className: 'kq-notes',
      actions: [{ label: t('notes.cancel') }, { label: t('notes.save'), primary: true, onClick: commit }],
      onClose: () => (this.modal = null),
    });
    m.el.setAttribute('data-testid', 'notes-modal');
    this.modal = m;
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (commit()) m.close();
      }
      // F8 in the field: nothing (no second field)
    });
    return true;
  }

  private async add(note: Note): Promise<number> {
    await this.ready;
    const { id: _drop, ...rest } = note;
    await this.store!.add(rest);
    this.n++;
    void this.saveTelemetry();
    return this.n;
  }

  async list(): Promise<Note[]> {
    await this.ready;
    return (await this.store!.all<Note>()).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  }

  telemetryState(): TelemetryState & { summary: TelemetrySummary } {
    const s = structuredClone(this.tele.s);
    return { ...s, summary: summary(s) };
  }

  async exportJson(): Promise<NotesExport> {
    return { format: 'kq-notes', version: 1, exportedAt: new Date().toISOString(), notes: await this.list(), telemetry: this.telemetryState() };
  }

  async download(): Promise<void> {
    const data = await this.exportJson();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const p = (v: number) => String(v).padStart(2, '0');
    const a = h('a', { href: url, download: `karlsberg-notizen-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`, style: 'display:none' });
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async clear(): Promise<void> {
    await this.ready;
    await this.store!.clear();
    this.n = 0;
    this.tele.reset();
    this.tele.dirty = false;
    this.ctx.ui.toast(t('notes.cleared'), 2200);
  }

  private installHooks(): void {
    const kq = window.kq!;
    kq.notes = {
      list: () => this.list(),
      export: () => this.exportJson(),
      count: () => this.n,
      open: () => this.open(),
      isOpen: () => !!this.modal && !this.modal.closed,
      save: async (text) => {
        await this.add({ ...this.snapshot(this.screenshot()), text });
        return this.n;
      },
      download: () => this.download(),
      clear: () => this.clear(),
      storage: () => this.store?.kind ?? 'pending',
    };
    kq.telemetry = {
      state: () => this.telemetryState(),
      idle: (seconds) => {
        const s = this.situation();
        this.tele.tick(seconds, s, true);
      },
    };
  }

  dispose(): void {
    for (const f of this.offs) f();
    void this.saveTelemetry();
    delete notesPauseHooks.count;
    delete notesPauseHooks.exportAll;
    delete notesPauseHooks.clearAll;
  }
}

let notes: Notes | null = null;

export default defineSystem({
  id: 'notes',
  init(ctx) {
    notes = new Notes(ctx);
  },
  update(dt) {
    notes?.update(dt);
  },
  frame(dt) {
    notes?.frame(dt);
  },
  dispose() {
    notes?.dispose();
    notes = null;
  },
});
