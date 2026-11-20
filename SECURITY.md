# Security policy

## Reporting a vulnerability

Please report security issues **privately** through GitHub's private vulnerability reporting:
open the repository, go to **Security → Report a vulnerability**, and describe the issue. Do not
open a public issue for a security problem.

The maintainers of the schloss-karlsberg GitHub organisation will acknowledge the report, keep you
informed and credit you in the fix if you wish. This is a volunteer project, so please allow some
time for a response.

## What Karlsberg Quest is

Karlsberg Quest is a **static website**: HTML, JavaScript, data and assets served from GitHub Pages.
There is no server-side code, no backend, no database, no user accounts and no login. The game
sends no data anywhere; progress, settings and F8 notes stay in the browser (local storage and
IndexedDB).

## In scope

- Cross-site scripting or HTML injection in the game, e.g. through a URL parameter, a player name,
  an imported save or note, or content rendered from the data files.
- Anything that makes the published site load or run code from a third party.
- Malicious or tampered files in the repository or the build output (assets, data, decoders), and
  problems in the build and deploy workflow (`.github/workflows/`) such as leaked secrets or
  injectable workflow inputs.
- Vulnerable bundled dependencies (three.js and the decoders it ships) that are reachable in the game.

## Out of scope

- The debug API `window.kq` and the URL testing flags (`?debug`, `?kapitel=`, `?era=`, `?x=&z=`,
  `?manual`). They are intentionally available in production; cheating in a single-player game is
  not a security issue.
- Changing your own save in your own browser.
- GitHub Pages itself (hosting, TLS, headers): report those to GitHub.
- Denial of service through very weak hardware, or the browser's own WebGL bugs.
- Findings from automated scanners without a demonstrated impact.

## Supported versions

Only the current site (built from `main`) is supported.
