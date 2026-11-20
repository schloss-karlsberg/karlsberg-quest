import { Vector4 } from 'three';

/**
 * Ground props part round the enemies (playtest round 10, F-04: the first Nebelinge stood half
 * hidden in ferns, only their health pips showed). Ferns, bushes and flower clumps (the swaying
 * kinds of `NatureProps`) within a creature's radius lie down and spread, so a fight on the forest
 * floor stays readable. One shared uniform: combat writes it every frame, the props' shader reads it.
 */
export const DUCK_N = 8;

/** Per slot: x, z, radius (m), strength 0..1 (0 = unused). */
export const enemyDuck = { value: Array.from({ length: DUCK_N }, () => new Vector4()) };

/**
 * Fill the slots with the creatures nearest to (cx, cz) inside `range` m (the rest are cleared).
 * Returns how many slots are in use.
 */
export function setDuck(points: readonly { x: number; z: number; r: number }[], cx: number, cz: number, range = 46): number {
  const near = points
    .map((p) => ({ p, d: Math.hypot(p.x - cx, p.z - cz) }))
    .filter((q) => q.d < range)
    .sort((a, b) => a.d - b.d)
    .slice(0, DUCK_N);
  const slots = enemyDuck.value;
  for (let i = 0; i < DUCK_N; i++) {
    const q = near[i];
    if (q) slots[i]!.set(q.p.x, q.p.z, q.p.r, 1);
    else slots[i]!.set(0, 0, 0, 0);
  }
  return near.length;
}

/** GLSL: the duck factor (0..1) of an instance at world xz `p`. */
export const DUCK_GLSL = /* glsl */ `
uniform vec4 uEnemyDuck[${DUCK_N}];
float kqDuckAt(vec2 p) {
  float k = 0.0;
  for (int i = 0; i < ${DUCK_N}; i++) {
    vec4 e = uEnemyDuck[i];
    k = max(k, e.w * (1.0 - smoothstep(e.z * 0.55, e.z, length(p - e.xy))));
  }
  return k;
}
`;
