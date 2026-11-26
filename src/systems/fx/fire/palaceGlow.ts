/**
 * Lets the real windows of the 1789 palace model glow room by room and blackens its walls where
 * the fire has been. Injected into the palace ShaderMaterial at runtime (two inserts in its
 * fragment shader + three uniforms), so world/palace.ts stays untouched; uFireOn = 0 switches the
 * whole branch off. Window glass in the model is the near-black vertex colour (max channel < 0.06).
 */
import { DataTexture, LinearFilter, RGBAFormat, type ShaderMaterial, UnsignedByteType, Vector2, Vector4 } from 'three';
import { patchPalace } from '../palacePatch';
import type { FireMap } from './firemap';

const DECL = /* glsl */ `
uniform sampler2D uFireMap;
uniform vec4 uFireBox;     // x0, z0, width, depth (m)
uniform vec2 uFireY;       // y0, yRange (split height encoding)
uniform float uFireOn;
vec4 kqFireAt(vec3 w) {
  return texture2D(uFireMap, (w.xz - uFireBox.xy) / uFireBox.zw);
}
`;

/** Before the lighting: soot on the walls (not on the window glass, which glows instead). */
const SOOT = /* glsl */ `
  float fGlass = 1.0 - smoothstep(0.05, 0.09, max(vColor.r, max(vColor.g, vColor.b)));
  vec4 fMap = vec4(0.0);
  if (uFireOn > 0.0) {
    fMap = kqFireAt(vWorld);
    float fSoot = fMap.a * uFireOn * smoothstep(0.2, 0.7, n + (vWorld.y - vBase) * 0.05);
    alb = mix(alb, vec3(0.012, 0.01, 0.009), fSoot * 0.96 * (1.0 - fGlass));
  }
`;

/** After the lighting: the windows burn, the facade is lit from inside and below. */
const GLOW = /* glsl */ `
  if (uFireOn > 0.0) {
    float fSplit = uFireY.x + fMap.b * uFireY.y;
    float fBurn = vWorld.y < fSplit - 0.2 ? fMap.r : fMap.g;
    float fFlick = 0.72 + 0.18 * sin(uTime * 9.1 + vWorld.x * 0.73 + vWorld.z * 0.31) + 0.1 * sin(uTime * 23.0 + vWorld.z * 1.7);
    vec3 fCol = mix(vec3(1.2, 0.2, 0.025), vec3(2.0, 0.6, 0.1), fBurn * fBurn);
    col += fGlass * fBurn * fFlick * fCol * uFireOn;
    // light spilling out of the windows onto the wall around them
    col += (1.0 - fGlass) * alb * fBurn * fFlick * vec3(0.9, 0.3, 0.06) * 0.35 * uFireOn;
  }
`;

const LIGHT_LINE = 'vec3 nn = normalize(vNormal);';
const OUT_LINE = 'gl_FragColor = vec4(kqFog(col, vWorld), 1.0);';

export class PalaceFireGlow {
  private readonly tex: DataTexture;
  private readonly installed: boolean;

  constructor(
    private readonly material: ShaderMaterial,
    private readonly map: FireMap,
  ) {
    const r = map.r;
    this.tex = new DataTexture(map.data, r.w, r.h, RGBAFormat, UnsignedByteType);
    this.tex.magFilter = this.tex.minFilter = LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    const u = material.uniforms;
    u.uFireMap = { value: this.tex };
    u.uFireBox = { value: new Vector4(...map.box()) };
    u.uFireY = { value: new Vector2(r.y0, r.yRange) };
    u.uFireOn ??= { value: 0 };
    this.installed = patchPalace(material, {
      id: 'uFireMap',
      decl: DECL,
      before: [
        [LIGHT_LINE, SOOT],
        [OUT_LINE, GLOW],
      ],
    });
  }

  /** Whether the palace shader carries the hook (false if its source changed shape). */
  get ok(): boolean {
    return this.installed;
  }

  update(intensity: (i: number) => number, soot: (i: number) => number, on: number): void {
    if (this.map.fill(intensity, soot)) this.tex.needsUpdate = true;
    this.material.uniforms.uFireOn!.value = on;
  }

  dispose(): void {
    this.material.uniforms.uFireOn!.value = 0;
    this.material.uniforms.uFireMap!.value = null;
    this.tex.dispose();
  }
}
