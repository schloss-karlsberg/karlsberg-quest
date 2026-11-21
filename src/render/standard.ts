import {
  type Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PMREMGenerator,
  Scene,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { ATMOS_GLSL, atmosphere } from '../world/atmosphere';

/**
 * Bridge for imported (glTF) PBR materials: three's MeshStandardMaterial / MeshPhysicalMaterial
 * keep their maps and BRDF, but take the world's light instead of three.js lights:
 * - the era sun (`uSunDir`, `uSunColor`) as one direct light, shadowed by `kqShadow` (sun shadows),
 * - the era hemisphere ambient (`uSkyAmbient` / `uGroundAmbient`), the lantern and the fire glow,
 * - specular / a little diffuse IBL from the era sky (`EnvLight`, a PMREM of the sky dome),
 * - the world's distance + height fog (`kqFog`) instead of three's fog.
 * So a downloaded rock, barrel or character sits in the same light as the procedural world.
 * No three.js lights are added to the scene (interiors and older systems stay as they are).
 */

const VERT_HEAD = /* glsl */ `
varying vec3 vKqWorld;
`;
const VERT_WORLD = /* glsl */ `
{
  vec4 kqWp = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  kqWp = batchingMatrix * kqWp;
#endif
#ifdef USE_INSTANCING
  kqWp = instanceMatrix * kqWp;
#endif
  vKqWorld = (modelMatrix * kqWp).xyz;
}
`;
const FRAG_HEAD = /* glsl */ `
varying vec3 vKqWorld;
uniform float uKqAmbient;
${ATMOS_GLSL}
`;
const FRAG_LIGHT = /* glsl */ `
{
  // view → world normal (viewMatrix is orthonormal)
  vec3 kqN = normalize((vec4(geometryNormal, 0.0) * viewMatrix).xyz);
  IncidentLight kqSun;
  kqSun.direction = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  kqSun.color = uSunColor * PI * kqShadow(vKqWorld, kqN);
  kqSun.visible = true;
  RE_Direct(kqSun, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  irradiance += PI * uKqAmbient * mix(uGroundAmbient, uSkyAmbient, kqN.y * 0.5 + 0.5);
  vec3 kqLd = uLanternPos - vKqWorld;
  float kqDl = length(kqLd);
  float kqLat = clamp(1.0 - kqDl / uLanternRadius, 0.0, 1.0);
  irradiance += PI * uLantern * kqLat * kqLat * (0.35 + 0.65 * max(dot(kqN, kqLd / max(kqDl, 1e-3)), 0.0));
  vec3 kqGd = uGlowPos - vKqWorld;
  float kqDg = length(kqGd);
  irradiance += PI * uGlowColor / (1.0 + kqDg * kqDg * 0.00002) * (0.3 + 0.7 * max(dot(kqN, kqGd / max(kqDg, 1e-3)), 0.0));
}
`;

/** Default IBL strength of patched materials (the hemisphere ambient carries most of the fill). */
export const KQ_ENV_INTENSITY = 0.45;

const patched = new Set<MeshStandardMaterial>();

/**
 * Opt-in shading variants on top of the bridge, by name: a material whose `userData.kqShading`
 * names a registered variant gets it on every kqStandard call (a clone that its owner re-patches
 * keeps it). Authored characters register 'toon' (systems/characters/toon.ts). World materials
 * name none, so they are never touched.
 */
const variants = new Map<string, (m: MeshStandardMaterial) => void>();

export function registerShadingVariant(name: string, patch: (m: MeshStandardMaterial) => void): void {
  variants.set(name, patch);
}

/** Patch one standard / physical material in place (idempotent). Returns it. */
export function kqStandard<M extends MeshStandardMaterial>(m: M, opts: { ambient?: number; env?: number } = {}): M {
  if (m.userData.kqStandard) return m;
  m.userData.kqStandard = true;
  m.fog = false;
  m.envMap = EnvLight.texture;
  m.envMapIntensity = opts.env ?? KQ_ENV_INTENSITY;
  const ambient = { value: opts.ambient ?? 1 };
  m.userData.kqAmbient = ambient;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    Object.assign(shader.uniforms, atmosphere, { uKqAmbient: ambient });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${VERT_WORLD}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>\n${FRAG_LIGHT}`)
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb = kqFog(gl_FragColor.rgb, vKqWorld);');
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${key()}|kq-standard-1`;
  m.needsUpdate = true;
  patched.add(m);
  m.addEventListener('dispose', () => patched.delete(m));
  const variant = m.userData.kqShading;
  if (typeof variant === 'string') variants.get(variant)?.(m);
  return m;
}

/**
 * Patch every standard / physical material under `root` (a loaded glTF scene). Other material
 * types (unlit, custom shaders) are left alone.
 */
export function kqStandardize(root: Object3D, opts?: { ambient?: number; env?: number }): Object3D {
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const mats: Material[] = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m instanceof MeshStandardMaterial || m instanceof MeshPhysicalMaterial) kqStandard(m, opts);
    }
  });
  return root;
}

/**
 * Era environment light for patched PBR materials: a PMREM of the sky dome, rebuilt when the
 * era look changes (`World.lookVersion`). One shared texture; all patched materials follow it.
 */
export class EnvLight {
  static texture: Texture | null = null;
  private pmrem: PMREMGenerator | null = null;
  private rt: WebGLRenderTarget | null = null;
  private version = -1;
  private readonly scene = new Scene();

  constructor(skyMesh: Mesh) {
    // same geometry + material as the world sky, at the origin of the cube camera
    const m = new Mesh(skyMesh.geometry, skyMesh.material);
    m.frustumCulled = false;
    this.scene.add(m);
  }

  /** Rebuild the PMREM when `version` changed (cheap check, call per frame). */
  update(renderer: WebGLRenderer, version: number): void {
    if (version === this.version) return;
    this.version = version;
    this.pmrem ??= new PMREMGenerator(renderer);
    const prev = this.rt;
    const target = renderer.getRenderTarget();
    this.rt = this.pmrem.fromScene(this.scene, 0.02, 0.1, 2000, { size: 256 });
    renderer.setRenderTarget(target);
    EnvLight.texture = this.rt.texture;
    for (const m of patched) {
      if (!m.envMap) m.needsUpdate = true; // USE_ENVMAP switches on
      m.envMap = EnvLight.texture;
    }
    prev?.dispose();
  }
}
