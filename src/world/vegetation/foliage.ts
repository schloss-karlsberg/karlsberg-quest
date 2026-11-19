/**
 * Foliage colour rules shared by every tree shader (procedural low-tier forest, the CC0 model
 * trees and their baked impostors), so near trees, mid trees and the far stand agree on the
 * season's hues (docs/ART-DIRECTION.md §5). Needs ATMOS_GLSL (uSeason) before it.
 */
export const FOLIAGE_GLSL = /* glsl */ `
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }

/** Leaf density for the season: summer full, November thinned, bare in winter. */
float leafDensity() {
  return uSeason <= 1.0 ? 1.0 - 0.1 * uSeason : clamp(0.9 - (uSeason - 1.0) * 1.2, 0.0, 1.0);
}
float twigShow() { return smoothstep(0.75, 1.6, uSeason); }

/** Leaf colour per kind (0 beech, 1 spruce, 2 oak) and variation v (0..1). */
vec3 leafColour(float kind, float v) {
  // summer: fresh, saturated greens (beech lighter, oak deeper)
  vec3 sBeech = mix(srgb(vec3(0.22, 0.36, 0.1)), srgb(vec3(0.33, 0.44, 0.13)), v);
  vec3 sOak = mix(srgb(vec3(0.16, 0.26, 0.08)), srgb(vec3(0.23, 0.32, 0.1)), v);
  // November: copper beech, brown-gold oak, a few late yellow and still-green crowns
  vec3 aBeech = v < 0.4 ? mix(srgb(vec3(0.55, 0.22, 0.06)), srgb(vec3(0.66, 0.33, 0.09)), v / 0.4)
              : v < 0.78 ? mix(srgb(vec3(0.7, 0.46, 0.12)), srgb(vec3(0.6, 0.3, 0.08)), (v - 0.4) / 0.38)
              : srgb(vec3(0.34, 0.36, 0.12));
  vec3 aOak = mix(srgb(vec3(0.42, 0.29, 0.1)), srgb(vec3(0.52, 0.37, 0.12)), v);
  vec3 sum = kind > 1.5 ? sOak : sBeech;
  vec3 aut = kind > 1.5 ? aOak : aBeech;
  vec3 dead = srgb(vec3(0.32, 0.24, 0.16));
  return uSeason < 1.0 ? mix(sum, aut, uSeason) : mix(aut, dead, clamp(uSeason - 1.0, 0.0, 1.0));
}

/** Spruce / pine needles: blue-green, a little lighter at v = 1. */
vec3 needleColour(float v) {
  return mix(srgb(vec3(0.1, 0.19, 0.11)), srgb(vec3(0.15, 0.25, 0.12)), v);
}
`;
