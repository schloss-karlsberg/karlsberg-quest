"""Build one character from its spec (any NPC: write a spec, run this).

    blender -b --factory-startup --disable-autoexec --python-exit-code 1 \
        -P scripts/chars/mpfb/build.py -- --spec scripts/chars/mpfb/specs/<name>.json \
        --out <raw.glb> [--blend <debug.blend>] [--stats <stats.json>]

Then pack it for the browser: pnpm assets:pack <raw.glb> public/assets/models/chars/<name>.glb
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kqchar.build import load_spec, run  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

    def opt(name, default=None):
        return argv[argv.index('--' + name) + 1] if '--' + name in argv else default

    spec_path = opt('spec')
    out = opt('out')
    if not spec_path or not out:
        print(__doc__)
        sys.exit(2)
    spec = load_spec(spec_path)
    stats = run(spec, out, opt('blend'))
    if opt('stats'):
        with open(opt('stats'), 'w', encoding='utf-8') as f:
            json.dump(stats, f, indent=1)


main()
