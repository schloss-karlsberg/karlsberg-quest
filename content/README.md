# Content

Run `pnpm validate` to check pack files discovered recursively under `content/`. An entry ending
in `.pack.json` must be a regular file or a symbolic link to a regular file. A malformed file is
reported by its path relative to the project root.

To add yourself to the credits, add an entry to `people` in `credits.json` with your name, a German role and optional HTTP(S) links, for example `{ "name": "Dein Name", "role": "Übersetzung", "links": ["https://example.org"] }`.
