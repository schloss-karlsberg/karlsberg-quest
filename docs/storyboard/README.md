# Storyboard

Open [index.html](index.html) from disk to see the guided tour, the first crossing and training, chapters 1–4, the three party endings, and the credits. The German captions and the page are maintained by hand. The capture script writes only the pictures to `img/`. The page uses local JPEGs and the bundled IM Fell English fonts.

## Regenerate the pictures

Run from the worktree root on a machine with a real GPU. Keep the preview running and capture in a second shell.

```sh
# 1. Build into a temporary directory
pnpm exec vite build --outDir /tmp/kq-storyboard

# 2. Serve the build on a free port
pnpm exec vite preview --outDir /tmp/kq-storyboard --port 5370 --strictPort --host localhost

# 3. Capture in a second shell
scripts/dev/heavy.sh -- node scripts/dev/storyboard.mjs http://localhost:5370/
```

- `node scripts/dev/storyboard.mjs --list` prints the 68 shot IDs.
- `scripts/dev/heavy.sh -- node scripts/dev/storyboard.mjs http://localhost:5370/ --only t6-reh-sicht,e-keep-fest` retakes two shots in script order.
- `--out <dir>` writes to a different directory. `--quality 72` sets the JPEG quality, with 72 as the default.

The script opens the game with `?debug&nosave&fresh&manual&q=high` and uses `window.kq` to stage the lighting, actors, effects and UI. Each frame is 1280 × 720. Check the `GPU:` line for the hardware renderer, the log for failed shots, and the final count for `68/68 shots`. A failed shot triggers a reload and the capture continues. Review every picture, then open the page from disk to check the thumbnails and lightbox.

**Image budget.** The 68 JPEGs in `img/` take up about 7.3 MB (7,484 KiB). Places and Cast reuse story pictures where they show the subject.

## What is not captured, and why

- The guided-tour ticket is a capture-only mockup. The training uses the combat hooks. The shipped tour ends on arrival in 1789. The existing `t14-pause-hub.jpg` shows the former spring menu. The capture script now opens Pause → Kapitel for that shot. Refresh the image and its caption together.
- The reunion, fire bowl and dogs use the shipped party set and animations. The museum frame uses the archive box and group around the table. The lifted page and the player's seated pose are design beats. The choice at the edge uses the ending panel in front of the party, with capture-only wording for the fire bowl and the Bussole.
- The storyboard stages Marlene with the available party stand-in and the player's staff. The handoff and tripod at the dam, the physical horn at the spring, and the compass coming out of the trough are told in the captions.
- The hillside chase in K1 and the eyes in the fog in K2 are represented by the closer K2 Parforcejagd picture (`c-meute`). The garden caption covers the K3 jaguar, which was hard to read in the dark. The K2 warning uses the exterior view of the palace (`k2-schloss`).
- The map and point cloud overlays were hard to read in previous captures. The dam uses the game's relief view (`t7-relief`).
- The K3 frames before the fire use the dusk look with the scenery fire switched off. The Festsaal card shows the room and Hanne. The Steinbrecher frame shows its reveal. The Schuldbuch frame uses daylight so the boss reads.

## Editing the capture script

- Clear visible enemies before jumping the story. An era or story jump can stash a live group and bring it back later.
- The game drives the spring touch on fixed updates. Camera settling, fades and the staged endings need render frames. The helpers use both clocks.
- Keep the thumbnails and lightbox references in sync with `--list`. The expected story order and frame descriptions live in [the beat sheet](../design/tour/storyboard-beats.md).
