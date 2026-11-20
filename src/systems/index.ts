import type { SystemLoader } from '../core/systems';

/**
 * Feature systems, in init order (an `after: [...]` in a system overrides the order).
 * ONE line per feature. Each module lives in src/systems/<feature>/index.ts and
 * default-exports `defineSystem({ id, init, update, frame, dispose })`.
 */
export const SYSTEM_LOADERS: SystemLoader[] = [
  () => import('./survey'),
  () => import('./footsteps'),
  () => import('./ambience'),
  () => import('./hunt'),
  () => import('./menagerie'),
  () => import('./fx'),
  () => import('./chronik'),
  () => import('./story'),
  () => import('./interiors'),
  () => import('./npc'),
  () => import('./barks'),
  () => import('./skills'),
  () => import('./tools'),
  () => import('./scenery'),
  // Action-RPG layer (docs/ACTION-RPG.md): progression before combat before quests
  () => import('./progression'),
  () => import('./combat'),
  () => import('./quests'),
  // world: Vermessungspunkte, fast travel, route POIs, Wegweiser (after combat / quests / story)
  () => import('./travel'),
  // F8 notes + passive local telemetry (docs/ARCHITECTURE.md "Notizen & Telemetrie"), last: listens to everyone
  () => import('./notes'),
];
