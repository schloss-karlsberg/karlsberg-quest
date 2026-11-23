# Release to GitHub Pages — checklist

Target: `https://schloss-karlsberg.github.io/karlsberg-quest/` (org `schloss-karlsberg`, public repo
`karlsberg-quest`). The workflow is `.github/workflows/pages.yml`. On every push to `main` (or a
manual run) it does: install → typecheck, unit tests, content validation → `pnpm build` → deploy
`dist`. E2E tests do not run in CI. Vite uses `base: './'`, so the sub-path needs no config.

Prepared 2026-11-20 on branch `release/pages-prep`. The repo went public on 2026-11-20; the first
public commit is `3f650214fa5f66b4b6ccd8f999713fe80e0587e7`. §§0a–0c below are the current flow;
§§1–5 are the original first-push checklist, kept for the record.

## 0a. Publishing local main (until the one-time in-place rewrite)

The public history is a **rewritten copy** of local `main`: author emails mapped to the GitHub
noreply address, a few personal strings scrubbed (`scripts/release/rewrite-history.sh`, rule files
untracked in the main checkout's `scripts/release/private/`). Public SHAs therefore differ from
local ones. The rewrite is deterministic, so rewriting a fresh clone again gives the same public
SHAs for the old commits and the push is a plain fast-forward. `scripts/release/publish.sh` does it:

```sh
scripts/release/publish.sh --dry-run   # everything up to the fast-forward check, no push
scripts/release/publish.sh             # the same, then `git push origin main`
```

1. makes a temp dir under `$TMPDIR` and clones `main` only (`git clone --no-local`);
2. copies `mailmap.txt` and `replace-text.txt` from `<toplevel>/scripts/release/private/` (falling
   back to the main checkout's copy when run from a worktree);
3. runs `rewrite-history.sh` in the clone (its backup bundle and rule-file copy land in the temp
   dir, which is deleted at the end; `--keep` keeps it);
4. verifies: only noreply emails, no `.env` in any commit, no hit for any replace-text pattern
   (or the old email) in any blob or commit message;
5. adds `origin` (https://github.com/schloss-karlsberg/karlsberg-quest.git) **in the temp clone
   only**, fetches `origin/main`, and requires `git merge-base --is-ancestor origin/main HEAD`;
   otherwise it aborts and pushes nothing. It **never force-pushes**;
6. `git push origin main` (needs push access: `gh auth login` or a credential helper).

Run it after the four gates pass on local `main`. The push triggers the Pages workflow (deploy) and
the Release workflow (release PR, below).

**Caveat: commits made on GitHub.** Anything merged on GitHub (a release-please PR, a contributor
PR) exists only in the public history; local `main` does not have it, so the next `publish.sh`
aborts (not a fast-forward). Until the one-time in-place rewrite, keep `main` on GitHub
push-only: bring contributor changes in locally (e.g. apply the PR's patch on a local branch,
merge `--no-ff` with a conventional summary, publish), and **cut the first release only after the
in-place rewrite** (or accept merging the release PR as the last GitHub-side change before that
rewrite). After the in-place rewrite, local and public SHAs match: `git pull --ff-only` and
`git push` replace this script.

## 0b. Cutting a release (release-please)

`.github/workflows/release.yml` runs `googleapis/release-please-action@v4` on every push to `main`
(config `release-please-config.json`, manifest `.release-please-manifest.json`, release type
`node`, package at `.`). It reads the Conventional Commits (CONTRIBUTING.md) since the last
release (for the first one: since `bootstrap-sha` = the first public commit) and keeps one open
**release PR** "chore(main): release X.Y.Z" with the new `CHANGELOG.md` entry (sections Features,
Bug Fixes, Performance, Documentation; `chore`, `test`, `ci`, `build`, `refactor` hidden), the
bumped `package.json` "version" and the manifest.

To release:

1. Write the player notes `content/release-notes/vX.Y.Z.md` (German, player language, sections
   „Neu“, „Besser“, „Behoben“; no internal jargon, never the brewery brand) and commit them **into
   the release PR's branch** before merging (or on `main` before the PR is merged). A unit test
   checks the file name and the three sections.
2. Merge the release PR. release-please tags `vX.Y.Z` and creates the GitHub Release with the
   generated changelog.
3. The same workflow then reads `content/release-notes/vX.Y.Z.md` and puts it on top of the
   Release body under „## Für Spielerinnen und Spieler“ (`gh release view` / `gh release edit
   --notes-file`). A missing file only gives a warning.
4. The merge is a push to `main`, so Pages redeploys: the title screen shows „Version X.Y.Z ·
   Build <sha>“ and the „Neuigkeiten“ badge, and `neu.html` lists the new notes.

New PRD changelog rows say `unreleased` until release-please cuts the version; the release PR relabels them.

**First release:** the manifest says `0.1.0` (the current `package.json` version) and the config
pins `"release-as": "0.5.0"`. **Remove `release-as` from `release-please-config.json` after v0.5.0
has shipped**, or every later release PR stays at 0.5.0. From then on the version follows the
commits (`feat` → minor, `fix` → patch while below 1.0).

Repo settings: Settings → Actions → General → Workflow permissions → **"Allow GitHub Actions to
create and approve pull requests"** must be on, or release-please cannot open its PR. PRs opened
with the workflow token do not trigger other workflows (no PR-title check on the release PR).

## 0c. Version in the game and on the site

- `vite.config.ts` injects the `package.json` version and `git rev-parse --short HEAD` (fallback
  `dev`) via `define` (`src/buildInfo.ts`); only these two literals reach the bundle, never an
  environment variable. The published build shows the public (rewritten) SHA.
- The title screen's „Neuigkeiten“ opens all `content/release-notes/*.md` (bundled with
  `import.meta.glob`, newest first, a small safe markdown subset); a dot badge shows until the
  newest version was opened (localStorage `kq.news.seen`).
- `neu.html` (https://schloss-karlsberg.github.io/karlsberg-quest/neu.html) is generated from the
  same files by a small plugin in `vite.config.ts` during `pnpm build` (dev: served at `/neu.html`).

## 1. Owner decisions (before the first push)

- [x] **Code licence: decided, MIT.** `LICENSE` ("Copyright (c) 2026 Karlsberg Quest contributors"),
      the README "Licence" section and `licences.code` in `src/i18n/de.ts` are updated.
- [ ] **Commit author email:** all commits so far use one personal address. It becomes public on
      push. Options:
      - push as is;
      - set a GitHub noreply address for future commits (`git config user.email <id>+<login>@users.noreply.github.com`);
      - or rewrite the history before the first push (for example `git filter-repo --mailmap`).
        Rewriting changes every hash, and the docs cite hashes.
- [ ] **Internal docs in a public repo:** `docs/NEXT-SESSION.md` and `research/02-sister-projects.md`
      contain local absolute paths (`/Users/<name>/…`) and the owner's first name. `IDEA.md` (now `docs/archive/IDEA.md`) names a
      commercial game as genre inspiration. Agent handoff notes are part of the history.
      - Keep them as they are, trim them, or publish from a clean squashed repo.
- [x] **Release flag: decided.** The debug API stays on (community project); see §4.
- [x] **CC BY-SA 2.0 DE share-alike: resolved.** The palace footprints are partly based on the
      schloss-carlsberg.de site plan (CC BY-SA 2.0 DE). The README "Licence" section states that the
      derived palace data in `public/data/palace/` is offered under CC BY-SA 2.0 DE as well.

## 2. GitHub setup

1. [ ] Create the organisation **schloss-karlsberg** (github.com → Your organizations → New, Free plan).
2. [ ] Create the **public** repo `schloss-karlsberg/karlsberg-quest`. Leave it empty: no README,
   no licence, no .gitignore.
3. [ ] Repo → Settings → Pages → **Build and deployment → Source = "GitHub Actions"**.
4. [ ] Optional: Settings → Actions → General → allow GitHub Actions (on by default for new repos).

## 3. Push (first push, done; later pushes: §0a)

```sh
git checkout main
git merge --no-ff release/pages-prep        # after review
git remote add origin git@github.com:schloss-karlsberg/karlsberg-quest.git
git push -u origin main
```

- [ ] Watch Actions → "Pages": check → build → deploy. The deploy job prints the URL.
- [ ] Open the site and run a smoke test. A new game should reach the first fight. „Lizenzen & Quellen“
      should list all items. No console errors (assets load from the `/karlsberg-quest/` sub-path).
- [ ] Optional: add the URL to the repo's About box and topics (`threejs`, `webgl`, `game`, `saarland`).

## 4. Release build hygiene (decided)

**Decided: the debug API stays on (community project).** The production build keeps:

- **`window.kq`**, always installed (`src/debug/hooks.ts`, `installDebug` from `src/boot.ts`):
  teleporting, setting the era, `step` / `press`, combat hooks, the `kq.pilot` API, spawning assets.
- **URL flags:** `?debug`, `?kapitel=2|3|4`, `?era=`, `?x=&z=`, `?manual` (bullet time).

They are testing aids for contributors and are documented in `CONTRIBUTING.md`. In a
single-player game they harm nobody.

**Future option:** a build-time switch `VITE_KQ_RELEASE=1`, set in the workflow's build step. It is
not needed for the debug API, but it is the planned hook for the **bottle-label swap**: once the
hidden bottle collectibles exist, their label texture comes through one resolver (a
`labelFor(collectible)` in the future collectibles system) that can check the flag. Owner decision
2026-11-20: the bottles carry the real label publicly as a swappable placeholder (plain text, no logo
artwork, never in codex / quests / dialogue); a unit test keeps the label text in one collectibles
file so the swap stays one edit (docs/NEXT-SESSION.md §5). The e2e
suites and the pilot need the full API, so e2e would build without the flag.

## 5. Credits status (2026-11-20)

These are covered: every CC0 asset (86 entries in `public/assets/LICENSES.json`; every file under
`public/assets` is listed), DGM1 / DOM1 / ALS point cloud and the historic maps (© GeoBasis-DE/LVGL-SL,
dl-de/by-2-0, `public/data/attribution.json`), OSM (ODbL), the fonts (OFL 1.1, text string) and Web Audio.

Former gaps, all fixed on `release/pages-prep`:

- [x] **three.js (MIT)** and the other libraries bundled from its examples (meshoptimizer decoder,
      KTX-Parse, zstddec: MIT; Draco, Basis Universal: Apache-2.0) are in `LICENSES.json` →
      `libraries`, shown in the game and in the README credits. No other production dependency is
      bundled (no fflate).
- [x] **OFL licence texts** ship with the build: `public/fonts/OFL-*.txt` → `dist/fonts/`, linked
      from the fonts line in „Lizenzen & Quellen“.
- [x] **CC BY-SA 2.0 DE** share-alike: the README licence section names the derived files
      (`public/data/palace/footprints.json`, `buildings.glb`, `rooms.json`); the `recon` item in
      `public/data/attribution.json` (and `scripts/prepare-data.ts`) carries the licence link and
      the file list, shown in the game.
- [ ] Optional, still open: add `www.lvgl.saarland.de` and the licence URL to every LVGL item (the
      in-game items carry the URL only for the DGM entry). The LVGL DGM1 metadata gives the source
      note as "© LVGL <Jahr>, dl-de/by-2-0, www.lvgl.saarland.de".
