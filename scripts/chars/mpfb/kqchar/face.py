"""Face parts: stylised eyes, solid brows and the painted skin (vertex colours)."""
import math

import numpy as np

from .bind import Binding
from .parts import Part, rigid_weights
from .util import hex_lin, mix, smoothstep


def eye_part(name, center, radius, palette, bones, forward=(0.0, -1.0, 0.0), segments=20):
    """A sphere whose pole looks forward; rings at the pupil and iris edges carry crisp colours."""
    pupil = palette.get('pupil', '#17181c')
    iris = palette['iris']
    iris_dark = palette.get('iris_dark', '#3a3430')
    iris_light = palette.get('iris_light', '#9a8e84')
    sclera = palette.get('sclera', '#ece4da')
    sclera_back = palette.get('sclera_back', '#c9b8ad')
    ip = palette.get('pupil_deg', 12.0)
    ii = palette.get('iris_deg', 32.0)
    # (polar angle from the front, colour, starts a new colour band)
    rings = [
        (0, pupil, False), (ip * 0.6, pupil, False), (ip, pupil, False),
        (ip, iris_light, True), (ii * 0.55, iris, False), (ii * 0.85, iris, False), (ii, iris_dark, False),
        (ii, sclera, True), (ii + 9, sclera, False), (60, sclera, False), (85, sclera, False), (115, sclera_back, False),
        (150, sclera_back, False), (180, sclera_back, False),
    ]
    back = palette.get('back_deg', 180)
    if back < 180:
        # an open cup: the back of the eyeball sits inside the head and is never seen
        rings = [r for r in rings if r[0] < back] + [(back, sclera_back, False)]
    f = np.array(forward, dtype=np.float64)
    f /= np.linalg.norm(f)
    up = np.array([0.0, 0.0, 1.0])
    side = np.cross(f, up)
    side /= np.linalg.norm(side)
    up = np.cross(side, f)
    co, col, faces = [], [], []
    ring_idx = []
    for ang, c, _ in rings:
        a = math.radians(ang)
        idx = []
        if ang in (0, 180):
            co.append(center + radius * math.cos(a) * f)
            col.append(hex_lin(c))
            idx = [len(co) - 1]
        else:
            for s in range(segments):
                t = 2 * math.pi * s / segments
                d = math.cos(a) * f + math.sin(a) * (math.cos(t) * side + math.sin(t) * up)
                co.append(center + radius * d)
                col.append(hex_lin(c))
                idx.append(len(co) - 1)
        ring_idx.append(idx)
    for k in range(len(rings) - 1):
        if rings[k + 1][2]:
            continue  # a duplicated ring: no faces between the two copies
        A, B = ring_idx[k], ring_idx[k + 1]
        if len(A) == 1:
            for s in range(segments):
                faces.append((A[0], B[(s + 1) % segments], B[s]))
        elif len(B) == 1:
            for s in range(segments):
                faces.append((A[s], A[(s + 1) % segments], B[0]))
        else:
            for s in range(segments):
                faces.append((A[s], A[(s + 1) % segments], B[(s + 1) % segments], B[s]))
    # catchlight: a small white disc floating just off the cornea, up and to one side of the pupil
    cl = palette.get('catchlight', [14.0, 11.0, 0.15])  # (degrees up, degrees to +x, radius / eye radius)
    if cl:
        up_a, side_a, rr = math.radians(cl[0]), math.radians(cl[1]), cl[2]
        dc = math.cos(up_a) * math.cos(side_a) * f + math.sin(up_a) * up + math.cos(up_a) * math.sin(side_a) * np.array([1.0, 0.0, 0.0])
        dc /= np.linalg.norm(dc)
        u = np.cross(dc, side)
        u /= np.linalg.norm(u)
        v = np.cross(dc, u)
        c0 = len(co)
        co.append(center + radius * 1.012 * dc)
        col.append(hex_lin('#ffffff'))
        ns = 8
        for s in range(ns):
            t = 2 * math.pi * s / ns
            co.append(center + radius * 1.006 * dc + radius * rr * (math.cos(t) * u + math.sin(t) * v * 0.8))
            col.append(hex_lin('#ffffff'))
        for s in range(ns):
            a, b = c0 + 1 + s, c0 + 1 + (s + 1) % ns
            tri = (c0, a, b)
            # outward winding (towards dc)
            n_ = np.cross(np.array(co[a]) - co[c0], np.array(co[b]) - co[c0])
            faces.append(tri if n_ @ dc > 0 else (c0, b, a))
    co = np.array(co)
    return Part(name, 'Eye', co, faces, col=np.array(col), weights=rigid_weights(len(co), bones, 'head'))


def brow_part(skin, side, lm, palette, bones, keys, spec):
    """A solid brow strip draped on the forehead (rounded ridge, tapering tail)."""
    s = 1.0 if side == 'l' else -1.0
    e = lm['eye_l'] if side == 'l' else lm['eye_r']
    r = lm['eye_radius']
    sc = r / 0.0158  # proportions relative to the eye size
    # control points: (dx toward the outside, dz above the eye centre, half thickness)
    ctrl = spec.get('shape', [[-0.017, 0.021, 0.0042], [-0.008, 0.025, 0.0040], [0.004, 0.0275, 0.0034], [0.016, 0.0255, 0.0026], [0.026, 0.019, 0.0014]])
    ctrl = np.array(ctrl) * sc
    n_along = 14
    t = np.linspace(0, 1, len(ctrl))
    ts = np.linspace(0, 1, n_along)
    dx = np.interp(ts, t, ctrl[:, 0])
    dz = np.interp(ts, t, ctrl[:, 1]) + spec.get('raise', 0.0)
    hw = np.interp(ts, t, ctrl[:, 2])
    lift = spec.get('lift', 0.0026)
    rows = [(-1.0, 0.0004), (-0.45, lift * 0.8), (0.0, lift), (0.45, lift * 0.8), (1.0, 0.0004)]
    pts, lifts = [], []
    for i in range(n_along):
        for v, lf in rows:
            x = e[0] + s * dx[i]
            z = e[2] + dz[i] + v * hw[i]
            hit = skin.ray(np.array([x, e[1] - 0.2, z]), (0.0, 1.0, 0.0), 0.4)
            p, nrm = (hit[0], hit[1]) if hit else (np.array([x, e[1] - 0.01, z]), np.array([0, -1.0, 0]))
            pts.append(p + nrm * lf)
            lifts.append(lf)
    pts = np.array(pts)
    nr = len(rows)
    faces = []
    for i in range(n_along - 1):
        for j in range(nr - 1):
            a, b = i * nr + j, i * nr + j + 1
            c, d = (i + 1) * nr + j + 1, (i + 1) * nr + j
            faces.append((a, d, c, b) if s > 0 else (a, b, c, d))
    bind = Binding(skin, pts)
    k = {name: bind.eval(kc) for name, kc in keys.items()}
    base = hex_lin(palette['brows'])
    dark = base * 0.72
    col = np.zeros((len(pts), 3))
    soft = spec.get('soft', 0.0)
    skin_c = hex_lin(palette.get('skin', '#c99273'))
    for i in range(n_along):
        for j, (v, _) in enumerate(rows):
            c_ = mix(base[None], dark[None], abs(v) * 0.6 + 0.15 * (1 - ts[i]))[0]
            if soft:
                # soft edges: the border rows and the thin tail melt into the skin (hairs, not paint)
                tail = smoothstep(0.7, 1.0, ts[i])
                c_ = mix(c_[None], skin_c[None], soft * (abs(v) ** 2 * 0.85 + 0.5 * tail))[0]
            col[i * nr + j] = c_
    return Part('brow_' + side, spec.get('material', 'Hair'), pts, faces, col=col, weights=rigid_weights(len(pts), bones, 'head'), keys=k)


def brow_tint(co, nrm, col, lm, palette, spec):
    """A soft shadow of the brows painted on the skin under the brow strips (`palette.brow_tint`:
    [amount, spread in m]): the brows then read as hair with a soft edge, not as a painted stripe."""
    bt = palette.get('brow_tint')
    if not bt:
        return col
    amount, spread = bt
    r = lm['eye_radius']
    sc = r / 0.0158
    ctrl = np.array(spec.get('shape', [[-0.017, 0.021, 0.0042], [-0.008, 0.025, 0.0040], [0.004, 0.0275, 0.0034], [0.016, 0.0255, 0.0026], [0.026, 0.019, 0.0014]])) * sc
    brow = hex_lin(palette['brows'])
    front = smoothstep(0.1, 0.5, -nrm[:, 1])
    for side, e in ((1.0, lm['eye_l']), (-1.0, lm['eye_r'])):
        ts = np.linspace(0, 1, 24)
        t = np.linspace(0, 1, len(ctrl))
        px = e[0] + side * np.interp(ts, t, ctrl[:, 0])
        pz = e[2] + np.interp(ts, t, ctrl[:, 1]) + spec.get('raise', 0.0)
        hw = np.interp(ts, t, ctrl[:, 2])
        near = (np.abs(co[:, 0] - e[0]) < 0.05) & (np.abs(co[:, 2] - e[2] - 0.022) < 0.03) & (co[:, 1] < e[1] + 0.02)
        idx = np.nonzero(near)[0]
        if len(idx) == 0:
            continue
        d2 = (co[idx, 0][:, None] - px[None]) ** 2 + (co[idx, 2][:, None] - pz[None]) ** 2
        k = np.argmin(d2, axis=1)
        d = np.sqrt(d2[np.arange(len(idx)), k])
        w = amount * np.exp(-0.5 * (np.maximum(d - hw[k], 0) / spread) ** 2) * (1 - 0.6 * ts[k]) * front[idx]
        col[idx] = mix(col[idx], brow[None], w)
    return col


def skin_colours(co, nrm, groups, lm, palette):
    """Painted skin: base tone, soft rosy cheeks / nose / ears, lips, darker inner mouth."""
    n = len(co)
    base = hex_lin(palette['skin'])
    col = np.tile(base, (n, 1))
    rosy = hex_lin(palette.get('cheeks', '#d77a6a'))
    r = lm['eye_radius']
    cp = palette.get('cheek_place', [0.55, -0.6, -2.0, 1.15])  # side, forward, down (eye radii), spread
    for e, s in ((lm['eye_l'], 1), (lm['eye_r'], -1)):
        c = e + np.array([s * cp[0] * r, cp[1] * r, cp[2] * r])
        d2 = ((co - c) ** 2).sum(1)
        w = palette.get('cheek_amount', 0.5) * np.exp(-d2 / (2 * (cp[3] * r) ** 2))
        if 'cheek_top' in palette:
            # fades out above `cheek_top` eye radii under the eye centre (the lens rim)
            ct = palette['cheek_top']
            w = w * smoothstep(e[2] - (ct - 0.35) * r, e[2] - (ct + 0.35) * r, co[:, 2])
        col = mix(col, rosy[None], w)
    d2 = ((co - lm['nose_tip']) ** 2).sum(1)
    col = mix(col, rosy[None], palette.get('nose_amount', 0.3) * np.exp(-d2 / (2 * (0.55 * r) ** 2)))
    # the neck under the jaw: warmer and a little deeper (no pale bib inside the collar)
    if 'neck' in palette:
        nk = smoothstep(lm['chin_z'] - 0.005, lm['chin_z'] - 0.035, co[:, 2]) * smoothstep(lm['chin_z'] - 0.2, lm['chin_z'] - 0.12, co[:, 2])
        col = mix(col, hex_lin(palette['neck'])[None], palette.get('neck_amount', 0.6) * nk)
    ears = groups['ears']
    col = mix(col, hex_lin(palette.get('ears', '#d9907a'))[None], 0.45 * np.clip(ears, 0, 1))
    lips = groups['lips']
    col = mix(col, hex_lin(palette.get('lips', '#c47466'))[None], palette.get('lips_amount', 0.85) * np.clip(lips, 0, 1))
    if palette.get('lip_line'):
        # a slightly darker vermilion border: the lip outline reads at a distance
        edge = smoothstep(0.06, 0.25, lips) * smoothstep(0.6, 0.32, lips)
        col = mix(col, col * np.array([0.8, 0.62, 0.6]), palette['lip_line'] * edge)
    # inner mouth: behind the lips, facing backwards
    m = lm['mouth']
    inner = (co[:, 1] > m[1] + 0.006) & (co[:, 1] < m[1] + 0.06) & (np.abs(co[:, 0]) < lm['mouth_w'] * 0.6) & (np.abs(co[:, 2] - m[2]) < 0.03) & (nrm[:, 1] > -0.2) & (lips < 0.5)
    col[inner] = hex_lin(palette.get('mouth', '#4a2420'))
    # smile creases: soft warm shading fanning out from the outer eye corners
    ec = palette.get('eye_crease')
    if ec:
        crease = hex_lin(ec[0])
        for e, s in ((lm['eye_l'], 1), (lm['eye_r'], -1)):
            d = co - (e + np.array([s * 1.3 * r, 0.25 * r, -0.1 * r]))
            u = d[:, 0] * s  # outwards
            v = d[:, 2]
            fan = np.exp(-(u / (0.7 * r)) ** 2 - (v / (0.45 * r + 0.25 * np.clip(u, 0, None))) ** 2) * (u > -0.4 * r)
            lines = 0.6 + 0.4 * np.cos(np.arctan2(v, np.abs(u) + 1e-4) * 9.0)
            col = mix(col, col * crease[None] / max(crease.max(), 1e-3), ec[1] * fan * lines * (nrm[:, 1] < 0.6))
    # a soft lid line around the eyes (reads at game distance; faint behind glasses)
    for e in (lm['eye_l'], lm['eye_r']):
        d = np.linalg.norm(co - e, axis=1)
        w = smoothstep(r * 1.02, r * 1.12, d) * smoothstep(r * 1.55, r * 1.2, d)
        lower = palette.get('lid_line_lower', 1.0) + (1 - palette.get('lid_line_lower', 1.0)) * smoothstep(e[2] - 0.2 * r, e[2] + 0.2 * r, co[:, 2])
        col = mix(col, (col * np.array([0.82, 0.7, 0.68])), palette.get('lid_line', 0.55) * w * lower)
    return col


def teeth_part(skin, lm, bones, palette, spec):
    """A strip of upper teeth behind the upper lip (shows when the lips part in the smile): it
    follows the lip's lower edge, found by front rays that fall into the mouth."""
    m = lm['mouth']
    half = spec.get('half_width', 0.8) * lm['mouth_w'] * 0.5
    th = spec.get('height', 0.0036)
    xs = np.linspace(-half, half, int(spec.get('columns', 13)))
    top, ys = [], []
    for x in xs:
        edge, ye = None, None
        for z in np.linspace(lm['lips_top'] + 0.004, lm['lips_bottom'], 80):
            hit = skin.ray(np.array([x, m[1] - 0.2, z]), (0.0, 1.0, 0.0), 0.4)
            if hit is None:
                continue
            if ye is not None and hit[0][1] > ye + 0.006:  # fell into the mouth: the upper lip ends just above
                edge = z
                break
            if hit[0][1] < m[1] + 0.012 + 0.25 * abs(x):  # on the lip
                ye = hit[0][1] if ye is None else min(ye, hit[0][1]) if z > m[2] else hit[0][1]
        if edge is None or ye is None:
            edge, ye = m[2] + 0.001, m[1] + 0.003
        top.append(edge)
        ys.append(ye)
    top, ys = np.array(top), np.array(ys)
    if spec.get('debug'):
        print('[mpfb] teeth edge z', np.round(top, 4).tolist(), 'y', np.round(ys, 4).tolist())
    ax = np.abs(xs) / half
    co, col, faces = [], [], []
    white = hex_lin(palette.get('teeth', '#efe8dc'))
    shade = hex_lin(palette.get('teeth_shade', '#b9ad9c'))
    rows = [(0.004, 0.0), (0.0, 0.0), (-th * 0.55, 0.0), (-th, 0.25)]
    gap = spec.get('gaps', 0.0)  # every other column: the line between two teeth
    for i, x in enumerate(xs):
        h_i = 1.0 - 0.35 * ax[i] ** 2
        between = gap if i % 2 == 1 else 0.0
        step = spec.get('gap_depth', 0.0) if i % 2 == 1 else 0.0
        for dz, dy in rows:
            co.append([x, ys[i] + spec.get('behind', 0.0035) + 0.004 * ax[i] ** 2 + dy * 0.004 + step, top[i] + dz * h_i])
            col.append(mix(white[None], shade[None], min(1.0, 0.75 * ax[i] ** 2 + between + (0.35 if dz < -th * 0.8 else 0.0)))[0])
    K = len(rows)
    for i in range(len(xs) - 1):
        for k in range(K - 1):
            a = i * K + k
            faces.append((a, a + 1, a + K + 1, a + K))
    co = np.array(co)
    faces = [f if np.cross(co[f[1]] - co[f[0]], co[f[2]] - co[f[0]]) @ np.array([0.0, -1.0, 0.0]) > 0 else f[::-1] for f in faces]
    return Part('teeth', 'Eye', co, faces, col=np.array(col), weights=rigid_weights(len(co), bones, 'head'))
