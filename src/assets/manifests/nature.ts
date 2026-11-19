import type { AssetEntry } from '../types';

/** Nature track: forest props, ground sets, vegetation (docs/ART-DIRECTION.md §8.1). */
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
];
export default entries;
