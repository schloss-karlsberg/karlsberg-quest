# Release to GitHub Pages — checklist

Target: `https://schloss-karlsberg.github.io/karlsberg-quest/` (org `schloss-karlsberg`, public repo
`karlsberg-quest`). The workflow is `.github/workflows/pages.yml`. On every push to `main` (or a
manual run) it does: install → typecheck, unit tests, content validation → `pnpm build` → deploy
`dist`. E2E tests do not run in CI. Vite uses `base: './'`, so the sub-path needs no config.

Prepared 2026-11-20 on branch `release/pages-prep`; nothing has been pushed.

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
      contain local absolute paths (`/Users/<name>/…`) and the owner's first name. `IDEA.md` names a
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

## 3. Push

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
