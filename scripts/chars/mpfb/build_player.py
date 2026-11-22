"""Build the player character (specs/player.json) into a raw GLB.

    blender -b --factory-startup --disable-autoexec --python-exit-code 1 \
        -P scripts/chars/mpfb/build_player.py -- [--out <raw.glb>] [--blend <debug.blend>] [--stats <stats.json>]

Default output: $TMPDIR/kq-chars/player-head-mpfb.raw.glb. Pack it with
pnpm assets:pack <raw.glb> public/assets/models/chars/player-head-mpfb.glb
"""
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from kqchar.build import load_spec, run  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    return argv[argv.index('--' + name) + 1] if '--' + name in argv else default


out = opt('out', os.path.join(tempfile.gettempdir(), 'kq-chars', 'player-head-mpfb.raw.glb'))
spec = load_spec(opt('spec', os.path.join(HERE, 'specs', 'player.json')))
stats = run(spec, out, opt('blend'))
if opt('stats'):
    with open(opt('stats'), 'w', encoding='utf-8') as f:
        json.dump(stats, f, indent=1)
