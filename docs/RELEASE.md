# Release to GitHub Pages — checklist

Target: `https://schloss-karlsberg.github.io/karlsberg-quest/` (org `schloss-karlsberg`, public repo
`karlsberg-quest`). The workflow is `.github/workflows/pages.yml`. On every push to `main` (or a
manual run) it does: install → typecheck, unit tests, content validation → `pnpm build` → deploy
`dist`. E2E tests do not run in CI. Vite uses `base: './'`, so the sub-path needs no config.

Prepared 2026-11-20 on branch `release/pages-prep`; nothing has been pushed.

## 1. Owner decisions (before the first push)

- [ ] **Code licence:** MIT, all rights reserved, or something else. Fill in the README "Licence"
      section, add a `LICENSE` file, and update `licences.code` in `src/i18n/de.ts`. That string
      currently says "Karlsberg Quest (Open-Kirrberg)".
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
- [ ] **Release flag** (see §4): ship with the `window.kq` debug API and URL cheats, or gate them first.
- [ ] **CC BY-SA 2.0 DE share-alike:** the palace footprints are partly based on the
      schloss-carlsberg.de site plan (CC BY-SA 2.0 DE). Derived files (`public/data/palace/*`) may need
      to be offered under CC BY-SA too. State that in the README / credits, or replace the source.

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

## 4. Release build hygiene (open)

Today the production build exposes:

- **`window.kq`** — always installed (`src/debug/hooks.ts`, `installDebug` from `src/boot.ts`). It
  allows teleporting, setting the era, `step` / `press`, combat hooks (hurt / heal / restore), the
  pilot API and spawning assets. Anyone with the console can cheat. That is harmless for a
  single-player game, but it is still a cheat surface.
- **URL flags** — `?debug` (stats panel, skips the title, never pauses), `?kapitel=2|3|4` (a new game
  starts at that chapter with skills and level), `?era=`, `?x=&z=` (teleport) and `?manual`
  (bullet time).

Suggestion: add a build-time switch `VITE_KQ_RELEASE=1`, set in the workflow's build step.

- In `src/boot.ts` (around `const debug = params.has('debug')`) ignore `debug`, `kapitel`, `x/z`,
  `manual` when `import.meta.env.VITE_KQ_RELEASE` is set. Keep `q`, `cam`, `nosave`, `fresh`.
- Install `window.kq` only when not in release mode, or install a reduced read-only set.
  The e2e suites and the pilot need the full API, so e2e must build without the flag.
- **Bottle labels:** once the hidden bottle collectibles exist, the label texture should come
  through one resolver. In release mode it is forced to the invented label (owner decision, see
  docs/NEXT-SESSION.md). There is no collectibles code yet, so the hook point is planned: a
  `labelFor(collectible)` in the future collectibles system that checks `VITE_KQ_RELEASE`. No real
  brand art goes into `public/`.

## 5. Credits status (2026-11-20)

These are covered: every CC0 asset (86 entries in `public/assets/LICENSES.json`; every file under
`public/assets` is listed), DGM1 / DOM1 / ALS point cloud and the historic maps (© GeoBasis-DE/LVGL-SL,
dl-de/by-2-0, `public/data/attribution.json`), OSM (ODbL), the fonts (OFL 1.1, text string) and Web Audio.

Gaps, in order:

- **three.js (MIT)** is not credited in the game. `LICENSES.json` → `libraries` lists only Draco
  and Basis. Add it.
- **OFL licence texts** are not shipped with the build. The woff2 files are in `dist/app/`, but
  `OFL-*.txt` stay in `src/ui/fonts`. Copy them to `public/licences/`, or link to them from the credits.
- **dl-de/by-2-0 link:** the in-game items carry the URL only for the DGM entry. Optionally add
  `www.lvgl.saarland.de` and the licence URL to every LVGL item. The LVGL DGM1 metadata gives the
  source note as "© LVGL <Jahr>, dl-de/by-2-0, www.lvgl.saarland.de".
- **CC BY-SA 2.0 DE** share-alike (see §1).
