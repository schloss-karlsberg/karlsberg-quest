# Content

Run `pnpm validate` to check regular `.pack.json` files and links to such files under `content/`.
Keep content subdirectories as real directories. Validation reports linked directories and
malformed packs by their paths relative to the project root.

To add yourself to the credits, add an entry to `people` in `credits.json` with your name, a German role and optional HTTP(S) links, for example `{ "name": "Dein Name", "role": "Übersetzung", "links": ["https://example.org"] }`.
