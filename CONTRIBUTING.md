# Contributing to Karlsberg Quest

Thanks for your interest. Karlsberg Quest is a German-language action RPG for the browser, built
with Vite, TypeScript (strict) and three.js. This guide is in English; **everything the player sees
in the game is German**.

By contributing you agree that your code and texts are released under the MIT License (see
[`LICENSE`](LICENSE)) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).

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
| `?kapitel=2\|3\|4` | A new game starts at that chapter, with matching skills and level |
| `?era=1789` | Start in that era: `today`, `1789`, `1793-02`, `1793-07`, `1796` |
| `?x=…&z=…` | Start at a local position |
| `?manual` | Bullet time: the game advances only when stepped |
| `window.kq` | Debug API in the browser console: teleport, set the era, step, press keys, combat hooks |
| `kq.pilot` | Scripted play on top of `window.kq`: act, observe, choose, `bulletTime(true)`, `showStrip(true)` |
| F8 (in game) | Write a playtest note with the current position and state; export it from the pause menu |

## The four gates

Run all four before you open a pull request. CI runs the same checks.

```sh
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest unit tests
pnpm validate     # content validation (packs, quests, story)
pnpm build        # production build
```

### End-to-end tests

The Playwright suites in `e2e/` build the game and drive a real browser. They are a regression
net, not a gate, and some suites (the full campaign) take about an hour.

```sh
pnpm e2e --workers=1
```

Always use `--workers=1`: the game is GPU-heavy, and parallel workers produce flaky timings.
The preview server uses port 5281 by default. To run suites from several checkouts at the same
time, give each its own port, e.g. `KQ_E2E_PORT=5301 pnpm e2e --workers=1`.

## Project rules

These are not negotiable; pull requests that break them cannot be merged.

### Art assets: CC0 only

- Use only **CC0 1.0** assets, downloaded from the official sites: [Poly Haven](https://polyhaven.com),
  [ambientCG](https://ambientcg.com), [Kenney](https://kenney.nl),
  [Quaternius](https://quaternius.com) and [poly.pizza](https://poly.pizza) (with the CC0 filter).
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

The story packs in `content/` (`content/packs`, `content/quests`, `content/story`) are
**generated and committed**. Do not edit the generated JSON by hand. Instead:

1. Edit the builders in [`scripts/content-build/`](scripts/content-build/) (e.g. `prolog.mjs`,
   `kapitel1.mjs`, `codex.mjs`).
2. Re-run all builders:

   ```sh
   node scripts/content-build/build.mjs
   ```

3. Run `pnpm validate` (and `pnpm test`), then commit the builder changes together with the
   regenerated packs.

## Documentation

[`PRD.md`](PRD.md) and the files in [`docs/`](docs/) are living documents. When you change
behaviour, content or design, update them in the same pull request:

- add a row to the log in [`docs/ACTION-RPG.md`](docs/ACTION-RPG.md) §14, and
- add an entry to the changelog table at the top of [`PRD.md`](PRD.md).

## Pull requests

- Open pull requests against `main`. Keep them focused on one topic.
- CI runs typecheck, unit tests, content validation and the build.
- Fill in the pull request template: gates, asset credits, FIKTION labels.
- For bugs, include the browser, GPU and URL flags, and if you can, the F8 note from the game.

## Reporting bugs and ideas

Use the issue forms (bug report or idea). For security issues, see [`SECURITY.md`](SECURITY.md);
do not open a public issue.
