# Storyboard

`index.html` is a static page with the story, places, cast and items in pictures. Open it straight from disk. It needs no build, no server and no network. Images live in `img/`; the fonts (IM Fell English, OFL) live in `fonts/`.

The captions and the page are written by hand in `index.html`. Only the pictures are generated.

## Regenerate the pictures

Do this on a machine with a real GPU. The script warns if Chromium falls back to a software renderer, because those pictures will not match the real look.

```sh
# 1. build into a temp folder
npx vite build --outDir /tmp/kq-storyboard

# 2. serve it on a free port of your own
npx vite preview --outDir /tmp/kq-storyboard --port 5370 --strictPort --host localhost

# 3. capture (in a second shell); writes docs/storyboard/img/<id>.jpg
node scripts/dev/storyboard.mjs http://localhost:5370/
```

Options:

- `--list` prints the shot ids.
- `--only p3q-quelle,k2-orangerie` re-shoots only these shots, in list order.
- `--out <dir>` writes somewhere else, for example a scratch folder for review.
- `--quality 72` sets the JPEG quality.

The script uses `?debug&nosave&fresh&manual&q=high` with the `window.kq` debug hooks. Each shot sets its own era, light, teleport and framing, and stages its own NPCs, enemies, hounds and effects. A full run of 60 shots takes a few minutes. If a shot fails, the page reloads and the run continues.

Budget: keep `img/` under about 8 MB and 60 pictures. It is 6.4 MB now. If you add a shot, drop one, or reuse an existing picture in the page: Places and Cast reuse story pictures.

## What is not captured, and why

- **K1 par force down the cascade** and **K2 "Augen im Nebel"**: the hounds are only small dots at a distance. The pack is shown in the K2 Parforcejagd card instead (`c-meute`).
- **The jaguar (K3)**: too dark and small to read. It is mentioned in the Garten card only.
- **Schreibkabinett, K2**: the interior frame was weak. The card shows the palace with lit windows (`k2-schloss`) instead.
- **Laub's 1840 map overlay (M)** is washed out from above. The Ehrenhof card shows the relief view (key 2) instead.
- **The point cloud / X-ray tool** gave no points headless (`kq.tools.xray` returned 0). The Punktwolke card shows the Bussole springing open instead.
- **K3 afternoon light**: the 1793-07 era preset is a night look and starts the palace fire as scenery. The pre-fire K3 shots switch the fire off and use the dusk look.
- **The Festsaal choice UI** and the **Steinbrecher block throws** are not staged. There are no hooks to freeze them at a readable moment.
- **The Schuldbuch fight** is set at dusk in the game. The picture is lit by day so the boss reads.

## Gotchas, if you edit the script

- Undo enemies **before** jumping the story. `kq.story.goto` only stashes them, and they came back later at full strength.
- The era-shift effect, the dialogue card, NPC fade-in and the staged endings run on real frames. The helpers wait for them with `requestAnimationFrame`.
- A boss's left-over pieces come apart on render frames. `reset()` waits about 150 frames after a kill.
