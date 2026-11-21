"""Thick soft-rectangle glasses (our own bpy model): two rims, a bridge, temples back to the ears.

Separate object (`avatar-glasses`), rigid on the head bone, no lenses (nothing transparent to sort).
The frame plane keeps a clearance from the face, including the smiling cheeks (all morphs checked).
"""
import math

import numpy as np

from .bind import Surface

from .parts import Part, rigid_weights
from .util import hex_lin, mix


def _superellipse(a, b, p, n, bottom_scale=0.93):
    pts, nrm = [], []
    for k in range(n):
        t = 2 * math.pi * k / n
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / p), c)
        y = b * math.copysign(abs(s) ** (2 / p), s)
        if y < 0:
            x *= bottom_scale + (1 - bottom_scale) * (1 + y / b)
        pts.append((x, y))
    pts = np.array(pts)
    # outward normals from neighbours
    for k in range(n):
        d = pts[(k + 1) % n] - pts[k - 1]
        m = np.array([d[1], -d[0]])
        nrm.append(m / max(np.linalg.norm(m), 1e-12))
    return pts, np.array(nrm)


def _tube(path, ups, w, h, n_side=6):
    """A closed rectangular-ish tube along a 3D path (open ends capped)."""
    co, faces = [], []
    N = len(path)
    prof = []
    for k in range(n_side):
        a = 2 * math.pi * (k + 0.5) / n_side
        prof.append((math.cos(a), math.sin(a)))
    for i in range(N):
        t = path[min(i + 1, N - 1)] - path[max(i - 1, 0)]
        t /= max(np.linalg.norm(t), 1e-12)
        u = ups[i] - (ups[i] @ t) * t
        u /= max(np.linalg.norm(u), 1e-12)
        s = np.cross(t, u)
        for cx, cy in prof:
            co.append(path[i] + s * cx * w * 0.5 * 1.15 + u * cy * h * 0.5 * 1.15)
    for i in range(N - 1):
        for k in range(n_side):
            kn = (k + 1) % n_side
            faces.append((i * n_side + k, (i + 1) * n_side + k, (i + 1) * n_side + kn, i * n_side + kn))
    a = len(co)
    co.append(path[0])
    b = len(co)
    co.append(path[-1])
    for k in range(n_side):
        kn = (k + 1) % n_side
        faces.append((a, k, kn))
        faces.append((b, (N - 1) * n_side + kn, (N - 1) * n_side + k))
    return np.array(co), faces


def build(skin, lm, spec, palette, bones, skin_keys=None, skin_faces=None):
    # sized to the face (the eye radius before any eye stylisation), not to stylised big eyes
    sc = lm.get('eye_radius_ref', lm['eye_radius']) / 0.0158
    a = spec.get('lens_w', 0.052) * sc / 2
    b = spec.get('lens_h', 0.039) * sc / 2
    p = spec.get('squareness', 3.4)
    rim = spec.get('rim', 0.0052) * sc
    depth = spec.get('depth', 0.0055) * sc
    n = spec.get('outline', 36)
    wrap = math.radians(spec.get('wrap_deg', 7.0))
    tilt = math.radians(spec.get('tilt_deg', 6.0))
    outline, onrm = _superellipse(a, b, p, n, spec.get('bottom_scale', 0.92))
    frame = hex_lin(palette['glasses'])
    hi = hex_lin(palette.get('glasses_light', '#5a5a5e'))
    parts_co, parts_f, parts_col = [], [], []

    def add(co, f, col):
        off = sum(len(c) for c in parts_co)
        parts_co.append(co)
        parts_f.extend(tuple(i + off for i in ff) for ff in f)
        parts_col.append(col)

    # place: lens centres in front of the eyes, keep clear of the face in every morph
    ex = abs(lm['eye_l'][0]) + spec.get('x_off', 0.002) * sc
    ez = lm['eye_z'] + spec.get('z_off', 0.002) * sc
    cornea = lm['eye_y'] - lm['eye_radius']
    y0 = cornea - spec.get('vertex_dist', 0.012) * sc
    clear = spec.get('clearance', 0.004)
    surf_objs = [skin] + ([Surface(k, skin.tris) for k in skin_keys.values()] if skin_keys else [])

    def lens_frame(side):
        """Axes of one lens: xa outward along the frame, za up, fa forward (towards the viewer).

        Wrap turns the outer edge back (+Y); the pantoscopic tilt brings the bottom towards the face.
        """
        s = 1.0 if side == 'l' else -1.0
        cw, sw = math.cos(wrap), math.sin(wrap)
        xa = np.array([s * cw, sw, 0.0])
        fa = np.array([s * sw, -cw, 0.0])
        za = np.array([0.0, 0.0, 1.0])
        fa2 = fa * math.cos(tilt) - za * math.sin(tilt)
        za2 = za * math.cos(tilt) + fa * math.sin(tilt)
        return xa, za2, fa2

    def rim_points(side, yc):
        s = 1.0 if side == 'l' else -1.0
        xa, za, fa = lens_frame(side)
        c = np.array([s * ex, yc, ez])
        return c, xa, za, fa

    # push the frame forward until the rims clear the face (front ray casts per outline point)
    yc = y0
    for _ in range(30):
        worst = 1.0
        for side in ('l', 'r'):
            c, xa, za, fa = rim_points(side, yc)
            for k in range(0, n, 2):
                for grow in (0.0, rim):
                    q = c + xa * (outline[k, 0] + onrm[k, 0] * grow) + za * (outline[k, 1] + onrm[k, 1] * grow) - fa * depth * 0.5
                    for so in surf_objs:
                        hit = so.ray(q - fa * 0.2, fa, 0.4)
                        if hit is not None:
                            gap = (q - hit[0]) @ fa  # positive: the frame is in front of the skin
                            worst = min(worst, gap)
        if worst >= clear:
            break
        yc -= (clear - worst) + 0.0005
    # rims
    hinge = {}
    inner_top = {}
    for side in ('l', 'r'):
        c, xa, za, fa = rim_points(side, yc)
        rings = []
        cols = []
        prof = [(0.0, 0.5), (0.0, -0.5), (0.35, -0.5), (1.0, -0.42), (1.0, 0.42), (0.35, 0.5)]  # (out along rim, along depth)
        for k in range(n):
            for po, pd in prof:
                q = c + xa * (outline[k, 0] + onrm[k, 0] * rim * po) + za * (outline[k, 1] + onrm[k, 1] * rim * po) + fa * depth * pd
                rings.append(q)
                cols.append(mix(frame[None], hi[None], spec.get('rim_highlight', 0.0) if (pd > 0.4 and 0.2 < po < 0.9) else 0.0)[0])
        K = len(prof)
        f = []
        s = 1.0 if side == 'l' else -1.0
        for k in range(n):
            kn = (k + 1) % n
            for j in range(K):
                jn = (j + 1) % K
                quad = (k * K + j, k * K + jn, kn * K + jn, kn * K + j)
                f.append(quad[::-1] if s > 0 else quad)
        add(np.array(rings), f, np.array(cols))
        # the hinge: outer edge, a little above the centre line
        kh = int(round(n * 0.04)) % n
        hinge[side] = c + xa * (outline[kh, 0] + onrm[kh, 0] * rim * 0.9) + za * (outline[kh, 1] + 0.004 * sc) - fa * depth * 0.3
        ki = int(round(n * 0.40)) % n
        inner_top[side] = c + xa * (outline[ki, 0] + onrm[ki, 0] * rim * 0.5) + za * outline[ki, 1]
    # bridge: an arc over the nose between the inner rims
    L, R = inner_top['l'], inner_top['r']
    m = (L + R) / 2
    m[2] += spec.get('bridge_rise', 0.003) * sc
    m[1] -= 0.001
    ctrl = np.array([R, m, L])
    path = np.array([(1 - t) ** 2 * ctrl[0] + 2 * (1 - t) * t * ctrl[1] + t * t * ctrl[2] for t in np.linspace(0, 1, 8)])
    ups = np.tile(np.array([0.0, -1.0, 0.0]), (len(path), 1))
    bc, bf = _tube(path, ups, rim * 0.75, depth * 0.85)
    add(bc, bf, np.tile(frame, (len(bc), 1)))
    # temples: hinge -> along the head side -> over the ear -> down behind it
    for side in ('l', 'r'):
        s = 1.0 if side == 'l' else -1.0
        hpt = hinge[side]
        ear_top = lm['ear_top']
        pts = [hpt]
        ys = np.linspace(hpt[1] + 0.006, lm['ear_y'], 6)
        rise = spec.get('temple_rise', 0.004)
        for yy in ys:
            zz = hpt[2] + (ear_top + rise - hpt[2]) * ((yy - hpt[1]) / (lm['ear_y'] - hpt[1])) ** spec.get('temple_rise_pow', 1.5)
            # head side at this height: from outside near the face; further back from inside the
            # head, so the temple rests on the side of the head / the ear root, not on the outer ear
            if yy > lm['eye_y'] + 0.03:
                hit = skin.ray(np.array([0.0, yy, zz]), (s, 0.0, 0.0), 0.3)
            else:
                hit = skin.ray(np.array([s * 0.3, yy, zz]), (-s, 0.0, 0.0), 0.4)
            xx = (hit[0][0] + s * spec.get('temple_clear', 0.003)) if hit else s * (lm['ear_x'] - 0.01)
            if spec.get('temple_straight'):
                # straight back from the hinge until the head side is wider (hidden behind the frame
                # from the front); the outward run starts near the ear, inside the hair
                xx = s * max(abs(xx), abs(hpt[0]) - 0.001)
            pts.append(np.array([xx, yy, zz]))
        # behind the ear: optional points (dy behind the ear centre, dz below the ear top); none = the
        # temple runs straight back into the hair
        drop = spec.get('temple_drop', [[0.012, 0.010], [0.019, 0.024], [0.023, 0.04]])
        for dy, dz in drop:
            yy, zz = lm['ear_y'] + dy, ear_top - dz
            hit = skin.ray(np.array([0.0, yy, zz]), (s, 0.0, 0.0), 0.3)
            xx = (hit[0][0] + s * spec.get('temple_clear', 0.003)) if hit else pts[-1][0] - s * 0.003
            pts.append(np.array([xx, yy, zz]))
        wmax = max(abs(p[0]) for p in pts[1:])
        if spec.get('endpiece') and wmax > abs(hpt[0]):
            # an end piece: the frame front carries on out to the widest point of the head along the
            # temple (as thick as the rim), and the temple runs straight back from there, so it never
            # splays out past the face from the hinge
            ep = np.array([s * (wmax + spec.get('endpiece_out', 0.0)), hpt[1] + spec['endpiece'], hpt[2]])
            for k in range(1, len(pts)):
                pts[k] = np.array([s * max(abs(pts[k][0]), wmax - spec.get('temple_taper', 0.0) * k / len(pts)), pts[k][1], pts[k][2]])
            epath = np.array([hpt - np.array([s * 0.002, 0.0, 0.0]), hpt + (ep - hpt) * 0.5, ep])
            ec, ef = _tube(epath, np.tile(np.array([0.0, 0.0, 1.0]), (3, 1)), rim * 0.8, depth * 0.85)
            add(ec, ef, np.tile(frame, (len(ec), 1)))
            pts[0] = ep
            pts[1] = np.array([pts[1][0], max(pts[1][1], ep[1] + 0.004), pts[1][2]])
        path = np.array(pts)
        ups = np.tile(np.array([0.0, 0.0, 1.0]), (len(path), 1))
        tc, tf = _tube(path, ups, spec.get('temple_w', 0.0026) * sc, spec.get('temple_h', 0.0042) * sc)
        add(tc, tf, np.tile(frame, (len(tc), 1)))
    co = np.vstack(parts_co)
    col = np.vstack(parts_col)
    return Part('glasses', spec.get('material', 'Glasses'), co, parts_f, col=col, weights=rigid_weights(len(co), bones, 'head'), smooth=True), yc
