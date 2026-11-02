import type { GraphicsLevel, SettingsStore } from '../core/save';
import type { World } from '../world/world';
import type { PostFX } from './post';

/**
 * Graphics presets (settings → Bild & Leistung). One place decides what each level costs; the
 * fx system maps Niedrig → its low particle level, the tools system thins the point cloud on
 * Niedrig (both read `settings.graphics`).
 */
export interface QualityPreset {
  /** Upper bound of the device pixel ratio. */
  maxDpr: number;
  /** MSAA samples of the HDR scene target. */
  msaa: number;
  /** Terrain LOD distance factor (1 = 200 / 450 / 1000 m). */
  lodScale: number;
  /** Instanced trees: far ring (m) and the near (detailed) ring (m). */
  treeFar: number;
  treeNear: number;
}

export const QUALITY_PRESETS: Record<GraphicsLevel, QualityPreset> = {
  low: { maxDpr: 1, msaa: 0, lodScale: 0.6, treeFar: 480, treeNear: 110 },
  medium: { maxDpr: 1.25, msaa: 2, lodScale: 0.8, treeFar: 600, treeNear: 140 },
  high: { maxDpr: 1.5, msaa: 4, lodScale: 1, treeFar: 700, treeNear: 170 },
};

export const GRAPHICS_LEVELS: GraphicsLevel[] = ['low', 'medium', 'high'];

/** Pixel ratio for a preset and the user's resolution scale (pure, tested). */
export function pixelRatioFor(level: GraphicsLevel, resolutionScale: number, devicePixelRatio: number): number {
  const p = QUALITY_PRESETS[level];
  const scale = Math.max(0.5, Math.min(1, resolutionScale || 1));
  return Math.max(0.35, Math.min(devicePixelRatio || 1, p.maxDpr) * scale);
}

/**
 * First-run preset from the GPU name (WEBGL_debug_renderer_info) and the device (pure, tested):
 * software rasterisers and phones / tablets → Niedrig, integrated laptop GPUs → Mittel, else Hoch.
 * The auto-downgrade corrects a wrong guess within seconds.
 */
export function suggestLevel(gpu: string, coarsePointer: boolean, cores: number): GraphicsLevel {
  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(gpu)) return 'low';
  if (coarsePointer) return 'low';
  if (/mali|adreno|powervr|videocore/i.test(gpu)) return 'low';
  if (/intel|uhd|iris|radeon\(tm\) graphics|vega \d+ graphics/i.test(gpu)) return 'medium';
  if (cores > 0 && cores <= 4) return 'medium';
  return 'high';
}

/** GPU name for `suggestLevel` (empty when the browser hides it). */
export function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  } catch {
    return '';
  }
}

/** Auto-downgrade thresholds: average frame time above `slowMs` for `seconds` steps one level down. */
export const AUTO_QUALITY = { slowMs: 25, seconds: 6, graceSeconds: 4 };

/**
 * Pure decision of the auto-downgrade (tested): feed one-second averages, get the next level or
 * resolution scale when the game has been slow for `AUTO_QUALITY.seconds` in a row.
 */
export class AutoQuality {
  private slow = 0;
  private grace: number = AUTO_QUALITY.graceSeconds;

  /** Ignore the next seconds (era change, shader compiles, teleports). */
  hold(seconds: number = AUTO_QUALITY.graceSeconds): void {
    this.grace = Math.max(this.grace, seconds);
    this.slow = 0;
  }

  /** One second of play with average frame time `avgMs`. */
  sample(avgMs: number, level: GraphicsLevel, resolutionScale: number): { level: GraphicsLevel; resolutionScale: number } | null {
    if (this.grace > 0) {
      this.grace -= 1;
      return null;
    }
    this.slow = avgMs > AUTO_QUALITY.slowMs ? this.slow + 1 : 0;
    if (this.slow < AUTO_QUALITY.seconds) return null;
    this.slow = 0;
    this.grace = AUTO_QUALITY.graceSeconds;
    const i = GRAPHICS_LEVELS.indexOf(level);
    if (i > 0) return { level: GRAPHICS_LEVELS[i - 1]!, resolutionScale };
    if (resolutionScale > 0.76) return { level, resolutionScale: 0.75 };
    return null;
  }
}

export interface QualityDeps {
  renderer: { setPixelRatio(r: number): void; getPixelRatio(): number };
  post: PostFX;
  world: World;
  settings: SettingsStore;
  /** Re-size renderer + post targets (boot's resize handler). */
  resize(): void;
  /** Say what happened (toast). */
  notify(level: GraphicsLevel, resolutionScale: number): void;
}

/**
 * Applies the preset (pixel ratio, MSAA, terrain LOD, tree rings) and runs the auto-downgrade
 * while the game is played. Auto is off in `?manual`, under WebDriver (e2e) unless `?autoq`, and
 * when the player switched it off in the settings.
 */
export class QualityManager {
  private readonly auto = new AutoQuality();
  private acc = 0;
  private frames = 0;
  private ms = 0;
  /** Allowed to auto-downgrade at all (URL / environment). */
  autoAllowed = true;
  /** MSAA forced off (`?nomsaa`). */
  noMsaa = false;

  constructor(private readonly d: QualityDeps) {}

  get level(): GraphicsLevel {
    return this.d.settings.state.graphics ?? 'high';
  }

  get preset(): QualityPreset {
    return QUALITY_PRESETS[this.level];
  }

  apply(): void {
    const s = this.d.settings.state;
    const p = this.preset;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const want = pixelRatioFor(this.level, s.resolutionScale, dpr);
    this.d.post.setSamples(this.noMsaa ? 0 : p.msaa);
    if (Math.abs(this.d.renderer.getPixelRatio() - want) > 1e-3) {
      this.d.renderer.setPixelRatio(want);
      this.d.resize();
    }
    this.d.world.terrain.lodScale = p.lodScale;
    this.d.world.forest.setDistances(p.treeNear, p.treeFar);
    this.auto.hold(2);
  }

  /** Hold the auto-downgrade for a few seconds (era change, loading a building, a shift). */
  hold(seconds?: number): void {
    this.auto.hold(seconds);
  }

  /** Per rendered frame while playing (`active` = game running, tab visible). */
  frame(frameMs: number, active: boolean): void {
    if (!active || !this.autoAllowed || !this.d.settings.state.autoQuality) {
      this.acc = 0;
      this.frames = 0;
      this.ms = 0;
      return;
    }
    if (frameMs > 250) {
      // a stall (shader compile, building interiors, tab switch) says nothing about the steady state
      this.auto.hold(2);
      return;
    }
    this.acc += frameMs;
    this.ms += frameMs;
    this.frames++;
    if (this.acc < 1000) return;
    const avg = this.ms / Math.max(1, this.frames);
    this.acc = 0;
    this.ms = 0;
    this.frames = 0;
    const s = this.d.settings.state;
    const next = this.auto.sample(avg, this.level, s.resolutionScale);
    if (!next) return;
    this.d.settings.update((d) => {
      d.graphics = next.level;
      d.resolutionScale = next.resolutionScale;
    }, 'graphics');
    this.d.notify(next.level, next.resolutionScale);
  }
}
