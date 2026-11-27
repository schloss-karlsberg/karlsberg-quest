# Karlsberg Quest: notes for coding agents

Karlsberg Quest is a free, open-source 3D action RPG for the browser, set on the real terrain of
Schloss Karlsberg near Homburg (Saarland), with time travel between today and the 1790s. Stack:
Vite, TypeScript (strict), three.js; Node.js 24, pnpm. Entry points: `index.html` → `src/main.ts`
→ `src/boot.ts` (renderer, world, player, UI, saves, URL flags); feature systems are registered in
`src/systems/index.ts`. Everything the player sees is German; code, comments, commits and docs are English.

## Layout

| Path | What |
| --- | --- |
| `src/systems/` | Feature systems (story, quests, combat, photo, animals, interiors, ...) |
| `src/player/` | Player, avatar, camera, input, touch mapping |
| `src/rpg/` | Items, enemies, stats |
| `content/` | Story, quests, codex packs, routes, cinematics (JSON) |
| `public/assets/` | Models, textures, `LICENSES.json` (credits for every file) |
| `scripts/` | Content builders, asset packing, dev tools |
| `tests/`, `e2e/` | Vitest unit tests; Playwright end-to-end specs |
| `docs/` | Design docs (living documents); current game concept: `docs/design/tour/README.md`, PRD: `docs/PRD.md` |
| `.mc/` | Task tracking (MissionControl) |

## Commands

```sh
pnpm install && pnpm dev              # http://localhost:5280
pnpm typecheck && pnpm test && pnpm validate && pnpm build   # the four gates, run before a PR
pnpm exec vitest run tests/<file>.test.ts                    # one unit test file
pnpm build && pnpm exec playwright test e2e/<spec>.spec.ts --workers=1   # always one worker
pnpm assets:pack <in.glb> public/assets/models/<track>/<name>.glb        # pack a model
```

On a shared machine, wrap e2e and GPU runs in `scripts/dev/heavy.sh` if present.
CI runs e2e in up to 16 SwiftShader shards with a 640×360 default viewport. Run a subset with `gh workflow run e2e.yml -f specs="chapter-k2 smoke" --ref <branch>`.

## Rules

- **Conventional Commits** (`type(scope): summary`) for commits and PR titles: release-please builds
  the changelog and releases from them. Don't edit `CHANGELOG.md` by hand.
- **Minimise new dependencies.** Prefer a small local helper over a package.
- **Docs live in the repo** as Markdown (`docs/`, including `docs/PRD.md`); update them with behaviour changes.
- **Assets:** CC0 from the allowed sites, own work, or AI output whose licence allows redistribution;
  every file credited in `public/assets/LICENSES.json` (checked by `tests/assets.test.ts`).
  See `docs/ART-DIRECTION.md` §8 and CONTRIBUTING.md.
- **Generated content:** most of `content/packs/`, `content/quests/` and `content/story/` is written
  by `scripts/content-build/` (chapters 1-4, endings, codex, speakers, voices). Edit the
  builders, then `node scripts/content-build/build.mjs` and `pnpm validate`. The tour
  (`00-tour.story.json`, `tour.pack.json`), the party pack and the `99-test` files have no builder
  and are edited directly; grep `scripts/content-build/` when unsure.
- **Gameplay** is action-RPG: quest givers, collect and kill objectives, exploration. No quizzes or word puzzles.
- **Keep touch / mobile and reduced motion working** (`src/ui/touch.ts`, the `reducedMotion` setting).
- Facts need a source; invented parts are labelled FIKTION. No brand names (see CONTRIBUTING.md).

## Work tracking

Tasks are Markdown files in `.mc/tasks/` (MissionControl `mc`; without the CLI, read and edit the
frontmatter directly). The `contribute` skill (`.claude/skills/contribute/`, `.agents/skills/contribute/`)
is the workflow: pick a task → plan (stored in the task file) → implement → ship a PR.

## More

`CONTRIBUTING.md` (setup, rules, testing aids), `docs/ARCHITECTURE.md`, `docs/ACTION-RPG.md`,
`docs/ART-DIRECTION.md`, `docs/PERFORMANCE.md`, `docs/PRD.md`, `docs/design/tour/README.md`, `content/story/README.md`, `content/quests/README.md`.
