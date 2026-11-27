import { InstancedBufferGeometry, Mesh, Points, ShaderMaterial, type Vector4 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { World } from '../src/world/world';
import { AmbientParticles } from '../src/systems/fx/ambient/ambient';
import { buildEmitters } from '../src/systems/fx/fire/emitters';
import { FireVisuals } from '../src/systems/fx/fire/visuals';
import { GhostBatch, type GhostPose } from '../src/systems/fx/k3-ghosts';

describe('FX particle and instance budgets', () => {
  it('changes snow and mist budgets in place in the scene, then replaces them with summer ash', () => {
    const uniforms = { uHeight: { value: null }, uGrid: { value: null }, uGridSize: { value: null } };
    const ambient = new AmbientParticles({ terrain: { uniforms } } as unknown as World);
    const counts = () => ambient.object.children.map(o => {
      const g = (o as Points | Mesh).geometry;
      return g instanceof InstancedBufferGeometry ? g.instanceCount : g.getAttribute('position').count;
    });
    ambient.setEra('1793-02', true);
    expect(counts()).toEqual([9000, 2500, 34]);
    const snow = ambient.object.children[0] as Points;
    const disposed = vi.fn();
    snow.geometry.addEventListener('dispose', disposed);
    ambient.setEra('1793-02', true);
    expect(ambient.object.children[0]).toBe(snow);
    ambient.setEra('1793-02', false);
    expect(counts()).toEqual([3600, 1000, 17]);
    expect(snow.parent).toBeNull();
    expect(disposed).toHaveBeenCalledTimes(1);
    ambient.setEra('1793-07', false);
    expect(counts()).toEqual([1040, 200]);
    const embers = ambient.object.children[1] as Points;
    ambient.frame(250, 1, 0);
    expect(embers.visible).toBe(false);
    ambient.frame(250, 0.5, 0.8);
    expect(embers.visible).toBe(true);
    expect((embers.material as ShaderMaterial).uniforms.uAlpha!.value).toBeCloseTo(0.9 * 0.5 * 0.8);
    ambient.setEra('1793-02', true);
    expect(counts()).toEqual([9000, 2500, 34]);
    ambient.dispose();
    expect(ambient.object.children).toHaveLength(0);
  });

  it('recycles the oldest of four collapse bursts while preserving the other three', () => {
    const fire = new FireVisuals(buildEmitters([], []), 1, false);
    const sparks = fire.object.children.find((o): o is Points => o instanceof Points && o.geometry.hasAttribute('aVel'))!;
    const bursts = (sparks.material as ShaderMaterial).uniforms.uBursts!.value as Vector4[];
    expect(bursts).toHaveLength(4);
    const positions = sparks.geometry.getAttribute('position');
    for (let i = 0; i < 5; i++) fire.collapse(0, 10 + i, 20, 30, 100 + i);
    expect(bursts.map(v => v.toArray())).toEqual([
      [14, 20, 30, 104], [11, 20, 30, 101], [12, 20, 30, 102], [13, 20, 30, 103],
    ]);
    expect(sparks.geometry.getAttribute('position')).toBe(positions);
    const state = fire.stateTex.image.data!;
    fire.setUnit(0, 0.6, 0.4);
    expect(state[2]).toBe(1);
    fire.frame(1, 220);
    fire.setUnit(0, 0.6, 0.4);
    expect(state[2]).toBe(0.75);
    fire.frame(10, 220);
    fire.setUnit(0, 0.6, 0.4);
    expect(state[2]).toBe(0);
    fire.dispose();
  });

  it('drops crowd overflow and releases all slots for the next frame', () => {
    const material = new ShaderMaterial();
    const batch = new GhostBatch('bale', 2, material);
    const pose: GhostPose = { x: 0, y: 0, z: 0, yaw: 0, walk: 0, walkAmt: 0, fade: 1, seed: 0, raise: 0, load: 0, wheel: 0, scale: 1 };
    expect(batch.mesh.count).toBe(0);
    batch.begin();
    for (const seed of [11, 22, 33]) batch.push({ ...pose, seed });
    batch.end();
    const poses = batch.mesh.geometry.getAttribute('iA');
    expect(batch.mesh.count).toBe(2);
    expect([poses.getW(0), poses.getW(1)]).toEqual([11, 22]);
    batch.begin();
    batch.end();
    expect(batch.mesh.count).toBe(0);
    batch.begin();
    batch.push({ ...pose, seed: 44 });
    batch.end();
    expect(batch.mesh.count).toBe(1);
    expect(poses.getW(0)).toBe(44);
    batch.dispose();
    material.dispose();
  });
});
