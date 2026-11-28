# Contributing to Karlsberg Quest

Thanks for your interest. Karlsberg Quest is a German-language action RPG for the browser, built
with Vite, TypeScript (strict) and three.js. This guide is in English; **everything the player sees
in the game is German**.

By contributing you agree that your code and texts are released under the MIT License (see
[`LICENSE`](LICENSE)) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).

**Looking for something to work on?** Open tasks (tagged `community` or `bug`) live in
[`.mc/tasks/`](.mc/tasks/) (MissionControl: `mc list tasks --open --tag community`,
or just read the Markdown files). With Claude Code or Codex, say "I want to contribute" or run
`/contribute`: the `contribute` skill (`.claude/skills/contribute/`, `.agents/skills/contribute/`)
lists them and guides you through plan, implementation and pull request. Agents also read
[`AGENTS.md`](AGENTS.md).

## Setup

You need **Node.js 24** and **pnpm** (the version is pinned in `package.json` → `packageManager`;
`corepack enable` picks it up).

```sh
pnpm install
pnpm dev          # http://localhost:5280
```

Useful URL flags for development: `?notitle`, `?nosave`, `?fresh`, `?q=low|med|high`,
`?cam=first|third`.

### Testing aids

These are intentionally **on in production** too, so you can reproduce a bug on the live site:

| Aid | What it does |
| --- | --- |
| `?debug` | Stats panel and validation; skips the title and never pauses |
| `?kapitel=2\|3\|4` | A new game starts at that chapter, with matching skills and level. From the title, the name starts the game (no tour route card) |
| `?era=1789` | Start in that era: `today`, `1789`, `1793-02`, `1793-07`, `1796` |
| `?x=…&z=…` | Start at a local position |
| `?party=museum\|burn\|keep` | Start at the end-of-game party on the plateau at dusk, credits rolling. From the title, the name starts the party (no tour route card, no tour) |
| `?manual` | Bullet time: the game advances only when stepped. `kq.step(n)` advances skill and level cards by fixed ticks (60 per second). In e2e, use `e2e/helpers/cards.ts` to advance shared UI holds too. |
| `?manual&faststep` | Campaign test mode. Dialogue uses subtitle timing on fixed steps. `kq.step(n)` and `kq.press(code, n)` update frame-driven prompts and cameras. A browser frame requested just to show that view draws it without advancing presentation again. Use `await kq.screenshotReady()` before a capture. |
| `?nosave` | Makes save slots read-only. „Neues Spiel“ opens the content warning directly, and „Weiter“ reloads the autosave from the title. Add `&fresh` to skip loading the autosave on boot. |
| `window.kq` | Debug API in the browser console: teleport, set the era, step, press keys, combat hooks |
| `kq.pilot` | Scripted play on top of `window.kq`: act, observe, choose, `bulletTime(true)`, `showStrip(true)` |
| F8 (in game) | Write a playtest note with the current position and state; export it from the pause menu |

For e2e gameplay waits, boot with `?manual` and use `kq.step(n)` up to a fixed game-tick budget.
Assert the resulting state when the budget ends. Use `&idle` when the test owns the render
schedule. Each `kq.step(n)` advances `n` fixed ticks and presents one frame. It draws that frame
on the GPU only when the GPU has finished the previous stepped draw, so in a loop within one task
only the first step draws. The other steps prepare the frame (camera, HUD, frame-driven systems)
and the next animation frame paints it. Unpaced synchronous draws let software WebGL fall minutes
behind, and the browser then grows until a hosted runner runs out of memory (TASK-075). Use
`kq.step(n, { draw: true })` only when the test measures each draw (draw calls, triangles).
Use readiness assertions for asynchronous work such as asset loading and browser UI transitions.

In the normal e2e suite, check fixed work such as draw calls, triangles or ticks. Check the
active render cap in the browser and test the cadence with synthetic animation-frame timestamps.
Check held and resumed drawing over a fixed number of browser animation callbacks after queued
render requests drain. Allow a couple of draws from asynchronous requests (a streamed asset, a
delayed settings save) in a held view; a redraw on every callback must still fail. For workload deltas, load the fixture first and pair measurements at the
same camera pose and simulation tick.
If a check needs elapsed time, calibrate against a baseline from the same run or log why the
check is skipped under load. Absolute fps targets belong in dedicated GPU benchmarks.

## The four gates

Run all four before you open a pull request. The Gates workflow (`.github/workflows/gates.yml`)
runs them on every pull request and reports in about a minute. The Pages workflow runs them on
pushes to `main` before the deploy.

```sh
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest unit tests
pnpm validate     # content validation (packs, quests, story)
pnpm build        # production build
```

### How a pull request merges

Nobody merges by hand, and nobody waits for the project owner. A pull request reaches `main`
through GitHub's merge queue as soon as it is ready.

**As an outside contributor, this is all you do:**

1. Open the pull request against `main` with a Conventional Commits title (see below). Open it as
   a draft while you are still working on it.
2. Wait for the checks. On your first pull request a maintainer has to approve the workflows
   before they run; GitHub asks for that for new contributors. "Gates" then takes about a minute.
   "End-to-end tests" runs the full suite for a pull request from a fork: about 45 minutes when
   runners are free.
3. A maintainer reviews it. Push fixes to the same branch; each push runs the checks again.
4. When the review has passed and both checks are green, a maintainer queues it. You are done.

**What happens on its own after that:**

- The merge queue puts your change together with `main` and the pull requests queued ahead of
  it, and runs "Gates" and the full end-to-end suite on that result. This takes about 50 minutes.
- If it passes, `main` moves to exactly the commit that was tested, the game is deployed, and
  your pull request shows as merged.
- If it fails, your pull request leaves the queue and stays open. The failed run says why. Push a
  fix and it is queued again, or say in the pull request that the failure is not yours.

From "ready" to merged takes about an hour when the queue is short. Two queue entries are tested
at a time, so the queue manages about two and a half merges an hour.

**The label `full-e2e`** makes a pull request run the full suite on the pull request itself,
before it is queued. A maintainer adds it when the selected specs look too narrow for a change.
Pull requests from forks run the full suite anyway.

**Rules for maintainers and agents:**

- **Ready** means: "Gates" and "End-to-end tests" are green on the latest commit, and a reviewer
  other than the author has passed it.
- **Review.** A pull request from an outside contributor is reviewed and approved on GitHub by a
  maintainer. A pull request written by an agent gets an independent review, posted on the pull
  request as a comment that ends with a verdict, by another agent session or Codex and never by
  the session that wrote the change. All agents use the owner's GitHub account, and GitHub does
  not let an account approve its own pull request, so no setting can check this. It is a rule of
  the project.
- **Queue it** with `gh pr merge <number> --auto --merge`. If the checks are still running, GitHub
  queues it when they are green. The reviewer queues it; a session never queues its own change.
- **What GitHub enforces on `main`** (ruleset "main: tested merges"): both checks are required,
  merges go through the queue, and nobody can push, force-push or delete `main`. Organisation
  admins can merge one pull request past these rules. That exists for the release pull request:
  the Actions bot opens it, so its workflows wait for "Approve workflows to run". Agents never use
  it (`gh pr merge --admin` is off limits).
- **Few open pull requests.** Bundle related changes into one pull request. Open a pull request
  when it is ready for review, and as a draft before that. About five agent pull requests are open
  at once at most: before you open another, get an open one merged by reviewing it.
- **A pile of ready pull requests** goes in as one train. Branch `integrate/<name>` from
  `origin/main`, merge each reviewed head with a merge commit
  (`git merge --no-ff -m "Merge pull request #N from schloss-karlsberg/<branch>" <head-sha>`),
  resolve the seams, run the four gates, push, and open one pull request from that branch. It is
  one queue entry with one full run, and GitHub marks every pull request in it as merged.
- **A failed queue run is never re-run.** Its branch is gone, so the result would count for
  nothing. Fix the pull request and queue it again. GitHub removes the failing entry and rebuilds
  the entries behind it, so the first one that fails is the one to look at.

### What runs on a pull request

**The checks "Gates" and "End-to-end tests" must be green on the latest commit before a pull
request can be queued.** Both
report on every pull request, also when no spec had to run, so there is never a check to wait for
that does not arrive. Gates takes about a minute. How much "End-to-end tests" runs depends on the
changed paths. `scripts/ci/e2e-areas.ts` holds the rules, and the first rule that matches a path
decides:

| The pull request changes | "End-to-end tests" runs | Typical time |
| --- | --- | --- |
| Only docs, `.mc/` task files, unit tests or developer tooling | Nothing. The check passes at once. | under 1 min |
| A feature system, content, a spec or an e2e helper | The specs that cover those paths, plus smoke, on as many runners as the work needs | 5–20 min |
| Shared code (boot, core, player, render, world, shared strings, content builders, the build, the Playwright config, `scripts/ci/`, any workflow) or a path without a rule | The full suite on 12 runners | 30–45 min |
| Anything, from a fork | The full suite on 12 runners | 30–45 min |

- See what your branch will run, before you push: `node scripts/ci/select-e2e.ts` (committed
  changes against `origin/main`; `--base <ref>` picks another base). On the pull request, the
  summary of the job "Select specs and build" lists every changed path with its rule.
- Force the full suite on a pull request: add the label `full-e2e`, then push or re-run the run
  (`gh run rerun <run-id>`). Or start it by hand on the branch: `gh workflow run e2e.yml --ref <branch>`.
- The release campaign (`e2e/campaign.spec.ts`) only runs with the full suite.
- A changed spec selects itself. A changed file in `e2e/helpers/` selects every spec that imports it.
  A file that a spec imports or reads with `new URL('../…', import.meta.url)` (a game module, a
  save fixture in `tests/fixtures/`) selects that spec too. Load files in specs only in these two
  ways, never by a path relative to the working directory: the selection cannot see those.
- Only a green "End-to-end tests" on the latest commit counts. A cancelled run does not pass.
  Seen on #143, where a run was cancelled by hand while one shard ran and eleven waited: all
  shards ended as cancelled within 20 seconds, "End-to-end tests" stayed pending until its job
  got a runner (11 minutes that night) and then reported a failure. `gh pr checks` exits with 8
  while it is pending and with 1 afterwards, and the checks API shows `completed / failure`.
  `gh run rerun <run-id>` runs a cancelled run again.
- A newer push cancels the old run's jobs, and shards that are still running stop themselves
  within about a minute, so an older commit ends with a red "End-to-end tests".
- A pull request that changes `scripts/ci/`, the shard planner or a workflow always runs the full
  suite. The workflow decides that itself, before it runs the selection script, and it checks that
  a full run contains every spec file. A pull request can still edit the workflow file it is
  tested with. That is how `pull_request` workflows work, and it is what review is for.
- A new directory needs no rule to be safe: an unknown path runs the full suite. New files below
  `src/` need a rule (`tests/e2e-select.test.ts` says which), so that later changes stay cheap.
- A failed shard: `gh run rerun <run-id> --failed` repeats only the failed shards.

One-time transition (TASK-094, 2026-11-28): a run that started with the workflow from before this
change is in another concurrency group, so the next push to that pull request does not cancel it.
It would run all 16 shards for a commit nobody waits for. After such a push, look for a second
run on the branch (`gh run list --workflow e2e.yml --branch <branch>`) and cancel the older one
(`gh run cancel <run-id>`). Each pull request that was open at the merge needs this at most once.

The full suite runs before every merge:

- **In the merge queue** (`merge_group`), on 8 runners, once for every queued pull request together
  with the ones ahead of it. GitHub does not combine these builds: three queued pull requests are
  three full runs. A train (see "How a pull request merges") is how several pull requests share
  one run.
- **On a push to `main`**, on 8 runners, when the commit did not come through the queue (the
  release pull request, merged by an admin). A commit that already passed in the queue or in a
  manual full run is not tested again. Runs on `main` are never cancelled. One runs and one
  waits, and the waiting run covers every merge that arrived in the meantime.
- **By hand**: `gh workflow run e2e.yml --ref <branch>` without `specs`.

Because the queue runs the full suite before every merge, the repository variable
`E2E_SHARED_CODE=quick` lets a pull request that changes shared code run a cross-section of the
game on the pull request (`QUICK_SPECS` in `scripts/ci/e2e-areas.ts`) and leaves the full suite to
the queue. Without the variable, shared code runs the full suite twice: on the pull request and
in the queue.

#### When main is red

`main` deploys to the live game, so a red run on `main` comes first.

- `main` moves only to commits that passed the full suite in the merge queue, so a red `main` is
  rare: a merge past the queue, or a test that fails only some of the time.
  `gh run list --workflow e2e.yml --branch main --limit 5` shows the runs.
- A failed run opens the issue "End-to-end tests are red on main" with the failed shards and the
  commits since the previous push. Later red runs comment on it, and the first green run closes it.
- Find the merge in that commit range, then fix forward or revert it. Until `main` is green, merge
  only the fix or the revert.
- The run on `main` does not retry: a flaky test turns `main` red, and the issue links its shard.
  On a pull request a test that failed and then passed on its retry leaves the check green, but
  the run carries the warning "Flaky e2e tests" and its summary lists them. Treat each as a bug:
  fix it or file a task, and say so in the pull request.

### End-to-end tests

The GitHub Actions e2e workflow (`.github/workflows/e2e.yml`) builds once and runs file-level
shards, each with one Chromium worker and SwiftShader: up to 12, or 8 for the run after a merge.
The organisation runs 20 hosted jobs at a time, shared by all open pull requests.
`scripts/dev/plan-e2e-shards.ts` balances the shards with the minutes per spec in
`scripts/ci/e2e-minutes.ts`. Every run prints a "Spec timings" table in its summary, which is the
source for those minutes.
Hosted tests default to 640×360 and SwiftShader selects Niedrig, which
uses pixel ratio 1, shorter terrain and tree LOD distances, and no shadows. Touch layouts,
reference screenshots and render checks can specify their own viewport or graphics tier.
A check that raises the tier in `?manual` also boots with `&idle`: a Hoch frame takes tens of
seconds on a hosted runner, and each wait or screenshot otherwise queues behind several of them.
A newer run cancels the previous run for the same PR. Failed shards upload their HTML report,
traces with DOM snapshots, and still screenshots as an `e2e-results-*` artifact.

A failed test gets one retry on hosted runners; the campaign and the run on `main` after a merge
get none. A test that passes on its retry is reported as flaky (see "When main is red"). Local
runs never retry. The default test and
assertion timeouts and explicit test and screenshot timeouts are tripled through `ciScale` in
`e2e/helpers/ci.ts`. The campaign runs alone with a 240-minute Playwright deadline in a 270-minute
job. Other shards have 180 minutes inside a 205-minute job.

Hosted shards differ from a local run in two ways that tests must allow for. Full Chromium grants
pointer lock without a click, while the local headless shell never does. A test that needs to run
without the lock calls `kq.ctx.input.releaseLock()` and waits for `document.pointerLockElement` to
clear. Software frames also take up to a second, so wall-clock waits stretch:

- Poll frame-driven state with `expect.poll` and a `ciScale` timeout, not a fixed `waitForTimeout`.
- Measure HUD lines with wall-clock timers in the `page.evaluate` that shows them.
- Give CDP touch events their own `timestamp` (`Finger` in `e2e/touch.spec.ts`). Otherwise a slow
  acknowledgement stretches a tap past the 450 ms tap window.

Use the Actions tab or the command below to run selected spec names on a branch. Leave `specs`
blank to run the full suite. A run of selected specs reports as "End-to-end tests (manual
selection)", so it never stands in for the pull request's own check.

```sh
gh workflow run e2e.yml -f specs="chapter-k2 smoke" --ref <branch>
```

Wall-clock framerate checks and the walk performance sample run locally on a quiet machine.
The real-GPU suite and mobile UI tour have their own local configs. CI still runs the walk
behaviour, graphics settings, render budgets and first-input transfer budget checks.

The Playwright suites in `e2e/` drive a real browser. The release campaign uses
`?manual&faststep` on every load, including the mid-chapter save and continue.
Chapter 3 waits for skill cards to fade when it captures screenshots.
Use ordinary `?manual` when testing recorded audio or inspecting individual draws.

```sh
pnpm e2e --workers=1
```

Always use `--workers=1`: the game is GPU-heavy, and parallel workers produce flaky timings.
The preview server uses port 5281 by default (5281 + k inside `heavy.sh` slot k, see below). To
run suites from several checkouts at the same time, give each its own port, e.g.
`KQ_E2E_PORT=5301 pnpm e2e --workers=1`.

On a machine shared by several sessions, wrap heavy jobs (e2e, real-GPU screenshots, local model
runs) in `scripts/dev/heavy.sh`. It is a machine-wide lock with three slots (`KQ_HEAVY_SLOTS`,
default 3) and a first-come-first-served queue, so up to three normal jobs, such as SwiftShader
e2e specs, run at once. `scripts/dev/heavy.sh --status` shows each slot's holder and the queue.
Hold a slot for one spec file or one screenshot set at a time, never a whole multi-spec batch, so
short jobs can interleave:

```sh
for s in e2e/a.spec.ts e2e/b.spec.ts; do scripts/dev/heavy.sh -- pnpm exec playwright test "$s" --workers=1; done
```

Jobs that need a quiet machine pass `--exclusive`, which takes every slot: the walk, framerate
and perf specs, the real-GPU config (`playwright.gpu.config.ts`), real-GPU screenshot sets and
local model runs (MOSS / TTS). An exclusive job waits until all slots are free, and jobs queued
behind it wait as well, so it cannot starve:

```sh
scripts/dev/heavy.sh --exclusive --max-hold 10 -- pnpm exec playwright test e2e/framerate.spec.ts --workers=1
scripts/dev/heavy.sh --exclusive --max-hold 15 -- pnpm exec playwright test -c playwright.gpu.config.ts --workers=1
```

The real-GPU and fixed-port tools refuse a normal slot (exit 2), so run them `--exclusive`:
`scripts/dev/mobile-tour.ts` (mobile UI tour, port 5340), `scripts/dev/storyboard.mjs` (5370) and
`scripts/dev/look.mjs` (5602). Each also takes its port from the slot (base + k in slot k) unless
`KQ_MOBILE_PORT`, `KQ_STORYBOARD_PORT` or `KQ_LOOK_PORT` is set. `heavy.sh` passes the job
`KQ_HEAVY_SLOT` and `KQ_HEAVY_MODE` (`exclusive` or `normal`). The walk "d" perf, framerate and perf specs and
`playwright.gpu.config.ts` print a warning, but don't fail, when they run in a normal slot while other
slots are busy. In slot k ≥ 1 the Playwright artifacts and screenshots go to
`test-results/artifacts-slot<k>` and `test-results/screens-slot<k>`, so two jobs from the same checkout
never wipe or overwrite each other's files. Slot 0 and exclusive jobs keep `test-results/artifacts`
and `test-results/screens`.

Pass `--max-hold 15` or less. The merge gate (`KQ_HEAVY_OWNER=kq-integrate` or `kq-integrate-*`)
has a priority lane: it goes ahead of the queue, but after 2 priority holds in a row the oldest
waiting normal job gets the next hold. A priority job without `--max-hold` of 15 or less is refused
(exit 2); for everyone else a larger value only prints a warning. `--status` marks priority tickets
with `P` and exclusive tickets with `X`, and shows who is next.

To compare campaign timings, build once and run both modes with the same machine,
browser and port. Use Playwright’s reported durations so time in the lock queue is excluded.
Leave `CAMPAIGN_FROM` and `CAMPAIGN_TO` unset for a full release run.

```sh
pnpm build
for fast in 0 1; do
  CAMPAIGN_FASTSTEP=$fast KQ_E2E_PORT=5405 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/campaign.spec.ts --workers=1 --reporter=line || exit 1
done
```

Vitest prints a `FAIL` line with the file and case name for each failed test.
Capture both output streams when investigating a load flake, for example
`pnpm test --maxWorkers=1 >/tmp/kq-vitest.log 2>&1`.

## Project rules

These are not negotiable; pull requests that break them cannot be merged.

### Art assets: CC0, or licensed AI-generated

- Use only **CC0 1.0** assets, downloaded from the official sites: [Poly Haven](https://polyhaven.com),
  [ambientCG](https://ambientcg.com), [Kenney](https://kenney.nl),
  [Quaternius](https://quaternius.com) and [poly.pizza](https://poly.pizza) (with the CC0 filter).
- AI-generated assets are allowed when the generating tool's licence permits public redistribution of
  the output. Credit each file in `LICENSES.json` with the tool, model and version, date and licence;
  our own generated files are released as CC0. No likeness of a real living person without that
  person's consent; historical figures may be modelled from public-domain portraits.
- Voice clips in `public/voice/` use MOSS-TTS-v1.5 (OpenMOSS, Apache-2.0 model). Credit each voice in
  the `voices` list of `LICENSES.json`. Synthetic output is CC0. A real-person voice requires a
  named credit, written public consent in moss-service and an output licence limited to this game.
  `tests/voice-assets.test.ts` enforces the asset rules, including the exclusion of ElevenLabs output.
- Credit **every file** in [`public/assets/LICENSES.json`](public/assets/LICENSES.json) with its
  name, author and source URL. The entry then appears in the game under „Lizenzen & Quellen“.
- Treat downloaded archives as untrusted data: unpack them into a fresh, empty directory and never
  run scripts that come with them. Pack models and textures with the `pnpm assets:*` scripts.

### Facts and fiction

- Every historical or regional fact in the game needs a source.
- Invented parts are labelled **FIKTION** (in the codex and the Chronik). Real people only say and
  do what is documented.

### Original work only

No names, characters, lore, mechanics-by-name or assets from existing games or other franchises.
Inspiration is fine; copying is not.

### German in-game text

All player-facing strings (UI, dialogue, quests, codex) are German. Code, comments and commit
messages are English.

### Brands and trademarks

- Do **not** name the brewery brand that shares the Karlsberg name anywhere: not in code, content,
  docs, commit messages or issues. Write around it ("any brewery", "the real beer label").
- The only exception: the hidden bottle collectibles may carry the real beer label as a
  **swappable placeholder**: one constant or texture, plain text only, **no logo artwork**. It never
  appears in the codex, quests or dialogue. Don't name the brand anywhere else, and don't add any
  other brand logos or artwork to the repository.

## Story content

Most story packs in `content/` (`content/packs`, `content/quests`, `content/story`) are
**generated and committed**. Do not edit the generated JSON by hand. (Exceptions without a builder,
edited directly: the tour, `content/story/00-tour.story.json` and `content/packs/tour.pack.json`,
the party pack and the `99-test` files.) Instead:

1. Edit the builders in [`scripts/content-build/`](scripts/content-build/) (e.g. `kapitel1.mjs`
   and `codex.mjs`).
2. Re-run all builders:

   ```sh
   node scripts/content-build/build.mjs
   ```

3. Run `pnpm validate` (and `pnpm test`), then commit the builder changes together with the
   regenerated packs.

## Documentation

[`docs/PRD.md`](docs/PRD.md) and the other files in [`docs/`](docs/) are living documents; the current game
concept (the guided tour with time travel) is in [`docs/design/tour/README.md`](docs/design/tour/README.md). When you change
behaviour, content or design, update them in the same pull request:

- add a row to the log in [`docs/ACTION-RPG.md`](docs/ACTION-RPG.md) §14, and
- add an entry to the changelog table at the top of [`docs/PRD.md`](docs/PRD.md).

## Commit messages: Conventional Commits

Commit messages and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): summary`, in English, imperative, lower case after the colon.

```
feat(quelle): touching the spring starts the first time travel
fix(combat): Irrlichter stay hittable after a Bannlicht
docs(release): how to cut a release
```

- **Types:** `feat` (new for players), `fix` (bug fix), `perf` (faster or lighter), `refactor`,
  `docs`, `test`, `build`, `ci`, `chore`. A breaking change (e.g. old saves no longer load) gets a
  `!` after the type or scope, or a `BREAKING CHANGE:` footer.
- **Scopes** (optional): `story`, `quelle`, `combat`, `camera`, `touch`, `render`, `content`, `ui`,
  `release`, `env` (`main` is reserved for release-please's release PR). Pick the closest one or
  leave it out.
- **Merges into `main`** use `git merge --no-ff`, and the merge commit's summary is itself a
  conventional summary for the whole branch (e.g. `feat(touch): touch controls phase 1`), not
  "Merge branch …". On GitHub, use "Squash and merge" or keep the PR title as the merge summary.
  That summary is what release-please reads for `CHANGELOG.md` and the GitHub Release: `feat`,
  `fix`, `perf` and `docs` appear there; `refactor`, `test`, `build`, `ci` and `chore` stay hidden.
- The PR title is checked by the "PR title" workflow (`.github/workflows/pr-lint.yml`).

## Pull requests

- Open pull requests against `main`, with a Conventional Commits title (see above). Bundle related
  changes into one pull request, and open it as a draft until it is ready for review.
- "How a pull request merges" says what happens next: checks, review, the merge queue.
- Fill in the pull request template: gates, asset credits, FIKTION labels.
- For bugs, include the browser, GPU and URL flags, and if you can, the F8 note from the game.

## Reporting bugs and ideas

Use the issue forms (bug report or idea). For security issues, see [`SECURITY.md`](SECURITY.md);
do not open a public issue.
