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
  // people contract v0 (modern NPCs behind a mesh-independent handle API, ctx.people); before npc, which binds talkable people
  () => import('./people'),
  // fauna contract v0 (animal bodies behind a mesh-independent handle API, ctx.fauna); the behaviour layer (animals) declares after: ['fauna']
  () => import('./fauna'),
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
  // the Fläschchen: 24 hidden bottles, one table, the Journal row and the Regal (after travel)
  () => import('./flaschen'),
  // the Karlsbergquelle: its living water and the touch that starts the time travel (prologue p3q)
  () => import('./quelle'),
  // the tour group: Gerold walks the route, the group follows (WP-16, era today)
  () => import('./walk'),
  // F8 notes + passive local telemetry (docs/ARCHITECTURE.md "Notizen & Telemetrie"), last: listens to everyone
  () => import('./notes'),
];
