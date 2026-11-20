# Reference material

This folder holds **research material** for the people, places and objects in Karlsberg Quest. Examples are historical portraits, plus notes on what they show and where they come from. It serves two purposes:

- references for the stylized 3D figures (the game's "digital twins"), and
- sourced facts for the in-game codex.

It is **not game content**:

- Nothing here is loaded by the game.
- Nothing here is copied into `public/`.
- Nothing here is published with the build. The Pages workflow uploads only `dist/`.
- Do not import these files into the game, and do not use them as textures.

Figures are modelled freshly in the project's own stylized look. They are not traced from or projected with these images.

## Licences: the images are not MIT

The repository's MIT licence covers the code and the project's own texts. It **does not cover the images in this folder**.

Each image has its own status, recorded in the `sources.json` next to it:

- artwork licence;
- reproduction licence;
- photographer or producer;
- exact credit line;
- a plain-words status note.

If you reuse an image, follow that entry. A CC BY-SA reproduction stays CC BY-SA after resizing, and needs its credit line. Entries with `"file": null` are **link-only**: their reproduction rights are unclear or restricted, so only the link and a description are kept here.

Only images in these categories were downloaded:

- the holder released them as CC0, Public Domain Mark, CC BY or CC BY-SA;
- they are scans of prints published so long ago that any photo right has expired.

## Why old paintings still need a licence check (German law)

The paintings themselves are long in the public domain. In Germany, though, a photograph of a painting can carry its own protection.

- **"Reiss-Engelhorn"** (BGH, 20 Dec 2018, I ZR 104/17): even a faithful photo of a two-dimensional artwork is protected as a *Lichtbild* under **§72 UrhG**. That protection lasts 50 years from publication, or from making if it was never published. A museum can also bind visitors by house rules not to photograph.
- **"Bibelreproduktion"** (BGH, 1989): a mere photocopy or scan of an existing printed reproduction creates no new protection. This is why the 1910 book plates here are treated as public domain: their photos were published in 1910, so §72 ended in 1960.
- **§68 UrhG** (since 7 June 2021, implementing Art. 14 of the EU DSM Directive): reproductions of public-domain visual works no longer get related rights such as §72. This applies at least to reproductions made from that date on. How it treats older photos is debated, and museum terms of use still apply. This folder therefore follows the cautious rule above and does not rely on §68 alone.

This is a practical summary for the team, not legal advice.

## Contents

- [`people/karl-ii-august/`](people/karl-ii-august/README.md): Duke Karl II. August of Pfalz-Zweibrücken (speaker `herzog`)
- [`people/mannlich/`](people/mannlich/README.md): Johann Christian von Mannlich (speaker `mannlich`)

Each person folder has:

- images (JPEG, about 1600 px on the long side, metadata stripped);
- `sources.json`, with one entry per image, including link-only ones;
- `README.md`, with:
  - an appearance brief per portrait;
  - a "Build summary" for the 3D figure;
  - sourced "Facts for the codex".

All sources were retrieved on 2026-11-20.
