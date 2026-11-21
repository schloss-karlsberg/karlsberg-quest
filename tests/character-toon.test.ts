import { Mesh, MeshStandardMaterial, Object3D, ShaderLib, SphereGeometry, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { ASSETS } from '../src/assets/manifest';
import { kqStandard } from '../src/render/standard';
import { TOON_DEFAULT, applyCharacterShading, kqToon, shadingOf, toonParamsFor, toonShaderPatch } from '../src/systems/characters/toon';

/** Run a material's onBeforeCompile on the real physical shader source (no WebGL needed). */
function compiled(m: MeshStandardMaterial): { fragmentShader: string; vertexShader: string; uniforms: Record<string, unknown> } {
  const shader = { uniforms: {} as Record<string, unknown>, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
  m.onBeforeCompile(shader as never, {} as WebGLRenderer);
  return shader;
}

function character(names: string[]): { root: Object3D; mats: MeshStandardMaterial[] } {
  const root = new Object3D();
  const mats = names.map((n) => Object.assign(new MeshStandardMaterial(), { name: n }));
  for (const m of mats) root.add(new Mesh(new SphereGeometry(0.1), m));
  return { root, mats };
}

describe('character toon shading (opt-in, systems/characters/toon.ts)', () => {
  it('only authored character models may opt in, never world assets', () => {
    for (const e of ASSETS) {
      if (!e.shading) continue;
      expect(e.kind).toBe('model');
      expect(e.worldLight).not.toBe(false);
      if (e.shading === 'toon') expect(e.id.startsWith('chars.')).toBe(true);
    }
  });

  it("'standard' / unset leaves the world-light bridge as it is", () => {
    const { root, mats } = character(['Skin']);
    kqStandard(mats[0]!);
    const before = compiled(mats[0]!).fragmentShader;
    applyCharacterShading(root, undefined);
    applyCharacterShading(root, 'standard');
    const m = mats[0]!;
    expect(m.userData.kqShading).toBeUndefined();
    expect(shadingOf(m)).toBe('standard');
    const f = compiled(m).fragmentShader;
    expect(f).toBe(before);
    expect(f).toContain('RE_Direct(kqSun,');
    expect(f).not.toContain('kqToon');
    expect(m.customProgramCacheKey()).not.toContain('toon');
  });

  it("'toon' rewrites the sun term, warms the indirect light, adds the rim; sun, lantern and fog stay", () => {
    const { root, mats } = character(['Skin', 'Eye']);
    applyCharacterShading(root, 'toon'); // not yet world-lit: patched to kqStandard first
    const m = mats[0]!;
    expect(m.userData.kqStandard).toBe(true);
    expect(m.userData.kqShading).toBe('toon');
    expect(shadingOf(m)).toBe('toon');
    const s = compiled(m);
    expect(s.fragmentShader).toContain('kqToonDirect(kqSun,');
    expect(s.fragmentShader).not.toContain('RE_Direct(kqSun,');
    expect(s.fragmentShader).toContain('irradiance = kqToonWarm(irradiance)');
    expect(s.fragmentShader).toContain('kqRimF');
    // the world light is still there: sun shadow, lantern, fog
    expect(s.fragmentShader).toContain('kqShadow(vKqWorld');
    expect(s.fragmentShader).toContain('uLanternPos');
    expect(s.fragmentShader).toContain('kqFog(');
    expect(Object.keys(s.uniforms)).toEqual(expect.arrayContaining(['uSunDir', 'uSunColor', 'uToonBand', 'uToonMix', 'uToonShade', 'uToonRim', 'uToonLit', 'uToonGlint']));
    expect(m.customProgramCacheKey()).toContain('kq-toon-1');
    // per-slot params: the eyes keep a bright catchlight, the skin has none
    expect(toonParamsFor('Eye').glint).toBeGreaterThan(0);
    expect(toonParamsFor('Skin').glint).toBe(0);
    expect(toonParamsFor('Unknown')).toEqual(TOON_DEFAULT);
  });

  it('keeps the alphaHash screen-door fade and survives a clone + re-patch', () => {
    const { root, mats } = character(['Jacket']);
    applyCharacterShading(root, 'toon');
    const m = mats[0]!;
    // an owner's path (the avatar's costumes and camera fade): clone, drop the flag, re-patch, dither
    const cl = m.clone();
    delete cl.userData.kqStandard;
    kqStandard(cl, { ambient: 1.15 });
    cl.alphaHash = true;
    cl.opacity = 0.4;
    const f = compiled(cl).fragmentShader;
    expect(f).toContain('kqToonDirect(kqSun,');
    expect(f).toContain('#include <alphahash_fragment>');
    expect(cl.userData.kqToon).toMatchObject({ lit: toonParamsFor('Jacket').lit });
  });

  it('patches in place and once: a shared material stays one shared toon material', () => {
    const m = kqStandard(Object.assign(new MeshStandardMaterial(), { name: 'Skin' }));
    expect(kqToon(m)).toBe(m);
    const once = compiled(m).fragmentShader;
    expect(kqToon(m)).toBe(m);
    expect(compiled(m).fragmentShader).toBe(once);
    expect(once.split('kqToonDirect(kqSun,').length).toBe(2);
  });

  it('leaves a shader without the kqStandard anchors untouched', () => {
    const plain = { fragmentShader: ShaderLib.physical.fragmentShader };
    expect(toonShaderPatch(plain)).toBe(false);
    expect(plain.fragmentShader).toBe(ShaderLib.physical.fragmentShader);
  });
});
