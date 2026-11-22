/**
 * Soft toon shading for authored characters (opt-in per manifest entry: `shading: 'toon'`).
 *
 * A variant of the world-light bridge (`kqStandard`, render/standard.ts), so the character keeps
 * every light the world has: the era sun with its shadow map, the era ambient, the sky IBL, the
 * lantern and the fire glow, the world fog, skinning, morphs and the alphaHash screen-door fade.
 * Only the character's own response changes:
 *
 * - the sun term runs through a soft ramp: shadow, a mid band and the lit band, with soft edges
 *   (no hard cel lines), so the forms read as big painted planes;
 * - a narrow warm band where the light turns (the painterly terminator) and a warm shadow colour:
 *   the indirect light is pulled toward a warm tint at the same brightness, so a pale face never
 *   turns grey or lavender on the shadow side;
 * - a subtle rim on the sun side (plus a little everywhere, so it reads at night too);
 * - per material: a soft specular (eyes, glasses, hair), and on the eyes the catchlight stays bright
 *   (white vertex colour = a small emissive glint).
 *
 * World materials never get this: it is applied only to materials that name it in
 * `userData.kqShading` (set by `applyCharacterShading` for a manifest entry that opts in, or by
 * `kqToon` directly). The variant is registered with kqStandard, so a clone that its owner
 * re-patches (the avatar clones and re-patches its materials for costumes and the camera fade)
 * keeps the toon look. A shared material stays shared: `kqToon` patches the instance it is given
 * (the authored people's one palette material has one toon twin for every person,
 * people/authored.ts `peopleMaterial`).
 */
import { Color, type Material, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D } from 'three';
import { kqStandard, registerShadingVariant } from '../../render/standard';

/** How an authored character is shaded (manifest `shading`). */
export type CharacterShading = 'standard' | 'toon';

/** Toon parameters of one material (JSON-safe: kept in userData, so clones carry them). */
export interface ToonParams {
  /** Sun ramp edges in N·L: shadow → mid band, mid band → lit band. */
  edges: [number, number];
  /** Levels of the mid band and of the lit band (× the sun; physical N·L peaks at 1). */
  mid: number;
  lit: number;
  /** Softness of the band edges (half width in N·L). */
  soft: number;
  /** Share of the plain (unbanded) N·L kept, so the bands are painted, not cut. */
  smooth: number;
  /** Warm shadow tint (sRGB hex); the indirect light is pulled toward it at the same brightness. */
  shade: number;
  /** How far the indirect light is pulled toward the shade tint (0..1). */
  warm: number;
  /** Strength of the warm band at the light's edge. */
  terminator: number;
  /** Rim strength. */
  rim: number;
  /** Specular strength (× the physical lobe). */
  spec: number;
  /** Catchlight glow (white vertex colours), 0 = off. */
  glint: number;
  /** Saturation of the sun's colour on this material (1 = as lit, 0 = its luminance only): a low
   * sun's orange cast is kept off skin and hair without touching the scene light. */
  sunSat: number;
}

export const TOON_DEFAULT: ToonParams = {
  edges: [-0.1, 0.45],
  mid: 0.42,
  lit: 0.8,
  soft: 0.14,
  smooth: 0.25,
  shade: 0xffc4a0,
  warm: 0.4,
  terminator: 0.12,
  rim: 0.26,
  spec: 0.45,
  glint: 0,
  sunSat: 1,
};

/**
 * Per material slot name: the MPFB pipeline's slots (scripts/chars/mpfb/kqchar/parts.py) and the
 * people palette materials (kqchar/palette.py). Unknown slots take `TOON_DEFAULT`.
 */
export const TOON_BY_MATERIAL: Record<string, Partial<ToonParams>> = {
  // skin: a soft, mostly smooth ramp (no hard creases across the cheeks), a faint warm terminator and
  // highlight, a lower lit band, a light shade tint and a desaturated sun, so skin keeps its own colour
  // in a low orange sun and takes no cold cast at night
  Skin: { terminator: 0.15, warm: 0.8, spec: 0.2, rim: 0.2, shade: 0xffe0d8, smooth: 0.55, soft: 0.3, lit: 0.55, mid: 0.32, sunSat: 0.45 },
  // hair and beard: softer bands (the clumps carry the shape), no warm edge in the grooves; a lower
  // lit band and a desaturated sun, so saturated colours keep their hue in strong or low sun
  Hair: { terminator: 0, spec: 0.4, rim: 0.35, lit: 0.5, mid: 0.36, smooth: 0.4, soft: 0.2, sunSat: 0.45 },
  Beard: { terminator: 0, spec: 0.25, rim: 0.35, lit: 0.5, mid: 0.36, smooth: 0.45, soft: 0.22, sunSat: 0.45 },
  // eyes (and the teeth): flatter, a wet highlight, the catchlight stays bright
  Eye: { edges: [-0.3, 0.2], mid: 0.75, terminator: 0, rim: 0, spec: 1.0, glint: 1.4, warm: 0.1, sunSat: 0.3 },
  Glasses: { terminator: 0, spec: 1.0, rim: 0.25, warm: 0.2 },
  // a saturated top layer: a lower lit band, so the tone map keeps a strong hue (a red stays red);
  // matte (a faint highlight and rim, no sheen)
  Jacket: { terminator: 0.15, lit: 0.6, mid: 0.34, spec: 0.08, rim: 0.12, sunSat: 0.7 },
  Trousers: { rim: 0.3, terminator: 0.15 },
  Gear: { terminator: 0.2 },
  // the player's court costume (kqchar/court.py): the dark coat and breeches like the trousers, the
  // light waistcoat and stockings with a lower lit band (they must not blow out to white), no warm
  // edge and little warm fill (a light cloth must not take a skin tone in its folds)
  Coat: { rim: 0.3, terminator: 0.15 },
  Waistcoat: { terminator: 0, warm: 0.15, lit: 0.65, rim: 0.15, spec: 0.15 },
  Breeches: { rim: 0.3, terminator: 0.15 },
  // the people palette: skin, cloth and hair in one vertex-coloured material, shared by every person,
  // calibrated on the skin (no glint: white cloth must not glow). A light shade tint (a saturated one
  // turns the shadow side of a face red-orange and a green cloth olive); almost no terminator band
  // (on a face it draws a hard orange edge down the nose, a ring in the eye socket and a crease
  // through one mouth corner that reads as a smirk); wide, mostly smooth bands (a soft light-to-
  // shadow step); a faint rim (a warm rim edges grey cloth pink); a lower lit band and a desaturated
  // sun, so a low warm sun neither turns skin orange nor a green cloth yellow; a stronger warm pull of
  // the indirect light, so skin keeps its warmth at night instead of going grey and sallow under the
  // blue ambient; the eye material as `Eye`
  People: { terminator: 0.04, warm: 0.75, spec: 0.25, rim: 0.1, shade: 0xffe0d8, smooth: 0.6, soft: 0.4, lit: 0.56, mid: 0.33, sunSat: 0.4 },
  PeopleEye: { edges: [-0.3, 0.2], mid: 0.75, terminator: 0, rim: 0, spec: 1.0, glint: 1.4, warm: 0.3, sunSat: 0.3 },
};

/** The params of a material slot by its name. */
export function toonParamsFor(name: string): ToonParams {
  return { ...TOON_DEFAULT, ...(TOON_BY_MATERIAL[name] ?? {}) };
}

const TOON_HEAD = /* glsl */ `
uniform vec4 uToonBand;
uniform vec4 uToonMix;
uniform vec3 uToonShade;
uniform float uToonGlint;
uniform float uToonRim;
uniform float uToonLit;
uniform float uToonSunSat;
float kqToonRamp(float ndl) {
  float s = uToonBand.w;
  float a = smoothstep(uToonBand.x - s, uToonBand.x + s, ndl);
  float b = smoothstep(uToonBand.y - s, uToonBand.y + s, ndl);
  float bands = uToonBand.z * a + (uToonLit - uToonBand.z) * b;
  return mix(bands, saturate(ndl), uToonMix.w);
}
vec3 kqToonWarm(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(c, l * uToonShade, uToonMix.x);
}
void kqToonDirect(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  float ndl = dot(geometryNormal, directLight.direction);
  vec3 sunC = mix(vec3(dot(directLight.color, vec3(0.2126, 0.7152, 0.0722))), directLight.color, uToonSunSat);
  vec3 irr = sunC * kqToonRamp(ndl);
  reflectedLight.directDiffuse += irr * BRDF_Lambert(material.diffuseContribution);
  // the warm band where the light turns (luminance of the light, the warm tint of the shade)
  float term = smoothstep(uToonBand.x - 0.16, uToonBand.x + 0.02, ndl) * (1.0 - smoothstep(uToonBand.x + 0.02, uToonBand.x + 0.24, ndl));
  reflectedLight.directDiffuse += sunC * term * uToonMix.y * BRDF_Lambert(material.diffuseContribution * uToonShade * uToonShade);
  reflectedLight.directSpecular += irr * BRDF_GGX(directLight.direction, geometryViewDir, geometryNormal, material) * material.multiScatteringCompensation * uToonMix.z;
}
`;

const TOON_WARM = /* glsl */ `
irradiance = kqToonWarm(irradiance);
iblIrradiance = kqToonWarm(iblIrradiance);
`;

const TOON_RIM = /* glsl */ `
{
  float kqRimF = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 4.0);
  vec3 kqSunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float kqRimSide = 0.3 + 0.7 * saturate(dot(geometryNormal, kqSunV) + 0.6);
  vec3 kqRimC = kqToonWarm(uSunColor * 0.6 + uSkyAmbient * 0.7);
  reflectedLight.indirectDiffuse += (material.diffuseContribution + 0.03) * kqRimC * kqRimF * kqRimSide * uToonRim;
}
`;

const TOON_GLINT = /* glsl */ `
#ifdef USE_COLOR
  totalEmissiveRadiance += vec3(uToonGlint * smoothstep(0.93, 0.995, min(vColor.r, min(vColor.g, vColor.b))));
#endif
`;

const SUN_CALL = /RE_Direct\(\s*kqSun\s*,/;

/**
 * Rewrite a compiled kqStandard shader into the toon variant (pure string work; exported for the
 * unit test). Returns false when an anchor is missing (then the shader is left as it was).
 */
export function toonShaderPatch(shader: { fragmentShader: string }): boolean {
  const f = shader.fragmentShader;
  const anchors = ['#include <lights_physical_pars_fragment>', '#include <lights_fragment_end>', '#include <emissivemap_fragment>'];
  if (!SUN_CALL.test(f) || anchors.some((a) => !f.includes(a))) return false;
  shader.fragmentShader = f
    .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${TOON_HEAD}`)
    .replace(SUN_CALL, 'kqToonDirect(kqSun,')
    .replace('#include <lights_fragment_end>', `${TOON_WARM}\n#include <lights_fragment_end>\n${TOON_RIM}`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${TOON_GLINT}`);
  return true;
}

const toonPatched = new WeakSet<MeshStandardMaterial>();

/** The uniforms of one toon material from its params. */
export function toonUniforms(p: ToonParams): Record<string, { value: unknown }> {
  const shade = new Color(p.shade).convertSRGBToLinear();
  // luminance 1, so the warm pull keeps the light's brightness
  const l = 0.2126 * shade.r + 0.7152 * shade.g + 0.0722 * shade.b;
  shade.multiplyScalar(1 / Math.max(l, 1e-3));
  return {
    uToonBand: { value: [p.edges[0], p.edges[1], p.mid, p.soft] },
    uToonMix: { value: [p.warm, p.terminator, p.spec, p.smooth] },
    uToonShade: { value: shade },
    uToonGlint: { value: p.glint },
    uToonRim: { value: p.rim },
    uToonLit: { value: p.lit },
    uToonSunSat: { value: p.sunSat },
  };
}

/**
 * Patch one kqStandard material with the toon variant, in place (idempotent per material
 * instance; a shared material stays one shared toon material). The params come from
 * `userData.kqToon` (set by `applyCharacterShading` or the caller), else from the slot name.
 */
export function kqToon<M extends MeshStandardMaterial>(m: M): M {
  if (toonPatched.has(m)) return m;
  toonPatched.add(m);
  m.userData.kqShading = 'toon';
  const p: ToonParams = { ...toonParamsFor(m.name), ...((m.userData.kqToon as Partial<ToonParams> | undefined) ?? {}) };
  m.userData.kqToon = p;
  const uniforms = toonUniforms(p);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    if (!toonShaderPatch(shader)) console.warn(`[toon] ${m.name}: kqStandard shader anchors missing, standard shading kept`);
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${key()}|kq-toon-1`;
  m.needsUpdate = true;
  return m;
}

registerShadingVariant('toon', kqToon);

/**
 * Shade every standard / physical material under `root` (a loaded authored character) as asked
 * by its manifest entry. 'standard' leaves the materials alone. Materials not yet patched to the
 * world light get kqStandard first (the toon variant builds on it).
 */
export function applyCharacterShading(root: Object3D, shading: CharacterShading | undefined): void {
  if (shading !== 'toon') return;
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const mats: Material[] = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!(m instanceof MeshStandardMaterial || m instanceof MeshPhysicalMaterial)) continue;
      m.userData.kqShading = 'toon';
      if (m.userData.kqStandard) kqToon(m);
      else kqStandard(m); // applies the registered variant itself
    }
  });
}

/** The shading a loaded character material asks for (`userData.kqShading`, set at load). */
export function shadingOf(m: Material | undefined | null): CharacterShading {
  return m?.userData.kqShading === 'toon' ? 'toon' : 'standard';
}
