## What and why

<!-- What does this change, and why? Link issues with "Fixes #123". -->

## Gates

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm validate`
- [ ] `pnpm build`
- [ ] E2E run if gameplay changed (`pnpm e2e --workers=1`, which suites):

## Content and assets

- [ ] New or changed art assets are CC0 1.0 from an allowed site, and every file is credited in
      `public/assets/LICENSES.json` (name, author, source URL). Or: no new assets.
- [ ] Historical or regional facts have a source; invented parts are labelled **FIKTION**.
- [ ] Original work only: no names, lore or assets from existing games.
- [ ] In-game text is German.
- [ ] No real brand names, logos or artwork (the only exception is the bottle placeholder label;
      see CONTRIBUTING.md → Brands and trademarks).
- [ ] Story changes were made in `scripts/content-build/`, re-generated with
      `node scripts/content-build/build.mjs`, and the packs are committed.
- [ ] Docs updated if behaviour or design changed (`docs/ACTION-RPG.md` §14, `PRD.md` changelog).

## Screenshots / notes

<!-- Optional: before/after screenshots, GPU used for testing, F8 notes. -->
