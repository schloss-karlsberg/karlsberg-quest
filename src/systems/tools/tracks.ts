import { Mesh, Vector3 } from 'three';
import type { GameContext } from '../../core/context';
import { type RibbonLine, buildRibbons, groundLineMaterial, ribbonGeometry, throughMesh } from './ribbon';

/**
 * Spurenleser 2: the pack's routes as faint lines in the ground ("Fährtenlinien", bible 03 §2.1,
 * 05 §4.7): where the leader is heading (its planned path on the walk graph, flowing dashes) and
 * where each hound has been (fading trails).
 *
 * Read-only accessor (no import of the hunt system): `readPack()` looks at `window.kq.hunt.sim()`
 * and duck-types the PackSim: `agents[{kind,x,z}]`, `leader {path:number[], pathI}`,
 * `graph {xs, zs}`. Anything missing → no lines.
 */
export interface PackView {
  agents: { kind: string; x: number; z: number }[];
  /** Leader's remaining route [x, z] (from its position). */
  route: [number, number][];
}

interface SimLike {
  agents?: { kind: string; x: number; z: number }[];
  leader?: { x: number; z: number; path?: number[]; pathI?: number };
  graph?: { xs: ArrayLike<number>; zs: ArrayLike<number> } | null;
}

export function readPack(): PackView | null {
  const hooks = (typeof window !== 'undefined' ? (window.kq as unknown as { hunt?: { sim?: () => unknown } } | undefined) : undefined)?.hunt;
  const sim = hooks?.sim?.() as SimLike | null | undefined;
  return sim ? packView(sim) : null;
}

/** Pure part of the accessor (tested with a fake sim). */
export function packView(sim: SimLike): PackView | null {
  if (!Array.isArray(sim.agents) || !sim.agents.length) return null;
  const agents = sim.agents.map((a) => ({ kind: a.kind, x: a.x, z: a.z }));
  const route: [number, number][] = [];
  const L = sim.leader;
  const g = sim.graph;
  if (L && Array.isArray(L.path) && g) {
    route.push([L.x, L.z]);
    for (let i = Math.max(0, L.pathI ?? 0); i < L.path.length; i++) {
      const n = L.path[i]!;
      const x = g.xs[n];
      const z = g.zs[n];
      if (x === undefined || z === undefined) continue;
      route.push([x, z]);
    }
    if (route.length < 2) route.length = 0;
  }
  return { agents, route };
}

const ROUTE: readonly [number, number, number] = [0.95, 0.62, 0.22];
const TRAIL: readonly [number, number, number] = [0.85, 0.36, 0.12];

export class Tracks {
  readonly mesh: Mesh;
  private readonly through: Mesh;
  private readonly mat = groundLineMaterial();
  private readonly trails = new Map<number, [number, number][]>();
  private sampleT = 0;
  private target = 0;
  lines = 0;

  constructor(private readonly ctx: GameContext) {
    this.mesh = new Mesh(undefined, this.mat);
    this.mesh.name = 'kq-tracks';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 4;
    this.through = throughMesh(this.mat);
    this.mesh.add(this.through);
    this.mat.uniforms.uGlow!.value = 0.85;
    this.mat.uniforms.uFlow!.value = 1.6;
  }

  set(on: boolean): void {
    this.target = on ? 1 : 0;
    if (!on) this.trails.clear();
  }

  frame(dt: number): void {
    const u = this.mat.uniforms;
    const reduced = this.ctx.settings.state.reducedMotion;
    u.uFlow!.value = reduced ? 0 : 1.6;
    this.sampleT -= dt;
    let view: PackView | null = null;
    if (this.target > 0 && this.sampleT <= 0) {
      this.sampleT = 0.4;
      view = readPack();
      if (!view) this.trails.clear();
      else this.rebuild(view);
    }
    const want = this.target > 0 && this.lines > 0 ? 0.7 : 0;
    u.uOpacity!.value += (want - u.uOpacity!.value) * Math.min(1, dt * 2.5);
    this.mesh.visible = u.uOpacity!.value > 0.01;
    const p = this.ctx.player.position;
    (u.uCenter!.value as Vector3).set(p.x, 0, p.z);
    u.uRadius!.value = 180;
  }

  private rebuild(view: PackView): void {
    view.agents.forEach((a, i) => {
      let t = this.trails.get(i);
      if (!t) this.trails.set(i, (t = []));
      const last = t[t.length - 1];
      if (!last || Math.hypot(last[0] - a.x, last[1] - a.z) > 1.2) t.push([a.x, a.z]);
      if (t.length > 90) t.shift();
    });
    const lines: RibbonLine[] = [];
    if (view.route.length >= 2) lines.push({ pts: view.route, color: ROUTE, width: 0.8, dash: 2.4, alpha: 1 });
    for (const [i, t] of this.trails) {
      if (t.length < 2) continue;
      const a = view.agents[i];
      lines.push({ pts: t, color: TRAIL, width: a?.kind === 'pikeur' ? 0.6 : 0.4, dash: a?.kind === 'pikeur' ? 0 : 0.9, alpha: 0.75 });
    }
    this.lines = lines.length;
    const hf = this.ctx.world.heightfield;
    this.mesh.geometry.dispose();
    this.mesh.geometry = ribbonGeometry(buildRibbons(lines, (x, z) => hf.heightAt(x, z), 0.1, 2));
    this.through.geometry = this.mesh.geometry;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    (this.through.material as { dispose(): void }).dispose();
  }
}
