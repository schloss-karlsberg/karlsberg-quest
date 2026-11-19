import type { AssetEntry } from '../types';

/**
 * Nature track, round 2 (docs/ART-DIRECTION.md §5.2): stylised CC0 Quaternius models (Stylized
 * Nature MegaKit, via poly.pizza) for the forest and the forest floor. Packed into sets by
 * `pnpm assets:set` (one named node per variant). Fetched by `world.nature` only from the medium
 * tier up; the low tier keeps the procedural forest and draws no props.
 */
const entries: AssetEntry[] = [
  {
    id: 'nature2.trees',
    kind: 'model',
    url: 'models/nature2/trees.glb',
    area: 'forest',
    bytes: 2367332,
    licence: 'quaternius.common_tree_1',
    worldLight: false,
    note: 'Tree set: common1–5 (broadleaf → beech), pine1/2/4/5 (spruce), twisted2/3/5 (oak), dead1–4 (bare crowns in February 1793, snags). Each variant node <name> plus <name>_lod1 (bark ≈ 25 %, half the leaf cards ×1.35). Drawn by vegetation/trees.ts with its own shaders, impostors baked at load.',
  },
  { id: 'nature2.ferns', kind: 'model', url: 'models/nature2/ferns.glb', area: 'forest', bytes: 55672, licence: 'quaternius.fern_1', note: 'Variants: fern (≈ 9 m wide as authored, scaled down), plant (broad-leaved forest plant).' },
  { id: 'nature2.bushes', kind: 'model', url: 'models/nature2/bushes.glb', area: 'forest', bytes: 170716, licence: 'quaternius.bush_large', note: 'Variants: bush (green leaf ball), bushflowers (with pink blossoms), bushred (rust autumn bush).' },
  { id: 'nature2.flowers', kind: 'model', url: 'models/nature2/flowers.glb', area: 'forest', bytes: 154700, licence: 'quaternius.flower_3_group', note: 'Variants: flowers (tall clump), clover, flowerbed (low clumps in five colours).' },
  { id: 'nature2.rocks', kind: 'model', url: 'models/nature2/rocks.glb', area: 'forest', bytes: 137056, licence: 'quaternius.rock_medium_1', note: 'Variants: rock1–3 (mossy boulders ≈ 3 m as authored), pebble1/2 (≈ 0.4 m stones).' },
];
export default entries;
