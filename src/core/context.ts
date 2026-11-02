import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { AudioManager } from '../audio/audio';
import type { ContentDB } from '../content/db';
import type { GameData } from '../data/types';
import type { t } from '../i18n';
import type { Input } from '../player/input';
import type { Player } from '../player/player';
import type { PostFX } from '../render/post';
import type { UI } from '../ui/ui';
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
  player: Player;
  input: Input;
  world: World;
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
  /** `?debug` URL flag. */
  debug: boolean;
  /** URL query flags (e.g. `?era=1789&x=…`). */
  params: URLSearchParams;
  t: typeof t;
}
