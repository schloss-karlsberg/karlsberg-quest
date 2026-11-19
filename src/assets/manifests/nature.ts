import type { AssetEntry } from '../types';

/**
 * Nature track: terrain ground set, bark set, forest props (docs/ART-DIRECTION.md §5, §8.1).
 * The texture strips are texture arrays at runtime (src/world/vegetation/strips.ts); they and the
 * props are fetched by `world.nature` only from the medium tier up (low keeps the procedural look).
 */
const entries: AssetEntry[] = [
  {
    id: 'nature.stump.01',
    kind: 'model',
    url: 'models/nature/tree_stump_01.glb',
    area: 'forest',
    eras: ['today', '1796'],
    bytes: 946064,
    licence: 'polyhaven.tree_stump_01',
    note: 'Pipeline reference asset (foundation): ~1.2 m wide, pivot at the ground; simplified to 30 %, 1k WebP PBR set.',
  },
  {
    id: 'nature.ground.albedo',
    kind: 'texture',
    url: 'textures/nature/ground_albedo.webp',
    area: 'core',
    bytes: 2718898,
    licence: 'polyhaven.dry_decay_leaves',
    texture: { colorSpace: 'srgb', repeat: true },
    note: 'Strip of 8 × 1024² layers: litter, forest floor, grass, gravel, rock, snow, mud, burnt (vegetation/strips.ts GROUND_LAYERS).',
  },
  {
    id: 'nature.ground.nh',
    kind: 'texture',
    url: 'textures/nature/ground_nh.webp',
    area: 'core',
    bytes: 1181660,
    licence: 'polyhaven.dry_decay_leaves',
    texture: { colorSpace: 'linear', repeat: true },
    note: 'Strip of 8 × 512² layers: RG normal (OpenGL), B height; same order as the albedo strip.',
  },
  {
    id: 'nature.bark.albedo',
    kind: 'texture',
    url: 'textures/nature/bark_albedo.webp',
    area: 'core',
    bytes: 166132,
    licence: 'polyhaven.chinese_hackberry_bark',
    texture: { colorSpace: 'srgb', repeat: true },
    note: 'Strip of 3 × 512² layers: beech, oak, spruce.',
  },
  {
    id: 'nature.bark.nh',
    kind: 'texture',
    url: 'textures/nature/bark_nh.webp',
    area: 'core',
    bytes: 307894,
    licence: 'polyhaven.chinese_hackberry_bark',
    texture: { colorSpace: 'linear', repeat: true },
    note: 'Strip of 3 × 512² layers: RG normal, B height.',
  },
  { id: 'nature.fern.02', kind: 'model', url: 'models/nature/fern_02.glb', area: 'forest', bytes: 286960, licence: 'polyhaven.fern_02', note: '~2 m wide fern clump, instanced on the forest floor near the player.' },
  { id: 'nature.rocks.moss01', kind: 'model', url: 'models/nature/rock_moss_set_01.glb', area: 'forest', bytes: 444544, licence: 'polyhaven.rock_moss_set_01', note: 'Set of 6 mossy rocks (each child mesh is one variant), simplified to ≈ 12 %.' },
  { id: 'nature.rocks.moss02', kind: 'model', url: 'models/nature/rock_moss_set_02.glb', area: 'forest', bytes: 568852, licence: 'polyhaven.rock_moss_set_02', note: 'Set of 7 mossy rocks, simplified to ≈ 12 %.' },
  { id: 'nature.log.01', kind: 'model', url: 'models/nature/dead_tree_trunk.glb', area: 'forest', bytes: 658324, licence: 'polyhaven.dead_tree_trunk', note: '~3 m fallen trunk, simplified to 6 %.' },
  { id: 'nature.stump.02', kind: 'model', url: 'models/nature/tree_stump_02.glb', area: 'forest', bytes: 936764, licence: 'polyhaven.tree_stump_02', note: '~1.5 m stump with roots, simplified to 12 %.' },
];
export default entries;
