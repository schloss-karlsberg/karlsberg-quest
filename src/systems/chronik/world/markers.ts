/**
 * In-world clue markers: a subtle shimmer of glyph motes, a small lit prop with a glowing outline
 * for objects, draped survey rings for relief finds (only while the right scan mode is on), a
 * column of pale motes and ground mist for echoes.
 */
import { Group, Mesh, type Object3D, PlaneGeometry, type ShaderMaterial } from 'three';
import { registerEraMaterials } from '../../fx/shift/prewarm';
import type { ClueStatus } from '../logic';
import type { ChronikClue } from '../types';
import { beamMaterial, disposeTree, drapedDisc, drapedRing, hullMaterial, lin, makeMotes, mistMaterial, propMaterial, ringMaterial } from './gfx';
import { buildProp, propKindFor } from './props';

interface Marker {
  clue: ChronikClue;
  root: Group;
  mats: { mat: ShaderMaterial; key: 'uAlpha' | 'uGlow'; k: number }[];
  vis: number;
  target: number;
  near: number;
  status: ClueStatus;
}

const GOLD = lin(0xffd27a, 2.4);
const ECHO = lin(0xbfe3ff, 1.6);
const SCAN = lin(0xe39a12, 1.0);

export class ClueMarkers {
  readonly group = new Group();
  private readonly items = new Map<string, Marker>();

  constructor(private readonly heightAt: (x: number, z: number) => number) {
    this.group.name = 'chronik-markers';
    registerEraMaterials('chronik.markers', '*', () => [makeMotes({ count: 4, color: GOLD, height: 1, spread: 1, size: 0.06 }), new Mesh(drapedDisc(() => 0, 0, 0, 1, 2, 8), mistMaterial(ECHO)), new Mesh(drapedRing(() => 0, 0, 0, 0.8, 1, 16), ringMaterial(SCAN, 0)), new Mesh(new PlaneGeometry(), beamMaterial(SCAN)), new Mesh(buildProp('chest'), propMaterial()), new Mesh(buildProp('chest'), hullMaterial(GOLD, 0.03))]);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  ids(): string[] {
    return [...this.items.keys()];
  }

  /** Status a marker currently shows (tests / debug). */
  statusOf(id: string): ClueStatus | null {
    return this.items.get(id)?.status ?? null;
  }

  visibility(id: string): number {
    return this.items.get(id)?.vis ?? 0;
  }

  /** Make sure exactly these clues have markers, with their current status. */
  sync(list: { clue: ChronikClue; status: ClueStatus }[]): void {
    const want = new Set(list.map((l) => l.clue.id));
    for (const [id, m] of this.items) if (!want.has(id)) m.target = 0;
    for (const { clue, status } of list) {
      let m = this.items.get(clue.id);
      if (!m) {
        if (status === 'found' || status === 'hidden') continue;
        m = this.create(clue);
        this.items.set(clue.id, m);
      }
      m.status = status;
      m.target = status === 'available' ? 1 : status === 'needs-lantern' ? 0.28 : 0;
    }
  }

  /** Remove everything (era change, load). */
  clear(): void {
    for (const m of this.items.values()) this.remove(m);
    this.items.clear();
  }

  setNear(id: string | null): void {
    for (const [k, m] of this.items) m.near = k === id ? 1 : 0;
  }

  frame(dt: number): void {
    for (const [id, m] of this.items) {
      const k = Math.min(1, dt * (m.target > m.vis ? 1.6 : 2.4));
      m.vis += (m.target - m.vis) * k;
      if (m.target === 0 && m.vis < 0.01) {
        this.remove(m);
        this.items.delete(id);
        continue;
      }
      const boost = 1 + m.near * 0.8;
      for (const { mat, key, k: f } of m.mats) mat.uniforms[key]!.value = m.vis * f * boost;
      m.root.visible = m.vis > 0.005;
    }
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }

  private remove(m: Marker): void {
    m.root.removeFromParent();
    disposeTree(m.root as unknown as Object3D);
  }

  private create(c: ChronikClue): Marker {
    const root = new Group();
    root.name = `clue:${c.id}`;
    const { x, z } = c.where;
    const y0 = this.heightAt(x, z);
    root.position.set(x, 0, z);
    const mats: Marker['mats'] = [];
    const seed = [...c.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

    if (c.kind === 'echo') {
      const motes = makeMotes({ count: 90, color: ECHO, height: 2.4, spread: 0.9, size: 0.07, seed, far: 80 });
      motes.position.y = y0;
      root.add(motes);
      mats.push({ mat: motes.material, key: 'uAlpha', k: 0.9 });
      const mistMat = mistMaterial(lin(0xdfe9f2, 1.0));
      const mist = new Mesh(drapedDisc(this.heightAt, x, z, Math.min(6, c.where.radius * 0.7), 8, 40, 0.2), mistMat);
      mist.renderOrder = 4;
      root.add(mist);
      mats.push({ mat: mistMat, key: 'uAlpha', k: 0.35 });
    } else if (c.kind === 'relief') {
      const R = Math.max(2.5, Math.min(c.where.radius * 0.75, 14));
      const rings: [number, number, number][] = [
        [R, 0.32, 24],
        [R * 0.62, 0.22, 12],
        [R * 0.28, 0.18, 0],
      ];
      for (const [r, w, dash] of rings) {
        const mat = ringMaterial(SCAN, dash);
        const ring = new Mesh(drapedRing(this.heightAt, x, z, r - w, r + w, 128, 0.16), mat);
        ring.renderOrder = 4;
        root.add(ring);
        mats.push({ mat, key: 'uAlpha', k: 0.9 });
      }
      const beamMat = beamMaterial(lin(0xf0a51c, 1.0));
      for (const a of [0, Math.PI / 2]) {
        const beam = new Mesh(new PlaneGeometry(0.9, 26), beamMat);
        beam.geometry.translate(0, 13, 0);
        beam.geometry.scale(1, 1, 1);
        beam.rotation.y = a;
        beam.position.y = y0;
        root.add(beam);
      }
      mats.push({ mat: beamMat, key: 'uAlpha', k: 0.45 });
      const motes = makeMotes({ count: 50, color: GOLD, height: 2.2, spread: R * 0.5, size: 0.08, seed, far: 120 });
      motes.position.y = y0;
      root.add(motes);
      mats.push({ mat: motes.material, key: 'uAlpha', k: 0.8 });
    } else {
      const kind = propKindFor(c);
      if (kind) {
        const geo = buildProp(kind);
        const pm = propMaterial();
        const prop = new Mesh(geo, pm);
        prop.position.y = y0 + 0.01;
        prop.rotation.y = ((seed % 628) / 100) * 1.0;
        prop.scale.setScalar(1.15);
        root.add(prop);
        mats.push({ mat: pm, key: 'uGlow', k: 1 });
        const hm = hullMaterial(GOLD, 0.03);
        const hull = new Mesh(geo, hm);
        hull.position.copy(prop.position);
        hull.rotation.copy(prop.rotation);
        hull.scale.copy(prop.scale);
        hull.renderOrder = 6;
        root.add(hull);
        mats.push({ mat: hm, key: 'uAlpha', k: 0.9 });
      }
      const motes = makeMotes({ count: 46, color: GOLD, height: 1.5, spread: 0.55, size: 0.06, seed, far: 60 });
      motes.position.y = y0;
      root.add(motes);
      mats.push({ mat: motes.material, key: 'uAlpha', k: 1 });
    }
    this.group.add(root);
    return { clue: c, root, mats, vis: 0, target: 0, near: 0, status: 'available' };
  }
}
