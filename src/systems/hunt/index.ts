/**
 * Feature system "hunt": Die Meute (spectral hound pack), Der Pikeur (huntsman) and the lantern.
 *
 * - Activation ONLY via 'threat:configure' {kind:'pack'} from the story (or kq.hunt.start()).
 * - The AI is a deterministic simulation (sim.ts) stepped in the fixed update; visuals, sound,
 *   captions and HUD follow it. Caught → ≈2 s sequence → 'player:caught' {by:'pack'} → pack ends.
 *   With a story system the story's curtain takes over at that point (no hunt title).
 * - The pack ends on 'era:change' (it belongs to the era it was configured in) and 'hub:enter'.
 * - The lantern (L) lights the world through atmosphere.uLantern*, drains oil while lit, raises
 *   the pack's sight range; oil persists in the 'hunt' state slice and refills on 'hub:enter'.
 *
 * - Snow (1793-02 or a snowy look): footprints of the player, the hounds and the horse persist as
 *   decals; the pack TRACKS your prints until the trail breaks (water, stone, road, rock); the
 *   player reads the pack's prints (Spurenleser) when crouching / standing over them.
 * - Modes via threat:configure {kind:'pack', mode}: 'patrol' (default), 'drive' (Ch. 4, herds you
 *   to `target` over `via`), 'finale' (W8 at the kennel), 'parforce' (Ch. 2 long chase to `target`).
 *   See modes.ts. An active pack config is saved in the slice and restored after a load.
 *
 * Contract events emitted: hunt:alert, hunt:horn, hunt:finale, lantern:toggle, lantern:oil,
 * lantern:empty, player:caught ({soft:true} = brought home, nothing lost). Feature-private:
 * hunt:start, hunt:end, hunt:tracking, hunt:goal, hunt:rest, hunt:read (declared below).
 */
import './strings';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { hasString } from '../../i18n';
import type { Stance } from '../../player/stance';
import { pointInRing } from '../../world/collision';
import type { ThreatConfig } from '../contracts';
import { HuntAudio } from './audio';
import { SightCones } from './cones';
import { PathGraph } from './graph';
import { LanternView } from './lantern';
import { type LanternState, drain, newLantern, refill, toggle } from './lanternLogic';
import { type ArrowKind, HuntOverlay } from './overlay';
import type { PlayerSense } from './perception';
import { KennelGate, gateFrame } from './kennelGate';
import { DriveMode, FinaleMode, KENNEL_DOOR_S, KennelMode, ParforceMode, StandMode, makeMode } from './modes';
import { hashSeed } from './rng';
import { type Agent, type HornSignal, MAX_HOUNDS, type PackMode, type PackOptions, PackSim, type PackState, type SimEvent, type SimWorld, type XZ, headingTo } from './sim';
import { TrackVisuals } from './trackVisuals';
import { type PackReading, TrackField, type TrailBreak, ageWord, compassWord } from './tracks';
import { PackVisuals } from './visuals';

/** Horn signal → call id of the bible captions (ui.horn.<call>, ui.horn.<call>.tracker). */
const HORN_CALL: Record<HornSignal, string> = { search: 'anblasen', found: 'faehrte', lost: 'verloren', 'call-off': 'sammeln' };

export interface HuntSlice {
  /** Current pack alert 0..1 (mirror of the last 'hunt:alert'; 0 when no pack is out). */
  alert?: number;
  /** Lantern oil and lit state (persists; refilled on 'hub:enter'). Filled in on first use. */
  lantern?: LanternState;
  /** How often the pack has caught the player (stats, story may read it). */
  caught?: number;
  /** The active pack (configuration + era); restored after a load, cleared when it ends. */
  pack?: SavedPack | null;
  /** K3: the Zwinger's Gittertüren were opened (they stay open in 1793-07). */
  kennelOpen?: boolean;
}

/** JSON-safe pack configuration as saved in the slice. */
export interface SavedPack {
  era: string;
  opts: HuntStartOptions;
}

declare module '../../core/state' {
  interface SystemStates {
    hunt: HuntSlice;
  }
}

declare module '../contracts' {
  interface ThreatConfig {
    /** pack only: number of hounds 3–10 (default 3 + 2·intensity, +1 in Rauhnacht). */
    hounds?: number;
    /** pack only: the Pikeur rides along (default: intensity ≥ 0.6 or Rauhnacht). */
    pikeur?: boolean;
    /** pack only: base sight (m) for a standing unlit player (default by era: night 30, frost fog 15). */
    sight?: number;
    /** pack only: RNG seed (default derived from the area → reproducible beats). */
    seed?: number;
    /**
     * pack only: behaviour (default 'patrol').
     *  'drive'    the pack herds the player towards `target` (over `via`), never stalls him;
     *             pushing back past them = soft catch ("heimgebracht", player:caught {soft}).
     *  'finale'   W8: gathers in a circle around the player (or `target`), calms down once the
     *             player lies flat with the lantern lit (one-key / gentle: lying is enough) →
     *             'hunt:finale' {outcome: gathered | returned | calmed | faded}.
     *  'parforce' Ch. 2 long chase from `from` with `headStart` s, paced (surges, breathers, the
     *             Pikeur riding in from a flank); ends at `target` / water ('hunt:goal').
     *  'follow'   Ending C: the hounds walk in the player's footsteps at a distance, harmless.
     *  'stand'    K1 finale: the pack holds the player at `target` (arc on the `from` side,
     *             blockers across the way out); breaking out draws lunges, running off = caught.
     *  'kennel'   K3: the pack paces the kennel yard (`target`, `radius`); cue `hunt:release`
     *             opens the gates and they run out along `via` into the night.
     */
    mode?: 'patrol' | 'drive' | 'finale' | 'parforce' | 'follow' | 'stand' | 'kennel';
    /** pack drive/parforce/finale: the goal (drive, parforce) or circle centre (finale). */
    target?: { x: number; z: number };
    /** pack drive: waypoints on the way to the target. */
    via?: { x: number; z: number }[];
    /** pack parforce: where the hounds are let go. */
    from?: { x: number; z: number };
    /** pack parforce: seconds of head start (default 6, gentle 8). */
    headStart?: number;
    /** pack drive/parforce: arrival radius around `target` (drive 18, parforce 25). */
    goalRadius?: number;
    /** pack parforce: gap (m) the hounds settle at behind a runner (default 9). */
    heel?: number;
    /** pack parforce: rubber-band factor beyond the heel (a short chase that must be felt, default 1). */
    burst?: number;
    /**
     * pack parforce: at the heel the hounds keep a runner's pace instead of overtaking — whoever
     * keeps running is not caught (chapter 1's first chase is won by running; default false).
     */
    keepPace?: boolean;
    /** pack: snow tracks on/off (default: on in 1793-02 or a snowy look). */
    snow?: boolean;
    /** pack parforce: hounds that run ahead on the flanks and cut off the way (lunging from the side). */
    flankers?: number;
    /** pack parforce / stand: telegraphed lunges (dodge with Space); bites cost ground, `maxBites` = caught. */
    lunges?: boolean;
    /** pack parforce: the Pikeur stays this far off on his flank (seen, never riding in). */
    pikeurFar?: number;
    /** pack: bites before the pack has you (default 3, gentle 5). */
    maxBites?: number;
    /** pack patrol: sentry beats — hound i walks from `a` to `b` and back (K2 sneak). */
    beats?: { a: { x: number; z: number }; b: { x: number; z: number }; speed?: number }[];
  }
}

declare module '../../core/events' {
  interface GameEvents {
    /** The pack appeared (threat:configure or kq.hunt.start). */
    'hunt:start': { x: number; z: number; radius: number; hounds: number; pikeur: boolean };
    /** The pack is gone (configured off, caught the player, hub, era, escaped at the goal, debug). */
    'hunt:end': { reason: HuntEndReason };
    /** Snow: the pack picked up / lost the player's trail (why: what broke it). */
    'hunt:tracking': { on: boolean; x: number; z: number; why?: 'water' | 'stone' | 'road' | 'rock' };
    /** kennel (K3): the Gittertüren swing open and the pack bursts out (E at the gate, or story cue 'hunt:release'). */
    'hunt:release': { x: number; z: number; by: 'player' | 'cue' };
    /** drive: the player arrived at the target; parforce: escaped (water / target); kennel: the pack ran out and is gone. */
    'hunt:goal': { mode: 'drive' | 'parforce' | 'kennel'; x: number; z: number };
    /** A lunge landed (n of max; max = caught). */
    'hunt:bite': { n: number; max: number };
    /** parforce pacing: a breather starts / ends. */
    'hunt:rest': { on: boolean };
    /** Spurenleser: the player read the pack's prints. */
    'hunt:read': { kind: 'paw' | 'hoof'; age: number; count: number; heading: number };
  }
}

/** K3 Zwinger: the yard (footprint id) and the pack's first waypoint just outside its gate. */
const KENNEL_YARD = 'KB-B23';
const KENNEL_GATE_NEAR: XZ = { x: 1252, z: -1579 };
/** Distance band (m) from the gate in which E opens it. */
export const KENNEL_PROMPT_MIN = 3;
export const KENNEL_PROMPT_MAX = 7.5;

export type HuntEndReason = 'configure' | 'caught' | 'hub' | 'era' | 'escaped' | 'debug';

declare module '../../core/save' {
  interface Settings {
    /** Rauhnacht hard mode: faster pack, 30 % less oil, the Pikeur rides from the start. */
    rauhnacht?: boolean;
    /** Direction arrows at the screen edge for threat sounds (default on). */
    soundIndicators?: boolean;
    /** "Eine Taste für Aktionen": lying flat in the finale lights the lantern too (bible 05 §9). */
    oneKey?: boolean;
  }
}

export interface HuntStartOptions {
  x?: number;
  z?: number;
  radius?: number;
  intensity?: number;
  hounds?: number;
  pikeur?: boolean;
  seed?: number;
  sight?: number;
  mode?: PackMode;
  target?: XZ;
  via?: XZ[];
  from?: XZ;
  headStart?: number;
  goalRadius?: number;
  heel?: number;
  burst?: number;
  keepPace?: boolean;
  /** Snow tracks (default: by era / look). */
  snow?: boolean;
  flankers?: number;
  lunges?: boolean;
  pikeurFar?: number;
  maxBites?: number;
  beats?: { a: XZ; b: XZ; speed?: number }[];
}

export interface HuntHooks {
  /** Activate the pack (defaults: around the player, radius 160, intensity 0.5). */
  start(o?: HuntStartOptions): ReturnType<PackSim['snapshot']>;
  stop(): void;
  state(): (ReturnType<PackSim['snapshot']> & { active: boolean; caughtT: number }) | null;
  /** Force a pack state (emits the matching horn); `x/z` = last known position. */
  setState(s: PackState, x?: number, z?: number): void;
  /** Place agent i (0 = Pikeur if present) at x/z, yaw in degrees (0 north, 90 east). */
  place(i: number, x: number, z: number, yawDeg?: number): void;
  /** Place agent i `dist` m in front of the view, `angleDeg` to the right, facing the player. */
  placeInView(i: number, dist: number, angleDeg?: number, facePlayer?: boolean): void;
  /** Freeze/unfreeze the AI movement (perception keeps running). */
  freeze(on?: boolean): void;
  horn(signal: HornSignal): void;
  /** Trigger the caught sequence with the nearest hound. */
  catch(): void;
  /** Hunt/lantern/caught events seen so far (name, payload, tick). */
  events(): { name: string; payload: unknown; tick: number }[];
  /** Raw simulation (tests). */
  sim(): PackSim | null;
  /** Apply a threat configuration as the story would (kind 'pack' implied). */
  configure(c: Omit<ThreatConfig, 'kind'> & { kind?: 'pack' }): void;
  /** Snow prints: counts per kind, the trail segment and the clock. */
  tracks(): { boot: number; paw: number; hoof: number; seg: number; now: number; snow: number; tracking: boolean };
  /** Lay a line of player prints (debug / screenshots): from x0/z0 to x1/z1, one per `step` m. */
  walkPrints(x0: number, z0: number, x1: number, z1: number, step?: number): number;
  /** Spurenleser: what the pack's prints at the player tell (null = none). */
  readTracks(): (PackReading & { text: string }) | null;
  /** K3 Zwinger: the Gittertüren (placed, open, E prompt shown), the release path and the nearest a hound came. */
  kennel(): { placed: boolean; open: boolean; prompt: boolean; x: number; z: number; nx: number; nz: number; path: XZ[]; nearest: number } | null;
  /** Finale / drive / parforce controller state. */
  mode(): { mode: PackMode; phase?: string; calm?: number; pressure?: number; rests?: number; rideIns?: number; bites?: number; lunges?: number } | null;
  /** The staged picture of the endings (cue 'hunt:tableau'): kind and per-hound lie/gone. */
  tableau(): { kind: string; t: number; lie: number[]; gone: number[] } | null;
  /** The saved pack configuration (slice). */
  saved(): SavedPack | null;
}

export interface LanternHooks {
  toggle(on?: boolean): boolean;
  setOil(v: number): void;
  refill(): void;
  setSeconds(s: number): void;
  state(): LanternState & { light: number };
}

declare module '../../debug/hooks' {
  interface KqHooks {
    hunt?: HuntHooks;
    lantern?: LanternHooks;
  }
}

const NUM_DE = ['null', 'einem', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn'];

/** Seconds from caught to 'player:caught' (the sequence itself). */
const CAUGHT_EMIT = 2.0;
const CAUGHT_END = 4.6;

class Hunt {
  readonly audio: HuntAudio;
  readonly visuals = new PackVisuals();
  readonly lanternView: LanternView;
  readonly overlay: HuntOverlay;
  sim: PackSim | null = null;
  /** Sight cones on the ground (K2 sneak: flags['hunt.cones']). */
  private readonly cones = new SightCones();
  private graph: PathGraph | null = null;
  /** Agents of a pack that is fading out. */
  private fading: { agents: Agent[]; state: PackState; t: number } | null = null;
  private needPrewarm = false;
  private hudAlert = 0;
  private threatOwned = false;
  private lastAlert = { level: -1, state: '' as PackState | '', at: -1 };
  private hornGlowT = 0;
  private hornGlowDur = 1;
  private hbT = 0;
  private caughtT = -1;
  private caughtBy: Agent | null = null;
  private caughtEmitted = false;
  private prevDesat = 0;
  private readonly captionAt = new Map<string, number>();
  private readonly agentAudio = new Map<Agent, { paw: number; pant: number; hoof: number }>();
  private readonly log: { name: string; payload: unknown; tick: number }[] = [];
  private lowWarned = false;
  /** A conversation is open (the oil does not burn meanwhile). */
  private talking = false;
  private lastLit = false;
  private hooksInstalled = false;
  /** Prints in the snow (player trail + the pack's). */
  readonly tracks = new TrackField();
  readonly trackVis = new TrackVisuals();
  private lastStep: XZ | null = null;
  private stepSide = 1;
  private readT = 0;
  private roads: { grid: Uint8Array; x0: number; z0: number; cols: number; rows: number } | null = null;
  /** A saved pack waits for the first update after init / load. */
  private restorePending = false;
  /** Seconds since the parforce goal (the pack stops a little later). */
  private escapedT = -1;
  /** Finale: bring the player back at full black (centre). */
  private returnTo: XZ | null = null;
  private returnT = 0;
  private finalePrompt: string | null = null;
  private caughtSoft = false;
  /** Story cue 'hunt:hold': freeze the pack for `seconds` (waits ≤ 2 s while a hound is close). */
  private holdReq: { seconds: number; waited: number } | null = null;
  private holdLeft = 0;
  /** Seconds left of a dodge roll's i-frames (Space; combat performs the roll). */
  private dodgeT = 0;
  /** Seconds left of the camera kick after a bite. */
  private biteT = 0;
  private biteDir = { x: 0, z: 0 };
  private lungeTaught = false;
  /** Seconds after the kennel pack ran out (the pack ends a little later). */
  private releasedT = -1;
  /** Loop time of the Zwinger breakout: the hounds are in plain view, their sound captions keep quiet. */
  private breakoutAt = -1e9;
  private breakoutBusy = false;
  /** K3: the Zwinger's Gittertüren (era 1793-07), the E prompt at them, the camera nudge on release. */
  readonly gate = new KennelGate();
  private gatePlaced = false;
  private gatePrompt = false;
  private nudgeT = 0;
  private nudgeTo: XZ | null = null;
  private passShake = 0;
  private passShook = false;
  /** Closest a released hound came to the player (m; Infinity before the release). */
  private passNearest = Infinity;
  /** A staged picture without a simulation (story cue 'hunt:tableau', the endings). */
  private tableau: { kind: 'lie' | 'eyes' | 'rest'; agents: Agent[]; t: number; horn: boolean; stagger?: number } | null = null;

  constructor(readonly ctx: GameContext) {
    this.audio = new HuntAudio(ctx.audio);
    this.lanternView = new LanternView(ctx.scene);
    ctx.scene.add(this.visuals.object);
    ctx.scene.add(this.cones.object);
    ctx.scene.add(this.trackVis.mesh);
    ctx.scene.add(this.gate.object);
    this.visuals.object.visible = false;
    this.overlay = new HuntOverlay(ctx.ui.layer('hunt'), { caught: ctx.t('hunt.caught.title'), caughtSub: ctx.t('hunt.caught.sub') });
    const ev = ctx.events;
    ev.onAny((name, payload) => {
      if (/^(hunt:|lantern:|player:caught|threat:configure)/.test(name)) {
        this.log.push({ name, payload, tick: ctx.loop.tick });
        if (this.log.length > 300) this.log.shift();
      }
    });
    ev.on('threat:configure', (c) => this.configure(c));
    ev.on('npc:conversation', ({ open }) => (this.talking = open));
    // round 2: the story's oil meter lights (and refills) the lantern for a timed beat
    ev.on('lantern:request', ({ lit, refill }) => {
      if (refill) this.refill();
      this.setLit(lit, false);
    });
    // arriving home (the spring's hub ring, src/systems/home.ts; the story emits hub:enter) ends the
    // pack and refills the lantern
    ev.on('hub:enter', () => {
      this.stop('hub');
      this.refill();
    });
    // the pack belongs to the era it was configured in: a shift (or the return after being caught)
    // ends it; the story re-issues threat:configure when the beat wants it again
    ev.on('era:change', () => {
      this.stop('era');
      this.tracks.clear();
      this.lastStep = null;
    });
    ev.on('save:loaded', () => {
      this.syncLantern(true);
      if (this.sim) this.stop('debug', true);
      this.restorePending = true;
    });
    // story set pieces (ch. 2): the Warner's trail in the hoarfrost; the pack holds still during W4
    ev.on('story:cue', ({ id, data }) => {
      if (id === 'hunt:trail') this.layTrail(data ?? {});
      else if (id === 'hunt:release') this.releaseKennel('cue'); else if (id === 'hunt:tableau') this.setTableau(data ?? {});
      else if (id === 'hunt:hold') {
        const s = data?.['seconds'];
        this.holdReq = { seconds: typeof s === 'number' && s > 0 ? s : 8, waited: 0 };
      }
    });
    // the Bannlicht flare scatters the hounds in its cone for 4 s (they are never damaged)
    ev.on('combat:bann', ({ x, z, yaw, range, angle }) => {
      const n = this.sim?.scatter(x, z, yaw, range, angle, 4) ?? 0;
      if (n > 0) this.caption('scatter', ctx.t('combat.hounds'), 30, 2800);
    });
    ev.on('player:step', ({ x, z, running }) => this.footprint(x, z, running));
    ev.on('player:teleport', () => (this.lastStep = null));
    // a pack that was out when the game was saved comes back (first update, all systems ready)
    this.restorePending = true;
    ev.on('settings:change', ({ key }) => {
      if (this.sim && (key === 'gentleMode' || key === 'rauhnacht' || key === 'oneKey')) this.sim.retune({ ...this.mode(), oneKey: this.oneKey() });
    });
    this.syncLantern(true);
  }

  // ---- state --------------------------------------------------------------------------------

  slice(): Required<HuntSlice> {
    const s = this.ctx.state.slice('hunt', () => ({ alert: 0, lantern: newLantern(), caught: 0, pack: null, kennelOpen: false }));
    if (typeof s.kennelOpen !== 'boolean') s.kennelOpen = false;
    if (!s.lantern || typeof s.lantern.oil !== 'number') s.lantern = newLantern();
    if (typeof s.caught !== 'number') s.caught = 0;
    if (typeof s.alert !== 'number') s.alert = 0;
    if (s.pack === undefined) s.pack = null;
    return s as Required<HuntSlice>;
  }

  /** One key for actions (settings) or gentle mode: lying flat is enough in the finale. */
  oneKey(): boolean {
    return this.ctx.settings.state.oneKey === true || this.ctx.settings.state.gentleMode;
  }

  // ---- snow ---------------------------------------------------------------------------------

  /** 0..1 snow on the ground: the frost night of 1793-02, or any snowy look. */
  snowAmount(): number {
    if (this.snowOverride !== null) return this.snowOverride ? 1 : 0;
    if (this.ctx.era.current === '1793-02') return 1;
    const sn = this.ctx.world.look.snow;
    return sn > 0.3 ? Math.min(1, sn / 0.85) : 0;
  }

  private snowOverride: boolean | null = null;

  /** Where a trail breaks: water, stone (cobbles / terrace paving, inside a building), a road, steep rock. */
  readonly trailBreakAt = (x: number, z: number): TrailBreak => {
    const w = this.ctx.world;
    const s = w.surfaceAt(x, z);
    if (s === 'water') return 'water';
    // a snowed-over gravel avenue still takes prints; paving (cobbles, terraces) and floors don't
    if (s === 'cobbles' || s === 'building') return 'stone';
    if (w.collider.enabled && w.collider.footprintAt(x, z) >= 0) return 'stone';
    if (this.ctx.era.current === 'today' && this.roadAt(x, z)) return 'road';
    if (w.heightfield.slopeDeg(x, z) > 32) return 'rock';
    return null;
  };

  /** Within ~2.5 m of an OSM road (only meaningful today; historic eras have ground classes). */
  private roadAt(x: number, z: number): boolean {
    if (!this.roads) {
      const P = this.ctx.data.paths;
      const road = P.kinds.indexOf('road');
      const b = this.ctx.world.bounds();
      const cell = 2;
      const cols = Math.ceil((b.x1 - b.x0) / cell) + 1;
      const rows = Math.ceil((b.z1 - b.z0) / cell) + 1;
      const grid = new Uint8Array(cols * rows);
      const N = P.nodes;
      for (let k = 0; k + 3 < P.edges.length; k += 4) {
        if (P.edges[k + 2] !== road) continue;
        const a = P.edges[k]!;
        const c = P.edges[k + 1]!;
        const ax = N[a * 3]!;
        const az = N[a * 3 + 2]!;
        const bx = N[c * 3]!;
        const bz = N[c * 3 + 2]!;
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.ceil(len / 1));
        for (let i = 0; i <= n; i++) {
          const px = ax + ((bx - ax) * i) / n;
          const pz = az + ((bz - az) * i) / n;
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) {
              const cc = Math.round((px - b.x0) / cell) + dx;
              const rr = Math.round((pz - b.z0) / cell) + dz;
              if (cc >= 0 && rr >= 0 && cc < cols && rr < rows) grid[rr * cols + cc] = 1;
            }
        }
      }
      this.roads = { grid, x0: b.x0, z0: b.z0, cols, rows };
    }
    const R = this.roads;
    const c = Math.round((x - R.x0) / 2);
    const r = Math.round((z - R.z0) / 2);
    return c >= 0 && r >= 0 && c < R.cols && r < R.rows && R.grid[r * R.cols + c] === 1;
  }

  /** A footstep of the player: a print in the snow (or the trail breaks here). */
  private footprint(x: number, z: number, running: boolean): void {
    const pl = this.ctx.player;
    if (pl.flying || this.snowAmount() < 0.3) {
      this.lastStep = null;
      return;
    }
    const prev = this.lastStep;
    const h = prev && Math.hypot(x - prev.x, z - prev.z) > 0.15 ? headingTo(x - prev.x, z - prev.z) : pl.yaw;
    this.lastStep = { x, z };
    this.stepSide = -this.stepSide;
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    const px = x + rx * 0.11 * this.stepSide;
    const pz = z + rz * 0.11 * this.stepSide;
    const depth = running ? 1 : pl.stance === 'stand' ? 0.7 : pl.stance === 'crouch' ? 0.45 : 0.3;
    this.tracks.addPlayer(px, pz, h, this.tracks.now, this.stepSide, depth, this.trailBreakAt(px, pz));
  }

  /** Spurenleser: what the pack's prints at x/z say, as a caption text (by skill tier). */
  private readingText(r: PackReading): string {
    const t = this.ctx.t;
    const tier = Math.max((this.ctx.state.state.skills['spurenleser'] ?? 0) as number, this.ctx.settings.state.gentleMode ? 1 : 0);
    const age = ageWord(r.age);
    const dir = compassWord(r.heading);
    if (tier >= 2) {
      const n = r.kind === 'hoof' ? t('hunt.read.only_rider') : r.count === 1 ? t('hunt.read.n1') : t('hunt.read.n', { n: NUM_DE[r.count] ?? String(r.count) });
      return t('hunt.read.2', { count: n, rider: r.hasPikeur && r.kind === 'paw' ? t('hunt.read.rider') : '', age, dir });
    }
    if (tier >= 1) return t(`hunt.read.${r.kind}.1`, { age, dir });
    return t(`hunt.read.${r.kind}`);
  }

  mode(): { gentle: boolean; rauhnacht: boolean } {
    const st = this.ctx.settings.state;
    return { gentle: st.gentleMode, rauhnacht: st.rauhnacht === true || this.ctx.state.state.flags['rauhnacht'] === true };
  }

  // ---- lantern ------------------------------------------------------------------------------

  private syncLantern(force = false): void {
    const L = this.slice().lantern;
    this.ctx.player.stats.lanternLit = L.lit;
    if (force || L.lit !== this.lastLit) {
      this.lastLit = L.lit;
      this.ctx.state.mutable.flags['lanternLit'] = L.lit;
    }
  }

  setLit(on: boolean, user: boolean): boolean {
    const L = this.slice().lantern;
    const r = toggle(L, on);
    if (r === null) {
      if (on && L.oil <= 0 && user) this.ctx.ui.toast(this.ctx.t('lantern.noOil'));
      return L.lit;
    }
    this.syncLantern();
    this.ctx.events.emit('lantern:toggle', { lit: r });
    return r;
  }

  refill(): void {
    const L = this.slice().lantern;
    refill(L);
    this.lowWarned = false;
    this.ctx.events.emit('lantern:oil', { oil: L.oil });
  }

  private updateLantern(dt: number): void {
    const ctx = this.ctx;
    const L = this.slice().lantern;
    if (ctx.input.wasPressed('lantern') && this.caughtT < 0) {
      const lit = this.setLit(!L.lit, true);
      ctx.ui.toast(ctx.t(lit ? 'lantern.on' : 'lantern.off'), 1400);
    }
    // the oil is the timer of the past: in the present the lantern burns for free
    // playtest round 9 (the Registratur: finding the door ate half the oil, the visit ended mid-
    // conversation): no burn while someone talks or a page is open, half burn under a roof
    const p = ctx.player.position;
    const indoors = ctx.world.ceilingAt?.(p.x, p.z, p.y) != null;
    const burnK = this.talking || ctx.ui.modals.count > 0 ? 0 : indoors ? 0.5 : 1;
    const r = ctx.era.current === 'today' || burnK === 0 ? { emptied: false, percentChanged: false } : drain(L, dt * burnK, this.mode());
    if (r.percentChanged) ctx.events.emit('lantern:oil', { oil: L.oil });
    if (r.emptied) {
      ctx.events.emit('lantern:toggle', { lit: false });
      ctx.events.emit('lantern:empty', {});
      ctx.ui.toast(ctx.t('lantern.empty'));
    } else if (L.lit && L.oil < 0.15 && !this.lowWarned) {
      this.lowWarned = true;
      ctx.ui.toast(ctx.t('lantern.low'));
    }
    if (L.oil >= 0.15) this.lowWarned = false;
    this.syncLantern();
  }

  // ---- pack lifecycle -----------------------------------------------------------------------

  private configure(c: ThreatConfig): void {
    if (c.kind !== 'pack') return;
    this.restorePending = false; // the story (re)configures: that wins over a saved pack
    if (typeof c.seconds === 'number' && c.seconds > 0) this.slice().lantern.seconds = c.seconds;
    if (!c.active) {
      this.stop('configure');
      return;
    }
    const o: HuntStartOptions = { intensity: c.intensity, radius: c.radius, hounds: c.hounds, pikeur: c.pikeur, sight: c.sight, seed: c.seed, x: c.center?.x, z: c.center?.z };
    if (c.mode) o.mode = c.mode;
    if (c.target) o.target = { x: c.target.x, z: c.target.z };
    if (c.via) o.via = c.via.map((v) => ({ x: v.x, z: v.z }));
    if (c.from) o.from = { x: c.from.x, z: c.from.z };
    if (c.headStart !== undefined) o.headStart = c.headStart;
    if (c.goalRadius !== undefined) o.goalRadius = c.goalRadius;
    if (c.heel !== undefined) o.heel = c.heel;
    if (c.burst !== undefined) o.burst = c.burst;
    if (c.keepPace !== undefined) o.keepPace = c.keepPace;
    if (c.snow !== undefined) o.snow = c.snow;
    if (c.flankers !== undefined) o.flankers = c.flankers;
    if (c.lunges !== undefined) o.lunges = c.lunges;
    if (c.pikeurFar !== undefined) o.pikeurFar = c.pikeurFar;
    if (c.maxBites !== undefined) o.maxBites = c.maxBites;
    if (Array.isArray(c.beats)) o.beats = c.beats.map((b) => ({ a: { x: b.a.x, z: b.a.z }, b: { x: b.b.x, z: b.b.z }, ...(b.speed !== undefined ? { speed: b.speed } : {}) }));
    const s = this.sim;
    const sameArea = s && this.caughtT < 0 && (c.center === undefined || Math.hypot(c.center.x - s.opt.x, c.center.z - s.opt.z) < 5) && (c.radius === undefined || c.radius === s.opt.radius) && (c.hounds === undefined || Math.round(c.hounds) === s.hounds.length) && (c.pikeur === undefined || c.pikeur === !!s.pikeur);
    if (s && sameArea) {
      const mode = c.mode ?? s.mode;
      const sameTarget = !c.target || (s.opt.target && Math.hypot(c.target.x - s.opt.target.x, c.target.z - s.opt.target.z) < 1);
      if (mode === s.mode && sameTarget) {
        // same beat, new difficulty
        s.retune({ intensity: c.intensity ?? s.opt.intensity, ...this.mode() });
        return;
      }
      // same pack, new behaviour (drive → finale at the kennel): they stay where they are
      const extra: Partial<PackOptions> = {};
      if (o.flankers !== undefined) extra.flankers = o.flankers;
      if (o.lunges !== undefined) extra.lunges = o.lunges;
      if (o.pikeurFar !== undefined) extra.pikeurFar = o.pikeurFar;
      if (o.maxBites !== undefined) extra.maxBites = o.maxBites;
      // the chase's pace too (K2: a searching pack at the gate turns into the par force hunt)
      if (o.heel !== undefined) extra.heel = o.heel;
      if (o.burst !== undefined) extra.burst = o.burst;
      if (o.keepPace !== undefined) extra.keepPace = o.keepPace;
      s.switchMode({ mode, target: o.target ?? s.opt.target ?? null, via: o.via ?? [], from: o.from ?? null, headStart: o.headStart, goalRadius: o.goalRadius, oneKey: this.oneKey(), intensity: c.intensity ?? s.opt.intensity, ...extra }, makeMode);
      const saved = this.slice().pack;
      if (saved) saved.opts = { ...saved.opts, ...o, mode };
      this.escapedT = -1;
      this.clearFinalePrompt();
      return;
    }
    this.start(o);
  }

  private senseDefaults(rauhnacht: boolean): { sight: number; beacon: number } {
    const era = this.ctx.era.current;
    if (era === '1793-02') return { sight: rauhnacht ? 20 : 15, beacon: 65 }; // frost fog
    if (era === '1793-07') return { sight: 24, beacon: 5 }; // fire light: they hunt by ear
    if (this.ctx.era.info.night) return { sight: 30, beacon: 40 };
    return { sight: 40, beacon: 20 }; // a dusk / day memory
  }

  start(o: HuntStartOptions = {}): PackSim {
    const ctx = this.ctx;
    if (this.sim) this.stop('debug', true);
    this.endCaught();
    const p = ctx.player.position;
    const mode = this.mode();
    const intensity = Math.max(0, Math.min(1, o.intensity ?? 0.5));
    const x = o.x ?? p.x;
    const z = o.z ?? p.z;
    const radius = Math.max(30, o.radius ?? 160);
    const special = o.mode === 'drive' || o.mode === 'finale';
    const hounds = Math.max(3, Math.min(MAX_HOUNDS, Math.round(o.hounds ?? (special ? 5 : 3 + intensity * 2 + (mode.rauhnacht ? 1 : 0)))));
    const pikeur = o.pikeur ?? (special || o.mode === 'parforce' || intensity >= 0.6 || mode.rauhnacht);
    const sense = this.senseDefaults(mode.rauhnacht);
    const opts: PackOptions = {
      x,
      z,
      radius,
      intensity,
      hounds,
      pikeur,
      seed: o.seed ?? hashSeed(x, z, radius, hounds),
      sight: o.sight ?? sense.sight,
      beacon: sense.beacon,
      gentle: mode.gentle,
      rauhnacht: mode.rauhnacht,
      mode: o.mode ?? 'patrol',
      target: o.target ?? null,
      via: o.via ?? [],
      from: o.from ?? null,
      headStart: o.headStart,
      goalRadius: o.goalRadius,
      heel: o.heel,
      burst: o.burst,
      keepPace: o.keepPace,
      oneKey: this.oneKey(),
      flankers: o.flankers,
      lunges: o.lunges,
      pikeurFar: o.pikeurFar,
      maxBites: o.maxBites,
      ...(o.beats ? { beats: o.beats } : {}),
    };
    this.snowOverride = o.snow ?? null;
    const snow = this.snowAmount() >= 0.3;
    this.graph ??= new PathGraph(ctx.data.paths);
    this.sim = new PackSim(this.simWorld(x, z, radius), this.graph, opts, { x: p.x, z: p.z }, snow ? this.tracks : null, makeMode);
    this.fading = null;
    this.visuals.clear();
    this.agentAudio.clear();
    this.overlay.clearArrows();
    this.needPrewarm = true;
    this.lastAlert = { level: -1, state: '', at: -1 };
    this.escapedT = -1;
    this.returnTo = null;
    this.holdReq = null;
    this.holdLeft = 0;
    this.releasedT = -1;
    this.tableau = null;
    this.clearFinalePrompt();
    // remembered for a reload (JSON only)
    this.slice().pack = { era: ctx.era.current, opts: JSON.parse(JSON.stringify({ ...o, x, z, radius, intensity, hounds, pikeur })) as HuntStartOptions };
    ctx.events.emit('hunt:start', { x, z, radius, hounds, pikeur });
    return this.sim;
  }

  stop(reason: HuntEndReason, silent = false): void {
    const s = this.sim;
    this.slice().pack = null;
    this.snowOverride = null;
    this.clearFinalePrompt();
    this.escapedT = -1;
    this.returnTo = null;
    if (!s) return;
    this.sim = null;
    this.slice().alert = 0;
    if (!silent) this.fading = { agents: s.agents, state: s.state, t: 0 };
    this.ctx.events.emit('hunt:alert', { level: 0, state: 'calm' });
    this.ctx.events.emit('hunt:end', { reason });
  }

  private clearFinalePrompt(): void {
    if (!this.finalePrompt) return;
    this.finalePrompt = null;
    this.ctx.ui.hud.prompt(null, undefined, 'hunt');
  }

  /** A saved pack (slice) comes back after a load, in the era it was out in. */
  private restore(): void {
    this.restorePending = false;
    const saved = this.slice().pack;
    if (!saved || this.sim) return;
    if (saved.era !== this.ctx.era.current) {
      this.slice().pack = null;
      return;
    }
    this.start(saved.opts);
  }

  /** Terrain, cover, water, buildings (as sight blockers and colliders) for the simulation. */
  private simWorld(cx: number, cz: number, radius: number): SimWorld {
    const w = this.ctx.world;
    const obstacle = this.buildObstacles(cx, cz, radius * 1.7);
    return {
      heightAt: (x, z) => w.heightAt(x, z),
      surfaceAt: (x, z) => w.surfaceAt(x, z),
      coverAt: (x, z) => w.coverAt(x, z),
      obstacleAt: obstacle,
      collide: (x, z, r) => w.collider.resolve(x, z, r),
      bounds: () => w.bounds(),
      trailBreakAt: this.trailBreakAt,
    };
  }

  /** 3 m raster of building heights around the area (only while the palace stands). */
  private buildObstacles(cx: number, cz: number, r: number): (x: number, z: number) => number {
    const w = this.ctx.world;
    if (!w.collider.enabled) return () => 0;
    const cell = 3;
    const n = Math.ceil((2 * r) / cell);
    const x0 = cx - r;
    const z0 = cz - r;
    const grid = new Float32Array(n * n);
    for (const b of this.ctx.data.footprints.buildings) {
      const ring = b.ring;
      let bx0 = Infinity;
      let bz0 = Infinity;
      let bx1 = -Infinity;
      let bz1 = -Infinity;
      for (const [x, z] of ring) {
        bx0 = Math.min(bx0, x);
        bz0 = Math.min(bz0, z);
        bx1 = Math.max(bx1, x);
        bz1 = Math.max(bz1, z);
      }
      if (bx1 < x0 || bz1 < z0 || bx0 > x0 + n * cell || bz0 > z0 + n * cell) continue;
      const h = b.base_h !== null && b.eaves_h !== null ? Math.max(3, Math.min(25, b.eaves_h - b.base_h)) : 8;
      const c0 = Math.max(0, Math.floor((bx0 - x0) / cell));
      const c1 = Math.min(n - 1, Math.floor((bx1 - x0) / cell));
      const r0 = Math.max(0, Math.floor((bz0 - z0) / cell));
      const r1 = Math.min(n - 1, Math.floor((bz1 - z0) / cell));
      for (let rr = r0; rr <= r1; rr++)
        for (let cc = c0; cc <= c1; cc++) if (pointInRing(x0 + (cc + 0.5) * cell, z0 + (rr + 0.5) * cell, ring)) grid[rr * n + cc] = Math.max(grid[rr * n + cc]!, h);
    }
    return (x, z) => {
      const c = Math.floor((x - x0) / cell);
      const rr = Math.floor((z - z0) / cell);
      if (c < 0 || rr < 0 || c >= n || rr >= n) return 0;
      return grid[rr * n + c]!;
    };
  }

  /**
   * Story cue 'hunt:hold' (bible ch. 2, W4 "Das sind Kalköfen"): the pack stands still for a few
   * seconds while a memory plays. Never right before a catch: it waits while a hound is closer
   * than 15 m, at most 2 s. Frozen agents do not catch (sim.checkCaught).
   */
  private updateHold(dt: number, sim: PackSim): void {
    const req = this.holdReq;
    if (req) {
      const p = this.ctx.player.position;
      let near = Infinity;
      for (const a of sim.agents) near = Math.min(near, Math.hypot(a.x - p.x, a.z - p.z));
      req.waited += dt;
      if (near >= 15 || req.waited >= 2) {
        this.holdReq = null;
        this.holdLeft = req.seconds;
        sim.frozen = true;
      }
    }
    if (this.holdLeft > 0) {
      this.holdLeft -= dt;
      if (this.holdLeft <= 0) {
        this.holdLeft = 0;
        sim.frozen = false;
      }
    }
  }

  /** Story cue 'hunt:trail' {path: "x,z x,z …", step?, depth?, hold?}: someone else's prints in the snow. */
  private layTrail(data: Record<string, unknown>): void {
    const raw = typeof data['path'] === 'string' ? data['path'] : '';
    const path = raw
      .trim()
      .split(/\s+/)
      .map((s) => s.split(',').map(Number))
      .filter((v) => v.length === 2 && v.every(Number.isFinite))
      .map(([x, z]) => ({ x: x!, z: z! }));
    if (path.length < 2) {
      console.warn('[hunt] cue hunt:trail needs data {path: "x,z x,z …"}', data);
      return;
    }
    const num = (k: string, d: number) => (typeof data[k] === 'number' ? (data[k] as number) : d);
    // only where the ground takes a print (no water, stone, floors)
    const T = this.tracks;
    T.addTrail(path, T.now, num('step', 1.4), num('depth', 1), num('hold', 0), (x, z) => !this.trailBreakAt(x, z));
  }

  private playerSense(): PlayerSense {
    const pl = this.ctx.player;
    return {
      x: pl.position.x,
      y: pl.position.y,
      z: pl.position.z,
      stance: pl.stance as Stance,
      noise: pl.stats.noise,
      visibility: pl.stats.visibility,
      lanternLit: pl.stats.lanternLit,
      speed: pl.stats.speed,
      flying: pl.flying,
      dodging: this.dodgeT > 0 && pl.pushed,
    };
  }

  // ---- fixed update -------------------------------------------------------------------------

  update(dt: number): void {
    this.installHooks();
    if (this.restorePending) this.restore();
    // a card or conversation on screen (echo transcript, clue card, talk): the oil and the pack
    // wait (playtest round 2: reading a transcript cost a fifth of the prologue's oil)
    const held = this.ctx.ui.modals.count > 0 && this.caughtT < 0;
    if (!held) this.updateLantern(dt);
    // the dodge roll (combat rolls the player; its i-frames are what a lunge must beat)
    this.dodgeT = Math.max(0, this.dodgeT - dt);
    if (this.ctx.input.wasPressed('dodge')) this.dodgeT = 0.36;
    this.biteT = Math.max(0, this.biteT - dt);
    const sim = this.sim;
    if (!sim || !sim.tracks) this.tracks.tick(dt); // else the simulation advances the clock
    // no pack, no chase: a hunt that ended mid-alert must not keep the HUD busy forever
    if (!sim) this.ctx.ui.hud.busy('hunt', false, 3);
    // a pack out at all (patrolling, a stand, the W8 lie-down) keeps the centre cards back (soft:
    // a page asked for still opens) — playtest round 5: the level card mid-sneak; not the resting pack
    this.ctx.ui.cards.soft('hunt', !!sim && this.tableau?.kind !== 'rest');
    if (sim && !held) this.updateHold(dt, sim);
    if (sim && !held) {
      const evs = sim.update(dt, this.playerSense());
      for (const e of evs) this.onSimEvent(e, sim);
      this.sounds(dt, sim);
      this.emitAlert(sim);
      this.updateModes(dt, sim);
    }
    this.updateGate(sim);
    this.readTracks(dt);
    if (this.fading) {
      this.fading.t += dt / 2.4;
      if (this.fading.t >= 1) {
        this.fading = null;
        this.visuals.clear();
      }
    }
    this.hornGlowT = Math.max(0, this.hornGlowT - dt);
    if (this.caughtT >= 0) this.updateCaught(dt);
    // heartbeat rises with the alert
    const alert = this.caughtT >= 0 ? 1 : sim ? sim.alert : 0;
    if (alert > 0.2) {
      this.hbT -= dt;
      if (this.hbT <= 0) {
        this.hbT = 60 / (58 + 92 * alert);
        this.audio.heartbeat(0.1 + 0.4 * alert);
        this.overlay.beat();
      }
    } else this.hbT = 0.3;
  }

  /** Where the Zwinger's gate is (the KB-B23 yard outline, at the pack's first waypoint). */
  private placeGate(): void {
    if (this.gatePlaced) return;
    this.gatePlaced = true;
    const yard = this.ctx.data.footprints.buildings.find((b) => b.id === KENNEL_YARD);
    const f = yard ? gateFrame(yard.ring as [number, number][], KENNEL_GATE_NEAR) : null;
    if (!f) return;
    this.gate.place(f, this.ctx.world.heightAt(f.x + f.nx * 0.5, f.z + f.nz * 0.5));
  }

  /**
   * K3 (bible 3.12): the Gittertüren swing open, the pack bursts out and runs past the player
   * (KennelMode bends its way KENNEL_PASS m beside them), the view eases towards the gate.
   */
  private releaseKennel(by: 'player' | 'cue'): void {
    const c = this.sim?.ctl;
    if (!(c instanceof KennelMode) || c.phase !== 'pen') return;
    this.breakoutAt = this.ctx.loop.time;
    const ctx = this.ctx;
    const p = ctx.player.position;
    c.release({ x: p.x, z: p.z });
    this.placeGate();
    this.gate.open();
    this.slice().kennelOpen = true;
    this.setGatePrompt(false);
    this.caption('kennel', ctx.t('hunt.kennel.open'), 6, 3000);
    const f = this.gate.frame;
    this.nudgeTo = f ? { x: f.x, z: f.z } : (c.path[0] ?? null);
    this.nudgeT = 1.4;
    this.passShook = false;
    this.passNearest = Infinity;
    // hold the card queue before the story hears of it: the clue page granted on hunt:release
    // must not open over the breakout (a page on screen also stops the pack where it stands)
    if (!this.breakoutBusy) {
      this.breakoutBusy = true;
      ctx.ui.hud.busy('stage-kennel', true, 0);
    }
    ctx.events.emit('hunt:release', { x: p.x, z: p.z, by });
  }

  private setGatePrompt(on: boolean): void {
    if (on === this.gatePrompt) return;
    this.gatePrompt = on;
    this.ctx.ui.hud.prompt(on ? 'E' : null, on ? this.ctx.t('hunt.kennel.prompt') : undefined, 'hunt-gate');
    const flags = this.ctx.state.mutable.flags;
    if (on) flags['e.owner'] = 'hunt-gate';
    else if (flags['e.owner'] === 'hunt-gate') delete flags['e.owner'];
  }

  /** Fixed step: E at the closed gate (outside, 3–7.5 m: the pack must pass, not trample). */
  private updateGate(sim: PackSim | null): void {
    const c = sim?.ctl;
    const f = this.gate.frame;
    let want = false;
    if (c instanceof KennelMode && c.phase === 'pen' && f && this.ctx.ui.modals.count === 0) {
      const p = this.ctx.player.position;
      const dx = p.x - f.x;
      const dz = p.z - f.z;
      const d = Math.hypot(dx, dz);
      want = d >= KENNEL_PROMPT_MIN && d <= KENNEL_PROMPT_MAX && dx * f.nx + dz * f.nz > 0.5;
    }
    this.setGatePrompt(want);
    if (want && this.ctx.input.wasPressed('listen')) this.releaseKennel('player');
  }

  /** Finale prompt, bringing the player back into the circle, the end of a par force hunt. */
  private updateModes(dt: number, sim: PackSim): void {
    const ctx = this.ctx;
    const ctl = sim.ctl;
    if (ctl instanceof FinaleMode) {
      // no time pressure; after a while a quiet reminder of the keys (accessibility)
      if (ctl.phase === 'wait' && ctl.t > 7) {
        const key = this.oneKey() ? 'hunt.finale.prompt.one' : ctx.input.touchMode ? 'hunt.finale.prompt.touch' : 'hunt.finale.prompt';
        if (key !== this.finalePrompt) {
          this.finalePrompt = key;
          ctx.ui.hud.prompt('X', ctx.t(key), 'hunt');
        }
      } else this.clearFinalePrompt();
      // the eyes go out one by one (caption once, when the first ones have dimmed)
      if (ctl.phase === 'calm' && sim.hounds.filter((h) => h.dim > 0.6).length === 2) this.caption('eyes', ctx.t('hunt.finale.eyes'), 30, 3600);
    }
    if (this.returnTo) this.returnT += dt;
    // at full black (or after a moment without frames, e.g. a hidden tab)
    if (this.returnTo && (this.overlay.blinkBlack || this.returnT > 0.9)) {
      const c = this.returnTo;
      this.returnTo = null;
      const p = ctx.player.position;
      // back inside the circle, a step from the centre, facing it
      const d = Math.hypot(p.x - c.x, p.z - c.z) || 1;
      const x = c.x + ((p.x - c.x) / d) * 1.5;
      const z = c.z + ((p.z - c.z) / d) * 1.5;
      ctx.player.teleport(x, z, headingTo(c.x - x, c.z - z));
    }
    if (this.escapedT >= 0) {
      this.escapedT += dt;
      if (this.escapedT > 6) this.stop('escaped');
    }
    if (this.releasedT >= 0) {
      this.releasedT += dt;
      if (this.releasedT > 1.5) {
        this.releasedT = -1;
        this.stop('escaped', true);
      }
    }
  }

  /** Spurenleser: crouching / standing still over the pack's prints reads them (caption). */
  private readTracks(dt: number): void {
    this.readT -= dt;
    if (this.readT > 0) return;
    this.readT = 0.5;
    const pl = this.ctx.player;
    if (pl.flying || this.snowAmount() < 0.3 || (pl.stance === 'stand' && pl.stats.speed > 0.8)) return;
    const r = this.tracks.readPack(pl.position.x, pl.position.z, 2.4, this.tracks.now);
    if (!r || r.age > this.tracks.life * 0.9) return;
    const key = 'tracks-read';
    const last = this.captionAt.get(key);
    if (last !== undefined && this.ctx.loop.time - last < 14) return;
    this.caption(key, this.readingText(r), 14, 4200);
    this.ctx.events.emit('hunt:read', { kind: r.kind, age: Math.round(r.age), count: r.count, heading: r.heading });
  }

  private emitAlert(sim: PackSim): void {
    // a chase on: level / skill cards and tips wait (HUD calm)
    this.ctx.ui.hud.busy('hunt', sim.alert >= 0.5, 3);
    const now = this.ctx.loop.time;
    const L = this.lastAlert;
    // the kennel pack (behind bars, then bursting out into the night) is never "on you": it does
    // not hold the way home shut
    const caged = sim.ctl instanceof KennelMode;
    const level = Math.round((caged ? Math.min(sim.alert, 0.45) : sim.alert) * 100) / 100;
    const state = caged && sim.state === 'chasing' ? 'searching' : sim.state;
    if (state !== L.state || (Math.abs(level - L.level) >= 0.05 && now - L.at >= 0.25)) {
      this.lastAlert = { level, state, at: now };
      this.slice().alert = level;
      this.ctx.events.emit('hunt:alert', { level, state });
    }
  }

  private pos3(x: number, z: number, up = 0.6) {
    return { x, y: this.ctx.world.heightAt(x, z) + up, z };
  }

  /** Bearing of x/z relative to the view, degrees (0 ahead, 90 right). */
  private relAngle(x: number, z: number): number {
    const p = this.ctx.player.position;
    const yaw = this.ctx.player.yaw;
    const dx = x - p.x;
    const dz = z - p.z;
    const fwd = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
    const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
    return (Math.atan2(right, fwd) * 180) / Math.PI;
  }

  private caption(key: string, text: string, throttle = 6, ms = 2800): void {
    const now = this.ctx.loop.time;
    // the breakout is seen, not told: the pack's own sounds get no caption over the running hounds
    if (now - this.breakoutAt < 12 && /^(paws|pant|hunt\.sound\.)/.test(key)) return;
    const last = this.captionAt.get(key);
    if (last !== undefined && now - last < throttle) return;
    this.captionAt.set(key, now);
    if (this.ctx.settings.state.subtitles === false) return;
    this.ctx.ui.hud.subtitle(null, text, ms);
  }

  /**
   * Direction arrow for a sound. Sources in plain view and close are skipped (you can see them);
   * arrows are grouped per kind and 30° sector so a pack doesn't spam the screen edge.
   */
  private arrow(kind: ArrowKind, x: number, z: number, label: string, ttl = 1.8, always = false): void {
    if (this.ctx.settings.state.soundIndicators === false) return;
    const ang = this.relAngle(x, z);
    const p = this.ctx.player.position;
    if (!always && Math.abs(ang) < 32 && Math.hypot(x - p.x, z - p.z) < 25) return;
    // one horn, one arrow: it follows the rider instead of leaving a trail of stale ones
    const key = kind === 'horn' ? 'horn' : `${kind}-${Math.round(ang / 30)}`;
    this.overlay.arrow(key, kind, ang, label, ttl);
  }

  private onSimEvent(e: SimEvent, sim: PackSim): void {
    const ctx = this.ctx;
    const p = ctx.player.position;
    switch (e.type) {
      case 'horn': {
        ctx.events.emit('hunt:horn', { signal: e.signal, x: e.x, z: e.z, mode: sim.mode });
        const dur = this.audio.horn(e.signal, this.pos3(e.x, e.z, 2.6));
        this.hornGlowDur = Math.max(0.8, dur || (e.signal === 'search' ? 2.8 : e.signal === 'call-off' ? 3.5 : e.signal === 'lost' ? 2.6 : 0.8));
        this.hornGlowT = this.hornGlowDur;
        const meaning = (ctx.state.state.skills['spurenleser'] ?? 0) >= 1 || ctx.settings.state.gentleMode;
        // bible captions (09-ui-texte §6): ui.horn.<call>[.tracker] with Spurenleser 1; own strings as fallback.
        // A driving pack's 'search' is the beaters' horn from behind (not "the hunt begins").
        const call = HORN_CALL[e.signal];
        const uiKey = `ui.horn.${call}${meaning ? '.tracker' : ''}`;
        const hornText =
          sim?.mode === 'drive' && e.signal === 'search'
            ? ctx.t('hunt.drive.horn')
            : hasString(uiKey)
              ? ctx.t(uiKey)
              : ctx.t(`hunt.horn.${e.signal}${meaning ? '.meaning' : ''}`);
        this.caption(`horn-${e.signal}`, hornText, 1.5, 4200);
        // the glowing brass horn of a Pikeur in plain view is its own visual cue
        this.arrow('horn', e.x, e.z, ctx.t('hunt.arrow.horn'), 3.2, !sim?.pikeur);
        break;
      }
      case 'bay': {
        const a = sim.agents[e.idx];
        if (!a) break;
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        this.audio.bay(e.kind, this.pos3(a.x, a.z, 0.8), 0.88 + (a.idx % 6) * 0.05);
        if (e.kind === 'growl' && d > 25) break;
        const key = e.kind === 'howl' ? 'hunt.sound.howl' : e.kind === 'growl' ? 'hunt.sound.growl' : d < 35 ? 'hunt.sound.bark.near' : 'hunt.sound.bark.far';
        this.caption(key, ctx.t(key), e.kind === 'bark' ? 5 : 9);
        this.arrow('hound', a.x, a.z, ctx.t('hunt.arrow.hound'), 2);
        break;
      }
      case 'caught': {
        this.caughtBy = sim.agents[e.by] ?? null;
        this.beginCaught(e.soft === true);
        break;
      }
      case 'state':
        break;
      case 'tracking': {
        ctx.events.emit('hunt:tracking', e.why ? { on: e.on, x: e.x, z: e.z, why: e.why } : { on: e.on, x: e.x, z: e.z });
        const meaning = (ctx.state.state.skills['spurenleser'] ?? 0) >= 1 || ctx.settings.state.gentleMode;
        if (e.on) this.caption('track-on', ctx.t(meaning ? 'hunt.track.on.meaning' : 'hunt.track.on'), 8, 4200);
        else if (e.why) this.caption('track-off', ctx.t(`hunt.track.off.${e.why}`), 6, 3600);
        break;
      }
      case 'goal': {
        if (sim.mode === 'kennel') {
          ctx.events.emit('hunt:goal', { mode: 'kennel', x: e.x, z: e.z });
          this.caption('kennel-gone', ctx.t('hunt.kennel.gone'), 6, 3600);
          this.releasedT = 0;
          break;
        }
        const mode = sim.mode === 'parforce' ? 'parforce' : 'drive';
        ctx.events.emit('hunt:goal', { mode, x: e.x, z: e.z });
        if (mode === 'parforce') {
          this.escapedT = 0;
          this.caption('goal', ctx.t('hunt.goal.bank'), 6, 4000);
        }
        break;
      }
      case 'lunge': {
        const a = sim.agents[e.idx];
        if (!a) break;
        if (e.phase === 'dodged') {
          this.caption('dodged', ctx.t('hunt.lunge.dodged'), 2, 1800);
          break;
        }
        // the telegraph: growl (the sim's bay), crouch and flaring eyes (visuals), caption, arrow
        const first = !this.lungeTaught;
        this.lungeTaught = true;
        this.caption(first ? 'lunge-first' : 'lunge', ctx.t(first ? 'hunt.lunge.first' : 'hunt.lunge'), first ? 0 : 3, first ? 3600 : 1400);
        this.arrow('hound', a.x, a.z, ctx.t('hunt.arrow.hound'), 1.2, true);
        break;
      }
      case 'bite': {
        const pl = ctx.player;
        // teeth in the coat: you are pulled off your line (a bite from behind drags you sideways,
        // never forwards — it must cost ground, not give it)
        let bx = e.dx;
        let bz = e.dz;
        const v = sim.pv;
        const vl = Math.hypot(v.x, v.z);
        if (vl > 1 && (bx * v.x + bz * v.z) / vl > 0.2) {
          const s = (bx * -v.z + bz * v.x) / vl >= 0 ? 1 : -1;
          bx = (-v.z / vl) * s * 0.8 - (v.x / vl) * 0.6;
          bz = (v.x / vl) * s * 0.8 - (v.z / vl) * 0.6;
        }
        pl.impulse(bx * 5, bz * 5, 0.3);
        this.biteT = 0.32;
        this.biteDir = { x: bx, z: bz };
        const a = sim.agents[e.idx];
        if (a) this.audio.bay('bark', this.pos3(a.x, a.z, 0.7), 1.25);
        this.audio.heartbeat(0.55);
        this.overlay.beat();
        const left = e.max - e.n;
        if (left > 0) this.caption('bite', left === 1 ? ctx.t('hunt.bite.last') : ctx.t('hunt.bite', { left: NUM_DE[left] ?? String(left) }), 0, 2600);
        ctx.events.emit('hunt:bite', { n: e.n, max: e.max });
        break;
      }
      case 'rest':
        ctx.events.emit('hunt:rest', { on: e.on });
        if (e.on) this.caption('rest', ctx.t('hunt.rest'), 10, 3600);
        break;
      case 'lie': {
        const a = sim.agents[e.idx];
        if (!a) break;
        this.audio.sigh(this.pos3(a.x, a.z, 0.4), 0.9 + (a.idx % 5) * 0.05);
        this.caption('lie', ctx.t('hunt.finale.lie'), 6, 2600);
        break;
      }
      case 'finale': {
        ctx.events.emit('hunt:finale', { outcome: e.outcome });
        if (e.outcome === 'returned') {
          this.returnTo = { x: e.x, z: e.z };
          this.returnT = 0;
          this.overlay.blink();
          this.caption('return', ctx.t('hunt.finale.return'), 4, 3000);
        } else if (e.outcome === 'calmed') {
          this.clearFinalePrompt();
          // one key: lying flat lights the lantern too
          if (!this.slice().lantern.lit) this.setLit(true, false);
        } else if (e.outcome === 'faded') this.caption('silence', ctx.t('hunt.finale.silence'), 30, 3000);
        break;
      }
    }
  }

  /** Paws, panting and hoof beats of the nearest animals (with captions and arrows). */
  private sounds(dt: number, sim: PackSim): void {
    const ctx = this.ctx;
    const p = ctx.player.position;
    const frost = ctx.era.current === '1793-02' || ctx.world.look.snow > 0.3;
    // lying / faded hounds (finale) are silent
    const hounds = sim.agents.filter((a) => a.kind === 'hound' && a.lie < 0.3 && a.gone < 0.5).map((a) => ({ a, d: Math.hypot(a.x - p.x, a.z - p.z) }));
    hounds.sort((u, v) => u.d - v.d);
    hounds.forEach(({ a, d }, rank) => {
      let st = this.agentAudio.get(a);
      if (!st) this.agentAudio.set(a, (st = { paw: a.dist, pant: 0.5 + a.idx * 0.17, hoof: a.dist }));
      const stride = a.speed > 4 ? 1.1 : 0.7;
      if (a.dist - st.paw >= stride) {
        st.paw = a.dist;
        if (d < 28 && rank < 3) {
          this.audio.paw(this.pos3(a.x, a.z, 0.05), frost, Math.min(0.16, 0.05 + a.speed * 0.02));
          if (d < 20) {
            this.caption('paws', ctx.t(frost ? 'hunt.sound.paws.frost' : 'hunt.sound.paws'), 10);
            this.arrow('hound', a.x, a.z, ctx.t('hunt.arrow.hound'), 1.2);
          }
        }
      }
      st.pant -= dt;
      if (st.pant <= 0) {
        st.pant = a.speed > 4 ? 0.36 : a.speed > 1 ? 0.62 : 1.05;
        if (d < 16 && rank < 2) {
          this.audio.pant(this.pos3(a.x, a.z, 0.8), 0.06 + 0.1 * (1 - d / 16), a.speed > 4);
          if (d < 12) {
            this.caption('pant', ctx.t('hunt.sound.pant'), 8);
            this.arrow('hound', a.x, a.z, ctx.t('hunt.arrow.hound'), 1.2);
          }
        }
      }
    });
    const pk = sim.pikeur;
    if (pk) {
      let st = this.agentAudio.get(pk);
      if (!st) this.agentAudio.set(pk, (st = { paw: pk.dist, pant: 1, hoof: pk.dist }));
      const step = pk.speed > 3 ? 0.75 : 1.15;
      if (pk.dist - st.hoof >= step) {
        st.hoof = pk.dist;
        const d = Math.hypot(pk.x - p.x, pk.z - p.z);
        if (d < 75) {
          this.audio.hoof(this.pos3(pk.x, pk.z, 0.1), Math.min(0.4, 0.12 + pk.speed * 0.05));
          if (d < 55) {
            this.caption('hooves', ctx.t('hunt.sound.hooves'), 10);
            this.arrow('hooves', pk.x, pk.z, ctx.t('hunt.arrow.hooves'), 1.5);
          }
        }
      }
    }
  }

  // ---- caught -------------------------------------------------------------------------------

  private beginCaught(soft = false): void {
    const ctx = this.ctx;
    this.caughtT = 0;
    this.ctx.ui.hud.busy('hunt-caught', true);
    this.caughtEmitted = false;
    this.caughtSoft = soft;
    ctx.player.frozen = true;
    ctx.player.lookLocked = true;
    this.prevDesat = ctx.post.uniforms.uDesaturate!.value as number;
    this.overlay.setCaughtText(soft ? { caught: ctx.t('hunt.homed.title'), caughtSub: ctx.t('hunt.homed.sub') } : null);
    if (soft) {
      // brought home: no stinger, no rush — the circle closes
      this.audio.homed();
      this.caption('rush', ctx.t('hunt.sound.homed'), 1, 2400);
      return;
    }
    this.audio.rush();
    const s = this.sim;
    const by = this.caughtBy ?? s?.agents[0];
    if (by) {
      // the horn: found — sounds right behind the pack
      ctx.events.emit('hunt:horn', { signal: 'found', x: by.x, z: by.z, mode: s?.mode ?? 'patrol' });
      this.audio.horn('found', this.pos3(by.x, by.z, 2.6));
      this.hornGlowT = this.hornGlowDur = 0.8;
    }
    this.caption('rush', ctx.t('hunt.sound.rush'), 1, 2000);
    this.slice().caught++;
  }

  /** A story system shows the caught curtain and returns the player: hunt hands over at CAUGHT_EMIT. */
  private storyOwnsCaught(): boolean {
    return !!this.ctx.systems.get('story');
  }

  private updateCaught(dt: number): void {
    const ctx = this.ctx;
    // the story paused the game for its curtain and has moved the player by now: done here
    if (this.caughtEmitted && this.storyOwnsCaught()) {
      this.endCaught();
      return;
    }
    this.caughtT += dt;
    if (this.caughtT >= CAUGHT_EMIT && !this.caughtEmitted) {
      this.caughtEmitted = true;
      this.stop('caught');
      ctx.events.emit('player:caught', this.caughtSoft ? { by: 'pack', soft: true } : { by: 'pack' });
    }
    if (this.caughtT >= 3.0) {
      ctx.player.frozen = false;
      ctx.player.lookLocked = false;
    }
    if (this.caughtT >= CAUGHT_END) this.endCaught();
  }

  private endCaught(): void {
    if (this.caughtT < 0) return;
    this.caughtT = -1;
    this.ctx.ui.hud.busy('hunt-caught', false, 2);
    this.caughtBy = null;
    this.ctx.player.frozen = false;
    this.ctx.player.lookLocked = false;
    this.ctx.post.uniforms.uDesaturate!.value = this.prevDesat;
  }

  /** Visual part of the caught sequence: turn to the hound, shake, desaturate. */
  private caughtFrame(dt: number): void {
    const ctx = this.ctx;
    const t = this.caughtT;
    const reduced = ctx.settings.state.reducedMotion || this.caughtSoft;
    const by = this.caughtBy;
    if (by && t < 0.8 && !reduced) {
      const want = headingTo(by.x - ctx.player.position.x, by.z - ctx.player.position.z);
      const d = Math.atan2(Math.sin(want - ctx.player.yaw), Math.cos(want - ctx.player.yaw));
      ctx.player.yaw += d * Math.min(1, dt * 7);
      ctx.player.pitch += (-0.12 - ctx.player.pitch) * Math.min(1, dt * 5);
    }
    if (!reduced && t < 1.8) {
      const amp = 0.012 * Math.min(1, t * 1.5);
      ctx.camera.position.x += Math.sin(t * 61) * amp;
      ctx.camera.position.y += Math.sin(t * 47 + 1) * amp;
    }
    ctx.post.uniforms.uDesaturate!.value = Math.max(this.prevDesat, Math.min(0.7, t * 0.6) * (t < 3.6 ? 1 : Math.max(0, 1 - (t - 3.6))));
  }

  // ---- tableau (the endings) ----------------------------------------------------------------

  /**
   * Story cue 'hunt:tableau' {kind, n?, x?, z?, r?, face?}: a staged picture of the pack without a
   * simulation (it runs on rendered frames, also behind a paused game):
   *  'lie'   n hounds in an arc around x/z (r m) facing it; the horn sounds "Sammeln", then they
   *          lie down one by one and their eyes go out (museum ending, the W8 echo);
   *  'eyes'  n hounds in the dark around x/z, facing it; one pair of eyes opens after another
   *          (keep ending);
   *  'rest'  hounds that stay lying where they are, eyes half shut (after W8, round Jost):
   *          `from: 'pack'` keeps the running pack's hounds where they lay (else an arc as 'lie');
   *          `near: {x, z}` moves the nearest hound to that spot (the one Jost scratches);
   *  'off'   they dissolve.
   */
  private setTableau(d: Record<string, unknown>): void {
    const kind = d['kind'];
    if (kind === 'off') {
      if (this.tableau) this.fading = { agents: this.tableau.agents, state: 'calm', t: 0 };
      this.tableau = null;
      return;
    }
    if (kind !== 'lie' && kind !== 'eyes' && kind !== 'rest') return;
    // the W8 pack stays where it lay down (its hounds become the resting tableau)
    const keep = kind === 'rest' && d['from'] === 'pack' && this.sim ? this.sim.agents.filter((a) => a.kind === 'hound').map((a) => ({ x: a.x, z: a.z, heading: a.heading })) : null;
    if (this.sim) this.stop('debug', true);
    const num = (k: string, def: number) => (typeof d[k] === 'number' ? (d[k] as number) : def);
    const p = this.ctx.player.position;
    const cx = num('x', p.x);
    const cz = num('z', p.z);
    const n = Math.max(1, Math.min(MAX_HOUNDS, Math.round(num('n', 5))));
    const r = num('r', kind === 'lie' ? 9 : 14);
    // the arc opens towards `face` (degrees, 0 = north; default: the way the player looks)
    const faceDeg = num('face', (-this.ctx.player.yaw * 180) / Math.PI);
    const fwd = (faceDeg * Math.PI) / 180;
    const fx = Math.sin(fwd);
    const fz = -Math.cos(fwd);
    const base = Math.atan2(fz, fx);
    const spread = kind === 'eyes' ? 2.9 : 2.2;
    const agents: Agent[] = [];
    const spots: { x: number; z: number; heading: number }[] = keep ?? [];
    if (!keep)
      for (let i = 0; i < n; i++) {
        const th = base + (n === 1 ? 0 : i / (n - 1) - 0.5) * spread;
        const rr = r * (kind === 'eyes' ? 0.8 + 0.45 * ((i * 0.618) % 1) : 1);
        const x = cx + Math.cos(th) * rr;
        const z = cz + Math.sin(th) * rr;
        spots.push({ x, z, heading: headingTo(cx - x, cz - z) });
      }
    const near = d['near'] as { x?: unknown; z?: unknown } | undefined;
    if (kind === 'rest' && near && typeof near.x === 'number' && typeof near.z === 'number' && spots.length) {
      const nx = near.x;
      const nz = near.z;
      const best = spots.reduce((b, s) => (Math.hypot(s.x - nx, s.z - nz) < Math.hypot(b.x - nx, b.z - nz) ? s : b));
      best.x = nx;
      best.z = nz;
      if (typeof d['nearHeading'] === 'number') best.heading = ((d['nearHeading'] as number) * Math.PI) / 180;
    }
    spots.forEach((s, i) => {
      const y = this.ctx.world.heightAt(s.x, s.z);
      const rest = kind === 'rest';
      agents.push({
        kind: 'hound', idx: i, name: `t${i}`, x: s.x, y, z: s.z, heading: s.heading, speed: 0, dist: i * 0.7, awareness: rest ? 0.2 : 1, sees: 0, closeSee: 0,
        target: null, path: [], pathI: 0, wait: 0, sniffing: false, off: { r: 0, f: 0 }, node: -1, stuck: 0, wallT: 0, scentI: -1,
        lie: rest ? 1 : 0, dim: rest ? 0.75 : 0, gone: kind === 'eyes' ? 1 : 0, printAcc: 0, printSide: 1,
      });
    });
    this.fading = null;
    this.visuals.clear();
    // `stagger`: seconds between two pairs of eyes (a short memory opens them quicker)
    const stagger = typeof d['stagger'] === 'number' ? (d['stagger'] as number) : undefined;
    this.tableau = { kind, agents, t: 0, horn: false, ...(stagger !== undefined ? { stagger } : {}) };
  }

  private frameTableau(dt: number): void {
    const T = this.tableau!;
    const ctx = this.ctx;
    T.t += Math.min(dt, 0.5); // real time (a staged ending on a slow renderer must not lag)
    const t = T.t;
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    T.agents.forEach((a, k) => {
      if (T.kind === 'rest') {
        // lying, eyes half shut; now and then one lifts its head (a sniff) and settles again
        a.lie = 1;
        a.dim = 0.75;
        a.sniffing = Math.sin(t * 0.37 + k * 2.1) > 0.93;
      } else if (T.kind === 'lie') {
        a.lie = clamp01((t - 1.6 - k * 0.85) / 1.3);
        a.dim = clamp01((t - 2.9 - k * 0.85) / 1.5);
      } else {
        // one pair of eyes after another; they never come closer
        const st = T.stagger ?? 0.55;
        a.gone = 1 - clamp01((t - Math.min(0.6, st) - k * st) / Math.min(0.9, st * 2));
        a.sniffing = Math.sin(t * 0.8 + k * 2) > 0.85;
      }
    });
    if (!T.horn && t > 0.4 && T.kind !== 'rest') {
      T.horn = true;
      const a = T.agents[Math.floor(T.agents.length / 2)]!;
      if (T.kind === 'lie') {
        this.audio.horn('call-off', this.pos3(a.x, a.z, 2.6));
        this.caption('tab-horn', ctx.t('hunt.horn.call-off'), 1, 3600);
      } else this.audio.bay('growl', this.pos3(a.x, a.z, 0.6), 0.9);
    }
    this.visuals.update({
      agents: T.agents,
      state: T.kind === 'eyes' ? 'searching' : 'calm',
      dissolve: -1,
      time: ctx.loop.time + t,
      dt,
      camera: ctx.camera,
      viewportH: window.innerHeight,
      hornGlow: 0,
      caught: null,
      mist: T.kind === 'eyes' ? 0.8 : T.kind === 'rest' ? 0.35 : 0.5,
      reducedMotion: ctx.settings.state.reducedMotion,
      reducedFlash: ctx.settings.state.reducedFlash,
      heightAt: (x: number, z: number) => ctx.world.heightAt(x, z),
      snap: false,
      settle: T.kind === 'lie' ? clamp01(t / 8) : T.kind === 'rest' ? 1 : 0,
    });
  }

  // ---- frame (visuals only) -----------------------------------------------------------------

  frame(dt: number): void {
    const ctx = this.ctx;
    this.installHooks();
    const snap = ctx.loop.manual;
    const reducedMotion = ctx.settings.state.reducedMotion;
    const sim = this.sim;
    const agents = sim ? sim.agents : this.fading?.agents;
    if (agents) {
      const input = {
        agents,
        state: sim ? sim.state : this.fading!.state,
        dissolve: sim ? -1 : this.fading!.t,
        time: ctx.loop.time,
        dt,
        camera: ctx.camera,
        viewportH: window.innerHeight,
        hornGlow: this.hornGlowT > 0 ? Math.min(1, this.hornGlowT / Math.min(0.4, this.hornGlowDur)) * (ctx.settings.state.reducedFlash ? 0.8 : 0.6 + 0.4 * Math.sin(ctx.loop.time * 30)) : 0,
        caught: this.caughtT >= 0 && this.caughtT < 2.2 && !this.caughtSoft ? { t: this.caughtT } : null,
        mist: sim?.mode === 'kennel' ? 0 : ctx.era.current === '1793-02' ? 1 : ctx.era.info.night ? 0.55 : 0.3,
        real: sim?.mode === 'kennel',
        reducedMotion,
        reducedFlash: ctx.settings.state.reducedFlash,
        heightAt: (x: number, z: number) => ctx.world.heightAt(x, z),
        snap,
        settle: sim?.ctl instanceof FinaleMode ? sim.ctl.calm : 0,
      };
      if (this.needPrewarm) {
        this.needPrewarm = false;
        this.visuals.prewarm(input);
      }
      this.visuals.update(input);
    } else if (this.tableau) this.frameTableau(dt);
    else this.visuals.object.visible = false;
    this.cones.update(sim && ctx.state.mutable.flags['hunt.cones'] === true ? sim : null, ctx.loop.time, dt, (x, z) => ctx.world.heightAt(x, z));
    if (this.caughtT >= 0) this.caughtFrame(dt);
    this.frameKennel(dt, sim, reducedMotion);
    // a bite: the view jolts towards the pull (no shake in reduced motion)
    if (this.biteT > 0 && !reducedMotion) {
      const k = (this.biteT / 0.32) ** 2 * 0.06;
      ctx.camera.position.x += this.biteDir.x * k + Math.sin(this.biteT * 70) * k * 0.3;
      ctx.camera.position.y -= k * 0.8;
      ctx.camera.position.z += this.biteDir.z * k;
    }
    // prints in the snow
    const hf = ctx.world.heightfield;
    this.trackVis.frame({
      tracks: this.tracks,
      snow: this.snowAmount(),
      highlight: (ctx.state.state.skills['spurenleser'] ?? 0) >= 2 ? 1 : 0,
      heightAt: (x, z) => ctx.world.heightAt(x, z),
      normalAt: (x, z) => hf.normalAt(x, z),
    });
    // HUD threat meter (only while we own it, so fire/oblivion can use the slot too)
    const target = this.caughtT >= 0 ? 1 : sim ? sim.alert : 0;
    this.hudAlert += (target - this.hudAlert) * (snap ? 1 : Math.min(1, dt * 4));
    if (sim || this.caughtT >= 0 || this.fading) {
      ctx.ui.hud.setThreat(this.hudAlert);
      this.threatOwned = true;
    } else if (this.threatOwned) {
      ctx.ui.hud.setThreat(this.hudAlert);
      if (this.hudAlert < 0.01) {
        ctx.ui.hud.setThreat(0);
        this.threatOwned = false;
      }
    }
    // lantern
    const L = this.slice().lantern;
    const pl = ctx.player;
    this.lanternView.frame({
      dt,
      time: ctx.loop.time + (snap ? 0 : performance.now() / 1000) * 0,
      camera: ctx.camera,
      lit: L.lit,
      oil: L.oil,
      fog: ctx.era.current === '1793-02',
      prone: pl.stance === 'prone',
      moving: Math.min(1, pl.stats.speed / 4),
      reducedMotion,
      snap,
    });
    const showGauge = L.lit || L.oil < 0.999 || !!sim || ctx.era.info.night;
    ctx.ui.hud.setLantern(showGauge ? L.oil : null, L.lit);
    this.overlay.frame({ dt, alert: this.hudAlert, reducedMotion, caught: this.caughtT, handoff: this.storyOwnsCaught(), showArrows: ctx.settings.state.soundIndicators !== false && !ctx.ui.hud.staged });
  }

  /** The Gittertüren, the view easing to the gate on release, a short shake as the pack goes by. */
  private frameKennel(dt: number, sim: PackSim | null, reducedMotion: boolean): void {
    const ctx = this.ctx;
    const k3 = ctx.era.current === '1793-07';
    if (k3) this.placeGate();
    if (k3 && this.slice().kennelOpen && !this.gate.isOpen) this.gate.open(true);
    if (!this.slice().kennelOpen && this.gate.isOpen) this.gate.close();
    this.gate.update(dt, k3, reducedMotion);
    const pl = ctx.player;
    if (this.nudgeT > 0 && this.nudgeTo) {
      this.nudgeT -= dt;
      // no turn in reduced motion (the hounds come into view on their own way past)
      if (!reducedMotion) {
        const want = Math.atan2(-(this.nudgeTo.x - pl.position.x), -(this.nudgeTo.z - pl.position.z));
        let d = want - pl.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        pl.yaw += d * Math.min(1, dt * 2.4);
      }
    }
    // the breakout is the Zwinger's climax: no card or toast slides over the hounds going by
    const c = sim?.ctl;
    const breakout = c instanceof KennelMode && c.phase === 'out';
    if (breakout !== this.breakoutBusy) {
      this.breakoutBusy = breakout;
      ctx.ui.hud.busy('stage-kennel', breakout, 0);
    }
    // the first hound brushing by (within 7 m): a short thump in the view
    if (c instanceof KennelMode && c.phase === 'out' && c.t > KENNEL_DOOR_S) {
      let near = Infinity;
      for (const h of sim!.hounds) if (h.gone < 0.5) near = Math.min(near, Math.hypot(h.x - pl.position.x, h.z - pl.position.z));
      this.passNearest = Math.min(this.passNearest, near);
      if (near < 7 && !this.passShook) {
        this.passShook = true;
        this.passShake = 0.5;
      }
    }
    if (this.passShake > 0) {
      this.passShake = Math.max(0, this.passShake - dt);
      if (!reducedMotion) {
        const k = this.passShake * 0.05;
        ctx.camera.position.x += Math.sin(ctx.loop.time * 53) * k;
        ctx.camera.position.y += Math.sin(ctx.loop.time * 71) * k * 0.6;
      }
    }
  }

  // ---- debug hooks --------------------------------------------------------------------------

  private installHooks(): void {
    if (this.hooksInstalled || typeof window === 'undefined' || !window.kq) return;
    this.hooksInstalled = true;
    const ctx = this.ctx;
    const self = this;
    const toHeading = (yawDeg: number) => (-yawDeg * Math.PI) / 180;
    window.kq.hunt = {
      start(o = {}) {
        return self.start(o).snapshot();
      },
      stop() {
        self.stop('debug');
      },
      state() {
        const s = self.sim;
        return s ? { ...s.snapshot(), active: true, caughtT: self.caughtT } : null;
      },
      setState(s, x, z) {
        const p = ctx.player.position;
        self.sim?.force(s, { x: x ?? p.x, z: z ?? p.z });
        const sim = self.sim;
        if (sim) for (const e of sim.update(0, self.playerSense())) self.onSimEvent(e, sim);
      },
      place(i, x, z, yawDeg) {
        self.sim?.place(i, x, z, yawDeg === undefined ? undefined : toHeading(yawDeg));
      },
      placeInView(i, dist, angleDeg = 0, facePlayer = true) {
        const pl = ctx.player;
        const h = pl.yaw - (angleDeg * Math.PI) / 180;
        const x = pl.position.x - Math.sin(h) * dist;
        const z = pl.position.z - Math.cos(h) * dist;
        self.sim?.place(i, x, z, facePlayer ? headingTo(pl.position.x - x, pl.position.z - z) : undefined);
      },
      freeze(on = true) {
        if (self.sim) self.sim.frozen = on;
      },
      horn(signal) {
        const s = self.sim;
        const p = ctx.player.position;
        self.onSimEvent({ type: 'horn', signal, x: s?.leader.x ?? p.x, z: s?.leader.z ?? p.z }, s ?? (null as unknown as PackSim));
      },
      catch() {
        const s = self.sim;
        if (!s || s.caught) return;
        const p = ctx.player.position;
        let best = 0;
        s.agents.forEach((a, i) => {
          if (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(s.agents[best]!.x - p.x, s.agents[best]!.z - p.z)) best = i;
        });
        s.force('chasing');
        s.caught = { by: best, t: 0 };
        self.caughtBy = s.agents[best]!;
        self.beginCaught();
      },
      events() {
        return self.log.slice();
      },
      sim() {
        return self.sim;
      },
      configure(c) {
        self.configure({ ...c, kind: 'pack' } as ThreatConfig);
      },
      tracks() {
        const T = self.tracks;
        const n = { boot: 0, paw: 0, hoof: 0 };
        for (const p of T.prints) n[p.kind]++;
        return { ...n, seg: T.seg, now: T.now, snow: self.snowAmount(), tracking: self.sim?.tracking ?? false };
      },
      walkPrints(x0, z0, x1, z1, step = 0.7) {
        const d = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.max(1, Math.floor(d / step));
        self.lastStep = null;
        for (let i = 0; i <= n; i++) self.footprint(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, false);
        return n + 1;
      },
      kennel() {
        const f = self.gate.frame;
        if (!f) return null;
        const c = self.sim?.ctl;
        return {
          placed: true,
          open: self.gate.isOpen,
          prompt: self.gatePrompt,
          x: f.x,
          z: f.z,
          nx: f.nx,
          nz: f.nz,
          path: c instanceof KennelMode ? [...c.path] : [],
          nearest: self.passNearest,
        };
      },
      readTracks() {
        const p = ctx.player.position;
        const r = self.tracks.readPack(p.x, p.z, 2.4, self.tracks.now);
        return r ? { ...r, text: self.readingText(r) } : null;
      },
      mode() {
        const s = self.sim;
        if (!s) return null;
        const c = s.ctl;
        if (c instanceof FinaleMode) return { mode: s.mode, phase: c.phase, calm: c.calm };
        if (c instanceof DriveMode) return { mode: s.mode, pressure: c.pressure };
        if (c instanceof ParforceMode) return { mode: s.mode, phase: c.phase, rests: c.stats.rests, rideIns: c.stats.rideIns, bites: s.bites, lunges: s.lungeStats.started };
        if (c instanceof StandMode) return { mode: s.mode, phase: c.engaged ? 'engaged' : 'waiting', bites: s.bites, lunges: s.lungeStats.started };
        if (c instanceof KennelMode) return { mode: s.mode, phase: c.phase };
        return { mode: s.mode };
      },
      saved() {
        return self.slice().pack;
      },
      tableau() {
        const T = self.tableau;
        return T ? { kind: T.kind, t: T.t, lie: T.agents.map((a) => a.lie), gone: T.agents.map((a) => a.gone) } : null;
      },
    };
    window.kq.lantern = {
      toggle(on) {
        const L = self.slice().lantern;
        return self.setLit(on ?? !L.lit, false);
      },
      setOil(v) {
        const L = self.slice().lantern;
        L.oil = Math.max(0, Math.min(1, v));
        ctx.events.emit('lantern:oil', { oil: L.oil });
      },
      refill() {
        self.refill();
      },
      setSeconds(s) {
        self.slice().lantern.seconds = s;
      },
      state() {
        return { ...self.slice().lantern, light: self.lanternView.light };
      },
    };
  }

  dispose(): void {
    this.visuals.object.removeFromParent();
    this.visuals.dispose();
    this.cones.object.removeFromParent();
    this.cones.dispose();
    this.trackVis.mesh.removeFromParent();
    this.trackVis.dispose();
    this.lanternView.dispose();
    this.overlay.dispose();
  }
}

let hunt: Hunt | null = null;

export default defineSystem({
  id: 'hunt',
  init(ctx) {
    hunt = new Hunt(ctx);
  },
  update(dt) {
    hunt?.update(dt);
  },
  frame(dt) {
    hunt?.frame(dt);
  },
  dispose() {
    hunt?.dispose();
    hunt = null;
  },
});
