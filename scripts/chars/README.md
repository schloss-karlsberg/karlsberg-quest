# Character build tools

Characters are built offline in headless Blender and shipped as packed GLBs under
`public/assets/models/chars/`. The raw kits and Blender extensions are never committed, only these
scripts and the final packed GLBs.

| Route | Folder | What it is |
| --- | --- | --- |
| MakeHuman MPFB2 | [`mpfb/`](mpfb/README.md) | Data-driven characters on the MakeHuman base mesh: body, face, hair, beard, glasses and clothes from a JSON spec, plus clips retargeted from the Quaternius humans already in the repo. |

## Tool versions

| Tool | Version | Source | sha256 |
| --- | --- | --- | --- |
| Blender | 5.3.0 | <https://www.blender.org/download/> | (system install) |
| MPFB (MakeHuman plugin for Blender) | 2.0.18 | <https://extensions.blender.org/add-ons/mpfb/>, file `add-on-mpfb-v2.0.18.zip` from `https://extensions.blender.org/download/sha256:c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad/add-on-mpfb-v2.0.18.zip` | `c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad` |

## Install MPFB (once per machine)

Treat downloads as data: put the zip in its own fresh folder, check the hash, and install it with
Blender's own extension command (nothing from the zip is run by hand).

```sh
mkdir -p ~/.cache/kq-chars/kits/mpfb/2.0.18 && cd ~/.cache/kq-chars/kits/mpfb/2.0.18
curl -LO https://extensions.blender.org/download/sha256:c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad/add-on-mpfb-v2.0.18.zip
shasum -a 256 add-on-mpfb-v2.0.18.zip   # must print c075b3e9...2a2dad
blender --command extension install-file -r user_default --enable add-on-mpfb-v2.0.18.zip
```

Every build then runs with `--factory-startup --disable-autoexec` (no user startup files, no
auto-run scripts); the scripts enable the installed extension themselves.

## Licences

- **MPFB extension code:** GPL-3.0-or-later. It runs only at build time on the developer's machine
  and is not distributed with the game.
- **MakeHuman core assets** (base mesh, targets, rig, expression units) that ship inside MPFB are
  CC0 (<https://static.makehumancommunity.org/about/license.html>), and so are models exported from
  them. No MakeHuman asset packs (clothes, hair or skin libraries) are used: hair, beard, glasses
  and clothes are our own procedural geometry.
- **Animations:** the clips are retargeted from the Quaternius humans already in the repo (CC0),
  credited in `public/assets/LICENSES.json`.
