# Karlsberg Quest

A German-language action RPG that runs in the browser. It is set on the real terrain of the
Karlsberg near Homburg (Saarland). The landscape comes from open LiDAR elevation data and historic
maps. The palace of 1789 is a hypothetical reconstruction.

You take on quests from the people you meet, fight the shadows of the past and travel between five
eras: today, summer 1789, February and July 1793, and 1796. Along the way you learn real regional
history; invented parts are labelled as fiction in the in-game Chronik.

**Play:** https://schloss-karlsberg.github.io/karlsberg-quest/

> Independent fan project, not affiliated with the city of Homburg, the WaldPark Schloss Karlsberg,
> or any brewery.

## Browser requirements

- A current desktop browser with **WebGL 2**: tested in Chrome; Edge and Firefox should work,
  Safari is untested.
- A keyboard and a mouse. Touch and gamepad are not supported yet.
- A dedicated or recent integrated GPU is recommended. On weak hardware the game lowers its quality
  on its own. You can also force a quality tier with `?q=low`, `?q=med` or `?q=high`.
- The full game is about 55 MB; terrain and models load per area and era. Progress is saved in
  the browser's local storage.

## How to play

1. Click „Laterne entzünden“, then „Neues Feldbuch beginnen“, and enter a name.
2. Click into the game to capture the mouse. Press Esc to open the pause menu.

| Action | Keys |
| --- | --- |
| Move / sprint / dodge | W A S D · Shift · Space |
| Attack (hold for Wuchthieb) | Left mouse or K |
| Bannlicht | Right mouse or G |
| Balsam (heal) | H |
| Interact / talk | E |
| Era shift | Q |
| Lock on | Tab or middle mouse |
| Geisterblick | F |
| Inventory / journal / map | I · J · M |
| Lantern | L |
| First / third person | F5 · mouse wheel to zoom |
| Turn without the mouse | ← / → |

## Development

```sh
pnpm install
pnpm dev          # http://localhost:5280
pnpm typecheck && pnpm test && pnpm validate && pnpm build
```

Built with Vite, TypeScript and three.js. The design documents live in [`PRD.md`](PRD.md) and
[`docs/`](docs/). Releases are built by GitHub Actions (`.github/workflows/pages.yml`); see
[`docs/RELEASE.md`](docs/RELEASE.md).

## Credits

The full list is in the game, under „Lizenzen & Quellen“ (title screen and pause menu).

- **Terrain, vegetation height, point cloud:** © GeoBasis-DE/LVGL-SL (2026), Landesamt für
  Vermessung, Geoinformation und Landentwicklung Saarland,
  [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0); data processed. The 1789 terrain is a
  hypothesis derived from it.
- **Historic maps** (Bavarian survey sheets 1836–41, TK25 1935–40): Geoportal Saarland, © GeoBasis-DE/LVGL-SL
  (2026), [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0); data processed.
- **Paths, water and places:** © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
  ODbL 1.0.
- **Palace reconstruction 1789:** a hypothesis; floor plans partly after the 2006 site plan from
  schloss-carlsberg.de (CC BY-SA 2.0 DE).
- **3D models and textures:** CC0 1.0 from [Poly Haven](https://polyhaven.com) and
  [poly.pizza](https://poly.pizza) (Kenney, Quaternius and others). Every file is listed with its
  author and source in [`public/assets/LICENSES.json`](public/assets/LICENSES.json).
- **Fonts:** IM Fell English (Igino Marini) and Caveat (The Caveat Project Authors), SIL Open Font
  License 1.1 ([`src/ui/fonts/`](src/ui/fonts/)).
- **Sound:** all sounds are generated in the browser (Web Audio).
- **Libraries:** [three.js](https://threejs.org) (MIT); the Draco and Basis Universal decoders
  (Apache-2.0).

## Licence

**Code licence: TODO, the owner decides** (for example MIT, or all rights reserved).

Third-party data and assets keep their own licences (see Credits). The game's story, characters
and texts are original works.
