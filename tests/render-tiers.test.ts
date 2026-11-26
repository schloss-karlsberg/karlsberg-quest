import { LessEqualCompare, LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Points, Scene, ShaderLib, ShaderMaterial, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleSunShadow } from '../src/debug/shadowProbe';
import { QUALITY_PRESETS, isSoftwareGpu, parseQualityParam } from '../src/render/quality';
import { SHADOW_FOCUS_LEAD, SHADOW_RECEIVER_SCALE, SunShadows, castsShadow } from '../src/render/shadows';
import { kqStandard } from '../src/render/standard';
import { atmosphere } from '../src/world/atmosphere';
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
    expect(low).toMatchObject({ shadowSize: 0, shadowRange: 0, shadowTaps: 0, shadowDetail: [0, 0], bloom: false, ao: false, grade: false });
    expect(medium).toMatchObject({ shadowSize: 1024, shadowRange: 45, shadowTaps: 4, shadowDetail: [16, 24] });
    expect(high).toMatchObject({ shadowSize: 2048, shadowRange: 60, shadowTaps: 9, shadowDetail: [20, 28] });
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

describe('sun shadow pass', () => {
  const shadows = new SunShadows();
  const scene = new Scene();
  const renderer = {
    getRenderTarget: () => null,
    setRenderTarget: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
  };
  const webgl = renderer as unknown as WebGLRenderer;

  afterEach(() => {
    shadows.configure(0, 0, 0, [0, 0]);
    scene.clear();
    renderer.render.mockReset();
    renderer.setRenderTarget.mockClear();
  });

  it.each(['medium', 'high'] as const)('fits and texel-snaps the %s map around the forward focus', (quality) => {
    const { shadowRange: range, shadowSize: size, shadowTaps: taps, shadowDetail: detail } = QUALITY_PRESETS[quality];
    shadows.configure(size, range, taps, detail);
    const texel = (2 * range) / size;
    const focus = new Vector3();
    shadows.update(webgl, scene, focus);
    const cam = shadows.camera;
    expect([cam.left, cam.right, cam.bottom, cam.top]).toEqual([-range, range, -range, range]);
    const side = new Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const cameraAtGround = new Vector3(0, -1.5, range * SHADOW_FOCUS_LEAD);
    const first = cameraAtGround.clone().project(cam);
    expect(Math.max(Math.abs(first.x), Math.abs(first.y), Math.abs(first.z))).toBeLessThan(1);

    shadows.update(webgl, scene, focus.copy(side).multiplyScalar(0.25 * texel));
    expect(cameraAtGround.clone().project(cam).distanceTo(first)).toBeLessThan(1e-10);
    shadows.update(webgl, scene, focus.copy(side).multiplyScalar(0.75 * texel));
    expect(cameraAtGround.clone().project(cam).x - first.x).toBeCloseTo(-2 / size, 9);
    expect(atmosphere.uShadowParams.value.toArray()).toEqual([1, 1 / size, taps, shadows.strength]);
    expect(atmosphere.uShadowDetailSq.value.toArray()).toEqual(detail.map((m) => m ** 2));
  });

  it('passes the new focus to casters and binds the comparison texture only after drawing', () => {
    const { shadowRange, shadowSize, shadowTaps, shadowDetail } = QUALITY_PRESETS.high;
    const focus = new Vector3(1632, 15, -1640);
    const caster = new Mesh();
    const cover = new Mesh();
    cover.userData.noShadow = true;
    scene.add(caster, cover);
    shadows.configure(shadowSize, shadowRange, shadowTaps, shadowDetail);
    renderer.render.mockImplementation(() => {
      expect(atmosphere.uShadowCenter.value.toArray()).toEqual([...focus.toArray(), shadowRange * SHADOW_RECEIVER_SCALE]);
      expect(atmosphere.uShadowMap.value).toBeNull();
      expect(atmosphere.uShadowPass.value).toBe(1);
      expect(caster.visible).toBe(true);
      expect(cover.visible).toBe(false);
    });
    shadows.update(webgl, scene, focus);
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(cover.visible).toBe(true);
    expect(atmosphere.uShadowPass.value).toBe(0);
    expect(atmosphere.uShadowMap.value).toMatchObject({
      compareFunction: LessEqualCompare,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    });
    shadows.configure(0, 0, 0, [0, 0]);
    shadows.update(webgl, scene, focus);
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(atmosphere.uShadowParams.value.x).toBe(0);
    expect(atmosphere.uShadowMap.value).toBeNull();
  });

  it('standard casters keep the alpha cuts and skip their lighting in the shadow pass', () => {
    const material = kqStandard(new MeshStandardMaterial());
    const { vertexShader, fragmentShader } = ShaderLib.standard;
    const shader = { vertexShader, fragmentShader, uniforms: {} };
    material.onBeforeCompile(shader as unknown as WebGLProgramParametersWithUniforms, webgl);
    expect(shader.fragmentShader).toContain('#include <alphahash_fragment>\nif (uShadowPass > 0.5)');
    expect(shader.fragmentShader.indexOf('if (uShadowPass > 0.5)')).toBeLessThan(shader.fragmentShader.indexOf('#include <normal_fragment_maps>'));
    material.dispose();
  });

  it.each(['high', 'medium', 'low'] as const)('reads controlled ground pixels using the %s shadow map setting', (tier) => {
    const preset = QUALITY_PRESETS[tier];
    const before = atmosphere.uShadowParams.value.clone();
    const sun = atmosphere.uSunDir.value.clone();
    const draw = vi.fn((scene: Scene) => {
      const { material } = scene.children[0] as Mesh<never, ShaderMaterial>;
      if (atmosphere.uShadowPass.value) {
        expect(material.vertexShader).toContain('kqTreeOutsideShadow(uTree, 0)');
      } else {
        expect(material.fragmentShader).toContain('kqShadow(vWorld,');
        expect(atmosphere.uShadowParams.value.x).toBe(preset.shadowSize > 0 ? 1 : 0);
        if (preset.shadowSize > 0) expect(atmosphere.uShadowParams.value.z).toBe(preset.shadowTaps);
      }
    });
    const read = vi.fn((_target: unknown, x: number, y: number, w: number, h: number, data: Uint8Array) => {
      expect([x, w, h]).toEqual([4, 1, 1]);
      data[0] = y === 4 && preset.shadowSize > 0 ? 38 : 255;
    });
    const device = { ...renderer, render: draw, readRenderTargetPixels: read } as unknown as WebGLRenderer;
    expect(sampleSunShadow(device, preset)).toEqual({ occluded: tier === 'low' ? 255 : 38, lit: 255 });
    expect(read.mock.calls.map(([, , y]) => y)).toEqual([4, 0]);
    expect(draw).toHaveBeenCalledTimes(tier === 'low' ? 1 : 2);
    expect(atmosphere.uShadowParams.value.equals(before)).toBe(true);
    expect(atmosphere.uSunDir.value.equals(sun)).toBe(true);
  });
});
