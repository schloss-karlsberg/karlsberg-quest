# karlsberg-quest — idea for a fun learning RPG

> Status: **idea only** (2026-11-02). Research and design come later, with another agent. Working title: **"Saarpfalz-Chroniken"** (German UI).
> Sister projects (both active, **other agents are working on them — don't modify them from here**):
> - [`../saar-lidar-explorer`](../saar-lidar-explorer): 3D LiDAR explorer of Homburg / Kirrberg / Karlsberg (terrain, relief, maps, buildings, point clouds, relict candidates, mobile, 3D print).
> - [`../saar-lidar-explorer/schloss-karlsberg`](../saar-lidar-explorer/schloss-karlsberg): researched 3D reconstruction of Schloss Karlsberg in summer 1789 (fly + walk viewer, interiors, plans).
> - [`../saar-lidar-detect`](../saar-lidar-detect): idea for a relict/crater detection service.

## 1. One-liner

A **role-playing exploration game in the real landscape around Homburg, Kirrberg and Karlsberg**, built on real LiDAR terrain, historic maps and the 1789 palace reconstruction. Players travel through time, take on quests, collect finds and knowledge, unlock "skills" such as reading LiDAR relief, and **learn real regional history, archaeology and geography while playing**.

Genre inspiration: classic online RPGs such as World of Warcraft (quest givers, quest chains, zones, collections, professions, achievements, a journal). **Only the genre is borrowed: no names, lore, classes, UI look or assets from any existing game.** Setting, characters and art are original and grounded in local history.

## 2. Why this is interesting

- The data is unusually good and already processed:
  - real 1 m terrain with hidden relicts under the forest;
  - historic maps from 1836–41 and 1935–40;
  - a walkable, evidence-tagged reconstruction of a palace that burned in 1793.
- Learning sticks better through doing: "find the moat in the relief", "compare the 1840 map with today", "walk the Orangerie as it was in 1789".
- It is local identity content for the Open-Kirrberg community (schools, clubs, families, tourism) and can be published on GitHub Pages like the explorer.

## 3. Pillars

1. **Explore:** fly and walk the real landscape; time-travel between eras.
2. **Discover:** quests teach players to *see*: relief modes, old maps, measuring, comparing then and now.
3. **Collect:** virtual finds, codex cards, maps, portraits; all backed by real facts and sources.
4. **Understand:** every piece of content says what is known, what is a hypothesis, and where it comes from.
5. **Respect:** heritage protection is part of the game's message ("Schauen, nicht graben"), never an afterthought.

## 4. Game concept (first sketch)

### World & eras ("Zeitreise")
The same map in several time layers, switched by a "Chronik-Kompass" item:

| Era | Places in the data | Possible content |
|---|---|---|
| Prehistory / Celtic | Burial mounds (e.g. the Rabenhorst group), ring walls in the region | Burial customs, how mounds look in LiDAR, the Hallstatt/La Tène periods |
| Roman | Roads, villa sites, field systems (as far as the sources support) | Roman roads, the villa rustica, trade |
| Middle Ages | Merburg (Kirrberg), Hohenburg / Schlossberg (Homburg), hollow ways | Castles, moats, castle mounds, everyday life, hollow ways as old roads |
| 1778–1793 | **Schloss Karlsberg** (walkable reconstruction, interiors), Orangerie, Karlslust, gardens | Duke Karl II. August, building a residence, court life, the 1793 destruction |
| 19th century | Bavarian Uraufnahme map 1836–41 ("Ruine Carlsberg") | Surveying, early maps, the Pfalz under Bavaria |
| 20th century | TK25 1935–40, bunkers, bomb crater fields | West Wall/WWII history, **told carefully and age-appropriately**; UXO danger as a safety lesson, never as a treasure hunt |
| Today | 2025 LiDAR, OSM, buildings, orthophoto | How LiDAR works, forests, nature, how archaeologists work today |

### Mechanics (MMORPG-style, single-player first)
- **Quest givers** are original characters, e.g. a forester, a young archaeologist, a court gardener of 1789 or a land surveyor of 1840. Quest chains run per era and zone (Karlsberg, Kirrberg/Merburg, Homburg/Schlossberg).
- **Quest types:**
  - find a feature in the relief ("Finde den Burggraben");
  - compare maps ("Was stand 1840 hier?");
  - measure (use the explorer's profile tool: "Wie tief ist der Hohlweg?");
  - walk to a room in the 1789 palace;
  - answer a short quiz from codex cards;
  - photo mode ("mache eine Aufnahme der Orangerie bei Abendlicht").
- **Collections:** virtual replica finds (clearly labelled as replicas or illustrations), historic map sheets, character cards, plant and animal cards for the forest, and "Relief-Muster" cards (what a mound, pit, ditch or charcoal-kiln platform looks like).
- **Skills / professions** (unlocked by quests):
  - "Relief-Blick" (relief modes, step by step: hillshade → local relief → VAT);
  - "Kartograf" (historic maps, measuring);
  - "Baumeister" (palace plans, building parts);
  - "Förster" (canopy on/off, forest knowledge);
  - "Röntgenblick" (point-cloud clip).
- **Progression:** chronicle levels, titles, achievements ("Alle Hügelgräber am Rabenhorst gefunden"), and a **codex/journal** with sources and links.
- **Light story arc (example):** "Der verschwundene Palast". Pages of a lost 1793 chronicle are scattered across eras; each page unlocks a part of the palace and a piece of the region's story.
- **Later:** co-op (explore together), shared events, community-made quests (a quest editor for teachers and clubs).

### Optional real-world mode (phones)
- The explorer already has "Mein Standort" (geolocation; HTTPS on GitHub Pages). A location mode could unlock codex entries **only at public, signposted places** (museum, info boards, viewpoints, Schlossberg, the public part of the Karlsberg site), like a learning trail.
- **Hard rules:** never send players to relict candidates, unmarked sites, crater fields (possible unexploded ordnance) or off-path areas in protected forests. Respect the "Wegegebot" in nature reserves. No digging or metal-detector content, ever.

## 5. How the existing data can be used

| Asset (from the sister projects) | Use in the game |
|---|---|
| Explorer terrain chunks + overview levels (data contract v2, Terrarium heights, 500 m chunks, streaming) | The game world: real 6 × 8 km landscape, fly/walk, no loading screens |
| Relief layers (VAT, SLRM, SVF, openness, hillshade; live local relief) | The "Relief-Blick" skill progression; quests that teach reading LiDAR |
| Historic maps `hist_1840`, `hist_1935` (rgb layers + XYZ) | "Alte Karte" items, then/now comparison quests, era switching |
| Orthophoto (`ortho`) | Today's view, orientation |
| OSM ways, LoD2 buildings (20 k), Flurstücke | Today's world: paths for routes, villages, orientation; parcels only if useful for a surveying quest |
| POIs (`pois.geojson`, 44 known sites with sources) | Quest locations and codex entries (with the source URLs as "Quellen") |
| **Castle reconstruction `sle-recon-v1`** (`data/shared/karlsberg1789/`: light LOD1 glb, footprints, `index.json` with per-building confidence + sources) | The palace in the world, plus building codex cards with confidence ("gesichert / vermutet / unsicher") |
| **Full castle viewer** (`schloss-karlsberg/viewer`: Fliegen + Gehen, interiors of 7 buildings, rooms, 1789 terrain, time of day, plan sheets) | Walkable interior quests ("Geh in den Festsaal"), plans as collectible items, 1789 vs 2025 terrain as the time-travel visual. Handover via its URL parameters (`?src=…&E=…&N=…&mode=gehen&back=…`), or a later shared engine |
| Point clouds (palace, Schlossberg, Merburg) | The "Röntgenblick" skill: see ground under the canopy |
| Measuring tools / height profiles | Quest mechanic ("miss die Wallhöhe") |
| Relict candidates (`candidates.geojson`) | **Use very carefully or not at all.** At most a "Was könnte das sein?" learning game about *shapes* (pit vs. mound vs. kiln platform) using generic or anonymised examples. Never "go find this unverified spot". |
| Mobile UI + touch gestures + "Mein Standort" | Phone-friendly play; optional learning-trail mode (see §4) |
| 3D-print tiles | Physical game board or classroom model of the same world (nice tie-in) |

**Interfaces, not forks:**
- Read data through the published data contracts: the explorer's `docs/data-contract.md` (terrain v2, layers, vectors, recon) and `schloss-karlsberg/docs/explorer-integration.md`.
- If the game needs something new (e.g. quest anchors, walkable navmesh, room metadata), write it down as a **request to those projects** instead of editing them; their agents are active.
- Data source for a hosted game: the public data repo planned for GitHub Pages (`Open-Kirrberg/saar-lidar-data`, CORS-enabled), or the local `app/public/data/` during development.

## 6. Tech sketch (to be researched)

- **Engine:** reuse the explorer's three.js terrain engine and controls (desktop + touch), and the castle viewer's walking mode. Options:
  - (a) extract both into a shared package;
  - (b) the game as a mode/plugin of the explorer;
  - (c) a separate app that imports the modules.

  Decide after research.
- **Game layer:**
  - data-driven quests (JSON/YAML: giver, steps, triggers like "camera within 30 m of E/N", "layer X active", "measured depth ≥ 1 m", "entered room Y", rewards);
  - inventory and collection;
  - codex with sources;
  - save state in localStorage (no accounts in the MVP);
  - an i18n-ready German UI.
- **Content pipeline:** quest and codex authoring in Markdown or YAML with **mandatory source fields**, plus a validation script that fails on missing sources or confidence.
- **Art direction:** stylised and readable on top of real terrain (the real relief is the star); simple characters (2D portraits or low-poly); accessibility from the start (contrast, keyboard/touch, reduced motion, readable fonts).
- **Hosting:** static site on GitHub Pages under Open-Kirrberg, like the explorer.

## 7. Content principles (learning game)

- **Truthful:** facts carry sources; hypotheses are labelled as such (the reconstruction already has evidence tags and confidence). Fiction (quest givers, story) is clearly fiction and never mixed into facts.
- **Age-appropriate**, especially for the 20th century (war history, bunkers, bombs): factual, respectful, with a safety message (UXO: don't touch, report to the police / Kampfmittelbeseitigungsdienst).
- **Heritage ethics as game content:** why you don't dig, what happens to a find (reporting duty), what archaeologists do instead. This is a real learning goal, not just a disclaimer.
- **Expert review:** ideally a local historian, the Historisches Museum / city of Homburg, or the Landesdenkmalamt check content before release.
- **Licences:** data under dl-de/by-2-0 and ODbL needs attribution in-game. Historic images and plan scans need a licence check before use (the castle project already flags several as local reference only).

## 8. MVP proposal (to refine after research)

**"Der verschwundene Palast", Karlsberg zone only:**
- 1 quest giver chain, 6–8 quests, 10–15 collectibles, 15–20 codex cards with sources;
- skills: "Relief-Blick" (3 steps), "Alte Karte 1840";
- 1 walkable interior quest in the 1789 palace (via the castle viewer);
- desktop + mobile, German UI, local save, no accounts, no multiplayer;
- done when a first-time player finishes the chain in about 45–60 minutes, can explain what LiDAR shows and why you don't dig, and every fact in the game has a source.

## 9. Open questions (for the research phase)

1. **Audience:** children (which age), families, school classes, adults or tourists? This drives tone, quiz depth and the 20th-century content.
2. **Single-player vs. co-op/multiplayer:** a real MMO needs servers and accounts. Start single-player?
3. **Platform:** browser only (desktop + mobile), or also a classroom/kiosk mode (museum, school)?
4. **Engine path:** shared package vs. explorer mode vs. separate app (see §6).
5. **Partners:** city of Homburg / Historisches Museum, Landesdenkmalamt Saarland, schools, Open-Kirrberg community — who reviews content, and could anyone co-fund or host?
6. **Real-world mode:** wanted at all? Which public places qualify? Safety and liability?
7. **Art:** who makes portraits, icons and characters (own work, open-licence assets, AI-generated with a licence check)?
8. **Name:** "Saarpfalz-Chroniken", "Karlsberg-Quest", or something else?

## 10. First steps for the next agent

1. Read this file; skim (read-only) the explorer's `README.md`, `PRD.md`, `docs/data-contract.md`, and `schloss-karlsberg/README.md` + `docs/explorer-integration.md` + `docs/architecture.md`.
2. Research:
   - educational RPG and "serious games" for history and archaeology (what works, what fails);
   - location-based learning trails;
   - the regional history sources already collected in `schloss-karlsberg/research/` and the explorer's `research/03-archaeology-visualization.md`.
3. Ask the owner the §9 questions (at least 1, 2, 4), then write a `PRD.md` (living, with a decisions log, same style as the explorer) and a vertical-slice plan for the MVP.
