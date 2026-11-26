/**
 * The party's set (src/systems/party/fest.ts): built headless on a sloped fake terrain for every
 * variant and graphics preset — within its draw-call / triangle budget, every prop anchored on the
 * ground or the table top, nothing below the ground, the archive box only in museum, the local
 * lights in the prop shader, and the handle's lifecycle (fire, burst, update, hide, dispose).
 */
import { type BufferGeometry, Group, type InstancedBufferGeometry, type Mesh, type ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import type { GraphicsLevel } from '../src/core/save';
import { FestPartySet } from '../src/systems/party/fest';
import { PROP_EMISSIVE_HOOK, festPropMaterial } from '../src/systems/party/festfx';
import { PROPS, TABLE_TOP, partyLayout, propsFor } from '../src/systems/party/placements';
import { PARTY_VARIANTS, type PartyVariant } from '../src/systems/party/types';
import { propMaterial } from '../src/systems/scenery/material';
import { atmosphere } from '../src/world/atmosphere';

/** A gently sloped plateau at ~350 m. */
const heightAt = (x: number, z: number) => 350 + (x - 1216) * 0.03 - (z + 1114) * 0.02 + Math.sin(x * 0.7) * 0.05;

function build(variant: PartyVariant, level: GraphicsLevel = 'high', reducedMotion = () => false) {
  const scene = new Group();
  const set = new FestPartySet(heightAt, () => level, reducedMotion);
  const h = set.build(scene, partyLayout(variant), variant);
  return { scene, h };
}

function count(root: Group | import('three').Object3D) {
  let tris = 0;
  let meshes = 0;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !m.visible) return;
    meshes++;
    const g = m.geometry as BufferGeometry & Partial<InstancedBufferGeometry>;
    const n = g.index ? g.index.count : g.getAttribute('position').count;
    tris += (n / 3) * (g.isInstancedBufferGeometry ? (g.instanceCount ?? 1) : 1);
  });
  return { tris, meshes };
}

describe('party set (fest.ts)', () => {
  it.each(PARTY_VARIANTS)('%s: within budget on every preset (≤ 12 calls, ≤ 60 k triangles on Hoch, fewer on Niedrig)', (variant) => {
    const out: Record<string, { tris: number; meshes: number; calls: number }> = {};
    for (const level of ['low', 'medium', 'high'] as const) {
      const { h } = build(variant, level);
      const c = count(h.root);
      out[level] = { ...c, calls: h.drawCalls() };
      expect(h.drawCalls()).toBe(c.meshes);
      h.dispose();
    }
    console.log(`[party-set] ${variant} ${JSON.stringify(out)}`);
    expect(out.high!.calls).toBeLessThanOrEqual(12);
    expect(out.high!.tris).toBeLessThanOrEqual(60_000);
    expect(out.low!.calls).toBeLessThan(out.high!.calls);
    expect(out.low!.tris).toBeLessThan(out.high!.tris * 0.7);
    expect(out.medium!.tris).toBeLessThanOrEqual(out.high!.tris);
  });

  it.each(PARTY_VARIANTS)('%s: anchors on the ground or the table top, nothing under the ground', (variant) => {
    const { h } = build(variant);
    const layout = partyLayout(variant);
    const tableY = heightAt(layout.props.table.x, layout.props.table.z);
    expect(Object.keys(h.anchors).sort()).toEqual(propsFor(variant).sort());
    expect('archiveBox' in h.anchors).toBe(variant === 'museum');
    for (const [id, a] of Object.entries(h.anchors)) {
      const spot = PROPS[id as keyof typeof PROPS];
      expect(Number.isFinite(a.x + a.y + a.z)).toBe(true);
      // within a few cm of the placement (things on the table are kept 2 cm in from its edges)
      expect(Math.hypot(a.x - spot.x, a.z - spot.z)).toBeLessThan(0.12);
      if (id === 'lightsA' || id === 'lightsB') expect(a.y).toBeCloseTo(heightAt(a.x, a.z) + spot.up!, 5);
      else if (spot.up !== undefined) expect(a.y).toBeGreaterThanOrEqual(tableY + TABLE_TOP);
      else expect(a.y).toBeCloseTo(heightAt(a.x, a.z), 5);
    }
    // the static props: no vertex deeper than 12 cm under the ground (posts and pegs go in 10 cm)
    const props = h.root.getObjectByName('party-props') as Mesh;
    const p = props.geometry.getAttribute('position');
    let deepest = 0;
    for (let i = 0; i < p.count; i++) deepest = Math.min(deepest, p.getY(i) - heightAt(p.getX(i), p.getZ(i)));
    expect(deepest).toBeGreaterThan(-0.12);
    for (let i = 0; i < p.count; i++) expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true);
    h.dispose();
  });

  it('the prop shader carries the local lights (the scenery material still has the hook)', () => {
    expect(propMaterial().fragmentShader).toContain(PROP_EMISSIVE_HOOK);
    const m = festPropMaterial();
    expect(m.lit).toBe(true);
    expect(m.material.fragmentShader).toContain('uPartyPos');
    expect(m.material.uniforms.uPartyPos!.value).toBe(m.pos);
  });

  it('fire, sparks, visibility and dispose', () => {
    const { scene, h } = build('burn');
    const flames = h.root.getObjectByName('party-flames') as Mesh;
    const uFire = (flames.material as ShaderMaterial).uniforms.uFire!;
    expect(uFire.value).toBeCloseTo(1.6);
    h.setFire(1);
    expect(uFire.value).toBe(1);
    h.setFire(Number.NaN);
    expect(uFire.value).toBe(1);
    h.burst();
    for (let i = 0; i < 30; i++) h.update(1 / 60);
    const glows = h.root.getObjectByName('party-glows') as Mesh;
    const spr = glows.geometry.getAttribute('aSprite');
    let live = 0;
    for (let i = 0; i < spr.count; i++) if (spr.getY(i) > 0) live++;
    expect(live).toBeGreaterThan(40);
    h.setVisible(false);
    expect(h.drawCalls()).toBe(0);
    h.setVisible(true);
    expect(h.drawCalls()).toBeGreaterThan(0);
    h.dispose();
    h.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('the camping chair faces the way Herzog sits', () => {
    const { h } = build('keep');
    const layout = partyLayout('keep');
    const herzog = layout.people.find((p) => p.who === 'double.herzog')!;
    expect(Math.hypot(herzog.x - layout.props.chair.x, herzog.z - layout.props.chair.z)).toBeLessThan(0.4);
    h.dispose();
  });

  it('holds firelight still and removes bursts and smoke when reduced motion is enabled', () => {
    let reduced = false;
    const { h } = build('burn', 'high', () => reduced);
    const glows = h.root.getObjectByName('party-glows') as Mesh;
    const flames = h.root.getObjectByName('party-flames') as Mesh;
    const steam = h.root.getObjectByName('party-steam')!;
    const sprites = glows.geometry.getAttribute('aSprite');
    const liveSprites = () => Array.from({ length: sprites.count }, (_, i) => sprites.getY(i)).filter((y) => y > 0).length;
    const still = liveSprites();
    const clocks = [flames, glows].map((mesh) => (mesh.material as ShaderMaterial).uniforms.uTime!);
    const previousTime = atmosphere.uTime.value;
    try {
      h.burst();
      atmosphere.uTime.value = 7;
      h.update(1 / 60);
      expect(liveSprites()).toBeGreaterThan(still);
      expect(clocks.map((clock) => clock.value)).toEqual([7, 7]);
      reduced = true;
      for (const time of [11, 19]) {
        atmosphere.uTime.value = time;
        h.update(1 / 60);
        expect(clocks.map((clock) => clock.value)).toEqual([0, 0]);
        expect(atmosphere.uTime.value).toBe(time);
      }
      expect(liveSprites()).toBe(still);
      expect(steam.visible).toBe(false);
      reduced = false;
      h.update(1 / 60);
      expect(clocks.map((clock) => clock.value)).toEqual([19, 19]);
    } finally {
      atmosphere.uTime.value = previousTime;
      h.dispose();
    }
  });
});
