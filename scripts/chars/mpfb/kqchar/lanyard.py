"""A lanyard with a name badge (the tour guide): two thin straps that come out from under the
collar at the sides of the neck and meet at a card hanging on the chest.

Spec (spec['wardrobe']['lanyard'], palette keys for the colours):
  colour        strap colour (the guide's accent slot)
  badge         card colour
  width         strap width (m)
  badge_size    [w, h, d] of the card (m)
  badge_below_neck  card centre below the neck bone's head (m)
  strap_x       where the straps leave the collar, |x| (m)
  samples, smooth  points along each strap, smoothing passes of its depth and normals
"""
import numpy as np

from . import geom
from .outfit import bone_pos
from .parts import Part
from .util import hex_lin

DEFAULTS = {'colour': 'lanyard', 'badge': 'badge', 'width': 0.014, 'badge_size': [0.062, 0.088, 0.004],
            'badge_below_neck': 0.24, 'strap_x': 0.05, 'lift': 0.004, 'material': 'Gear'}


def _weights(n, bones, mix_):
    W = np.zeros((n, len(bones)))
    for b, w in mix_.items():
        W[:, bones.index(b)] = w
    return W


def build(surface, rig, wardrobe, palette, bones):
    """The lanyard parts on the dressed body surface (empty without `wardrobe.lanyard`)."""
    spec = wardrobe.get('lanyard')
    if not spec:
        return []
    s = {**DEFAULTS, **spec}
    neck_h, _ = bone_pos(rig, 'neck_01')
    jk = wardrobe.get('jacket') or {}
    strap = hex_lin(palette.get(s['colour'], '#2f7c84'))
    card = hex_lin(palette.get(s['badge'], '#eeebe2'))
    bw, bh, bd = s['badge_size']
    zb = neck_h[2] - s['badge_below_neck']
    # the straps leave the collar where its front edge is low, just below the band
    z0 = neck_h[2] + jk.get('collar_above_neck', 0.0) - jk.get('collar_front_drop', 0.012) - 0.004
    parts = []
    w = s['width']
    prof = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, 0.0015), (-w / 2, 0.0015)]
    top_hit = None
    for side in (1, -1):
        path, ups = [], []
        for t in np.linspace(0.0, 1.0, s.get('samples', 9)):
            x = side * (s['strap_x'] + (0.009 - s['strap_x']) * t ** 0.8)
            z = z0 + (zb + bh * 0.42 - z0) * t
            hit = surface.ray(np.array([x, -0.5, z]), (0.0, 1.0, 0.0), 1.0)
            if hit is None:
                continue
            path.append(hit[0])
            ups.append(hit[1])
        if len(path) < 3:
            continue
        path, ups = np.array(path), np.array(ups)
        if s.get('smooth'):
            # a straight, even strap over a faceted chest: depth and normals smoothed along it
            y0 = path[:, 1].copy()
            for _ in range(int(s['smooth'])):
                path[1:-1, 1] = 0.25 * path[:-2, 1] + 0.5 * path[1:-1, 1] + 0.25 * path[2:, 1]
                ups[1:-1] = 0.25 * ups[:-2] + 0.5 * ups[1:-1] + 0.25 * ups[2:]
            path[:, 1] = np.minimum(path[:, 1], y0)
            ups /= np.linalg.norm(ups, axis=1, keepdims=True)
        path = path + ups * s['lift']
        co, faces = geom.sweep(path, ups, prof)
        z_rel = (co[:, 2] - zb) / max(z0 - zb, 1e-6)
        W = np.zeros((len(co), len(bones)))
        W[:, bones.index('spine_03')] = 0.75 + 0.25 * (1 - np.clip(z_rel, 0, 1))
        W[:, bones.index('neck_01')] = 0.25 * np.clip(z_rel, 0, 1)
        parts.append(Part(f'lanyard_{side}', s['material'], co, faces, col=np.tile(np.append(strap, 1.0), (len(co), 1)), weights=W))
    top_hit = surface.ray(np.array([0.0, -0.5, zb]), (0.0, 1.0, 0.0), 1.0)
    if top_hit is not None:
        n = top_hit[1]
        n = n / np.linalg.norm(n)
        ex = np.cross(n, np.array([0.0, 0.0, 1.0]))
        ex /= np.linalg.norm(ex)
        ez = np.cross(ex, n)
        # the card hangs a little off the chest, a few mm in front of the zip and flaps
        c = top_hit[0] + n * (s['lift'] + bd * 0.5 + 0.003)
        co, faces = geom.rounded_box(c, (bw, bd, bh), e=0.2, nu=6, nv=10, axes=np.array([ex, n, ez]))
        local = (co - c) @ ez
        col = np.tile(np.append(card, 1.0), (len(co), 1))
        col[local > bh * 0.26, :3] = strap  # a coloured band at the top of the card
        line = (np.abs(local + bh * 0.08) < bh * 0.06) & ((co - c) @ n > 0)
        col[line, :3] = card * 0.55  # a printed name line (back face stays plain)
        parts.append(Part('badge', s['material'], co, faces, col=col, weights=_weights(len(co), bones, {'spine_03': 0.6, 'spine_02': 0.4})))
    return parts
