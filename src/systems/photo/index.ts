/**
 * Smartphone photo mode (WP-14; docs/ARCHITECTURE.md "Fotomodus"; story contract C3).
 *
 * - **N toggles** the phone (one press up, one press down: works the same with the touch camera
 *   button; holding a key on a phone is awkward). Up: the phone frame overlay, the lens at the
 *   eyes (`CameraRig.setPhoto`), 1× / 2× zoom (mouse wheel or the chips; `CameraRig.setFovScale`).
 * - **Click** (or the touch attack button, which becomes the shutter) takes the picture: a flash,
 *   then a card with 0–3 stars and the verdict. The core (`core.ts`) judges it geometrically;
 *   targets with a drawn body (the deer) are first measured by pixels, once per shot
 *   (`visibility.ts`: what ferns, grass or a rise hide does not count), and a weak shot's card
 *   says in one sentence what to change.
 * - **Down**: N, Esc, right click (or the camera button). Not in a conversation, a menu, a fight,
 *   the spirit view, a cut scene (`player.frozen`) or while somebody else holds the camera
 *   (`camera:override`): a toast says why, and an open phone closes. Such a forced close (also
 *   death and an era change) snaps the lens back to 1× in the same frame (`lensDown`), so a
 *   cinematic never takes over a half-zoomed fov; the player's own close eases.
 * - **Past eras**: „Kein Netz“; the picture comes out white, nothing is judged
 *   (`photo:shot { noSignal: true }`, never `photo:good`).
 * - Targets are data (`content/photo/targets.json`); code may attach a live position and a
 *   `calm()` to a target by id (`attachTarget`), or register a whole target (`registerTarget`).
 * - The album (Pause → Album) is in the save: one entry per target (best stars, era, time),
 *   max 60, no images; this session's JPEG thumbnails stay in memory.
 * - The gallery (TASK-006; gallery.ts, gallery-logic.ts, store.ts) keeps every shot with signal on
 *   this device, not in the save: IndexedDB `kq-photos` (memory when blocked), at most 100. G on the
 *   phone (its pointer is locked) or the phone's „Galerie“ button (touch), and Pause → Album open it.
 * - Grants once per target: codex (quietly, no XP), photo cards, flags. No XP for photos.
 */
import './photo.css';
import { Scene } from 'three';
import type { GameContext } from '../../core/context';
import { ERA_INFO } from '../../core/era';
import { defineSystem } from '../../core/systems';
import { addStrings, t } from '../../i18n';
import type { Action } from '../../player/input';
import { cameraHints } from '../../player/camera';
import { h } from '../../ui/dom';
import { addPausePage } from '../../ui/pause-pages';
import { addControlKeys } from '../../ui/menus';
import { registerEraMaterials } from '../fx/shift/prewarm';
import { captureView, captureViewBlobs } from '../notes/capture';
import { type Seen, ShotVisibility, registerSubject, shotTip } from './visibility';
import { GalleryView, type GalleryState } from './gallery';
import { PhotoLibrary } from './gallery-logic';
import { type PhotoMeta, openPhotoStore, requestPersist } from './store';
import { type AlbumEntry, type PhotoSlice, type PhotoTargetDef, type PhotoView, type PhotoWorld, type PhotoLiveBinding, type ShotResult, type TargetJudgement, type Vec3, PhotoCore, debugDeerBlocker, goodEvents, lensDown, SteadyMeter, emptySlice, normaliseSlice } from './core';
import { type PhotoTargetData, type PhotoTargetFile, targetFromData } from './data';
import { DebugDeer, buildBoard } from './demo';
import targetsFile from '../../../content/photo/targets.json';

addStrings('de', {
  'photo.hint': 'Klick: Foto · Mausrad: 1× / 2× · G: Galerie · N, Esc oder Rechtsklick: Handy weg',
  'photo.gallery': 'Galerie',
  'photo.gallery.open': 'Galerie öffnen',
  'photo.gallery.photo': 'Foto',
  'photo.gallery.loading': 'Fotos werden geladen …',
  'photo.gallery.count': '{n} von {cap} Fotos',
  'photo.gallery.device': 'Die Fotos liegen nur auf diesem Gerät, nicht im Spielstand. Browser räumen solche Daten manchmal auf (Safari nach etwa sieben Tagen ohne Besuch): Lade die Fotos herunter, die du behalten willst.',
  'photo.gallery.session': 'Dieser Browser lässt hier keinen Speicher zu: Die Fotos bleiben nur bis zum Neuladen. Lade die herunter, die du behalten willst.',
  'photo.gallery.empty': 'Noch keine Fotos. Öffne den Fotomodus und löse aus.',
  'photo.gallery.fullNote': 'Die Galerie ist voll. Neue Fotos werden erst wieder gespeichert, wenn du welche löschst.',
  'photo.gallery.full': 'Galerie voll ({cap} Fotos). Lösche Fotos, um neue zu behalten.',
  'photo.gallery.fail': 'Das Foto konnte nicht gespeichert werden.',
  'photo.gallery.gone': 'Dieses Foto gibt es nicht mehr.',
  'photo.gallery.item': 'Foto vom {when} ({era})',
  'photo.gallery.prev': 'Vorheriges Foto',
  'photo.gallery.next': 'Nächstes Foto',
  'photo.gallery.share': 'Teilen',
  'photo.gallery.download': 'Herunterladen',
  'photo.gallery.delete': 'Löschen',
  // short on the button, so the bar keeps its layout on a phone; the full question for screen readers
  'photo.gallery.deleteSure': 'Wirklich?',
  'photo.gallery.deleteSureLabel': 'Wirklich löschen?',
  'photo.gallery.deleted': 'Foto gelöscht.',
  'photo.gallery.back': 'Alle Fotos',
  'photo.nonet': 'Kein Netz',
  'photo.toast.nonet': 'Kein Netz. Das Foto wird nichts.',
  'photo.toast.dialog': 'Nicht während eines Gesprächs.',
  'photo.toast.combat': 'Nicht im Kampf. Erst die Hände frei.',
  'photo.toast.fly': 'Im Geisterblick gibt es kein Handy.',
  'photo.toast.scene': 'Nicht jetzt.',
  'photo.toast.menu': 'Erst das Menü schließen.',
  'photo.zoom': 'Zoom',
  'photo.album': 'Album',
  'photo.album.empty': 'Noch keine Fotos. Öffne den Fotomodus und löse aus. Gute Fotos landen hier.',
  'photo.album.session': 'Die Bilder sind in dieser Sitzung sichtbar. Nach dem Neuladen bleiben die Fotokarten erhalten. Alle Fotos findest du in der Galerie.',
  'photo.album.cards': 'Fotokarten',
  'photo.album.unknown': 'Unbekanntes Fotomotiv',
  'photo.stars': '{n} von 3 Sternen',
  'ui.keys.photo': 'Handy-Kamera öffnen oder wegstecken',
});

declare module '../../core/events' {
  interface GameEvents {
    /** The phone came up. */
    'photo:open': Record<string, never>;
    /** The phone went down. */
    'photo:close': Record<string, never>;
    /** One shot (summary; arrays allowed). stars = best stars in the frame, 0 = nothing. noSignal: a past era („Kein Netz“). */
    'photo:shot': { targets: string[]; good: string[]; stars: number; noSignal: boolean };
    /**
     * One per good target in the shot (stars ≥ 2). Scalar only: story `{ "event": "photo:good",
     * "match": { "id": …, "state": "alert" } }`. `state`: the target's `state()` at the shot (an
     * opaque string, e.g. the deer's 'graze' | 'alert' | 'flee' | 'settled'); absent without a getter.
     */
    'photo:good': { id: string; stars: number; state?: string };
  }
}

declare module '../../core/state' {
  interface SystemStates {
    photo: PhotoSlice;
  }
}

export interface PhotoAlbumRow {
  id: string;
  label_de: string;
  stars: number;
  era: string;
  at: string;
  /** A JPEG of this session exists. */
  thumb: boolean;
}

export interface PhotoHooks {
  open(): boolean;
  close(): void;
  /** Take a picture now (as a click would). Null when the phone is down. */
  shoot(): ShotResult | null;
  album(): PhotoAlbumRow[];
  /** A good shot of that target exists (survives the album cap). */
  has(id: string): boolean;
  targets(): { id: string; era: string; label_de: string; placeholder: boolean; inWorld: boolean; at: Vec3 | null }[];
  /** Judge one target against the current view as a shot would, pixel test included, without shooting (null if unknown). */
  judge(id: string): TargetJudgement | null;
  state(): { open: boolean; zoom: number; signal: boolean; steady: number; blocked: string | null; lastShot: ShotResult | null };
  zoom(k: 1 | 2): void;
  /** Photo cards unlocked. */
  cards(): string[];
  /** The pixel test of the current view, as a shot runs it (visibility.ts): per target id with a drawn body. */
  seen(): Record<string, Seen>;
  /** The device-wide gallery (TASK-006, IndexedDB `kq-photos`). */
  gallery: {
    open(): Promise<void>;
    close(): void;
    state(): GalleryState;
    /** Stored photos, newest first, without the image data. */
    list(): Promise<(PhotoMeta & { id: number })[]>;
    count(): Promise<number>;
    remove(id: number): Promise<boolean>;
    /** 'idb', or 'memory' when IndexedDB is missing or blocked. */
    kind(): Promise<'idb' | 'memory'>;
    /** Resolves when every shot taken so far is stored (or refused). */
    settled(): Promise<void>;
  };
  /** ?debug only: the test deer pair (reh.ricke / reh.kitz). */
  deer?: {
    /** False (with a dev warning) when the deer targets are already attached or kq.animals reports deer. */
    spawn(x: number, z: number): boolean;
    calm(on: boolean): void;
    at(): { ricke: Vec3; kitz: Vec3 } | null;
    /** Set (with an argument) and read the deer's `state()` string carried on `photo:good` (default 'graze'; null without deer). */
    state(s?: string): string | null;
  };
}

declare module '../../debug/hooks' {
  interface KqHooks {
    /** Smartphone photo mode (src/systems/photo). */
    photo?: PhotoHooks;
  }
}

// ---- module-level registry: registerTarget / attachTarget work before and after init ---------

let ctxRef: GameContext | null = null;
const core = new PhotoCore(() => slice());

function slice(): PhotoSlice {
  if (!ctxRef) return fallbackSlice;
  const s = ctxRef.state.slice('photo', emptySlice);
  // an old or foreign save: fill what is missing once
  if (!Array.isArray(s.album) || !Array.isArray(s.good) || !Array.isArray(s.granted) || !Array.isArray(s.cards) || !s.near || !s.best) {
    const n = normaliseSlice(s);
    (ctxRef.state.mutable.systems as Record<string, unknown>).photo = n;
    return n;
  }
  return s;
}
const fallbackSlice = emptySlice();

/** Register (or replace, by id) a photo target at run time. Returns an unregister function. */
export function registerTarget(def: PhotoTargetDef): () => void {
  core.register(def);
  return () => core.unregister(def.id);
}

/**
 * Attach a live position (and optionally `calm()` and `state()`) to a target from the data file
 * by id: the animals system for `animal` anchors, the npc system for `npc` anchors. `state()` is
 * an opaque string read at the shot and carried on `photo:good { id, stars, state }` (e.g. the
 * deer's 'graze' | 'alert' | 'flee' | 'settled'); it changes no stars. Bindings stack per id by
 * handle (`PhotoCore.attach`): the newest remaining one is active, and the returned detach removes
 * exactly this one wherever it sits (a detached getter is never restored); with none left the
 * target goes back to its data anchor, or out of the world.
 */
export function attachTarget(id: string, live: PhotoLiveBinding): () => void {
  const off = core.attach(id, live);
  if (!off) {
    if (import.meta.env?.DEV) console.warn(`[photo] attachTarget: unknown target '${id}'`);
    return () => {};
  }
  return off;
}

/**
 * The drawn body of a target (`visibility.ts`): with one, a shot counts what the lens really sees
 * of it instead of sight rays. The animals system registers the deer's bodies through its bridge.
 */
export { registerSubject };

/** True while any live binding (`attachTarget`) holds that target. */
export function isAttached(id: string): boolean {
  return core.isAttached(id);
}

// ---- the system ------------------------------------------------------------------------------

/** Actions the phone takes over while it is up (their keys are the shutter / put-away). */
const MUTED: Action[] = ['attack', 'interact', 'bannlicht', 'lockOn', 'dodge', 'skill1', 'skill2', 'skill3', 'quickUse', 'throw', 'measure', 'listen', 'shift', 'xray', 'plans', 'pause'];
const THUMB_W = 480;
/** The targets the `?debug` test deer binds. */
const DEER_IDS = ['reh.ricke', 'reh.kitz'] as const;

/** Switch the phone controls and the gameplay HUD together. */
export function showViewfinder(
  on: boolean,
  root: Pick<HTMLElement, 'toggleAttribute'>,
  ...controls: Pick<HTMLElement, 'classList'>[]
): void {
  root.toggleAttribute('data-kq-photo', on);
  for (const el of controls) el.classList.toggle('kq-hidden', !on);
}
const THUMB_Q = 0.72;
const STAR = '★';

type Block = 'dialog' | 'combat' | 'fly' | 'scene' | 'menu';

class Photo {
  isOpen = false;
  private zoomK: 1 | 2 = 1;
  private readonly steady = new SteadyMeter();
  private readonly thumbs = new Map<string, string>();
  private white: string | null = null;
  private lastShot: ShotResult | null = null;
  private cooldown = 0;
  private conversation = false;
  private inlineChoice = false;
  private storyDialogue = false;
  private overridden = false;
  private readonly offs: (() => void)[] = [];
  private readonly el: HTMLElement;
  private readonly flash: HTMLElement;
  /** The 1× / 2× chips: their own layer above the touch controls (which cover the screen). */
  private readonly zoomBar: HTMLElement;
  private readonly card: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly zoomBtns: HTMLButtonElement[];
  private cardTimer = 0;
  private deer: DebugDeer | null = null;
  private board: { remove(): void } | null = null;
  private readonly world: PhotoWorld;
  /** The pixel test of the shot being judged (visibility.ts); null between shots. */
  private seenNow: Map<string, Seen> | null = null;
  private readonly vis = new ShotVisibility();
  /** The device-wide gallery (TASK-006): its store opens at boot, shots are stored in order. */
  private readonly library: Promise<PhotoLibrary>;
  private readonly gallery: GalleryView;
  private readonly galleryBtn: HTMLButtonElement;
  private saving: Promise<void> = Promise.resolve();
  private persistAsked = false;
  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.isOpen) return;
    // G (muted as the Bannlicht while the phone is up): the gallery; the pointer is locked, the button is out of reach
    if (e.code === 'KeyG' && !e.repeat) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.ctx.input.releaseLock();
      this.openGallery();
      return;
    }
    if (e.code !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    // the browser lets go of the pointer on Esc: mark it as ours, or the pause menu opens
    this.ctx.input.releaseLock();
    this.close();
  };

  constructor(private readonly ctx: GameContext) {
    const w = ctx.world;
    this.world = {
      heightAt: (x, z) => w.heightAt(x, z),
      blocked: (x, z) => w.collider.enabled && w.collider.hits(x, z, 0.05),
      trunks: (x, z, r, fn) => w.forest.trunksNear(x, z, r, fn),
      seen: (id) => this.seenNow?.get(id),
    };
    this.clock = h('span.kq-photo-clock', '14:31');
    this.zoomBtns = ([1, 2] as const).map((k) =>
      h('button', { type: 'button', 'aria-pressed': String(k === 1), 'data-testid': `photo-zoom-${k}`, onclick: () => this.setZoom(k) }, `${k}×`),
    );
    this.el = h('div.kq-photo.kq-hidden', { 'data-testid': 'photo', 'aria-hidden': 'true' }, [
      h('div.kq-photo-body', [
        h('div.kq-photo-grid'),
        h('div.kq-photo-focus'),
        h('div.kq-photo-status', [this.clock, h('span.kq-photo-net', [h('span.kq-photo-carrier', { 'data-testid': 'photo-net' }, ''), h('span.kq-photo-bars', [h('i'), h('i'), h('i'), h('i')]), h('span.kq-photo-batt')])]),
        h('div.kq-photo-nonet', { 'data-testid': 'photo-nonet', role: 'status' }, t('photo.nonet')),
        h('div.kq-photo-hint', t('photo.hint')),
      ]),
    ]);
    this.flash = h('div.kq-photo-flash', { 'aria-hidden': 'true' });
    this.card = h('div.kq-photo-card.kq-hidden', { 'data-testid': 'photo-card', role: 'status', 'aria-live': 'polite' });
    this.galleryBtn = h('button.kq-photo-gallery-btn', { type: 'button', 'data-testid': 'photo-gallery', onclick: () => this.openGallery() }, t('photo.gallery'));
    this.zoomBar = h('div.kq-photo-zoom.kq-hidden', [h('span.kq-photo-zoomset', { role: 'group', 'aria-label': t('photo.zoom') }, this.zoomBtns), this.galleryBtn]);
    ctx.ui.root.append(this.el, this.zoomBar, this.flash, this.card);
    this.library = openPhotoStore().then((s) => new PhotoLibrary(s));
    this.gallery = new GalleryView({
      modals: ctx.ui.modals,
      library: () => this.library,
      label: (id) => this.label(id),
      eraLabel: (era) => t(ERA_INFO[era]?.labelKey ?? 'era.today'),
      toast: (msg) => ctx.ui.toast(msg),
    });
  }

  /** The phone goes down and the gallery opens (from the phone's button or G, and from the album). */
  openGallery(): Promise<void> {
    if (this.isOpen) this.close();
    return this.gallery.open();
  }

  /**
   * Store a shot in the gallery (signal only). The frame is copied now; encoding and the write run
   * after, one shot after the other, and never hold up the card. A full gallery or a failed write
   * says so in a toast. The first stored photo asks the browser to keep the site's storage.
   */
  private keep(r: ShotResult, at: string): void {
    const ctx = this.ctx;
    const blobs = captureViewBlobs(ctx);
    const p = ctx.player.position;
    const meta = { at, playSeconds: ctx.state.state.meta.playSeconds, era: ctx.era.current, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, targets: [...r.targets], good: [...r.good], stars: r.stars };
    this.saving = this.saving.then(async () => {
      const b = await blobs;
      if (!b) return;
      const lib = await this.library;
      const out = await lib.save({ ...meta, width: b.width, height: b.height }, b.full, b.thumb);
      if (!out.ok) {
        const msg = out.reason === 'full' ? t('photo.gallery.full', { cap: lib.cap }) : t('photo.gallery.fail');
        // the HUD (and its toasts) is hidden behind the viewfinder: the card says it now, the toast once the phone is down
        this.cardNote(msg);
        ctx.ui.toast(msg);
      }
      else if (!this.persistAsked && lib.kind === 'idb') {
        this.persistAsked = true;
        void requestPersist();
      }
    });
  }

  init(): void {
    const ctx = this.ctx;
    // the data file's targets (kq-story content, plus the placeholders)
    for (const d of (targetsFile as unknown as PhotoTargetFile).targets ?? []) {
      try {
        core.register(targetFromData(d as PhotoTargetData, (x, z) => ctx.world.heightAt(x, z)));
      } catch (err) {
        console.warn('[photo] bad target in content/photo/targets.json', err);
      }
    }
    this.placeholders();
    const ev = ctx.events;
    this.offs.push(
      ev.on('npc:conversation', ({ open }) => {
        this.conversation = open;
        if (open) this.close(true);
      }),
      ev.on('story:inline-choice', ({ open }) => {
        this.inlineChoice = open;
        if (open) this.close(true);
      }),
      ev.on('story:phone-block', ({ active }) => {
        this.storyDialogue = active;
        if (active) this.close(true);
      }),
      ev.on('camera:override', ({ active }) => {
        this.overridden = active;
        if (active) this.close(true);
      }),
      ev.on('game:pause', ({ paused }) => paused && this.close(true)),
      ev.on('player:died', () => this.close(true)),
      ev.on('era:change', () => {
        this.syncSignal();
        this.close(true);
      }),
      ev.on('save:loaded', () => this.thumbs.clear()),
    );
    ctx.state.subscribe((_s, reason) => {
      if (reason === 'new' || reason === 'replace') this.thumbs.clear();
    });
    window.addEventListener('keydown', this.onKey, { capture: true });
    addControlKeys({ id: 'photo', actions: ['photo'] });
    addPausePage({ id: 'album', label: t('photo.album'), order: 70, render: (el) => this.renderAlbum(el) });
  }

  /** PLACEHOLDER subjects (demo.ts): the car-park board, and with ?debug the test deer. */
  private placeholders(): void {
    const ctx = this.ctx;
    const p = core.targets.get('photo.parkplatz');
    const at = (targetsFile as unknown as PhotoTargetFile).targets.find((x) => x.id === 'photo.parkplatz')?.at;
    if (p && at) {
      const g = buildBoard(ctx.scene, at.x, 0, at.z, 0);
      registerEraMaterials('photo.board', '*', () => buildBoard(new Scene(), 0, 0, 0));
      const ground = () => {
        const y = ctx.world.heightAt(at.x, at.z);
        if (Number.isFinite(y)) g.position.y = y - 0.05;
      };
      ground();
      const off = ctx.events.on('era:change', ({ to }) => {
        g.visible = to === 'today';
        ground();
      });
      g.visible = ctx.era.current === 'today';
      // the board's face centre (1.4 m up), not ground + r
      p.at = () => {
        const y = ctx.world.heightAt(at.x, at.z);
        return Number.isFinite(y) ? { x: at.x, y: y + 1.35, z: at.z } : null;
      };
      this.board = {
        remove: () => {
          off();
          ctx.scene.remove(g);
        },
      };
    }
    if (ctx.debug) this.spawnDeer(817, -704);
  }

  /**
   * The test deer yields to real animals: it refuses (dev warning, false) when `reh.ricke` /
   * `reh.kitz` are already attached by someone else, or when `kq.animals` reports deer.
   */
  spawnDeer(x: number, z: number): boolean {
    const ctx = this.ctx;
    if (this.deer) {
      this.deer.moveTo(x, z);
      return true;
    }
    const animals = (window.kq as unknown as { animals?: unknown } | undefined)?.animals;
    const why = debugDeerBlocker(DEER_IDS, isAttached, animals);
    if (why) {
      if (import.meta.env?.DEV || ctx.debug) console.warn(`[photo] debug deer not spawned: ${why}`);
      return false;
    }
    const d = (this.deer = new DebugDeer(ctx.scene, x, z, (px, pz) => ctx.world.heightAt(px, pz)));
    const today = () => ctx.era.current === 'today';
    d.group.visible = today();
    this.offs.push(
      ctx.events.on('era:change', () => (d.group.visible = today())),
      attachTarget('reh.ricke', { at: () => (today() ? d.doeAt() : null), calm: () => d.calm, state: () => d.state }),
      attachTarget('reh.kitz', { at: () => (today() ? d.fawnAt() : null), calm: () => d.calm, state: () => d.state }),
      registerSubject('reh.ricke', () => d.doe),
      registerSubject('reh.kitz', () => d.fawn),
    );
    return true;
  }

  deerHooks(): NonNullable<PhotoHooks['deer']> {
    return {
      spawn: (x, z) => this.spawnDeer(x, z),
      calm: (on) => {
        if (this.deer) this.deer.calm = on;
      },
      at: () => (this.deer ? { ricke: { ...this.deer.doeAt() }, kitz: { ...this.deer.fawnAt() } } : null),
      state: (s) => {
        if (!this.deer) return null;
        if (s !== undefined) this.deer.state = s;
        return this.deer.state;
      },
    };
  }

  /** Why the phone may not come up now (null = it may). */
  blocked(): Block | null {
    const ctx = this.ctx;
    if (ctx.pause.paused || ctx.ui.modals.count > 0 || !ctx.input.enabled) return 'menu';
    if (this.overridden || ctx.player.frozen) return 'scene';
    if (this.conversation || this.inlineChoice || this.storyDialogue || cameraHints.focus) return 'dialog';
    if (cameraHints.fight.length > 0 || cameraHints.boss > 0) return 'combat';
    if (ctx.player.flying) return 'fly';
    return null;
  }

  open(): boolean {
    if (this.isOpen) return true;
    const b = this.blocked();
    if (b) {
      this.ctx.ui.toast(t(`photo.toast.${b}`));
      return false;
    }
    this.isOpen = true;
    this.cooldown = 0.25;
    this.steady.reset();
    const pl = this.ctx.player;
    pl.rig.setPhoto(true);
    this.setZoom(1);
    for (const a of MUTED) this.ctx.input.muted.add(a);
    showViewfinder(true, document.documentElement, this.el, this.zoomBar);
    // level, skill and reward cards wait while the phone is up: not in the viewfinder (M-18)
    this.ctx.ui.cards.hold('photo', true);
    this.syncSignal();
    if (this.ctx.era.current !== 'today') this.ctx.ui.toast(t('photo.toast.nonet'));
    this.ctx.events.emit('photo:open', {});
    return true;
  }

  /** Phone down. `forced` (anything but the player's own N / Esc / right click): the lens snaps to 1×. */
  close(forced = false): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    lensDown(this.ctx.player.rig, this.ctx.camera, forced);
    for (const a of MUTED) this.ctx.input.muted.delete(a);
    showViewfinder(false, document.documentElement, this.el, this.zoomBar);
    this.ctx.ui.cards.hold('photo', false);
    this.ctx.events.emit('photo:close', {});
  }

  setZoom(k: 1 | 2): void {
    this.zoomK = k;
    if (this.isOpen) this.ctx.player.rig.setFovScale(k);
    this.zoomBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === k)));
  }

  private syncSignal(): void {
    const off = this.ctx.era.current !== 'today';
    this.el.classList.toggle('kq-nonet', off);
    const carrier = this.el.querySelector('.kq-photo-carrier');
    if (carrier) carrier.textContent = off ? t('photo.nonet') : '';
  }

  update(dt: number): void {
    const inp = this.ctx.input;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const pl = this.ctx.player;
    core.tick(dt, this.ctx.era.current, pl.position);
    if (inp.wasPressed('photo')) {
      if (this.isOpen) this.close();
      else this.open();
      return;
    }
    if (!this.isOpen) return;
    const b = this.blocked();
    if (b) {
      if (b !== 'menu') this.ctx.ui.toast(t(`photo.toast.${b}`));
      this.close(true);
      return;
    }
    if (inp.wasPressed('bannlicht', true) || inp.wasPressed('pause', true)) {
      this.close();
      return;
    }
    if (inp.wasPressed('attack', true) || inp.wasPressed('interact', true)) this.shoot();
  }

  frame(dt: number): void {
    const now = performance.now() / 1000;
    const cam = this.ctx.camera;
    if (this.isOpen) {
      this.steady.push(now, cam.rotation.y, cam.rotation.x);
      this.el.classList.toggle('kq-shaky', this.steady.speed(now) > 0.35);
      // the phone's clock: the strict afternoon (14:31 at the start), one game minute per minute played
      const mins = 14 * 60 + 31 + Math.floor(this.ctx.state.state.meta.playSeconds / 60);
      const txt = `${Math.floor(mins / 60) % 24}:${String(mins % 60).padStart(2, '0')}`;
      if (this.clock.textContent !== txt) this.clock.textContent = txt;
      // the wheel while the phone is up switches the rig's 1× / 2× (CameraRig.addZoom): follow it
      const k = this.ctx.player.rig.fovWanted >= 1.5 ? 2 : 1;
      if (k !== this.zoomK) this.setZoom(k);
    }
    this.deer?.frame(dt);
  }

  view(): PhotoView {
    const cam = this.ctx.camera;
    return {
      x: cam.position.x,
      y: cam.position.y,
      z: cam.position.z,
      yaw: cam.rotation.y,
      pitch: cam.rotation.x,
      fovV: cam.fov,
      aspect: cam.aspect || 16 / 9,
      angularSpeed: this.steady.speed(performance.now() / 1000),
    };
  }

  shoot(): ShotResult | null {
    if (!this.isOpen || this.cooldown > 0) return null;
    this.cooldown = 0.6;
    const ctx = this.ctx;
    const r = this.judgeSeen();
    let img: string | null;
    if (!r.signal) img = this.whiteImage();
    else img = captureView(ctx, THUMB_W, THUMB_Q);
    const at = new Date().toISOString();
    // every shot with signal goes to the gallery (a past era's white picture does not)
    if (r.signal) this.keep(r, at);
    const booked = core.book(r, at, ctx.state.state.meta.playSeconds, {
      knownFact: (id) => ctx.content.facts.has(id),
      knownCard: (id) => ((targetsFile as unknown as PhotoTargetFile).cards ?? []).some((c) => c.id === id),
      codex: (id) => {
        const facts = ctx.state.mutable.codex.facts;
        if (facts.includes(id)) return;
        facts.push(id);
        ctx.events.emit('codex:unlocked', { factId: id, noXp: true });
      },
      card: (id) => {
        const cards = slice().cards;
        if (!cards.includes(id)) cards.push(id);
      },
      flag: (id) => (ctx.state.mutable.flags[id] = true),
      warn: (msg) => {
        if (import.meta.env?.DEV || ctx.debug) console.warn(`[photo] ${msg}`);
      },
    });
    if (img) for (const e of booked) this.thumbs.set(e.id, img);
    for (const id of r.good) if (img && !this.thumbs.has(id)) this.thumbs.set(id, img);
    this.lastShot = r;
    ctx.events.emit('photo:shot', { targets: r.targets, good: r.good, stars: r.stars, noSignal: !r.signal });
    for (const e of goodEvents(r)) ctx.events.emit('photo:good', e);
    if (booked.length) ctx.save.autosave('photo');
    this.showFlash();
    this.showCard(r, img);
    this.cardTip(r);
    return r;
  }

  /**
   * Judge the view as a shot does: bodies in the world are measured by pixels first (one small
   * extra draw of the scene, only now and only while such a body is drawn), the rest by sight rays.
   */
  private judgeSeen(): ShotResult {
    const { renderer, scene, camera, era } = this.ctx;
    this.seenNow = era.current === 'today' ? this.vis.measure(renderer, scene, camera) : null;
    try {
      return core.judge(era.current, this.view(), this.world);
    } finally {
      this.seenNow = null;
    }
  }

  /** Under a weak shot's card: what to change (visibility.ts `shotTip`); the card stays a little longer. */
  private cardTip(r: ShotResult): void {
    const tip = shotTip(r, (id) => {
      const d = core.targets.get(id);
      return d && Math.max(d.maxDist, d.fallbackDist ?? 0);
    });
    if (!tip) return;
    this.card.append(h('div.kq-photo-tip', { 'data-testid': 'photo-card-tip' }, tip));
    window.clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => this.card.classList.add('kq-hidden'), 5200);
  }

  private whiteImage(): string | null {
    if (this.white) return this.white;
    try {
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 90;
      const g = c.getContext('2d');
      if (!g) return null;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 160, 90);
      this.white = c.toDataURL('image/jpeg', 0.8);
    } catch {
      this.white = null;
    }
    return this.white;
  }

  private showFlash(): void {
    const f = this.flash;
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  private stars(n: number): HTMLElement {
    const el = h('span.kq-photo-stars', { 'aria-label': t('photo.stars', { n }), 'data-stars': String(n) });
    for (let i = 1; i <= 3; i++) el.append(h(i <= n ? 'span' : 'span.off', STAR));
    return el;
  }

  private label(id: string): string {
    return core.targets.get(id)?.label_de ?? t('photo.album.unknown');
  }

  private showCard(r: ShotResult, img: string | null): void {
    const c = this.card;
    c.replaceChildren(
      h('img', { src: img ?? '', alt: '', 'data-testid': 'photo-card-img', 'data-white': String(!r.signal) }),
      this.stars(r.signal ? r.stars : 0),
      h('div.kq-photo-verdict', { 'data-testid': 'photo-verdict' }, r.verdict_de),
      h('div.kq-photo-label', r.good.map((id) => this.label(id)).join(' · ')),
    );
    c.classList.remove('kq-hidden');
    c.style.animation = 'none';
    void c.offsetWidth;
    c.style.animation = '';
    window.clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => c.classList.add('kq-hidden'), 3200);
  }

  /** A line under the shot's card (it stays visible in the viewfinder), e.g. a full gallery. */
  private cardNote(text: string): void {
    this.card.querySelector('.kq-photo-note')?.remove();
    this.card.append(h('div.kq-photo-note', { 'data-testid': 'photo-card-note' }, text));
  }

  album(): PhotoAlbumRow[] {
    return slice().album.map((e: AlbumEntry) => ({ id: e.id, label_de: this.label(e.id), stars: e.stars, era: e.era, at: e.at, thumb: this.thumbs.has(e.id) }));
  }

  private renderAlbum(el: HTMLElement): void {
    const rows = slice().album;
    el.replaceChildren();
    // the gallery (every photo, on this device) opens over the album
    const galleryBtn = h('button.kq-btn.kq-album-gallery', { type: 'button', 'data-testid': 'album-gallery', onclick: () => void this.openGallery() }, t('photo.gallery.open'));
    if (!rows.length) {
      el.append(h('p.kq-album-empty', { 'data-testid': 'album-empty' }, t('photo.album.empty')), galleryBtn);
      return;
    }
    const grid = h('div.kq-album-grid', { 'data-testid': 'album-grid' });
    for (const e of [...rows].reverse()) {
      const thumb = this.thumbs.get(e.id);
      const pic = thumb ? h('img', { src: thumb, alt: this.label(e.id) }) : h('div.kq-album-stock', this.label(e.id));
      const time = new Date(e.at);
      const when = Number.isFinite(time.getTime()) ? `${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')}` : '';
      grid.append(
        h('figure.kq-album-entry', { 'data-testid': `album-entry-${e.id}`, 'data-thumb': String(!!thumb) }, [
          pic,
          this.stars(e.stars),
          h('figcaption', this.label(e.id)),
          h('div.kq-album-meta', [t(ERA_INFO[e.era]?.labelKey ?? 'era.today'), when ? ` · ${when}` : '']),
        ]),
      );
    }
    el.append(grid);
    if (rows.some((e) => this.thumbs.has(e.id))) el.append(h('p.kq-album-meta', t('photo.album.session')));
    el.append(galleryBtn);
  }

  hooks(): PhotoHooks {
    return {
      open: () => this.open(),
      close: () => this.close(),
      shoot: () => {
        this.cooldown = 0;
        return this.shoot();
      },
      album: () => this.album(),
      has: (id) => core.has(id),
      targets: () =>
        [...core.targets.values()].map((x) => {
          const at = x.at();
          return { id: x.id, era: x.era, label_de: x.label_de, placeholder: !!x.placeholder, inWorld: !!at, at: at ? { ...at } : null };
        }),
      judge: (id) => {
        const r = this.judgeSeen();
        return r.details.find((d) => d.id === id) ?? null;
      },
      state: () => ({ open: this.isOpen, zoom: this.zoomK, signal: this.ctx.era.current === 'today', steady: this.steady.speed(performance.now() / 1000), blocked: this.blocked(), lastShot: this.lastShot }),
      zoom: (k) => this.setZoom(k),
      cards: () => [...slice().cards],
      seen: () => Object.fromEntries(this.vis.measure(this.ctx.renderer, this.ctx.scene, this.ctx.camera) ?? []),
      gallery: {
        open: () => this.openGallery(),
        close: () => this.gallery.close(),
        state: () => this.gallery.state(),
        list: async () => (await (await this.library).list()).map(({ thumb: _thumb, ...m }) => m),
        count: async () => (await this.library).count(),
        remove: async (id) => (await this.library).remove(id),
        kind: async () => (await this.library).kind,
        settled: () => this.saving,
      },
      ...(this.ctx.debug ? { deer: this.deerHooks() } : {}),
    };
  }

  dispose(): void {
    this.close(true);
    this.gallery.close();
    for (const off of this.offs) off();
    window.removeEventListener('keydown', this.onKey, { capture: true });
    this.deer?.dispose();
    this.vis.dispose();
    this.board?.remove();
    this.el.remove();
    this.zoomBar.remove();
    this.flash.remove();
    this.card.remove();
  }
}

let photo: Photo | null = null;
let hooks: PhotoHooks | null = null;

export default defineSystem({
  id: 'photo',
  init(ctx) {
    ctxRef = ctx;
    photo = new Photo(ctx);
    photo.init();
    hooks = photo.hooks();
    if (window.kq) window.kq.photo = hooks;
  },
  update(dt) {
    if (hooks && window.kq && window.kq.photo !== hooks) window.kq.photo = hooks;
    photo?.update(dt);
  },
  frame(dt) {
    photo?.frame(dt);
  },
  dispose() {
    photo?.dispose();
    photo = null;
    ctxRef = null;
  },
});
