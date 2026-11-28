/**
 * What the lens really sees of a photo subject (TASK-080): a one-off pixel test at the shutter.
 *
 * The geometric judge (`core.ts`) marches sight rays against terrain, footprint walls and trunks;
 * ferns, bushes and tall grass are instanced on the GPU and do not block a ray. So a deer behind a
 * row of ferns scored „Perfekt!“. For targets that have a drawn body (`registerSubject`) the photo
 * system measures instead, once per shot and only while such a body is in the world:
 *
 *  1. the subjects alone, each in its own flat colour → the pixels of each whole silhouette;
 *  2. the scene without the subjects, as it is drawn (alpha tests, wind, graphics tier) → depth;
 *  3. the subjects again, depth-tested against 2 → the pixels of each that nothing hides.
 *
 * `share` = 3 ÷ 1 per subject. Glows, light shafts and particles do not write depth, so they hide
 * nothing. All three passes go to one small target (`SEEN.height` px high); nothing here runs per
 * tick or per frame. The pure half (counting, the rules' numbers, the German tips) has no three.js
 * state and is tested in tests/photo-visibility.test.ts.
 */
import { Color, DoubleSide, MeshBasicMaterial, WebGLRenderTarget, type Camera, type Material, type Mesh, type Object3D, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import type { ShotResult, Verdict } from './core';

/** What a measurement says about one subject. */
export interface Seen {
  /** 0..1: the share of the subject's silhouette (inside the frame) that nothing hides. */
  share: number;
  /** 0..1: its visible pixels as a share of the whole frame. */
  area: number;
}

export const SEEN = {
  /** The measuring target's height in px (the width follows the view's aspect). */
  height: 360,
  /** Widest target (an ultra-wide window). */
  maxWidth: 960,
  /** A silhouette smaller than this (px) is not measured: the geometric rules decide. */
  minPx: 24,
  /** Private camera layer of the subject passes. */
  layer: 29,
  /** Subject i is drawn with red = (i + 1) × `step` (of 255). */
  step: 8,
} as const;

/** Subjects in one measurement at most (red carries the index). */
export const MAX_SUBJECTS = Math.floor(255 / SEEN.step) - 1;

/** Pixels per subject in an RGBA8 buffer of an id pass (alpha 0 = nothing drawn there). */
export function countIds(px: ArrayLike<number>, n: number): number[] {
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const k = Math.round(px[i]! / SEEN.step) - 1;
    if (k >= 0 && k < n) out[k]!++;
  }
  return out;
}

/** Whole and visible pixel counts → what was seen (undefined: too small to tell). */
export function seenFrom(whole: number, visible: number, framePx: number): Seen | undefined {
  if (!(whole >= SEEN.minPx) || !(framePx > 0)) return undefined;
  return { share: Math.max(0, Math.min(1, visible / whole)), area: Math.max(0, visible) / framePx };
}

// ---- the card's tip: why a shot was weak, and what to do about it ----------------------------

/** One short German sentence per reason a target was not good (a good shot needs none). */
export const TIP_DE: Partial<Record<Verdict, string>> = {
  verdeckt: 'Etwas steht davor. Such dir eine freie Sicht.',
  'zu-klein': 'Geh näher heran oder nimm den 2×-Zoom.',
  'zu-weit': 'Geh näher heran.',
  'zu-nah': 'Geh einen Schritt zurück.',
  'nicht-mittig': 'Nimm das Motiv in die Bildmitte.',
  unscharf: 'Halt kurz still, dann auslösen.',
  aufgeschreckt: 'Warte, bis die Tiere wieder ruhig stehen.',
  'nicht-alle': 'Alle müssen frei und mittig im Bild sein.',
};
/** A good shot of a measured subject without the third star: part of it was covered, or it was small in the frame. */
export const TIP_PARTLY_DE = 'Für drei Sterne: freie Sicht auf das ganze Motiv.';
export const TIP_BIGGER_DE = 'Für drei Sterne: größer ins Bild. Geh näher heran oder nimm den 2×-Zoom.';

/** A miss this many times beyond a target's range is not about that target: no tip. */
const MEANT_WITHIN = 1.6;
/** The reasons in the order a player can fix them (the partner's reason explains „Nicht alle“). */
const TIP_ORDER: Verdict[] = ['aufgeschreckt', 'verdeckt', 'zu-weit', 'zu-nah', 'nicht-mittig', 'zu-klein', 'unscharf'];

/**
 * The tip under a shot's card, or null. `range(id)` is the farthest distance at which that target
 * can be good (so a board 150 m away in the background never earns „Geh näher heran“).
 */
export function shotTip(r: ShotResult, range: (id: string) => number | undefined): string | null {
  if (!r.signal) return null;
  if (r.good.length) {
    if (r.stars >= 3) return null;
    const short = r.details.filter((d) => d.good && d.short).map((d) => d.short);
    return short.includes('cover') ? TIP_PARTLY_DE : short.length ? TIP_BIGGER_DE : null;
  }
  const meant = r.details.filter((d) => d.inFrame && !d.good && d.dist <= (range(d.id) ?? Infinity) * MEANT_WITHIN);
  if (!meant.length) return null;
  for (const v of TIP_ORDER) if (meant.some((d) => d.verdict === v)) return TIP_DE[v] ?? null;
  return TIP_DE[r.verdict] ?? null;
}

// ---- subjects --------------------------------------------------------------------------------

const subjects = new Map<string, (() => Object3D | null)[]>();

/**
 * The drawn body of a photo target, by target id (the animals system for the deer, the photo
 * system's own debug deer). The newest getter that returns an object wins; returns its undo.
 */
export function registerSubject(id: string, body: () => Object3D | null): () => void {
  let list = subjects.get(id);
  if (!list) subjects.set(id, (list = []));
  list.push(body);
  return () => {
    const cur = subjects.get(id);
    if (!cur) return;
    const i = cur.indexOf(body);
    if (i >= 0) cur.splice(i, 1);
    if (!cur.length) subjects.delete(id);
  };
}

function shown(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** The subjects that are in the scene and drawn right now. */
export function liveSubjects(scene: Object3D): { id: string; object: Object3D }[] {
  const out: { id: string; object: Object3D }[] = [];
  for (const [id, list] of subjects) {
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i]!();
      if (!o) continue;
      let root: Object3D = o;
      while (root.parent) root = root.parent;
      if (root === scene && shown(o)) out.push({ id, object: o });
      break;
    }
  }
  return out.slice(0, MAX_SUBJECTS);
}

// ---- the measurement -------------------------------------------------------------------------

interface Swapped {
  mesh: Mesh;
  material: Material | Material[];
  mask: number;
}

/** The three passes. One instance per photo system; `dispose` frees the target and materials. */
export class ShotVisibility {
  private target: WebGLRenderTarget | null = null;
  private readonly mats: MeshBasicMaterial[] = [];
  private px = new Uint8Array(0);
  /** Measurements taken (tests and the debug hook). */
  runs = 0;

  private mat(i: number): MeshBasicMaterial {
    let m = this.mats[i];
    if (!m) {
      m = new MeshBasicMaterial({ fog: false, toneMapped: false, side: DoubleSide });
      m.color.setRGB(((i + 1) * SEEN.step) / 255, 1, 0);
      this.mats[i] = m;
    }
    return m;
  }

  /**
   * Measure every live subject against the current view. Null when there is none (no pass is
   * drawn), or when the context cannot do it; subjects too small to tell are left out of the map.
   */
  measure(renderer: WebGLRenderer, scene: Scene, camera: Camera): Map<string, Seen> | null {
    const live = liveSubjects(scene);
    if (!live.length) return null;
    const aspect = (camera as PerspectiveCamera).aspect || 16 / 9;
    const h = SEEN.height;
    const w = Math.max(16, Math.min(SEEN.maxWidth, Math.round(h * aspect)));
    if (!this.target) this.target = new WebGLRenderTarget(w, h, { depthBuffer: true });
    else if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    if (this.px.length !== w * h * 4) this.px = new Uint8Array(w * h * 4);
    const rt = this.target;

    const swapped: Swapped[] = [];
    const hidden: Object3D[] = [];
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    const prevAlpha = renderer.getClearAlpha();
    const prevColor = renderer.getClearColor(scratch).getHex();
    const prevMask = camera.layers.mask;
    const prevBg = scene.background;
    const idPass = (on: boolean): void => {
      if (on) {
        live.forEach(({ object }, i) => {
          object.traverse((o) => {
            const mesh = o as Mesh;
            if (!mesh.isMesh) return;
            swapped.push({ mesh, material: mesh.material, mask: mesh.layers.mask });
            mesh.material = this.mat(i);
            mesh.layers.enable(SEEN.layer);
          });
        });
        camera.layers.set(SEEN.layer);
        scene.background = null;
      } else {
        for (const s of swapped) {
          s.mesh.material = s.material;
          s.mesh.layers.mask = s.mask;
        }
        swapped.length = 0;
        camera.layers.mask = prevMask;
        scene.background = prevBg;
      }
    };
    try {
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      // 1. the subjects alone
      idPass(true);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(rt, 0, 0, w, h, this.px);
      const whole = countIds(this.px, live.length);
      idPass(false);
      // 2. the scene without them: its depth stays in the target
      for (const { object } of live) {
        object.visible = false;
        hidden.push(object);
      }
      renderer.setClearColor(prevColor, prevAlpha);
      renderer.render(scene, camera);
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
      // 3. the subjects against that depth
      idPass(true);
      renderer.autoClear = false;
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(rt, 0, 0, w, h, this.px);
      const visible = countIds(this.px, live.length);
      this.runs++;
      const out = new Map<string, Seen>();
      live.forEach(({ id }, i) => {
        const s = seenFrom(whole[i]!, visible[i]!, w * h);
        if (s) out.set(id, s);
      });
      return out;
    } catch (err) {
      console.warn('[photo] visibility test failed', err);
      return null;
    } finally {
      for (const o of hidden) o.visible = true;
      idPass(false);
      renderer.autoClear = prevAuto;
      renderer.setClearColor(prevColor, prevAlpha);
      renderer.setRenderTarget(prevTarget);
    }
  }

  dispose(): void {
    this.target?.dispose();
    this.target = null;
    for (const m of this.mats) m?.dispose();
    this.mats.length = 0;
  }
}

const scratch = new Color();
