import type { GraphicsLevel } from '../core/save';

/**
 * First-run graphics level on a touch device (coarse pointer), docs/PERF-MOBILE-RESEARCH.md §B:
 * phones (short screen side < 600 CSS px) and mobile GPUs start on Niedrig; big tablets with
 * enough cores on Mittel. The auto-downgrade still corrects it. Pure; tested.
 */
export function mobileLevel(gpu: string, minSide: number, cores: number): GraphicsLevel {
  if (minSide > 0 && minSide < 600) return 'low';
  if (/mali|adreno|powervr|videocore/i.test(gpu)) return 'low';
  if (cores >= 6) return 'medium';
  return 'low';
}
