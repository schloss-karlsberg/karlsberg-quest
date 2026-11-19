/**
 * Architecture surfaces (docs/ART-DIRECTION.md §4, architecture track): a small library of CC0
 * PBR texture sets (Poly Haven, 1k: plaster, ashlar, roof tiles, slate, planks, painted planks,
 * iron, rubble, parquet, marble, hessian, straw, fine wood, cobbles, dressed sandstone) packed into two texture
 * arrays that every hand-built world shader can sample by a per-vertex layer id:
 *
 *   uSurfCol  rgb = albedo (sRGB, AO baked in)        → modulates the vertex colour (detail)
 *   uSurfNrm  rg  = tangent normal xy, b = roughness   → bump + specular
 *
 * Vertex colours stay the palette (era looks, the real façade colours); the texture adds the
 * material: `alb *= tex / mean(tex)` (per channel, so a red-sandstone trim keeps its red and gets
 * the stone's grain). Normals use a derivative cotangent frame, so the meshes only need `aUv` in
 * metres and `aSurf` (layer, −1 = none) — no tangents.
 *
 * Quality: nothing is loaded on the low tier (SwiftShader / e2e): `uSurfOn` stays 0 and every
 * shader takes the old flat path. Medium loads the arrays at half resolution. The textures are
 * manifest assets (`architecture.surf.*`, area 'palace'), recorded in LICENSES.json.
 */
import { DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, Vector3, Vector4 } from 'three';
import type { AssetLoader } from '../assets/loader';

export const SURF = {
  NONE: -1,
  PLASTER: 0,
  ASHLAR: 1,
  TILES: 2,
  SLATE: 3,
  PLANKS: 4,
  PAINTED: 5,
  IRON: 6,
  RUBBLE: 7,
  PARQUET: 8,
  MARBLE: 9,
  FABRIC: 10,
  STRAW: 11,
  FINEWOOD: 12,
  COBBLE: 13,
  STONE: 14,
} as const;

/**
 * One texture set: Poly Haven id, metres per tile (≈ the real size, a little larger where the
 * stylized look wants bigger shapes), normal strength, albedo detail strength, metalness.
 */
export interface SurfaceSet {
  key: keyof typeof SURF;
  ph: string;
  tile: number;
  normal: number;
  detail: number;
  metal: number;
}

export const SURFACE_SETS: readonly SurfaceSet[] = [
  { key: 'PLASTER', ph: 'white_plaster_02', tile: 2.2, normal: 0.5, detail: 0.6, metal: 0 },
  { key: 'ASHLAR', ph: 'medieval_blocks_03', tile: 2.4, normal: 1.0, detail: 0.85, metal: 0 },
  { key: 'TILES', ph: 'clay_roof_tiles_02', tile: 2.5, normal: 1.1, detail: 0.9, metal: 0 },
  { key: 'SLATE', ph: 'roof_slates_02', tile: 3.0, normal: 1.0, detail: 0.85, metal: 0 },
  { key: 'PLANKS', ph: 'weathered_brown_planks', tile: 1.8, normal: 1.0, detail: 0.9, metal: 0 },
  { key: 'PAINTED', ph: 'green_rough_planks', tile: 1.5, normal: 1.0, detail: 0.85, metal: 0 },
  { key: 'IRON', ph: 'green_metal_rust', tile: 1.0, normal: 0.8, detail: 0.8, metal: 0.7 },
  { key: 'RUBBLE', ph: 'castle_wall_varriation', tile: 2.2, normal: 1.1, detail: 0.85, metal: 0 },
  { key: 'PARQUET', ph: 'herringbone_parquet', tile: 3.4, normal: 0.7, detail: 0.8, metal: 0 },
  { key: 'MARBLE', ph: 'marble_01', tile: 1.5, normal: 0.6, detail: 0.9, metal: 0 },
  { key: 'FABRIC', ph: 'hessian_230', tile: 0.6, normal: 0.8, detail: 0.6, metal: 0 },
  { key: 'STRAW', ph: 'reed_roof_04', tile: 1.4, normal: 1.0, detail: 0.9, metal: 0 },
  { key: 'FINEWOOD', ph: 'wood_table_worn', tile: 1.1, normal: 0.6, detail: 0.85, metal: 0 },
  { key: 'COBBLE', ph: 'cobblestone_floor_01', tile: 1.2, normal: 1.0, detail: 0.85, metal: 0 },
  { key: 'STONE', ph: 'sandstone_cracks', tile: 1.6, normal: 0.9, detail: 0.75, metal: 0 },
];

export const SURF_COUNT = SURFACE_SETS.length;

/** Manifest ids of a set's two files. */
export const surfAssetId = (s: SurfaceSet, which: 'col' | 'nrm'): string => `architecture.surf.${s.ph.replace(/_/g, '-')}.${which}`;

const blank = (): DataArrayTexture => {
  const t = new DataArrayTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, 1);
  t.needsUpdate = true;
  return t;
};

/** Uniforms shared by reference (spread into each material like `atmosphere`). */
export const surfaces = {
  uSurfCol: { value: blank() },
  uSurfNrm: { value: blank() },
  /** 0 = flat look (low tier / not loaded yet), 1 = textured. */
  uSurfOn: { value: 0 },
  /** Per layer: mean linear albedo of the texture (the detail is relative to it). */
  uSurfMean: { value: SURFACE_SETS.map(() => new Vector3(0.5, 0.5, 0.5)) },
  /** Per layer: x tiles per metre, y normal strength, z detail strength, w metalness. */
  uSurfParam: { value: SURFACE_SETS.map((s) => new Vector4(1 / s.tile, s.normal, s.detail, s.metal)) },
};

/**
 * GLSL: `kqSurface(layer, uvMetres, wp, alb, n, rough, metal)` (inout albedo / normal) and
 * `kqLightPbr(...)` = kqLight + sun specular (GGX-ish) + a sky reflection. Needs ATMOS_GLSL before
 * it and the `surfaces` uniforms on the material.
 */
export const SURF_GLSL = /* glsl */ `
uniform highp sampler2DArray uSurfCol;
uniform highp sampler2DArray uSurfNrm;
uniform float uSurfOn;
uniform vec3 uSurfMean[${SURF_COUNT}];
uniform vec4 uSurfParam[${SURF_COUNT}];

// bump n by a tangent-space offset t (x along uv.x, y along uv.y): cotangent frame from derivatives
vec3 kqPerturb(vec3 n, vec3 p, vec2 uv, vec2 t) {
  vec3 dp1 = dFdx(p);
  vec3 dp2 = dFdy(p);
  vec2 du1 = dFdx(uv);
  vec2 du2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, n);
  vec3 dp1perp = cross(n, dp1);
  vec3 T = dp2perp * du1.x + dp1perp * du2.x;
  vec3 B = dp2perp * du1.y + dp1perp * du2.y;
  float d = max(dot(T, T), dot(B, B));
  if (d < 1e-14) return n;
  float im = inversesqrt(d);
  return normalize(n + (T * t.x + B * t.y) * im);
}

void kqSurface(float layer, vec2 uvM, vec3 wp, inout vec3 alb, inout vec3 n, inout float rough, inout float metal) {
  if (uSurfOn < 0.5 || layer < -0.5) return;
  int L = int(layer + 0.5);
  vec4 P = uSurfParam[L];
  vec3 uvw = vec3(uvM * P.x, float(L));
  vec3 c = texture(uSurfCol, uvw).rgb;
  c *= c; // ≈ sRGB → linear (the mean is taken the same way)
  vec3 t = texture(uSurfNrm, uvw).rgb;
  float dist = length(wp - uCamPos);
  float near = 1.0 - smoothstep(50.0, 260.0, dist);
  vec3 rel = c / max(uSurfMean[L], vec3(0.01));
  alb *= mix(vec3(1.0), clamp(rel, 0.0, 3.0), P.z * mix(0.6, 1.0, near));
  vec2 txy = (t.xy * 2.0 - 1.0) * P.y * near;
  n = kqPerturb(n, wp, uvM * P.x, txy);
  rough = mix(0.85, t.z, near);
  metal = P.w;
}

/** kqLight with a specular sun highlight and a sky reflection (rough 0..1, metal 0..1). */
vec3 kqLightPbr(vec3 albedo, vec3 n, vec3 wp, float ao, float rough, float metal) {
  float ndl = dot(n, uSunDir);
  float sh = 1.0;
  float sun = clamp((ndl + 0.15) / 1.15, 0.0, 1.0);
  if (sun > 0.0) {
    sh = kqShadow(wp, n);
    sun *= sh;
  }
  vec3 dif = albedo * (1.0 - 0.75 * metal);
  vec3 amb = mix(uGroundAmbient, uSkyAmbient, n.y * 0.5 + 0.5) * ao;
  vec3 col = dif * (uSunColor * sun + amb);
  vec3 v = normalize(uCamPos - wp);
  float nv = max(dot(n, v), 1e-3);
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  float r = clamp(rough, 0.06, 1.0);
  if (ndl > 0.0) {
    vec3 h = normalize(v + uSunDir);
    float a2 = r * r * r * r;
    float ndh = max(dot(n, h), 0.0);
    float dd = ndh * ndh * (a2 - 1.0) + 1.0;
    float D = a2 / (3.14159 * dd * dd);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(v, h), 0.0), 5.0);
    float vis = 0.25 / max(nv * 0.5 + 0.5, 0.2);
    col += min(D * vis, 24.0) * F * uSunColor * ndl * sh;
  }
  // sky reflection (cheap: the hemisphere colours along the reflected ray)
  vec3 R = reflect(-v, n);
  vec3 env = mix(uGroundAmbient, uSkyAmbient * 1.25, smoothstep(-0.25, 0.35, R.y));
  vec3 Fe = F0 + (max(vec3(1.0 - r), F0) - F0) * pow(1.0 - nv, 5.0);
  col += env * Fe * ao * (1.0 - 0.8 * r);
  // lantern
  vec3 ld = uLanternPos - wp;
  float dl = length(ld);
  float lat = clamp(1.0 - dl / uLanternRadius, 0.0, 1.0);
  lat *= lat;
  col += dif * uLantern * lat * (0.35 + 0.65 * max(dot(n, ld / max(dl, 1e-3)), 0.0));
  // distant fire glow
  vec3 gd = uGlowPos - wp;
  float dg = length(gd);
  float gfall = 1.0 / (1.0 + dg * dg * 0.00002);
  col += dif * uGlowColor * gfall * (0.3 + 0.7 * max(dot(n, gd / max(dg, 1e-3)), 0.0));
  return col;
}
`;

let loading: Promise<void> | null = null;
let loadedSize = 0;

/** Copy an image into a layer of an RGBA byte array (resized to `size`); returns its linear mean. */
function blit(img: CanvasImageSource, size: number, out: Uint8Array, layer: number, ctx2d: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): Vector3 {
  ctx2d.clearRect(0, 0, size, size);
  ctx2d.drawImage(img, 0, 0, size, size);
  const d = ctx2d.getImageData(0, 0, size, size).data;
  out.set(d, layer * size * size * 4);
  let r = 0;
  let g = 0;
  let b = 0;
  const step = 4 * 7;
  let n = 0;
  for (let i = 0; i < d.length; i += step) {
    const x = d[i]! / 255;
    const y = d[i + 1]! / 255;
    const z = d[i + 2]! / 255;
    r += x * x;
    g += y * y;
    b += z * z;
    n++;
  }
  return new Vector3(r / n, g / n, b / n);
}

function arrayTex(data: Uint8Array, size: number): DataArrayTexture {
  const t = new DataArrayTexture(data, size, size, SURF_COUNT);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/**
 * Load the surface sets (idempotent per size). `size` = colour layer edge (1024 high, 512
 * medium); normal layers are half of it. Resolves when the arrays are bound and `uSurfOn` = 1.
 */
export function loadSurfaces(assets: AssetLoader, size: number): Promise<void> {
  if (loading && loadedSize >= size) {
    return loading.then(() => {
      surfaces.uSurfOn.value = 1;
    });
  }
  loadedSize = size;
  const nsize = size / 2;
  loading = (async () => {
    const imgs = await Promise.all(
      SURFACE_SETS.map(async (s) => {
        const [c, n] = await Promise.all([assets.texture(surfAssetId(s, 'col')), assets.texture(surfAssetId(s, 'nrm'))]);
        return [c.image as CanvasImageSource, n.image as CanvasImageSource] as const;
      }),
    );
    const make = (sz: number) => {
      const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(sz, sz) : Object.assign(document.createElement('canvas'), { width: sz, height: sz });
      return cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    };
    const cc = make(size);
    const nc = make(nsize);
    const col = new Uint8Array(size * size * 4 * SURF_COUNT);
    const nrm = new Uint8Array(nsize * nsize * 4 * SURF_COUNT);
    imgs.forEach(([c, n], i) => {
      surfaces.uSurfMean.value[i]!.copy(blit(c, size, col, i, cc));
      blit(n, nsize, nrm, i, nc);
    });
    const old = [surfaces.uSurfCol.value, surfaces.uSurfNrm.value];
    surfaces.uSurfCol.value = arrayTex(col, size);
    surfaces.uSurfNrm.value = arrayTex(nrm, nsize);
    for (const t of old) t.dispose();
    surfaces.uSurfOn.value = 1;
  })();
  loading.catch((e) => {
    console.warn('[surfaces] load failed', e);
    loading = null;
    loadedSize = 0;
  });
  return loading;
}

/** Quality tier → surfaces on / off and their resolution. Low keeps everything flat. */
export function applySurfaceQuality(assets: AssetLoader, level: 'low' | 'medium' | 'high'): void {
  if (level === 'low') {
    surfaces.uSurfOn.value = 0;
    return;
  }
  void loadSurfaces(assets, level === 'high' ? 1024 : 512).catch(() => undefined);
}

/**
 * Per-vertex planar UVs in metres from position + normal (for meshes without UVs: the palace
 * model, rocks). Walls: u along the wall, v = height; floors: world x / z; slopes (roofs): u along
 * the eave, v up the slope. Flat-shaded meshes get seamless faces.
 */
export function planarUv(px: number, py: number, pz: number, nx: number, ny: number, nz: number, out: [number, number]): [number, number] {
  const ay = Math.abs(ny);
  if (ay > 0.94) {
    out[0] = px;
    out[1] = pz;
    return out;
  }
  const hl = Math.hypot(nx, nz) || 1;
  const tx = -nz / hl;
  const tz = nx / hl;
  out[0] = px * tx + pz * tz;
  if (ay < 0.2) {
    out[1] = py;
    return out;
  }
  // slope direction s = n × t (lies in the roof plane, points up or down the slope)
  const sx = ny * tz;
  const sy = nz * tx - nx * tz;
  const sz = -ny * tx;
  const sl = Math.hypot(sx, sy, sz) || 1;
  const sgn = sy >= 0 ? 1 : -1;
  out[1] = ((px * sx + py * sy + pz * sz) / sl) * sgn;
  return out;
}
