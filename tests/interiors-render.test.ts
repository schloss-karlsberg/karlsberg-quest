import { ShaderMaterial, type Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { FlameSpot } from '../src/systems/interiors/builder';
import { FireLightSelection } from '../src/systems/interiors/fireLights';
import { FlameLayer } from '../src/systems/interiors/flames';
import { MAX_CLIPS, MAX_CUTS, ShellCut, type CutBox } from '../src/systems/interiors/shell';

const spot = (x: number, kind: FlameSpot['kind'] = 1, room = 0): FlameSpot => ({ x, y: 0, z: 0, w: 1, h: 3, kind, room, seed: 0 });
const camera = { x: 0, y: 0, z: 0 };

describe('interior fire light budget', () => {
  it('keeps four closest eligible flame lights with stable ties and reuses the result', () => {
    const lights = new FireLightSelection();
    const sources = [spot(31), spot(12), spot(8), spot(-8), spot(1, 2), spot(2, 1, 1), spot(6), spot(4), spot(9)];
    const chosen = lights.update(sources, [0.05, 0.049], camera);
    expect(chosen).toEqual([sources[7], sources[6], sources[2], sources[3]]);
    expect(lights.update(sources, [0, 0], camera)).toBe(chosen);
    expect(chosen).toHaveLength(0);
    expect(lights.update([spot(30), spot(31)], [1], camera)).toEqual([spot(30)]);
  });
});

describe('interior flame batches', () => {
  it('keeps candles alone when cold and draws fire and smoke in distinct batches when active', () => {
    const fire = [0];
    const smoke = [0];
    const heat = [0];
    const layer = new FlameLayer([spot(1, 1), spot(2, 3), spot(3, 2), spot(4, 0, -1)], fire, smoke, heat);
    expect(layer.additive.geometry.instanceCount).toBe(1);
    expect(layer.additive.geometry.getAttribute('iKind').getX(0)).toBe(0);
    expect(layer.smoke.visible).toBe(false);

    smoke[0] = 1;
    layer.update(1, true, 1);
    expect(layer.smoke.visible).toBe(true);
    expect(layer.smoke.geometry.instanceCount).toBe(1);
    expect(layer.smoke.geometry.getAttribute('iKind').getX(0)).toBe(3);
    expect(layer.additive.geometry.instanceCount).toBe(1);

    heat[0] = 1;
    layer.update(2, true, 1);
    expect(layer.additive.geometry.instanceCount).toBe(11);
    expect(Array.from(layer.additive.geometry.getAttribute('iSpark').array).slice(2)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(layer.additive.material.uniforms.uMotion!.value).toBe(0.25);
    expect(layer.smoke.material.uniforms.uMotion!.value).toBe(0.25);

    fire[0] = 1;
    heat[0] = smoke[0] = 0;
    layer.update(3, false, 1);
    expect(layer.smoke.visible).toBe(true);
    expect(layer.additive.geometry.instanceCount).toBe(11);
    fire[0] = 0;
    layer.update(4, false, 0);
    expect(layer.additive.visible).toBe(false);
    expect(layer.smoke.visible).toBe(false);
    layer.dispose();
  });
});

describe('palace shell bounds', () => {
  it('enclose active rotated cuts, respect the caps and reset on disposal', () => {
    const mat = new ShaderMaterial({ fragmentShader: 'varying vec3 vWorld; void main() { if (uOpacity < 1.0) discard; }' });
    const shell = new ShellCut(mat);
    expect(shell.ok).toBe(true);
    const axis = Math.SQRT1_2;
    const first: CutBox = { x: 1200, z: -1100, ux: axis, uz: axis, hu: 2, hv: 5, y0: 350, y1: 355 };
    const second: CutBox = { ...first, x: 1230, z: -1140, ux: 1, uz: 0, y0: 352, y1: 360 };
    const ignored: CutBox = { ...first, x: 2000 };
    shell.setCuts([...Array<CutBox>(MAX_CUTS - 1).fill(first), second, ignored]);
    shell.setClips([...Array<CutBox>(MAX_CLIPS - 1).fill(first), second, ignored]);
    for (const [prefix, count] of [['uKqCut', MAX_CUTS], ['uKqClip', MAX_CLIPS]] as const) {
      expect(mat.uniforms[`${prefix}N`]!.value).toBe(count);
      const min = mat.uniforms[`${prefix}Min`]!.value as Vector3;
      const max = mat.uniforms[`${prefix}Max`]!.value as Vector3;
      expect(min.x).toBeCloseTo(1200 - 7 * axis, 2);
      expect(min.z).toBeCloseTo(-1145, 2);
      expect(min.y).toBeLessThan(350);
      expect(max.x).toBeCloseTo(1232, 2);
      expect(max.z).toBeCloseTo(-1100 + 7 * axis, 2);
      expect(max.y).toBeGreaterThan(360);
    }
    shell.setOpen([{ index: 2, fade: 1, y0: 350, y1: 355 }], false);
    expect(mat.uniforms.uKqOpenN!.value).toBe(1);
    shell.dispose();
    expect(mat.uniforms.uKqOpenN!.value).toBe(0);
    expect(mat.uniforms.uKqCutN!.value).toBe(0);
    expect(mat.uniforms.uKqClipN!.value).toBe(0);
    mat.dispose();
  });
});
