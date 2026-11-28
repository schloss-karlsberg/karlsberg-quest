/**
 * Minutes each e2e spec file takes on a hosted runner (SwiftShader, one worker).
 *
 * The shard planner balances shards with these numbers and sizes the matrix of a selected run from
 * them. A spec that is missing here counts DEFAULT_TEST_MINUTES per runnable test.
 *
 * Source: first estimate. Each shard's Playwright time, averaged over the full runs 46045395516,
 * 46082539997 and 46086245820 (2026-11-27/28), split across its files by test count. Replace it
 * with measured values: every run prints a "Spec timings" table in its summary and uploads
 * `e2e-timings-*` artifacts. Hosted runners differ by up to a factor of two between runs, so
 * round to the minute and do not chase small differences.
 */
export const SPEC_MINUTES: Readonly<Record<string, number>> = {
  accessibility: 2.7,
  animals: 6.3,
  art: 2.6,
  'avatar-mpfb': 1,
  bauwagen: 0.7,
  camera: 2.8,
  campaign: 30.3,
  'chapter-k1': 10,
  'chapter-k1-disguise': 9.7,
  'chapter-k1-quelle': 1.4,
  'chapter-k2': 11.9,
  'chapter-k3': 8.6,
  'chapter-k3-autosave': 2.3,
  'chapter-k4': 14.4,
  'chapter-prolog': 1.8,
  chronik: 2.6,
  cinematic: 1.1,
  combat: 9.5,
  'combat-variety': 1.9,
  court: 3.4,
  'enge-save': 0.9,
  'epilogue-resume': 3.7,
  flaschen: 1.8,
  framerate: 1.8,
  'fun-combat': 1.1,
  fx: 5.6,
  hunt: 2,
  'hunt-ext': 6.2,
  integration: 7.8,
  interiors: 5.3,
  'jaguar-quest': 1.7,
  'k3-stage': 0.4,
  kastanien: 0.7,
  minimap: 2.7,
  notes: 3.2,
  npc: 2.5,
  pacing: 4.6,
  party: 4.5,
  perf: 19.5,
  photo: 7.8,
  'pikeur-credit': 0.5,
  pilot: 2,
  'pol-flow': 6.3,
  'polish-art': 12.4,
  progression: 1.4,
  quelle: 1,
  quests: 2.2,
  readability: 4.9,
  scenery: 10.6,
  setpieces: 6.2,
  skills: 6,
  smoke: 9.4,
  'stage-k2k4': 12.3,
  story: 9.8,
  touch: 17.4,
  'tour-slice': 10.1,
  'travel-paths': 0.9,
  'travel-session': 0.9,
  'twins-echo': 1.1,
  voice: 0.9,
  walk: 1.2,
  world: 4.1,
};

/** Estimate for a runnable test in a spec file without a measured time. */
export const DEFAULT_TEST_MINUTES = 1.5;
