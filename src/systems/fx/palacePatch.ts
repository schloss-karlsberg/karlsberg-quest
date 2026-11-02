/**
 * Runtime inserts into the palace ShaderMaterial (world/palace.ts stays untouched): each patch
 * adds its declarations after `varying vec3 vWorld;` and code before given anchor lines. A patch
 * whose anchors are missing (the palace shader changed shape) is skipped and reports false, and
 * the caller falls back to effects that don't need it.
 */
import type { ShaderMaterial } from 'three';

export interface PalacePatch {
  /** Unique marker (a uniform name the patch declares). */
  id: string;
  decl: string;
  /** [anchor line, code inserted before it]. */
  before: [string, string][];
}

const DECL_ANCHOR = 'varying vec3 vWorld;';

/** Apply once; true if the shader carries the patch. Uniforms are the caller's job. */
export function patchPalace(material: ShaderMaterial, patch: PalacePatch): boolean {
  let fs = material.fragmentShader;
  if (fs.includes(patch.id)) return true;
  if (!fs.includes(DECL_ANCHOR) || !patch.before.every(([a]) => fs.includes(a))) return false;
  fs = fs.replace(DECL_ANCHOR, `${DECL_ANCHOR}\n${patch.decl}`);
  for (const [anchor, code] of patch.before) fs = fs.replace(anchor, `${code}\n  ${anchor}`);
  material.fragmentShader = fs;
  material.needsUpdate = true;
  return true;
}
