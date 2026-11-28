/**
 * Which end-to-end specs a changed path can affect (pull requests only; see select-e2e.ts).
 *
 * The first rule that matches a path decides. A path that matches no rule runs the full suite, so
 * a new directory is safe before anyone maps it. Spec names are file names without `.spec.ts`.
 *
 * - `none`: the path cannot reach the built game or the hosted Playwright run (docs, task files,
 *   unit tests, tooling). The Gates workflow still covers it.
 * - `full`: shared code. Everything can break, so everything runs.
 * - a spec list: the specs that exercise the area. `smoke` is always added. The release campaign
 *   never appears in a list: it runs with the full suite (merge queue, pushes to main, the
 *   `full-e2e` label and manual full runs).
 *
 * `e2e/*.spec.ts` and `e2e/helpers/**` are handled in select-e2e.ts: a spec selects itself, and a
 * helper selects every spec that imports it.
 *
 * tests/e2e-select.test.ts checks the names and globs here against the repository.
 */

export type AreaTarget = 'none' | 'full' | readonly string[];
export type AreaRule = { paths: readonly string[]; run: AreaTarget; why: string };

/** Added to every selection that runs at least one spec. */
export const ALWAYS_SPECS: readonly string[] = ['smoke'];

/** Specs that only run with the full suite. */
export const FULL_ONLY_SPECS: readonly string[] = ['campaign'];

/** A pull request with this label always runs the full suite. */
export const FULL_LABEL = 'full-e2e';

/**
 * A cross-section of the game for pull requests that change shared code. Only used when the
 * repository variable E2E_SHARED_CODE is `quick`, which is meant for a repository where the full
 * suite must pass before every merge anyway (a merge queue). The default is the full suite.
 */
export const QUICK_SPECS: readonly string[] = [
  'smoke', 'tour-slice', 'chapter-k1', 'chapter-k3', 'story', 'quests', 'combat', 'photo', 'skills', 'minimap', 'world',
];

const tour = ['tour-slice', 'chapter-prolog', 'walk', 'animals', 'kastanien', 'pacing', 'integration'];
const k1 = ['chapter-k1', 'chapter-k1-quelle', 'chapter-k1-disguise', 'quelle', 'pol-flow', 'twins-echo', 'setpieces'];
const k2 = ['chapter-k2', 'pikeur-credit', 'stage-k2k4', 'twins-echo', 'readability', 'pilot'];
const k3 = ['chapter-k3', 'chapter-k3-autosave', 'k3-stage', 'jaguar-quest', 'setpieces'];
const k4 = ['chapter-k4', 'enge-save', 'stage-k2k4', 'setpieces', 'touch'];
const endings = ['epilogue-resume', 'party', 'story', 'chapter-k4', 'pol-flow', 'stage-k2k4', 'setpieces'];
/** Every chapter playthrough and story check except the campaign. */
const playthroughs = [...tour, ...k1, ...k2, ...k3, ...k4, ...endings, 'quests', 'npc', 'voice'];
/** The placeholder story, quests and packs that feature specs boot instead of the real chapters. */
const testContent = ['quests', 'pacing', 'npc', 'chronik', 'court', 'progression', 'hunt-ext', 'interiors', 'pol-flow', 'photo', 'touch', 'voice', 'integration'];
const hudAndMenus = [
  'accessibility', 'pacing', 'pol-flow', 'readability', 'touch', 'minimap', 'perf', 'skills', 'chronik', 'notes',
  'progression', 'story', 'photo', 'party', 'quests', 'npc', 'tour-slice', 'chapter-prolog', 'kastanien', 'bauwagen', 'framerate',
];
const touchUi = ['touch', 'minimap', 'photo', 'party', 'tour-slice', 'chapter-prolog', 'kastanien', 'bauwagen', 'pol-flow', 'readability'];
const fights = [
  'combat', 'combat-variety', 'fun-combat', 'readability', 'camera', 'pilot', 'progression', 'enge-save', 'jaguar-quest',
  'pikeur-credit', 'world', 'pacing', 'touch', 'chapter-k1', 'chapter-k4',
];
const models = ['art', 'polish-art', 'scenery', 'perf', 'avatar-mpfb', 'interiors', 'flaschen', 'readability', 'animals', 'world', 'party', 'walk'];

export const AREA_RULES: readonly AreaRule[] = [
  // --- Bundled into the game although it looks like documentation -------------------------------
  { paths: ['content/release-notes/**'], run: ['accessibility'], why: 'player notes shown in the game' },

  // --- No effect on the built game or the hosted run ---------------------------------------------
  { paths: ['.mc/**', 'docs/**', 'research/**', '.claude/**', '.agents/**'], run: 'none', why: 'tasks, docs and agent notes' },
  { paths: ['**/*.md', 'LICENSE', '.gitignore', '.env.example'], run: 'none', why: 'text files outside the build' },
  { paths: ['content/bible/**', 'content/schema/**'], run: 'none', why: 'story bible and schemas (not bundled)' },
  { paths: ['tests/**'], run: 'none', why: 'unit tests (Gates)' },
  { paths: ['e2e/gpu/**', 'e2e/mobile/**', 'playwright.gpu.config.ts'], run: 'none', why: 'local-only Playwright configs' },
  { paths: ['.github/workflows/e2e.yml'], run: 'full', why: 'the e2e workflow itself' },
  { paths: ['.github/**'], run: 'none', why: 'other workflows and templates' },
  { paths: ['.release-please-manifest.json', 'release-please-config.json'], run: 'none', why: 'release tooling' },
  { paths: ['scripts/dev/heavy-env.*'], run: 'full', why: 'imported by the Playwright config and specs' },
  { paths: ['scripts/dev/plan-e2e-shards.ts', 'scripts/ci/**'], run: 'full', why: 'e2e selection and shard planning' },
  { paths: ['scripts/content-build/**'], run: 'full', why: 'content builders' },
  {
    paths: [
      'scripts/dev/**', 'scripts/assets/**', 'scripts/chars/**', 'scripts/voice/**', 'scripts/release/**', 'scripts/lib/**',
      'scripts/content-validation/**', 'scripts/validate-content.ts', 'scripts/sim-combat.ts', 'scripts/bench-minimap.ts',
      'scripts/prepare-data.ts',
    ],
    run: 'none',
    why: 'developer tooling (not bundled, not used by the hosted run)',
  },

  // --- Shared code: the full suite ---------------------------------------------------------------
  {
    paths: ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts', 'index.html'],
    run: 'full',
    why: 'build, dependencies or Playwright config',
  },
  { paths: ['src/boot.ts', 'src/main.ts', 'src/buildInfo.ts'], run: 'full', why: 'boot' },
  { paths: ['src/core/**', 'src/player/**', 'src/render/**', 'src/debug/**'], run: 'full', why: 'core, player, render pipeline or test hooks' },
  { paths: ['src/content/**', 'src/data/**', 'src/i18n/**'], run: 'full', why: 'content database, terrain data or shared strings' },
  { paths: ['src/systems/index.ts', 'src/systems/contracts.ts'], run: 'full', why: 'system registry and contracts' },
  { paths: ['src/world/crowd.ts'], run: ['walk', 'tour-slice', 'party', 'k3-stage'], why: 'tour crowd' },
  { paths: ['src/world/**', 'public/data/**'], run: 'full', why: 'terrain, collision and world rendering' },
  { paths: ['src/assets/loader.ts', 'src/assets/manifest.ts', 'src/assets/types.ts'], run: 'full', why: 'asset loader' },

  // --- Story spine: every playthrough except the campaign ----------------------------------------
  { paths: ['src/systems/story/title/**'], run: ['story', 'accessibility', 'touch', 'chapter-prolog', 'party'], why: 'title screen' },
  { paths: ['src/systems/story/endings/**'], run: endings, why: 'endings' },
  { paths: ['src/systems/story/**', 'src/systems/quests/**'], run: playthroughs, why: 'story engine and quests' },
  { paths: ['content/story/00-tour.story.json', 'content/packs/tour.pack.json'], run: [...tour, 'story', 'npc'], why: 'tour content' },
  { paths: ['content/story/01-*', 'content/packs/kapitel-1.pack.json', 'content/quests/01-*'], run: [...k1, 'integration', 'tour-slice'], why: 'chapter 1 content' },
  { paths: ['content/story/02-*', 'content/packs/kapitel-2.pack.json', 'content/quests/02-*'], run: k2, why: 'chapter 2 content' },
  { paths: ['content/story/03-*', 'content/packs/kapitel-3.pack.json', 'content/quests/03-*'], run: k3, why: 'chapter 3 content' },
  { paths: ['content/story/04-*', 'content/packs/kapitel-4.pack.json', 'content/quests/04-*'], run: k4, why: 'chapter 4 content' },
  { paths: ['content/story/05-*', 'content/packs/enden.pack.json'], run: endings, why: 'endings content' },
  { paths: ['content/story/99-*', 'content/quests/99-*', 'content/test/**', 'content/examples/**'], run: testContent, why: 'placeholder and example content' },
  { paths: ['content/packs/codex.pack.json'], run: ['chronik', 'bauwagen', 'twins-echo', 'npc', 'integration'], why: 'codex' },
  { paths: ['content/packs/speakers.pack.json', 'content/packs/voices.pack.json'], run: ['voice', 'npc', 'story', 'tour-slice', 'pol-flow', 'quests'], why: 'speakers and voices' },
  { paths: ['content/packs/party.pack.json', 'content/party/**', 'content/credits.json'], run: ['party', 'epilogue-resume', 'story'], why: 'party and credits' },
  { paths: ['content/photo/**'], run: ['photo', 'animals', 'tour-slice'], why: 'photo targets' },
  { paths: ['content/cinematics/**'], run: ['cinematic', 'animals', 'tour-slice'], why: 'cinematics' },
  { paths: ['content/routes/**'], run: ['walk', 'tour-slice', 'integration', 'travel-paths'], why: 'routes' },
  { paths: ['content/collectibles/**'], run: ['flaschen'], why: 'collectibles' },

  // --- Shared presentation -----------------------------------------------------------------------
  { paths: ['src/ui/releaseNotes.ts', 'src/ui/news.ts'], run: ['accessibility'], why: 'release notes page' },
  { paths: ['src/ui/touch.ts', 'src/ui/touch.css', 'src/ui/touchIcons.ts', 'src/ui/pointerTap.ts'], run: touchUi, why: 'touch controls' },
  { paths: ['src/ui/**'], run: hudAndMenus, why: 'HUD, menus and settings' },
  { paths: ['src/rpg/**'], run: fights, why: 'items, enemies and stats' },
  { paths: ['src/audio/**'], run: ['voice', 'fx', 'hunt', 'tour-slice', 'notes'], why: 'audio' },
  { paths: ['src/assets/manifests/**', 'public/assets/models/**', 'public/assets/textures/**', 'public/assets/hdri/**'], run: models, why: 'models and textures' },
  { paths: ['public/assets/LICENSES.json'], run: ['art', 'story'], why: 'licence credits page' },
  { paths: ['public/voice/**'], run: ['voice', 'tour-slice', 'quests'], why: 'voice clips' },

  // --- Feature systems ---------------------------------------------------------------------------
  { paths: ['src/systems/ambience/**'], run: ['fx', 'skills'], why: 'ambience' },
  { paths: ['src/systems/animals/**', 'src/systems/fauna/**'], run: ['animals', 'tour-slice', 'party', 'photo', 'cinematic', 'hunt-ext'], why: 'animals' },
  { paths: ['src/systems/barks/**'], run: ['npc', 'tour-slice', 'walk'], why: 'barks' },
  { paths: ['src/systems/bleiche/**'], run: ['chapter-k1-quelle', 'quelle', 'chapter-k1'], why: 'Bleiche' },
  { paths: ['src/systems/characters/**', 'src/systems/people/**'], run: ['polish-art', 'avatar-mpfb', 'npc', 'party', 'walk', 'readability', 'tour-slice'], why: 'characters and people' },
  { paths: ['src/systems/chronik/**'], run: ['chronik', 'twins-echo', 'stage-k2k4', 'bauwagen', 'npc', 'pacing', 'minimap', 'integration'], why: 'Chronik' },
  { paths: ['src/systems/cinematic/**'], run: ['cinematic', 'animals', 'party', 'tour-slice', 'photo'], why: 'cinematics' },
  { paths: ['src/systems/combat/**'], run: fights, why: 'combat' },
  { paths: ['src/systems/court/**', 'src/systems/court-k1/**'], run: ['court', 'chapter-k1-disguise', 'chapter-k1-quelle', 'chapter-k1', 'avatar-mpfb', 'integration'], why: 'court' },
  { paths: ['src/systems/flaschen/**'], run: ['flaschen'], why: 'bottles' },
  { paths: ['src/systems/footsteps/**'], run: ['notes', 'progression'], why: 'footsteps' },
  {
    paths: ['src/systems/fx/**'],
    run: ['fx', 'k3-stage', 'stage-k2k4', 'twins-echo', 'setpieces', 'quelle', 'skills', 'polish-art', 'interiors', 'scenery', 'integration', 'tour-slice', 'chapter-k3', 'chapter-k4'],
    why: 'effects and staged set pieces',
  },
  { paths: ['src/systems/home.ts'], run: ['story', 'chapter-k2', 'hunt-ext', 'quelle', 'world', 'progression'], why: 'homecoming' },
  {
    paths: ['src/systems/hunt/**'],
    run: ['hunt', 'hunt-ext', 'chapter-k2', 'pikeur-credit', 'setpieces', 'stage-k2k4', 'readability', 'polish-art', 'k3-stage', 'skills', 'combat', 'npc', 'touch', 'chapter-k4', 'chapter-k1', 'integration'],
    why: 'hunt and lantern',
  },
  { paths: ['src/systems/interiors/**'], run: ['interiors', 'chapter-k3', 'chapter-k3-autosave', 'setpieces', 'polish-art', 'camera', 'story', 'perf', 'integration'], why: 'interiors' },
  { paths: ['src/systems/menagerie/**'], run: ['hunt-ext', 'jaguar-quest', 'world', 'chapter-k3'], why: 'menagerie' },
  { paths: ['src/systems/minimap/**'], run: ['minimap'], why: 'minimap' },
  { paths: ['src/systems/notes/**'], run: ['notes'], why: 'F8 notes' },
  {
    paths: ['src/systems/npc/**'],
    run: ['npc', 'tour-slice', 'quests', 'jaguar-quest', 'camera', 'court', 'party', 'polish-art', 'stage-k2k4', 'walk', 'photo', 'animals', 'chapter-k1-disguise', 'integration'],
    why: 'NPCs and conversations',
  },
  { paths: ['src/systems/party/**'], run: ['party', 'epilogue-resume', 'story', 'chapter-k4', 'pol-flow', 'touch'], why: 'party' },
  { paths: ['src/systems/photo/**'], run: ['photo', 'animals', 'tour-slice', 'minimap', 'touch'], why: 'photo mode' },
  {
    paths: ['src/systems/progression/**'],
    run: ['progression', 'kastanien', 'combat-variety', 'readability', 'minimap', 'pilot', 'pol-flow', 'jaguar-quest', 'enge-save', 'world', 'quests', 'tour-slice'],
    why: 'progression',
  },
  { paths: ['src/systems/quelle/**'], run: ['quelle', 'chapter-k1-quelle', 'chapter-prolog', 'tour-slice', 'touch', 'scenery', 'story', 'integration'], why: 'Karlsbergquelle' },
  { paths: ['src/systems/scenery/**'], run: ['scenery', 'bauwagen', 'setpieces', 'world', 'court', 'readability', 'chapter-k1-disguise', 'flaschen', 'perf'], why: 'scenery' },
  { paths: ['src/systems/skills/**'], run: ['skills', 'progression', 'pacing', 'pol-flow', 'photo', 'minimap', 'combat-variety', 'hunt-ext', 'chapter-k4', 'integration'], why: 'skills' },
  { paths: ['src/systems/survey/**', 'src/systems/tools/**'], run: ['skills', 'touch', 'world', 'photo', 'party', 'chronik', 'minimap', 'chapter-k3', 'integration'], why: 'survey tools' },
  { paths: ['src/systems/travel/**'], run: ['travel-paths', 'travel-session', 'world', 'court', 'bauwagen', 'minimap', 'pacing', 'party', 'photo', 'skills', 'chronik'], why: 'fast travel and Wegweiser' },
  { paths: ['src/systems/walk/**'], run: ['walk', 'tour-slice', 'integration', 'animals', 'party', 'chapter-prolog'], why: 'guided walk' },
];
