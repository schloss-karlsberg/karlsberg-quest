/**
 * Minutes each e2e spec file takes on a hosted runner (SwiftShader, one worker).
 *
 * The shard planner balances shards with these numbers and sizes the matrix of a selected run from
 * them. A spec that is missing here counts DEFAULT_TEST_MINUTES per runnable test.
 *
 * Source: measured, the per-spec timings of the full run 46104995434 (2026-11-28, 62 specs,
 * 304 minutes in all). Every run prints a "Spec timings" table in its summary and uploads
 * `e2e-timings-*` artifacts. Hosted runners differ by up to a factor of two between runs (the
 * campaign took 20 to 47 minutes for the same code), so update a number only when a spec
 * changed for good, and do not chase small differences.
 */
export const SPEC_MINUTES: Readonly<Record<string, number>> = {
  accessibility: 0.6,
  animals: 3.5,
  art: 2.8,
  'avatar-mpfb': 0.4,
  bauwagen: 1,
  camera: 6,
  campaign: 44.7,
  'chapter-k1': 8.2,
  'chapter-k1-disguise': 2.2,
  'chapter-k1-quelle': 1.7,
  'chapter-k2': 7.1,
  'chapter-k3': 11.3,
  'chapter-k3-autosave': 1,
  'chapter-k4': 7.5,
  'chapter-prolog': 3.4,
  chronik: 3.3,
  cinematic: 1,
  combat: 3.4,
  'combat-variety': 2.2,
  court: 3.4,
  'enge-save': 0.8,
  'epilogue-resume': 4.6,
  flaschen: 4.5,
  framerate: 7.1,
  'fun-combat': 2,
  fx: 7.3,
  hunt: 0.9,
  'hunt-ext': 3.5,
  integration: 7.9,
  interiors: 6.3,
  'jaguar-quest': 1.2,
  'k3-stage': 1,
  kastanien: 0.9,
  minimap: 1.8,
  notes: 0.8,
  npc: 1.9,
  pacing: 3,
  party: 4.7,
  perf: 12.3,
  photo: 5.2,
  'pikeur-credit': 0.2,
  pilot: 0.7,
  'pol-flow': 9.6,
  'polish-art': 12.2,
  progression: 2.4,
  quelle: 0.8,
  quests: 4.2,
  readability: 6.6,
  scenery: 9.2,
  setpieces: 4,
  skills: 3.9,
  smoke: 8.4,
  'stage-k2k4': 10.7,
  story: 9,
  touch: 10.7,
  'tour-slice': 10.2,
  'travel-paths': 0.5,
  'travel-session': 0.3,
  'twins-echo': 1.9,
  voice: 0.3,
  walk: 1.6,
  world: 4.4,
};

/** Estimate for a runnable test in a spec file without a measured time. */
export const DEFAULT_TEST_MINUTES = 1.5;
