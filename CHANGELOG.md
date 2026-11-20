# Changelog

## [0.5.0](https://github.com/schloss-karlsberg/karlsberg-quest/compare/v0.1.0...v0.5.0) (2026-11-20)


### Features

* **avatar:** costume and lantern-tint API ([f67b15c](https://github.com/schloss-karlsberg/karlsberg-quest/commit/f67b15cdde011aa12180b893a18504b6f47eca25))
* **avatar:** costume and lantern-tint API (player:costume / player:lantern-tint events, kq.avatar.costume()) ([ca7cc7e](https://github.com/schloss-karlsberg/karlsberg-quest/commit/ca7cc7ea762c01ed9f8deb21fcc847aaf19b80fc))
* **collectibles:** 24 hidden bottles with journal counter and station shelf (label placeholder in one file) ([41d94ee](https://github.com/schloss-karlsberg/karlsberg-quest/commit/41d94ee190a5855aa37d9a1ddb620f0df00e6f45))
* **debug:** nan-watch flags exploded or non-finite geometry near the camera ([8cb41d7](https://github.com/schloss-karlsberg/karlsberg-quest/commit/8cb41d74ab690f162cf210fafa1ed218889e9640))
* **debug:** nan-watch for exploded geometry ([8840888](https://github.com/schloss-karlsberg/karlsberg-quest/commit/8840888a6000c357505bd300e3dd884c20812188))
* **dev:** FIFO queue and max-hold hint for heavy.sh ([40ef3dd](https://github.com/schloss-karlsberg/karlsberg-quest/commit/40ef3dd5c3bcb51fa4a3e315640d20cf89788391))
* **dev:** FIFO queue and max-hold hint for heavy.sh ([1472fa4](https://github.com/schloss-karlsberg/karlsberg-quest/commit/1472fa45c103043ff9961e1301223f469269f777))
* **dev:** machine-wide heavy-job lock (scripts/dev/heavy.sh) ([e599a72](https://github.com/schloss-karlsberg/karlsberg-quest/commit/e599a728aee2b9bfc30b2047ebfaa9a0bfb38ec7))
* **dev:** machine-wide heavy-job lock for e2e and other CPU-heavy runs (scripts/dev/heavy.sh) ([b2f9967](https://github.com/schloss-karlsberg/karlsberg-quest/commit/b2f9967cf2842aed4ece03fb8768b7ed3399774d))
* **flaschen:** 24 hidden bottles with journal counter and station shelf ([f35b4ff](https://github.com/schloss-karlsberg/karlsberg-quest/commit/f35b4ffa0ad6301a8174dc0742aa0809782c0dc9))
* **npc,quests:** NPCs face the player in dialogue; the main quest always stays tracked and listed ([9a1f343](https://github.com/schloss-karlsberg/karlsberg-quest/commit/9a1f343ccda1179316cff3e2283cab27358f013b))
* **npc:** twin identity API (roster mannlich / herzog, alias karl-ii-august, NpcPlacement.look, twinEcho hook returning null until authored models land) ([3a11702](https://github.com/schloss-karlsberg/karlsberg-quest/commit/3a11702d7a5dcfad07a30727444787498dda374f))
* **npc:** twin roster ids, alias and echo hook (API only, visuals pending) ([cc63923](https://github.com/schloss-karlsberg/karlsberg-quest/commit/cc6392350227e87eb04eed107013003f7bc9437c))
* **pilot:** radio in observe, live prompt, upfront turns, game-time fx in bullet time, dropped-input events, reliable hold ([5cb254e](https://github.com/schloss-karlsberg/karlsberg-quest/commit/5cb254e54a8154bae14999a729d192b3017f63c0))
* **quelle:** brook runs past the Bleiche ([fc2c1af](https://github.com/schloss-karlsberg/karlsberg-quest/commit/fc2c1af1fa4cb9cbf0b28a523259e3ad268aa8b0))
* **quelle:** brook runs past the Bleiche with banks and ferns in every era; perf(scenery): Bleiche baskets on high only ([da3c456](https://github.com/schloss-karlsberg/karlsberg-quest/commit/da3c456dd1ce4b3103570bb1fa01ee22229e9d93))
* **quelle:** spring look pass — draped brook bed and trickle, log trough, rubble spring house, sand trail, ashlar Brunnenstube with rustication and cornice, 1789 flagged apron ([105640e](https://github.com/schloss-karlsberg/karlsberg-quest/commit/105640ed1d6b00aed112e92c91a042957f240b3d))
* **r10:** playtest round 10 from kq-mobile — pilot radio/prompt/turns, NPCs face the player and main quest stays tracked, shorter walks with OSM-path Wegweiser, nan-watch ([79fef0a](https://github.com/schloss-karlsberg/karlsberg-quest/commit/79fef0a7a07fd5580a3ef6ab58f08c4e7fb62b92))
* **scenery:** 1789 Bleiche laundry green with swaying linen and a takeable coat; Gardisten pike prop with hand attach ([cf67e67](https://github.com/schloss-karlsberg/karlsberg-quest/commit/cf67e67554e441ae6493c43a33f8c9657b7e94c8))
* **story:** Kapitel 1 opens at the Karlsbergquelle at dawn, waking within reach of the spring water ([be89628](https://github.com/schloss-karlsberg/karlsberg-quest/commit/be896284f1a32dd65cb4db6bd66776873e962933))
* **touch:** touch controls phase 1 — virtual stick, look drag, action arc, touch mode setting, mobile defaults ([5c95489](https://github.com/schloss-karlsberg/karlsberg-quest/commit/5c95489183c70360a0771965e8c600e2e2d2b898))
* **travel:** shorter walks: no stale marker for portable clues, Wegweiser around the lake on the OSM paths, more Vermessungspunkte, quicker Laufschritt ([0d9f679](https://github.com/schloss-karlsberg/karlsberg-quest/commit/0d9f6798b99bfa33bfd0c2da85e1c75b10d262bc))
* **ui:** version and build on the title, Neuigkeiten modal with unseen badge, neu.html page ([09d32f6](https://github.com/schloss-karlsberg/karlsberg-quest/commit/09d32f6a8153df1d175ca31f200708917cef3996))
* **voice:** clip chains match the casting render ([edc97fe](https://github.com/schloss-karlsberg/karlsberg-quest/commit/edc97feede28fcddcab49b398494ffdf080c9232))
* **voice:** ElevenLabs voice-clip pipeline with dry-run plan ([303167c](https://github.com/schloss-karlsberg/karlsberg-quest/commit/303167c5cd3f5cda80bea25b607347dcab46802e))
* **voice:** play recorded clips through the speaker chains ([3a9ca6f](https://github.com/schloss-karlsberg/karlsberg-quest/commit/3a9ca6fb7f8066d7e6dcee419be2a6f89491a11c))
* **voice:** provider-agnostic TTS, Opus/AAC output, licence per clip ([8dfd618](https://github.com/schloss-karlsberg/karlsberg-quest/commit/8dfd6183cb9a48c12f00345794e61435eef14c94))
* **voice:** provisional cast, billed credits from character-cost ([40718b8](https://github.com/schloss-karlsberg/karlsberg-quest/commit/40718b87e66515111eeed2730e051e7271fb7b5b))
* **voice:** recorded voice clips with ElevenLabs/HF pipeline and in-game playback (no audio shipped) ([12a47ba](https://github.com/schloss-karlsberg/karlsberg-quest/commit/12a47ba488a0c66ef0efe168421aaf6ea65eaba5))
* **voice:** speech overrides for name lines, speechHash in manifest ([5e55e3b](https://github.com/schloss-karlsberg/karlsberg-quest/commit/5e55e3b5a85bb08a389af3de51698eca25b3cc4f))


### Bug Fixes

* **camera:** guard camera and avatar math against NaN (F-15) ([5fcbade](https://github.com/schloss-karlsberg/karlsberg-quest/commit/5fcbade5a5793b703cc23d980cd511f24ecce55d))
* **camera:** keep the spring arm in the player's space, dither occluders (round 10) ([c99c3e6](https://github.com/schloss-karlsberg/karlsberg-quest/commit/c99c3e68c9621a88b4ccd93b645874274bc0aed0))
* **camera:** see-through instead of trunk collision, a spring arm that stays in walkable space, indoor and dialogue framing, NaN guards (playtest round 10) ([4091471](https://github.com/schloss-karlsberg/karlsberg-quest/commit/40914710e302d6badb164620c9943f5c7308d6a3))
* **combat:** forgiving resets, stumble dodge when exhausted, a teachable reform rule, input buffer and step-in reach (playtest round 10) ([923840c](https://github.com/schloss-karlsberg/karlsberg-quest/commit/923840cf843c7a322ad46cc92dab854fc5c2856c))
* **combat:** gentler Nebelling reform so Karlslust keeps its pace ([10f178f](https://github.com/schloss-karlsberg/karlsberg-quest/commit/10f178fe7ea1dc66167f1c9bf6537a206943f0da))
* **flaschen:** 1789 spring bottle on the niche sill after the spring look pass ([4568bf2](https://github.com/schloss-karlsberg/karlsberg-quest/commit/4568bf281b1cc5d521b660c153aae73db5993f9d))
* **pilot:** keep the bullet-time strip off the radio box ([6d50c7e](https://github.com/schloss-karlsberg/karlsberg-quest/commit/6d50c7ec0a4a06707fb5bf48e60c06a4155a5f5d))
* **render:** readable spectral enemies (tinted rim and halo), ferns bend away from enemies, foundation stones follow slopes (playtest r10 F-04, F-14) ([ef943d0](https://github.com/schloss-karlsberg/karlsberg-quest/commit/ef943d04c30550f6481a4dd2eaae32acab2e63a8))
* **story:** k1 wakes within reach of the spring water ([1aa3cf3](https://github.com/schloss-karlsberg/karlsberg-quest/commit/1aa3cf361fd2586d77d6cbaf4653ad365dbe7b8b))
* **story:** prologue pacing from playtest round 10 ([60d62d5](https://github.com/schloss-karlsberg/karlsberg-quest/commit/60d62d54df9163b7b19adce4e9d0028ac7386c52))
* **story:** prologue pacing from playtest round 10 — clue before the radio lines, map objective, halfway line, Geisterblick after the wall fight, Nebelinge clear of the slope ([815b1cb](https://github.com/schloss-karlsberg/karlsberg-quest/commit/815b1cba2ba8c78d47578015063f6c8c5698714e))
* **travel:** the Bleiche keeps POIs clear only in 1789, so the present-day Weiher walk keeps its POIs ([68025dd](https://github.com/schloss-karlsberg/karlsberg-quest/commit/68025ddb5236a1598ec26fb4db68c3f47eb71fdc))


### Performance

* **scenery:** Bleiche basket LOD ([a5a0102](https://github.com/schloss-karlsberg/karlsberg-quest/commit/a5a010281ee75c0b1aa837c2b0084375b6af1fd7))


### Documentation

* **assets:** allow licensed AI-generated assets, credited per file; no voice cloning or living likenesses ([a2b788c](https://github.com/schloss-karlsberg/karlsberg-quest/commit/a2b788c92b0c1be78e0586d67978b1792147bbbb))
* bible 01-prolog, ACTION-RPG §11.0 and §14, PRD changelog row (unreleased). ([60d62d5](https://github.com/schloss-karlsberg/karlsberg-quest/commit/60d62d54df9163b7b19adce4e9d0028ac7386c52))
* **camera:** round 10 camera, see-through and NaN guards ([95d9085](https://github.com/schloss-karlsberg/karlsberg-quest/commit/95d90853c388bb12bb51d37a1f8ffd3a99264ff6))
* **content:** player notes for v0.5.0, the first public version ([f70e472](https://github.com/schloss-karlsberg/karlsberg-quest/commit/f70e47223cbc70f4af1e48826c38ff02e0ccc763))
* **next-session:** keep the commit trailer rule ([121d010](https://github.com/schloss-karlsberg/karlsberg-quest/commit/121d0108c3a6971e4019fad3986882c97a80b5f7))
* **next-session:** link the voice/media research ([149ab82](https://github.com/schloss-karlsberg/karlsberg-quest/commit/149ab8286d15f023d0101143fa741e576cb19347))
* **readme:** link the storyboard (spoiler) ([047a743](https://github.com/schloss-karlsberg/karlsberg-quest/commit/047a74310b97ddc21b0c4c0b934cfdb63ed629b0))
* **readme:** touch is supported ([3ef64fc](https://github.com/schloss-karlsberg/karlsberg-quest/commit/3ef64fc2f12b61bd9dd49c28a4bcae7d2f2488d6))
* **reference:** portraits and appearance notes for Mannlich and Karl II. August ([9238915](https://github.com/schloss-karlsberg/karlsberg-quest/commit/9238915969feba900229a707df0a7b5831fcf4d0))
* **reference:** portraits, sources and appearance notes for Mannlich and Karl II. August ([feccb20](https://github.com/schloss-karlsberg/karlsberg-quest/commit/feccb20e2d5b04210bfdf01178aa7e8306cabec8))
* **release:** history rewrite done, normal push/pull from now on; PRD voice row unreleased ([fb7152e](https://github.com/schloss-karlsberg/karlsberg-quest/commit/fb7152ef7b2fdceed5214880808eedd1af8a11d6))
* **release:** release and publish flow, git rule, changelog rows ([692458a](https://github.com/schloss-karlsberg/karlsberg-quest/commit/692458a226fe7e27be9457b751ff28dbde7e0b1d))
* **release:** v0.5.0 player notes and changelog versions ([44336a5](https://github.com/schloss-karlsberg/karlsberg-quest/commit/44336a5d83525f291a3b7bfa9a5ad2e6685a37ff))
* **release:** v0.5.0 player notes and changelog versions ([9882757](https://github.com/schloss-karlsberg/karlsberg-quest/commit/98827570734143ade8b0271745fa3c59fe4ab536))
* **research:** AI voice and media options for voices, SFX, images, video ([256acb7](https://github.com/schloss-karlsberg/karlsberg-quest/commit/256acb766637d868c6b26a8924bed1c694beda53))
* **research:** AI voice and media options for voices, SFX, images, video ([aadc0a8](https://github.com/schloss-karlsberg/karlsberg-quest/commit/aadc0a8732744903b7ebe908b6715049ee8e1f05))
* **storyboard:** illustrated storyboard of every beat, place, creature and item, plus capture script ([a13dc28](https://github.com/schloss-karlsberg/karlsberg-quest/commit/a13dc2851ee73e1a04dfbe79a1c027be4b11babc))
* **story:** Knigge visit disputed; disguise visitor is the invented Hofrat Amsel ([6a1dad4](https://github.com/schloss-karlsberg/karlsberg-quest/commit/6a1dad48a2b543f212c071279d0090ec5a507a86))
