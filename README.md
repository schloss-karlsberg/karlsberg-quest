# Karlsberg Quest

A German-language action RPG that runs in the browser. It is set on the real terrain of the
Karlsberg near Homburg (Saarland). The landscape comes from open LiDAR elevation data and historic
maps. The palace of 1789 is a hypothetical reconstruction.

You start as a visitor on a guided tour of the Karlsberg one November afternoon. At the
Karlsbergquelle the time travel begins: you take on quests from the people you meet, fight the
shadows of the past and travel between five eras: today, summer 1789, February and July 1793, and
1796. Every ending closes with a party. Along the way you learn real regional history; invented
parts are labelled as fiction in the Codex.

**Play:** https://schloss-karlsberg.github.io/karlsberg-quest/ ·
**What's new (German):** [Neuigkeiten](https://schloss-karlsberg.github.io/karlsberg-quest/neu.html)

> Trademarks belong to their owners. This independent fan project is not affiliated with or
> endorsed by the city of Homburg, the WaldPark Schloss Karlsberg, or any brewery.

## Browser requirements

- A current desktop browser with **WebGL 2**: tested in Chrome; Edge and Firefox should work,
  Safari is untested.
- A keyboard and a mouse, or touch on phones and tablets in landscape. Gamepad is not supported yet.
- A dedicated or recent integrated GPU is recommended. On weak hardware the game lowers its quality
  on its own. You can also force a quality tier with `?q=low`, `?q=med` or `?q=high`.
- The full game is about 55 MB; terrain and models load per area and era. Progress is saved in
  the browser's local storage.

## How to play

1. Choose „Neues Spiel“ on the „Schloss Karlsberg Tour“ title screen. Read the content note,
   enter your name, then select „Tour starten“ on the route map to begin with sound. Choose
   „Weiter“ on the title screen to load a saved game.
2. Click into the game to capture the mouse. Press Esc or tap Pause to open the menu. Choose
   „Speichern“ to save. Pause also opens Aufgaben, Codex, Sammlungen, Funde, Ausrüstung, Talente,
   Karte and Album.
3. A new game opens with the guided tour: follow the guide, talk to people and take photos. The
   tour has no fighting. Marlene lends you the Messstab at the Weiher. At the
   Karlsbergquelle, touch the water to travel to 1789.

| Action | Keys |
| --- | --- |
| Move / sprint | W A S D · Shift |
| Crouch (sneak) | C |
| Interact / talk | E |
| Smartphone camera (in the present) | N |
| First / third person | F5 · mouse wheel to zoom |
| Turn without the mouse | ← / → |

From the time travel on:

| Action | Keys |
| --- | --- |
| Dodge | Space |
| Attack (hold for Wuchthieb) | Left mouse or K |
| Bannlicht | Right mouse or G |
| Balsam (heal) | H |
| Era shift (hold to return to the Karlsbergquelle) | Q |
| Lock on | Tab or middle mouse |
| Inventory | I |
| Lantern | L |

### Survey tools

| Action | Keys |
| --- | --- |
| Geisterblick (present day) | 1 |
| Cycle unlocked Relief modes | 2 · Shift+2 backwards · ^ off |
| Measure | 3 |
| Röntgenblick | 4 |
| Planblatt | 5 |
| Map | M |

On touch, tap „Erkunden“ for the six survey tools.

## Development

```sh
pnpm install
pnpm dev          # http://localhost:5280
pnpm typecheck && pnpm test && pnpm validate && pnpm build
```

Built with Vite, TypeScript and three.js. The design documents live in [`docs/`](docs/): start with
[`docs/design/tour/README.md`](docs/design/tour/README.md) (the current concept), then
[`docs/PRD.md`](docs/PRD.md). Every push to `main` is deployed by GitHub Actions (`.github/workflows/pages.yml`);
versions, the changelog and the player notes (`content/release-notes/`, shown in the game under
„Neuigkeiten“ and on `neu.html`) come from release-please; see [`docs/RELEASE.md`](docs/RELEASE.md).

- [Storyboard](docs/storyboard/) — **Spoiler**: every beat, place and creature, illustrated (the prologue pictures still show the game's earlier concept).

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
  schloss-carlsberg.de ([CC BY-SA 2.0 DE](https://creativecommons.org/licenses/by-sa/2.0/de/)).
  The palace data files derived from it are CC BY-SA 2.0 DE, not MIT (see Licence).
- **3D models and textures:** CC0 1.0 from [Poly Haven](https://polyhaven.com) and
  [poly.pizza](https://poly.pizza) (Kenney, Quaternius and others). Every file is listed with its
  author and source in [`public/assets/LICENSES.json`](public/assets/LICENSES.json).
- **Fonts:** IM Fell English (Igino Marini) and Caveat (The Caveat Project Authors), SIL Open Font
  License 1.1. The licence texts are in [`public/fonts/`](public/fonts/) (shipped with the site as
  `fonts/OFL-*.txt` and linked from „Lizenzen & Quellen“); the originals sit next to the font files in
  [`src/ui/fonts/`](src/ui/fonts/).
- **Sound:** The browser synthesizes effects and ambience with Web Audio. Dialogue uses voice clips
  generated locally with MOSS-TTS-v1.5. Synthetic voices are CC0. Jan Eric Rippel licensed his
  voice for the player in Karlsberg Quest only. [Voice credits](public/assets/LICENSES.json)
- **Libraries:** [three.js](https://threejs.org) (MIT, © 2010-2026 three.js authors), including
  from its examples the meshoptimizer decoder (MIT), KTX-Parse and zstddec (MIT), and the Draco and
  Basis Universal decoders (Apache-2.0). Listed under `libraries` in
  [`public/assets/LICENSES.json`](public/assets/LICENSES.json).

## Licence

- **Code and the project's own content** (source code, story, characters, dialogue, codex and
  other texts written for this project) are released under the **MIT License**; see
  [`LICENSE`](LICENSE).
- **Third-party art assets** keep their own licence: **CC0 1.0**. Every file is listed with its
  author and source in [`public/assets/LICENSES.json`](public/assets/LICENSES.json).
- **Geodata:** the Saarland terrain (DGM1, DOM1, ALS point cloud) and the historic maps from the
  Geoportal Saarland are © GeoBasis-DE/LVGL-SL, licensed under the
  [Datenlizenz Deutschland – Namensnennung – Version 2.0](https://www.govdata.de/dl-de/by-2-0)
  (dl-de/by-2-0); data processed. OpenStreetMap data is
  © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL 1.0.
- **Palace data:** the palace floor plans are partly based on the 2006 site plan from
  schloss-carlsberg.de (CC BY-SA 2.0 DE). The derived palace data is therefore offered under
  [CC BY-SA 2.0 DE](https://creativecommons.org/licenses/by-sa/2.0/de/) as well. **These files are
  not MIT:**
  - [`public/data/palace/footprints.json`](public/data/palace/footprints.json): the building
    footprints, partly traced after the site plan;
  - [`public/data/palace/buildings.glb`](public/data/palace/buildings.glb): the 1789 model built
    on those footprints;
  - [`public/data/palace/rooms.json`](public/data/palace/rooms.json): the room outlines laid out
    inside them.

  Attribution: „Grundrisse teils nach Lageplan 2006, schloss-carlsberg.de“, CC BY-SA 2.0 DE. The
  `recon` entry in [`public/data/attribution.json`](public/data/attribution.json) lists the same files.
  The MIT code is unaffected.
- **Fonts:** SIL Open Font License 1.1; the licence texts are in [`src/ui/fonts/`](src/ui/fonts/)
  and, for the published site, in [`public/fonts/`](public/fonts/).
- **Libraries:** three.js and the bundled decoders keep their licences (MIT, Apache-2.0; see Credits).

Contributions are welcome; see [`CONTRIBUTING.md`](CONTRIBUTING.md) and the
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Security issues: [`SECURITY.md`](SECURITY.md).
