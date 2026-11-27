import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { AssetLoader } from '../assets/loader';
import type { AudioManager } from '../audio/audio';
import type { ContentDB } from '../content/db';
import type { GameData } from '../data/types';
import type { t } from '../i18n';
import type { Input } from '../player/input';
import type { Player } from '../player/player';
import type { PerfMonitor } from '../render/perf';
import type { PostFX } from '../render/post';
import type { QualityManager } from '../render/quality';
import type { UI } from '../ui/ui';
import type { TourCrowd } from '../world/crowd';
import type { World } from '../world/world';
import type { Era, EraInfo } from './era';
import type { EventBus } from './events';
import type { FixedStepLoop } from './loop';
import type { SaveManager, SettingsStore } from './save';
import type { GameStateStore } from './state';
import type { SystemRegistry } from './systems';

export interface EraController {
  readonly current: Era;
  readonly info: EraInfo;
  /** Switch era: terrain dataset, look, palace, forest; re-grounds the player, emits 'era:change'. */
  set(era: Era): void;
}

/** Reasons stack: the simulation runs only while no reason is active. */
export interface PauseController {
  push(reason: string): void;
  pop(reason: string): void;
  readonly paused: boolean;
  readonly reasons: ReadonlySet<string>;
}

export interface TakeCameraOptions {
  /** Draw the player character while the camera is taken (default true). */
  showAvatar?: boolean;
  /** Freeze the player (`frozen` + `lookLocked`, yaw / pitch restored on release; default true). */
  freeze?: boolean;
  /** Called once when the camera is given back (reason: 'release', 'shift', 'era', 'death', 'load', 'error'). */
  onRelease?: (reason: string) => void;
}

/**
 * The production camera takeover (boot.ts's override slot; src/systems/cinematic/takeover.ts).
 * One owner at a time; `fn` runs every rendered frame after the third-person rig placed the camera.
 * Released automatically on an era change (`shift:done`, `era:change`), the player's death and a load.
 * The hand-back eases from the shot to the rig over 0.4 s (a cut with reduced motion).
 */
export interface CinematicCamera {
  /** False when another owner holds the camera. */
  takeCamera(owner: string, fn: (cam: PerspectiveCamera) => void, opts?: TakeCameraOptions): boolean;
  releaseCamera(owner: string): void;
  /** The current owner, null when free. */
  readonly cameraOwner: string | null;
}

/**
 * Everything a feature system may use. Passed to `init/update/frame` and exposed as `window.kq.ctx`.
 * Rule of thumb: talk to other features through `events` and `state`, not through each other.
 */
export interface GameContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** Post-processing (grade, vignette, grain; `uShift`, `uFlash`, `uDesaturate` for effects). */
  post: PostFX;
  /** CC0 art assets by manifest id (src/assets; docs/ART-DIRECTION.md §8). */
  assets: AssetLoader;
  /** Per-frame counters (fps, frame / CPU ms, draw calls, triangles); `kq.perf()`, F3 overlay. */
  perf: PerfMonitor;
  /** Graphics preset (pixel ratio, MSAA, terrain LOD, tree rings) and the auto-downgrade. */
  quality: QualityManager;
  player: Player;
  input: Input;
  world: World;
  /** Live collision circles supplied by the tour walkers and animals. */
  tourCrowd: TourCrowd;
  /** Prepared static data (heights, rooms, POIs, path graph, attribution). */
  data: GameData;
  state: GameStateStore;
  settings: SettingsStore;
  save: SaveManager;
  events: EventBus;
  audio: AudioManager;
  ui: UI;
  era: EraController;
  content: ContentDB;
  systems: SystemRegistry;
  loop: FixedStepLoop;
  pause: PauseController;
  /** Camera takeover for cut-scenes (`takeCamera` / `releaseCamera`). */
  cinematic: CinematicCamera;
  /** `?debug` URL flag. */
  debug: boolean;
  /** URL query flags (e.g. `?era=1789&x=…`). */
  params: URLSearchParams;
  t: typeof t;
}
