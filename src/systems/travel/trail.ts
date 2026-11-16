/**
 * The Wegweiser: chalk-blue motes that drift along the walkable route from the player towards the
 * goal (A* round wings, through gates and doors: world/route.ts), for the first ~70 m. Shown for a
 * while after a goal changes, when the straight line runs into a wall, and when the player seems
 * lost (no progress for a while). CPU positions for ≤ 48 sprites per frame.
 */
import { Color, type InstancedBufferAttribute, type Mesh, type ShaderMaterial } from 'three';
import { glows } from './visuals';

const N = 48;
const SPACING = 1.6;
const SHOW = 70;

export class Trail {
  readonly mesh: Mesh;
  private readonly sprite: InstancedBufferAttribute;
  private readonly tint: InstancedBufferAttribute;
  private path: [number, number][] = [];
  private cum: number[] = [];
  private alpha = 0;
  private flow = 0;
  /** Seconds the trail stays visible (counts down). */
  visibleFor = 0;

  constructor() {
    const list = Array.from({ length: N }, () => ({ x: 0, y: -999, z: 0, size: 0.55, color: new Color(0.5, 0.85, 1.5) }));
    this.mesh = glows(list);
    this.mesh.name = 'travel-trail';
    this.sprite = this.mesh.geometry.getAttribute('aSprite') as InstancedBufferAttribute;
    this.tint = this.mesh.geometry.getAttribute('aTint') as InstancedBufferAttribute;
    this.mesh.visible = false;
  }

  get points(): readonly [number, number][] {
    return this.path;
  }

  setPath(pts: [number, number][]): void {
    this.path = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  }

  clear(): void {
    this.path = [];
    this.cum = [];
    this.visibleFor = 0;
  }

  private at(s: number): [number, number] | null {
    const c = this.cum;
    if (!c.length || s > c[c.length - 1]!) return null;
    let i = 1;
    while (i < c.length && c[i]! < s) i++;
    if (i >= c.length) return this.path[this.path.length - 1]!;
    const a = this.path[i - 1]!;
    const b = this.path[i]!;
    const t = (s - c[i - 1]!) / Math.max(1e-6, c[i]! - c[i - 1]!);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  /** Per frame; `heightAt` for the ground under each mote. */
  frame(dt: number, heightAt: (x: number, z: number) => number, reducedMotion: boolean): void {
    this.visibleFor = Math.max(0, this.visibleFor - dt);
    const want = this.visibleFor > 0 && this.path.length > 1 ? 1 : 0;
    this.alpha += (want - this.alpha) * Math.min(1, dt * 2.5);
    this.mesh.visible = this.alpha > 0.01;
    if (!this.mesh.visible) return;
    this.flow = (this.flow + dt * (reducedMotion ? 0.8 : 2.2)) % SPACING;
    const total = this.cum[this.cum.length - 1] ?? 0;
    for (let i = 0; i < N; i++) {
      const s = 2.2 + i * SPACING + this.flow;
      const p = s < Math.min(total, SHOW) ? this.at(s) : null;
      if (!p) {
        this.sprite.setY(i, -999);
        continue;
      }
      const y = heightAt(p[0], p[1]) + 0.22 + Math.sin(s * 1.7 + this.flow * 2) * 0.05;
      this.sprite.setXYZ(i, p[0], y, p[1]);
      const fade = this.alpha * Math.min(1, (s - 2.2) / 3) * (1 - Math.max(0, (s - SHOW * 0.6) / (SHOW * 0.4)));
      this.tint.setXYZ(i, 0.45 * fade, 0.8 * fade, 1.45 * fade);
    }
    this.sprite.needsUpdate = true;
    this.tint.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}
