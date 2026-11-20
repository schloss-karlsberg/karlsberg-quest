import { type Material, MeshStandardMaterial, ShaderChunk, ShaderLib, UniformsUtils, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { kqStandard } from '../src/render/standard';
import { atmosphere } from '../src/world/atmosphere';
import { DUCK_N, enemyDuck } from '../src/world/vegetation/duck';
import { patchNature } from '../src/world/vegetation/props';

/**
 * The forest props' shader patch (src/world/vegetation/props.ts `patchNature`) on top of the
 * loader's world-light patch (`kqStandard`), run on three's real MeshStandardMaterial shaders: the
 * see-through (round 10, F-21) on every patched material, the wind sway and the enemy duck (round
 * 10, F-04) on the swaying kinds. No WebGL here, so the checks are on the shader strings: each
 * declaration exactly once, declared before use, the discard in place, balanced braces.
 */
type Shader = { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string };

function patched(wind: boolean): Shader {
  const m = kqStandard(new MeshStandardMaterial());
  patchNature(m as Material, wind);
  const lib = ShaderLib.standard;
  const shader: Shader = { uniforms: UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  m.onBeforeCompile(shader as unknown as WebGLProgramParametersWithUniforms, {} as WebGLRenderer);
  return shader;
}

/** three's own #include resolution (WebGLProgram.resolveIncludes). */
const expand = (src: string): string =>
  src.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_m, name: string) => {
    const chunk = (ShaderChunk as unknown as Record<string, string>)[name];
    if (chunk === undefined) throw new Error(`unknown chunk ${name}`);
    return expand(chunk);
  });

const count = (s: string, needle: string): number => s.split(needle).length - 1;

/** Names declared as uniform / varying, and kq functions defined, with how often. */
function declarations(src: string): Map<string, number> {
  const out = new Map<string, number>();
  const add = (n: string) => out.set(n, (out.get(n) ?? 0) + 1);
  for (const m of src.matchAll(/^\s*(?:uniform|varying)\s+\w+\s+(\w+)/gm)) add(m[1]!);
  for (const m of src.matchAll(/^\s*(?:float|bool|vec[234]|void)\s+(kq\w+)\s*\(/gm)) add(m[1]!);
  return out;
}

/** Ours: the atmosphere uniforms, the duck uniform, the kq varyings and functions. */
const ours = (n: string): boolean => n in atmosphere || n === 'uEnemyDuck' || n === 'uKqAmbient' || n.startsWith('kq') || n.startsWith('vKq');

describe('forest props shader patch (see-through + wind + duck)', () => {
  for (const wind of [true, false]) {
    describe(`wind ${wind}`, () => {
      const sh = patched(wind);
      const vs = sh.vertexShader;
      const fs = sh.fragmentShader;
      const vx = expand(vs);
      const fx = expand(fs);

      it('declares each of our uniforms, varyings and functions exactly once per stage', () => {
        for (const [stage, src] of [
          ['vertex', vx],
          ['fragment', fx],
        ] as const) {
          for (const [n, k] of declarations(src)) if (ours(n)) expect(k, `${stage}: ${n}`).toBe(1);
        }
        // the specific ones the merge had to keep apart
        expect(count(vs, 'uniform float uTime;')).toBe(wind ? 1 : 0);
        expect(count(fx, 'uniform float uTime;')).toBe(1);
        expect(count(vs, `uniform vec4 uEnemyDuck[${DUCK_N}];`)).toBe(wind ? 1 : 0);
        expect(count(vs, 'float kqDuckAt(vec2 p)')).toBe(wind ? 1 : 0);
        expect(count(vs, 'varying float vKqSee;')).toBe(1);
        expect(count(fs, 'varying float vKqSee;')).toBe(1);
        expect(count(vs, 'float kqSee(vec3 base')).toBe(1);
        expect(count(vs, 'float kqSeeCone(')).toBe(1);
        expect(count(fs, 'bool kqSeeCut(')).toBe(1);
        expect(count(vs, 'uniform float uShadowPass;')).toBe(1);
        expect(count(fx, 'uniform float uShadowPass;')).toBe(1);
        expect(count(vs, 'uniform vec4 uSeeK;')).toBe(1);
        expect(count(fs, 'uniform vec4 uSeeK;')).toBe(1);
        expect(count(vs, 'varying vec3 vKqWorld;')).toBe(1);
        expect(count(fs, 'varying vec3 vKqWorld;')).toBe(1);
      });

      it('keeps every #include it hooked on (each injection chained, none lost)', () => {
        for (const inc of ['common', 'begin_vertex', 'worldpos_vertex', 'fog_vertex']) expect(count(vs, `#include <${inc}>`), inc).toBe(1);
        for (const inc of ['common', 'clipping_planes_fragment', 'normal_fragment_maps', 'lights_fragment_begin']) expect(count(fs, `#include <${inc}>`), inc).toBe(1);
      });

      it('has the see-through write and discard, after their declarations', () => {
        expect(count(vs, 'vKqSee = kqSee(vKqWorld, 0.25, vKqWorld.y, vKqWorld);')).toBe(1);
        expect(count(fs, 'if (kqSeeCut(vKqSee, vKqWorld)) discard;')).toBe(1);
        expect(vx.indexOf('float kqSee(vec3 base')).toBeLessThan(vx.indexOf('vKqSee = kqSee('));
        expect(vx.indexOf('vKqWorld = (modelMatrix * kqWp).xyz;')).toBeLessThan(vx.indexOf('vKqSee = kqSee('));
        expect(fx.indexOf('bool kqSeeCut(')).toBeLessThan(fx.indexOf('if (kqSeeCut('));
        expect(fx.indexOf('void main()')).toBeLessThan(fx.indexOf('if (kqSeeCut('));
        // the snow tint stays
        expect(count(fs, 'uSnow * smoothstep(0.35, 0.8, kqWn.y)')).toBe(1);
      });

      it(wind ? 'sways and ducks round enemies (instanced)' : 'neither sways nor ducks', () => {
        expect(count(vs, 'float kqW = sin(uTime * 1.7')).toBe(wind ? 1 : 0);
        expect(count(vs, 'float kqDk = kqDuckAt(kqIp);')).toBe(wind ? 1 : 0);
        if (wind) expect(vx.indexOf('float kqDuckAt(vec2 p)')).toBeLessThan(vx.indexOf('kqDuckAt(kqIp)'));
        else expect(vs).not.toMatch(/\buTime\b|kqDuckAt|uEnemyDuck/);
      });

      it('binds the shared uniforms (no copies)', () => {
        for (const k of ['uSeeCam', 'uSeeP', 'uSeeT', 'uSeeK', 'uShadowPass', 'uTime', 'uSnow'] as const) expect(sh.uniforms[k], k).toBe(atmosphere[k]);
        if (wind) expect(sh.uniforms.uEnemyDuck).toBe(enemyDuck);
        else expect(sh.uniforms.uEnemyDuck).toBeUndefined();
      });

      it('adds balanced braces and parentheses in both stages', () => {
        // three's own chunks are not balanced as text (#ifdef alternatives): compare with them
        const delta = (src: string) => [count(src, '{') - count(src, '}'), count(src, '(') - count(src, ')')];
        expect(delta(vx)).toEqual(delta(expand(ShaderLib.standard.vertexShader)));
        expect(delta(fx)).toEqual(delta(expand(ShaderLib.standard.fragmentShader)));
      });
    });
  }
});
