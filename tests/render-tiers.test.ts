import { Mesh, MeshBasicMaterial, Object3D, Points } from 'three';
import { describe, expect, it } from 'vitest';
import { QUALITY_PRESETS, isSoftwareGpu, parseQualityParam } from '../src/render/quality';
import { castsShadow } from '../src/render/shadows';
import { ERA_LOOKS } from '../src/world/eraPresets';

describe('render tiers', () => {
  it('?q= parses low / med / high (and German names), ignores the rest', () => {
    expect(parseQualityParam('low')).toBe('low');
    expect(parseQualityParam('med')).toBe('medium');
    expect(parseQualityParam('Medium')).toBe('medium');
    expect(parseQualityParam('hoch')).toBe('high');
    expect(parseQualityParam('ultra')).toBeNull();
    expect(parseQualityParam(null)).toBeNull();
  });

  it('software renderers are detected (SwiftShader in e2e → low tier)', () => {
    expect(isSoftwareGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareGpu('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareGpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)')).toBe(false);
  });

  it('low has no shadows / bloom / AO; costs rise with the tier', () => {
    const { low, medium, high } = QUALITY_PRESETS;
    expect(low).toMatchObject({ shadowSize: 0, bloom: false, ao: false, grade: false });
    expect(medium.shadowSize).toBeGreaterThan(0);
    expect(high.shadowSize).toBeGreaterThanOrEqual(medium.shadowSize);
    expect(high.shadowTaps).toBeGreaterThanOrEqual(medium.shadowTaps);
    expect(high.ao).toBe(true);
  });

  it('every era has a full post look (bloom, AO, shadow, white balance, split toning)', () => {
    for (const L of Object.values(ERA_LOOKS)) {
      expect(L.post.bloom).toBeGreaterThanOrEqual(0);
      expect(L.post.shadow).toBeGreaterThan(0);
      expect(L.post.shadow).toBeLessThanOrEqual(1);
      for (const c of [L.post.white, L.post.shadowTint, L.post.highTint]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('shadow casters: solid meshes yes; points, transparent, terrain, opted-out no', () => {
    expect(castsShadow(new Mesh(undefined, new MeshBasicMaterial()))).toBe(true);
    expect(castsShadow(new Points())).toBe(false);
    expect(castsShadow(new Mesh(undefined, new MeshBasicMaterial({ transparent: true })))).toBe(false);
    expect(castsShadow(new Mesh(undefined, new MeshBasicMaterial({ depthWrite: false })))).toBe(false);
    const t = new Object3D();
    t.name = 'terrain';
    expect(castsShadow(t)).toBe(false);
    const o = new Mesh(undefined, new MeshBasicMaterial());
    o.userData.noShadow = true;
    expect(castsShadow(o)).toBe(false);
  });
});
