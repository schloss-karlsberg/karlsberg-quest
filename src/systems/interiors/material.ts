/**
 * The interior material: one ShaderMaterial per built building (all surfaces + props in one draw
 * call), procedural finishes by material id (Versailles parquet, boiseries, damask, flags,
 * canvases, books …) and the interior light: candles / chandeliers (nearest lights), window light
 * (baked per building, tinted by the era's sky and sun), the player's lantern, burning rooms and a
 * smoke layer under the ceiling. Ruins and foundations (open sky) use the shared outdoor light.
 */
import { Color, type DataTexture, DoubleSide, ShaderMaterial, Vector4 } from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';

export const MAX_LIGHTS = 12;
export const MAX_ROOMS = 32;

/** Material ids (attribute aMat). */
export const M = {
  PLASTER: 0,
  BOISERIE: 1,
  DAMASK: 2,
  PARQUET: 3,
  FLAGS: 4,
  BOARDS: 5,
  CEILING: 6,
  WOOD: 7,
  GILT: 8,
  CANVAS: 9,
  MIRROR: 10,
  MASONRY: 11,
  BOOKS: 12,
  GLASS: 13,
  RUBBLE: 14,
  MARBLE: 15,
  CHECKER: 16,
  STEP: 17,
  IRON: 18,
  FABRIC: 19,
  FOLIAGE: 20,
  SOOT: 21,
  PAPER: 22,
  STRAW: 23,
  CHARRED: 24,
  MOSS: 25,
  COBBLE: 26,
  BARE: 27,
} as const;

const VERT = /* glsl */ `
attribute vec3 color;
attribute float aMat;
attribute float aRoom;
attribute vec2 aUv;
attribute vec4 aAux;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vMat;
varying float vRoom;
varying vec2 vUv;
varying vec4 vAux;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vMat = aMat;
  vRoom = aRoom;
  vUv = aUv;
  vAux = aAux;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform sampler2D uLightMap;
uniform vec4 uLmBox;
uniform float uLmSplit;
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec4 uLightCol[${MAX_LIGHTS}];
uniform float uRoomFire[${MAX_ROOMS}];
uniform float uRoomSmoke[${MAX_ROOMS}];
uniform float uRoomChar[${MAX_ROOMS}];
uniform float uRoomGone[${MAX_ROOMS}];
uniform float uRoomCeil[${MAX_ROOMS}];
uniform float uOpenSky;
uniform float uFade;
uniform float uIndoor;
uniform float uDust;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vMat;
varying float vRoom;
varying vec2 vUv;
varying vec4 vAux;

float h21(vec2 p) { return kqHash12(p); }
float vnoise(vec2 p) { return kqNoise(p); }

// Versailles panel parquet: framed squares with a woven diagonal lattice
vec3 parquet(vec2 p, vec3 base, out float spec) {
  float cell = 1.12;
  vec2 c = floor(p / cell);
  vec2 f = p / cell - c;
  float border = 0.075;
  vec3 col;
  float grainDir;
  float id;
  if (min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) < border) {
    bool horiz = min(f.y, 1.0 - f.y) < min(f.x, 1.0 - f.x);
    grainDir = horiz ? 0.0 : 1.0;
    id = h21(c + (horiz ? vec2(0.3, floor(f.y * 2.0)) : vec2(floor(f.x * 2.0), 0.7)));
  } else {
    vec2 q = (f - 0.5) * cell;
    float a = (q.x + q.y) * 0.7071;
    float b = (q.x - q.y) * 0.7071;
    float per = 0.26;
    float da = abs(fract(a / per) - 0.5) * per;
    float db = abs(fract(b / per) - 0.5) * per;
    bool onA = da < 0.045;
    bool onB = db < 0.045;
    if (onA && onB) onA = mod(floor(a / per) + floor(b / per), 2.0) < 1.0;
    if (onA) { grainDir = 2.0; id = h21(c * 7.1 + floor(a / per)); }
    else if (onB) { grainDir = 3.0; id = h21(c * 3.7 + floor(b / per) + 9.0); }
    else { grainDir = 4.0; id = h21(c * 5.3 + floor(vec2(a, b) / per)); }
  }
  vec2 gp = grainDir < 0.5 ? p.yx : grainDir < 1.5 ? p : grainDir < 2.5 ? vec2((p.x - p.y), (p.x + p.y)) : vec2((p.x + p.y), (p.x - p.y));
  float grain = vnoise(vec2(gp.x * 60.0, gp.y * 3.0) + id * 50.0);
  col = base * (0.78 + 0.32 * id) * (0.9 + 0.16 * grain);
  // joints
  float j = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  col *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.006, abs(j - border)));
  spec = 0.35;
  return col;
}

vec3 basket(vec2 p, vec3 base) {
  float s = 0.42;
  vec2 c = floor(p / s);
  vec2 f = p / s - c;
  bool hor = mod(c.x + c.y, 2.0) < 1.0;
  float k = hor ? f.y : f.x;
  float plank = floor(k * 4.0);
  float id = h21(c + plank * 0.37);
  float grain = vnoise((hor ? p : p.yx) * vec2(3.0, 70.0) + id * 31.0);
  vec3 col = base * (0.82 + 0.26 * id) * (0.9 + 0.16 * grain);
  col *= 1.0 - 0.3 * smoothstep(0.88, 1.0, abs(fract(k * 4.0) - 0.5) * 2.0);
  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  col *= 0.75 + 0.25 * smoothstep(0.0, 0.02, e);
  return col;
}

vec3 boards(vec2 p, vec3 base) {
  float w = 0.22;
  float row = floor(p.y / w);
  float off = h21(vec2(row, 3.0)) * 4.0;
  float seg = floor((p.x + off) / 3.6);
  float id = h21(vec2(row, seg));
  float grain = vnoise(vec2(p.x * 2.5, p.y * 80.0) + id * 20.0);
  vec3 col = base * (0.78 + 0.3 * id) * (0.88 + 0.2 * grain);
  float jy = abs(fract(p.y / w) - 0.5) * 2.0;
  col *= 1.0 - 0.4 * smoothstep(0.9, 1.0, jy);
  return col;
}

vec3 flags(vec2 p, vec3 base) {
  float s = 0.62;
  float row = floor(p.y / s);
  vec2 q = vec2(p.x + row * 0.31, p.y);
  vec2 c = floor(q / s);
  vec2 f = q / s - c;
  float id = h21(c);
  vec3 col = base * (0.84 + 0.22 * id) * (0.9 + 0.15 * kqFbm(p * 2.2));
  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  col *= 0.62 + 0.38 * smoothstep(0.0, 0.025, e);
  return col;
}

vec3 checker(vec2 p, vec3 base) {
  vec2 q = vec2(p.x + p.y, p.x - p.y) * 0.7071 / 0.55;
  vec2 c = floor(q);
  vec2 f = q - c;
  bool dark = mod(c.x + c.y, 2.0) < 1.0;
  vec3 col = dark ? vec3(0.16, 0.15, 0.15) : base;
  float vein = smoothstep(0.55, 0.62, kqFbm(p * 3.0 + c * 1.3));
  col = mix(col, col * (dark ? 1.6 : 0.82), vein * 0.5);
  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  col *= 0.8 + 0.2 * smoothstep(0.0, 0.02, e);
  return col;
}

void main() {
  if (uFade < 1.0 && kqHash12(gl_FragCoord.xy + 3.0) > uFade) discard;
  int m = int(vMat + 0.5);
  int room = int(vRoom + 0.5);
  bool hasRoom = vRoom > -0.5;
  float fire = 0.0;
  float smoke = 0.0;
  float charr = 0.0;
  float gone = 0.0;
  float ceil = vWorld.y + 10.0;
  if (hasRoom) {
    for (int i = 0; i < ${MAX_ROOMS}; i++) {
      if (i == room) {
        fire = uRoomFire[i];
        smoke = uRoomSmoke[i];
        charr = uRoomChar[i];
        gone = uRoomGone[i];
        ceil = uRoomCeil[i];
      }
    }
  }
  if (m == ${M.CEILING} && gone > 0.5) discard;

  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec2 uv = vUv;
  vec3 base = vColor;
  vec3 alb = base;
  float spec = 0.0;
  vec3 emis = vec3(0.0);
  float wallH = vAux.x;

  if (m == ${M.PLASTER}) {
    alb = base * (0.93 + 0.1 * kqFbm(uv * 2.7 + vWorld.xz * 0.1));
    // skirting shadow + cornice line
    alb *= mix(0.8, 1.0, smoothstep(0.0, 0.35, uv.y));
  } else if (m == ${M.BOISERIE}) {
    float P = 1.32;
    float fx = mod(uv.x, P);
    float dado = 0.92;
    float y = uv.y;
    float top = max(dado + 0.6, wallH - 0.55);
    // panel rectangles
    float inX = min(fx, P - fx);
    float lower = step(y, dado);
    float py0 = lower > 0.5 ? 0.16 : dado + 0.14;
    float py1 = lower > 0.5 ? dado - 0.12 : top - 0.1;
    float inY = min(y - py0, py1 - y);
    float d = min(inX - 0.16, inY);
    alb = base;
    // recessed panel field slightly darker, moulding highlight, gilt fillet
    if (d > 0.0) alb *= 0.93 + 0.04 * smoothstep(0.0, 0.05, d);
    float line = 1.0 - smoothstep(0.004, 0.012, abs(d - 0.035));
    float frame = 1.0 - smoothstep(0.0, 0.02, abs(d));
    alb = mix(alb, alb * 0.72, frame * 0.6);
    alb = mix(alb, vec3(0.74, 0.55, 0.24), line * 0.85);
    spec = line * 0.6;
    // dado rail + cornice
    float rail = 1.0 - smoothstep(0.0, 0.03, abs(y - dado));
    alb = mix(alb, alb * 0.7, rail);
    alb *= mix(0.86, 1.0, smoothstep(0.0, 0.3, y));
  } else if (m == ${M.DAMASK}) {
    float y = uv.y;
    if (y < 0.88) {
      alb = vec3(0.24, 0.15, 0.08) * (0.85 + 0.2 * vnoise(uv * vec2(2.0, 30.0)));
      float l = 1.0 - smoothstep(0.0, 0.02, abs(y - 0.84));
      alb = mix(alb, vec3(0.7, 0.52, 0.22), l);
      spec = 0.3;
    } else {
      vec2 q = uv / vec2(0.62, 0.86);
      vec2 c = floor(q);
      vec2 f = fract(q) - 0.5;
      f.x = abs(f.x);
      // a stylised pomegranate / arabesque motif
      float r = length(f * vec2(1.0, 0.8));
      float petals = 0.5 + 0.5 * cos(atan(f.y, f.x) * 5.0 + r * 9.0);
      float motif = smoothstep(0.32, 0.28, r) * (0.55 + 0.45 * petals);
      motif = max(motif, smoothstep(0.06, 0.03, abs(f.x - 0.05 - 0.25 * sin(f.y * 6.0)) ) * step(abs(f.y), 0.45) * 0.6);
      alb = base * (0.8 + 0.08 * vnoise(uv * 40.0));
      alb = mix(alb, base * 1.32 + 0.02, motif * 0.7);
      spec = motif * 0.25;
    }
  } else if (m == ${M.PARQUET}) {
    alb = parquet(uv, base, spec);
  } else if (m == ${M.FLAGS}) {
    alb = flags(uv, base);
  } else if (m == ${M.CHECKER}) {
    alb = checker(uv, base);
    spec = 0.25;
  } else if (m == ${M.BOARDS}) {
    alb = boards(uv, base);
  } else if (m == ${M.CEILING}) {
    // framed ceiling: border band, moulding lines, a rosette in big rooms
    vec2 L = vAux.xy;
    float e = min(min(uv.x, L.x - uv.x), min(uv.y, L.y - uv.y));
    alb = base * (0.95 + 0.05 * kqFbm(uv * 1.3));
    float l1 = 1.0 - smoothstep(0.01, 0.03, abs(e - 0.55));
    float l2 = 1.0 - smoothstep(0.005, 0.02, abs(e - 0.72));
    alb = mix(alb, alb * 0.75, max(l1, l2 * 0.7));
    if (vAux.z > 0.5) alb = mix(alb, vec3(0.78, 0.6, 0.3), l2 * 0.8);
    float rr = length(uv - L * 0.5);
    float ros = (1.0 - smoothstep(0.0, 0.04, abs(rr - 0.9))) + (1.0 - smoothstep(0.0, 0.05, abs(rr - 0.5))) * 0.6;
    if (min(L.x, L.y) > 6.0) alb = mix(alb, vec3(0.8, 0.62, 0.32), ros * 0.6 * vAux.z);
    alb *= mix(0.82, 1.0, smoothstep(0.0, 0.6, e));
  } else if (m == ${M.WOOD}) {
    alb = base * (0.85 + 0.2 * vnoise(vec2(uv.x * 3.0, uv.y * 40.0)));
    spec = 0.15;
  } else if (m == ${M.GILT}) {
    alb = base * (0.75 + 0.35 * vnoise(uv * 25.0));
    spec = 0.9;
  } else if (m == ${M.CANVAS}) {
    // an old painting under yellowed varnish: landscape, portrait or a dark history piece
    vec2 q = uv;
    float seed = vAux.y;
    float kind = h21(vec2(seed, 5.0));
    if (vAux.z > 1.15 && kind >= 0.4 && kind < 0.75) kind = 0.2;
    vec3 g;
    if (kind < 0.4) {
      float hor = 0.32 + 0.2 * h21(vec2(seed, 6.0));
      float hills = hor + 0.07 * sin(q.x * 6.0 + seed * 10.0) + 0.06 * kqFbm(q * 7.0 + seed);
      vec3 sky = mix(vec3(0.62, 0.5, 0.32), vec3(0.32, 0.4, 0.48), smoothstep(hor, 1.0, q.y));
      sky = mix(sky, vec3(0.75, 0.68, 0.55), smoothstep(0.55, 0.75, kqFbm(q * vec2(3.0, 6.0) + seed)) * 0.5);
      vec3 land = mix(vec3(0.12, 0.11, 0.05), vec3(0.3, 0.25, 0.11), kqFbm(q * 5.0 + seed));
      g = q.y > hills ? sky : land;
      float tr = smoothstep(0.52, 0.58, kqFbm(vec2(q.x * 5.0 + seed, q.y * 2.5))) * step(q.y, hills + 0.3) * step(hills - 0.05, q.y);
      g = mix(g, vec3(0.07, 0.08, 0.04), tr);
    } else if (kind < 0.75) {
      g = base * 0.35 + 0.02;
      vec2 c = vec2(0.5, 0.64);
      float face = smoothstep(0.13, 0.11, length((q - c) * vec2(1.0, 0.75)));
      float body = (1.0 - smoothstep(0.0, 0.05, abs(q.x - 0.5) - 0.12 - (0.55 - q.y) * 0.45)) * smoothstep(0.56, 0.5, q.y);
      vec3 coat = h21(vec2(seed, 8.0)) < 0.5 ? vec3(0.2, 0.05, 0.04) : vec3(0.06, 0.07, 0.12);
      g = mix(g, coat, body);
      g = mix(g, vec3(0.78, 0.6, 0.47), face);
      g = mix(g, vec3(0.85, 0.82, 0.75), smoothstep(0.04, 0.0, abs(q.y - 0.53)) * step(abs(q.x - 0.5), 0.06));
    } else {
      g = base * 0.25 + 0.02;
      for (int k = 0; k < 4; k++) {
        float fk = float(k);
        vec2 c = vec2(0.2 + 0.2 * fk + 0.05 * h21(vec2(seed, fk)), 0.35 + 0.1 * h21(vec2(fk, seed)));
        float fig = smoothstep(0.06, 0.04, length((q - c) * vec2(2.2, 0.8)));
        float head = smoothstep(0.035, 0.025, length(q - c - vec2(0.0, 0.17)));
        vec3 robe = mix(vec3(0.5, 0.1, 0.06), vec3(0.15, 0.2, 0.38), h21(vec2(seed + fk, 3.0)));
        g = mix(g, robe, fig);
        g = mix(g, vec3(0.75, 0.58, 0.45), head);
      }
      g = mix(g, vec3(0.6, 0.5, 0.3), smoothstep(0.75, 1.0, q.y) * 0.4 * kqFbm(q * 4.0 + seed));
    }
    g *= 0.72 + 0.4 * kqFbm(q * 6.0 + seed);
    g = mix(g, g * vec3(1.0, 0.86, 0.6), 0.45);
    g *= 1.0 - 0.18 * smoothstep(0.95, 1.0, vnoise(q * 90.0));
    alb = g;
    spec = 0.35;
  } else if (m == ${M.MIRROR}) {
    // a fake reflection of the room: dark floor below the horizon, the pale ceiling above,
    // candle glints; old mercury glass with speckles
    vec3 v = normalize(vWorld - uCamPos);
    vec3 r = reflect(v, n);
    float up = smoothstep(-0.2, 0.3, r.y);
    float f = kqFbm(r.xz * 3.0 + r.y * 2.0);
    vec3 room = mix(vec3(0.14, 0.07, 0.035), vec3(0.5, 0.46, 0.38), up) * (0.75 + 0.5 * f);
    float glint = smoothstep(0.9, 0.98, kqNoise(r.xz * 16.0 + r.y * 7.0)) * smoothstep(0.0, 0.3, r.y);
    alb = vec3(0.04);
    emis = (room * 0.4 + vec3(1.0, 0.75, 0.4) * glint * 0.7) * uIndoor * (0.82 + 0.18 * kqNoise(vUv * 60.0));
    spec = 1.4;
  } else if (m == ${M.MASONRY}) {
    vec2 q = uv / vec2(0.55, 0.28);
    float row = floor(q.y);
    q.x += row * 0.5;
    vec2 c = floor(q);
    vec2 f = fract(q);
    float id = h21(c);
    alb = base * (0.78 + 0.3 * id) * (0.85 + 0.25 * kqFbm(uv * 5.0));
    float e = min(min(f.x, 1.0 - f.x) * 0.55, min(f.y, 1.0 - f.y) * 0.28);
    alb *= 0.6 + 0.4 * smoothstep(0.0, 0.025, e);
  } else if (m == ${M.BOOKS}) {
    // shelves of spines: rows every 0.38 m, spines 3–6 cm
    float row = floor(uv.y / 0.38);
    float fy = fract(uv.y / 0.38);
    float sx = uv.x * 22.0 + h21(vec2(row, 1.0)) * 50.0;
    float id = h21(vec2(floor(sx), row));
    vec3 c1 = mix(vec3(0.35, 0.09, 0.05), vec3(0.12, 0.2, 0.12), step(0.55, id));
    c1 = mix(c1, vec3(0.42, 0.3, 0.16), step(0.82, id));
    c1 = mix(c1, base, vAux.z);
    float hgt = 0.62 + 0.3 * h21(vec2(floor(sx), row + 7.0));
    alb = fy < hgt ? c1 * (0.75 + 0.4 * h21(vec2(floor(sx) + 3.0, row))) : vec3(0.05, 0.035, 0.025);
    alb = fy < 0.06 ? base * 0.7 : alb;
    float band = smoothstep(0.02, 0.0, abs(fy - hgt * 0.8)) * step(fy, hgt);
    alb = mix(alb, vec3(0.72, 0.55, 0.22), band * 0.7 * (1.0 - vAux.z));
  } else if (m == ${M.GLASS}) {
    alb = vec3(0.04, 0.05, 0.05);
    vec3 v = normalize(vWorld - uCamPos);
    float fr = pow(1.0 - abs(dot(v, n)), 3.0);
    emis = vec3(0.05, 0.06, 0.07) * (0.4 + fr) * uIndoor;
    spec = 1.2;
  } else if (m == ${M.RUBBLE}) {
    float k = kqFbm(uv * 1.7);
    float k2 = vnoise(uv * 9.0);
    alb = mix(vec3(0.24, 0.22, 0.2), vec3(0.42, 0.38, 0.33), k) * (0.7 + 0.45 * k2);
    alb = mix(alb, vec3(0.06, 0.05, 0.045), smoothstep(0.6, 0.8, vnoise(uv * 0.8 + 3.0)) * 0.7);
    alb = mix(alb, vec3(0.22, 0.28, 0.12), smoothstep(0.62, 0.75, kqFbm(uv * 0.6 + 9.0)) * 0.8);
  } else if (m == ${M.MARBLE}) {
    float v = kqFbm(uv * 1.5 + vec2(kqFbm(uv * 3.0) * 2.0));
    alb = mix(base, base * 0.62, smoothstep(0.45, 0.6, v) * 0.7);
    spec = 0.5;
  } else if (m == ${M.STEP}) {
    alb = base * (0.85 + 0.2 * kqFbm(uv * 3.0));
    alb *= mix(0.7, 1.0, smoothstep(0.0, 0.05, uv.y));
  } else if (m == ${M.IRON}) {
    alb = base * (0.7 + 0.3 * vnoise(uv * 30.0));
    spec = 0.6;
  } else if (m == ${M.FABRIC}) {
    alb = base * (0.82 + 0.18 * vnoise(uv * vec2(60.0, 3.0)));
  } else if (m == ${M.FOLIAGE}) {
    float k = kqFbm(uv * 5.0);
    alb = mix(base * 0.5, base * 1.1, k);
    float fruit = step(0.86, vnoise(uv * 14.0));
    alb = mix(alb, vec3(0.9, 0.42, 0.05), fruit);
  } else if (m == ${M.SOOT}) {
    alb = base * (0.6 + 0.6 * kqFbm(uv * 4.0));
  } else if (m == ${M.PAPER}) {
    alb = base * (0.85 + 0.15 * vnoise(uv * 20.0));
  } else if (m == ${M.STRAW}) {
    float s = vnoise(vec2(uv.x * 40.0 + uv.y * 13.0, uv.y * 4.0));
    alb = mix(vec3(0.55, 0.45, 0.2), vec3(0.85, 0.72, 0.38), s) * (0.75 + 0.3 * kqFbm(uv * 3.0));
  } else if (m == ${M.CHARRED}) {
    float c = vnoise(vec2(uv.x * 4.0, uv.y * 14.0));
    alb = vec3(0.03, 0.028, 0.026) * (0.6 + 0.8 * c);
    float ember = smoothstep(0.82, 0.95, vnoise(uv * 7.0 + uTime * 0.05));
    emis = vec3(1.0, 0.25, 0.04) * ember * fire * 1.5;
  } else if (m == ${M.MOSS}) {
    vec2 q = uv / vec2(0.5, 0.3);
    vec2 f = fract(q + vec2(floor(q.y) * 0.5, 0.0));
    alb = mix(base, vec3(0.2, 0.27, 0.1), smoothstep(0.4, 0.7, kqFbm(vWorld.xz * 1.5 + uv)));
    alb *= 0.7 + 0.3 * smoothstep(0.0, 0.06, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  } else if (m == ${M.COBBLE}) {
    vec2 q = uv / 0.2;
    vec2 c = floor(q + vec2(floor(q.y) * 0.5, 0.0));
    vec2 f = fract(q + vec2(floor(q.y) * 0.5, 0.0)) - 0.5;
    float id = h21(c);
    alb = base * (0.75 + 0.35 * id) * (1.0 - 0.6 * smoothstep(0.3, 0.5, length(f)));
  } else if (m == ${M.BARE}) {
    // where the panelling was taken down: raw plaster, nail holes, lighter than the soot around
    alb = base * (0.9 + 0.12 * kqFbm(uv * 4.0));
    alb *= 1.0 - 0.6 * step(0.985, h21(floor(uv * 6.0)));
  }

  // dust (abandoned rooms) and charring of burnt rooms
  if (uDust > 0.0 && n.y > 0.5) alb = mix(alb, vec3(0.42, 0.39, 0.34), uDust * 0.35 * (0.6 + 0.4 * kqFbm(vWorld.xz * 2.0)));
  if (charr > 0.0) {
    float c = charr * smoothstep(0.2, 0.7, kqFbm(vWorld.xz * 0.9 + vWorld.y * 0.7) + charr * 0.6 - 0.2);
    alb = mix(alb, vec3(0.02, 0.018, 0.016), clamp(c, 0.0, 1.0));
  }

  vec3 col;
  if (uOpenSky > 0.5 || !hasRoom) {
    col = kqLight(alb, n, vWorld, 1.0, 1.0);
  } else {
    // ambient indoor light: a little sky through the windows, darker in corners and low down
    vec2 lmUv = (vWorld.xz + n.xz * 0.3 - uLmBox.xy) / uLmBox.zw;
    vec4 lm = texture2D(uLightMap, lmUv);
    bool upper = vWorld.y > uLmSplit;
    float sky = upper ? lm.g : lm.r;
    float sun = upper ? lm.a : lm.b;
    float ao = mix(0.55, 1.0, smoothstep(0.0, 1.2, vWorld.y - (ceil - 4.0)));
    vec3 amb = (uSkyAmbient * (0.05 + 1.25 * sky) + uSunColor * 0.45 * sun + uGroundAmbient * 0.05) * uIndoor;
    // light falls in from the windows: walls facing the windows catch more
    col = alb * amb * ao;
    // candles, chandeliers
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      vec4 lp = uLightPos[i];
      vec4 lc = uLightCol[i];
      if (lp.w <= 0.0) continue;
      if (lc.w > -0.5 && abs(lc.w - vRoom) > 0.5) continue;
      vec3 d = lp.xyz - vWorld;
      float dist = length(d);
      float att = 1.0 / (1.0 + dist * dist * 0.35) * smoothstep(lp.w, lp.w * 0.5, dist);
      float ndl = max(dot(n, d / max(dist, 1e-3)), 0.0) * 0.8 + 0.2;
      col += alb * lc.rgb * att * ndl;
      // a soft highlight on polished / gilt surfaces
      if (spec > 0.0) {
        vec3 v = normalize(uCamPos - vWorld);
        vec3 hv = normalize(v + d / max(dist, 1e-3));
        col += lc.rgb * att * spec * 0.35 * pow(max(dot(n, hv), 0.0), 24.0);
      }
    }
    // lantern
    vec3 ld = uLanternPos - vWorld;
    float dl = length(ld);
    float lat = clamp(1.0 - dl / uLanternRadius, 0.0, 1.0);
    lat *= lat;
    col += alb * uLantern * lat * (0.35 + 0.65 * max(dot(n, ld / max(dl, 1e-3)), 0.0));
    // the fire outside (1793-07) glows in through the windows
    col += alb * uGlowColor * 0.12 * (sky + 0.1);
  }
  // a burning room lights itself from below, flickering
  if (fire > 0.0) {
    float fl = 0.75 + 0.15 * sin(uTime * 11.0 + vWorld.x * 1.3) + 0.1 * sin(uTime * 23.0 + vWorld.z * 2.1);
    float low = 1.0 - smoothstep(0.0, 3.5, vWorld.y - (ceil - 5.0));
    float patchy = 0.45 + 0.8 * kqNoise(vWorld.xz * 0.45 + vec2(uTime * 0.2, -uTime * 0.13));
    col += alb * vec3(0.7, 0.23, 0.05) * fire * fl * (0.12 + 0.88 * low) * patchy;
  }
  col += emis;

  // smoke layer under the ceiling: the part of the view ray above the smoke line
  if (smoke > 0.0) {
    float hs = ceil - 0.4 - 2.4 * smoke;
    vec3 rd = vWorld - uCamPos;
    float len = length(rd);
    float y0 = uCamPos.y;
    float y1 = vWorld.y;
    float above;
    if (y0 >= hs && y1 >= hs) above = 1.0;
    else if (y0 < hs && y1 < hs) above = 0.0;
    else above = (max(y0, y1) - hs) / max(abs(y1 - y0), 1e-3);
    float dens = smoke * (0.5 + 0.6 * kqFbm(vWorld.xz * 0.35 + vec2(uTime * 0.07, uTime * 0.03)));
    float sOp = 1.0 - exp(-len * above * dens * 0.55);
    vec3 sCol = mix(vec3(0.018, 0.016, 0.016), vec3(0.22, 0.07, 0.015), fire * 0.45 * (1.0 - above * 0.6));
    col = mix(col, sCol, clamp(sOp, 0.0, 0.97));
    // and a thin haze everywhere
    col = mix(col, sCol, smoke * 0.08 * min(len / 12.0, 1.0));
  }
  // indoors the outdoor haze (and the fire-tinted night fog) barely reaches
  vec3 fogged = kqFog(col, vWorld);
  gl_FragColor = vec4((uOpenSky < 0.5 && hasRoom) ? mix(col, fogged, 0.15) : fogged, 1.0);
}
`;

export interface InteriorUniforms {
  [k: string]: { value: unknown };
}

export function makeInteriorMaterial(lightMap: DataTexture, lmBox: Vector4, lmSplit: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: DoubleSide,
    uniforms: {
      ...atmosphere,
      uLightMap: { value: lightMap },
      uLmBox: { value: lmBox },
      uLmSplit: { value: lmSplit },
      uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new Vector4()) },
      uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new Vector4()) },
      uRoomFire: { value: new Array<number>(MAX_ROOMS).fill(0) },
      uRoomSmoke: { value: new Array<number>(MAX_ROOMS).fill(0) },
      uRoomChar: { value: new Array<number>(MAX_ROOMS).fill(0) },
      uRoomGone: { value: new Array<number>(MAX_ROOMS).fill(0) },
      uRoomCeil: { value: new Array<number>(MAX_ROOMS).fill(1000) },
      uOpenSky: { value: 0 },
      uFade: { value: 1 },
      uIndoor: { value: 1 },
      uDust: { value: 0 },
    },
  });
}

/** sRGB hex → linear Color components (vertex colours are linear). */
export function lin(hex: number): [number, number, number] {
  const c = new Color().setHex(hex);
  return [c.r, c.g, c.b];
}
