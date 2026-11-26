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
  /** Sun shadow map size (px, 0 = no shadows) and the half extent (m) of the box around the player. */
  shadowSize: number;
  shadowRange: number;
  /** PCF taps per shaded pixel: 1, 4 (2×2) or 9 (3×3), each a bilinear 4-texel compare. */
  shadowTaps: number;
  /**
   * Re-render the shadow map at most every n-th frame (`SunShadows.every`); a frame re-uses the
   * last map only while the focus moved less than ¾ texel and the map is ≤ 25 ms old
   * (render/shadows.ts `ShadowReuse`; boot forces fresh maps in fights and bullet time).
   */
  shadowEvery: number;
  /** Bloom (HDR glow of fire, lanterns, spectral enemies, the sun). */
  bloom: boolean;
  /** Screen-space ambient occlusion (half resolution, depth only). */
  ao: boolean;
  /** Colour grade extras (split toning, white balance, film grain). Low keeps the plain grade. */
  grade: boolean;
}

export const QUALITY_PRESETS: Record<GraphicsLevel, QualityPreset> = {
  low: { maxDpr: 1, msaa: 0, lodScale: 0.6, treeFar: 480, treeNear: 110, shadowSize: 0, shadowRange: 0, shadowTaps: 0, shadowEvery: 2, bloom: false, ao: false, grade: false },
  medium: { maxDpr: 1, msaa: 2, lodScale: 0.8, treeFar: 600, treeNear: 140, shadowSize: 1024, shadowRange: 55, shadowTaps: 4, shadowEvery: 2, bloom: true, ao: false, grade: true },
  high: { maxDpr: 1.25, msaa: 4, lodScale: 1, treeFar: 700, treeNear: 170, shadowSize: 2048, shadowRange: 75, shadowTaps: 9, shadowEvery: 2, bloom: true, ao: true, grade: true },
};

/**
 * „Energiesparen“ (settings `powerSave`) on top of any preset: pixel ratio ≤ 1, no AO, no planar
 * water reflection; the 30 fps cap is `frameCap` (core/loop.ts).
 */
export const POWER_SAVE = { maxDpr: 1 } as const;

/** True for software rasterisers (SwiftShader in headless e2e, llvmpipe, Microsoft Basic Render). */
export function isSoftwareGpu(gpu: string): boolean {
  return /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(gpu);
}

/** `?q=low|med|medium|high` → a session tier (not saved), null when absent or unknown (pure, tested). */
export function parseQualityParam(v: string | null | undefined): GraphicsLevel | null {
  const k = (v ?? '').trim().toLowerCase();
  if (k === 'low' || k === 'niedrig') return 'low';
  if (k === 'med' || k === 'medium' || k === 'mittel') return 'medium';
  if (k === 'high' || k === 'hoch') return 'high';
  return null;
}

export const GRAPHICS_LEVELS: GraphicsLevel[] = ['low', 'medium', 'high'];

/** Pixel ratio for a preset and the user's resolution scale, optionally under „Energiesparen“ (pure, tested). */
export function pixelRatioFor(level: GraphicsLevel, resolutionScale: number, devicePixelRatio: number, powerSave = false): number {
  const p = QUALITY_PRESETS[level];
  const scale = Math.max(0.5, Math.min(1, resolutionScale || 1));
  const cap = powerSave ? Math.min(p.maxDpr, POWER_SAVE.maxDpr) : p.maxDpr;
  return Math.max(0.35, Math.min(devicePixelRatio || 1, cap) * scale);
}

/**
 * First-run preset from the GPU name (WEBGL_debug_renderer_info) and the device (pure, tested):
 * software rasterisers and phones / tablets → Niedrig, integrated laptop GPUs → Mittel, else Hoch.
 * The auto-downgrade corrects a wrong guess within seconds.
 */
export function suggestLevel(gpu: string, coarsePointer: boolean, cores: number): GraphicsLevel {
  if (isSoftwareGpu(gpu)) return 'low';
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

/** Slow-frame threshold under a frame cap (pure, tested): 25 ms, or 1.25 × the capped frame time when that is longer. */
export function slowMsFor(capFps: number): number {
  return Number.isFinite(capFps) && capFps > 0 ? Math.max(AUTO_QUALITY.slowMs, 1250 / capFps) : AUTO_QUALITY.slowMs;
}

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

  /**
   * One second of play with average frame time `avgMs`; `slowMs` is the threshold (higher under a
   * 30 fps cap, whose frames are 33 ms by design: `slowMsFor`).
   */
  sample(avgMs: number, level: GraphicsLevel, resolutionScale: number, slowMs: number = AUTO_QUALITY.slowMs): { level: GraphicsLevel; resolutionScale: number } | null {
    if (this.grace > 0) {
      this.grace -= 1;
      return null;
    }
    this.slow = avgMs > slowMs ? this.slow + 1 : 0;
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
  /**
   * Session tier that beats the saved setting (`?q=low|med|high`, or a software renderer such as
   * SwiftShader in the headless e2e run). Cleared when the player picks a level in the settings.
   */
  override: GraphicsLevel | null = null;
  /** Level when nothing is saved and nothing overrides (the GPU guess, 'high' when unknown). */
  fallback: GraphicsLevel = 'high';
  /** The render cap (fps, Infinity = none; boot sets it from „Bildrate“ / „Energiesparen“): the slow threshold follows it. */
  capFps = Infinity;
  /** Called after every `apply()` with the active preset (sun shadows, post features …). */
  readonly listeners: ((p: QualityPreset, level: GraphicsLevel) => void)[] = [];

  constructor(private readonly d: QualityDeps) {}

  get level(): GraphicsLevel {
    return this.override ?? this.d.settings.state.graphics ?? this.fallback;
  }

  get preset(): QualityPreset {
    return QUALITY_PRESETS[this.level];
  }

  get pixelRatio(): number {
    const s = this.d.settings.state;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
    return pixelRatioFor(this.level, s.resolutionScale, dpr, s.powerSave);
  }

  apply(): void {
    const s = this.d.settings.state;
    const p = this.preset;
    const save = s.powerSave === true;
    const want = this.pixelRatio;
    this.d.post.setSamples(this.noMsaa ? 0 : p.msaa);
    if (Math.abs(this.d.renderer.getPixelRatio() - want) > 1e-3) {
      this.d.renderer.setPixelRatio(want);
      this.d.resize();
    }
    this.d.world.terrain.lodScale = p.lodScale;
    this.d.world.forest.setDistances(p.treeNear, p.treeFar);
    this.d.post.setFeatures({ bloom: p.bloom, ao: p.ao && !save, grade: p.grade });
    this.d.world.water.reflections = !save;
    for (const fn of this.listeners) fn(p, this.level);
    this.auto.hold(2);
  }

  /** Hold the auto-downgrade for a few seconds (era change, loading a building, a shift). */
  hold(seconds?: number): void {
    this.auto.hold(seconds);
  }

  /** Per rendered frame while playing (`active` = game running, tab visible). */
  frame(frameMs: number, active: boolean): void {
    if (!active || !this.autoAllowed || !this.d.settings.state.autoQuality) {
      this.auto.hold(0); // slow seconds must be consecutive while playing
      this.acc = 0;
      this.frames = 0;
      this.ms = 0;
      return;
    }
    if (frameMs >= 250) {
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
    const next = this.auto.sample(avg, this.level, s.resolutionScale, slowMsFor(this.capFps));
    if (!next) return;
    this.override = null;
    this.d.settings.update((d) => {
      d.graphics = next.level;
      d.resolutionScale = next.resolutionScale;
    }, 'graphics');
    this.d.notify(next.level, next.resolutionScale);
  }
}
