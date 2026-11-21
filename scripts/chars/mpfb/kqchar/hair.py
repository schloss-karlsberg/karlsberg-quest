"""Solid stylised hair: one sculpted shell with chunky clumps combed along a flow field.

No alpha cards: every lock is a closed, outward-wound tube, so the hair reads from behind and the
side and never needs sorting in three.js. The style is data (spec['hair']): hairline per azimuth,
volume, part position, comb directions, lock count / size, palette.

Head frame: the centre `hc` sits inside the skull; directions use azimuth `theta` (0 = front (-Y),
+90 = the character's left (+X), 180 = back) and elevation `phi` (0 = level with the centre).
"""
import math

import numpy as np

from .parts import Part, rigid_weights
from .util import Rng, hex_lin, mix, periodic_interp, smoothstep


def head_centre(lm):
    return np.array([0.0, (lm['head_back'] + lm['eye_y']) / 2 + 0.004, lm['eye_z'] + 0.018])


def dir_of(theta_deg, phi_deg):
    t, p = np.radians(theta_deg), np.radians(phi_deg)
    return np.stack([np.sin(t) * np.cos(p), -np.cos(t) * np.cos(p), np.sin(p)], axis=-1)


def angles_of(d):
    d = np.asarray(d)
    theta = np.degrees(np.arctan2(d[..., 0], -d[..., 1]))
    phi = np.degrees(np.arcsin(np.clip(d[..., 2], -1, 1)))
    return theta, phi


class HeadField:
    """Envelope radius of the head around `hc` (skull and ears), sampled on an angle grid."""

    def __init__(self, skin, hc, step=2.0):
        self.hc = hc
        self.step = step
        self.thetas = np.arange(-180.0, 180.0, step)
        self.phis = np.arange(-80.0, 90.0 + 1e-6, step)
        R = np.full((len(self.phis), len(self.thetas)), np.nan)
        for i, p in enumerate(self.phis):
            for j, t in enumerate(self.thetas):
                d = dir_of(t, p)
                hits = skin.ray_all(hc, d, 0.5)
                if hits:
                    R[i, j] = hits[-1][2]
        # fill holes (rays through the neck opening) from the row above
        for i in range(len(self.phis) - 2, -1, -1):
            bad = np.isnan(R[i])
            R[i, bad] = R[i + 1, bad]
        R[np.isnan(R)] = np.nanmean(R)
        self.R = R

    def radius(self, theta, phi):
        """Bilinear lookup (degrees, arrays ok)."""
        theta = np.mod(np.asarray(theta, dtype=np.float64) + 180.0, 360.0) - 180.0
        phi = np.clip(np.asarray(phi, dtype=np.float64), self.phis[0], self.phis[-1])
        fj = (theta - self.thetas[0]) / self.step
        fi = (phi - self.phis[0]) / self.step
        j0 = np.floor(fj).astype(int)
        i0 = np.clip(np.floor(fi).astype(int), 0, len(self.phis) - 2)
        tj, ti = fj - j0, np.clip(fi - i0, 0, 1)
        nj = len(self.thetas)
        j0m, j1m = np.mod(j0, nj), np.mod(j0 + 1, nj)
        R = self.R
        a = R[i0, j0m] * (1 - tj) + R[i0, j1m] * tj
        b = R[i0 + 1, j0m] * (1 - tj) + R[i0 + 1, j1m] * tj
        return a * (1 - ti) + b * ti


class Style:
    def __init__(self, spec):
        self.s = spec
        hl = np.array(spec['hairline'], dtype=np.float64)  # [theta >= 0, phi] mirrored unless 'hairline_right'
        th = np.concatenate([hl[:, 0], -hl[1:, 0]])
        ph = np.concatenate([hl[:, 1], hl[1:, 1]])
        if 'hairline_right' in spec:
            hr = np.array(spec['hairline_right'], dtype=np.float64)
            keep = th >= 0
            th = np.concatenate([th[keep], -hr[:, 0]])
            ph = np.concatenate([ph[keep], hr[:, 1]])
        self.hl_t, self.hl_p = th, ph

    def hairline(self, theta):
        return periodic_interp(np.asarray(theta) + 180.0, self.hl_t + 180.0, self.hl_p)

    def thickness(self, theta, phi):
        """Hair thickness (m) over the scalp, fading out at the hairline."""
        return self.volume(theta, phi) * self.edge(theta, phi, self.hairline(theta))

    def edge(self, theta, phi, h):
        """0 below the hairline h, 1 a few degrees above it (steeper at the swept-up front)."""
        at = np.abs(np.asarray(theta, dtype=np.float64))
        front = smoothstep(55.0, 15.0, at)
        e = self.s.get('edge_deg', 7.0) * (1 - 0.6 * front)
        e = e + (self.s.get('edge_back_deg', e) - e) * smoothstep(75.0, 150.0, at)  # a tapered back
        return smoothstep(h - 1.0, h + e, phi)

    def volume(self, theta, phi):
        """Thickness (m) without the hairline fade: volume on top, swept-up front, thinner sides."""
        s = self.s
        theta = np.asarray(theta, dtype=np.float64)
        phi = np.asarray(phi, dtype=np.float64)
        at = np.abs(theta)
        t = s['side'] + (s['top'] - s['side']) * smoothstep(-5.0, 55.0, phi)
        t = t + (s['back'] - s['side']) * smoothstep(100.0, 165.0, at) * smoothstep(-55.0, 20.0, phi) * (1 - smoothstep(30, 70, phi))
        h = self.hairline(theta)
        # the swept-up front: extra lift just behind the front hairline
        front = smoothstep(55.0, 15.0, at)
        bump = np.exp(-((phi - (h + s.get('front_peak_deg', 14.0))) / s.get('front_width_deg', 14.0)) ** 2)
        t = t + s['front_lift'] * front * bump
        # the short side of the part carries less volume
        part_theta = s.get('part_theta', -38.0)
        short = smoothstep(part_theta + 8, part_theta - 25, theta) * smoothstep(-150, -110, theta)
        return t * (1 - s.get('short_side_thin', 0.25) * short)


def _field(d, s):
    """Comb direction (unprojected) at unit direction d from the head centre (x left, y back, z up)."""
    x, y, z = d
    part = s.get('part_x', -0.36)
    main = np.array(s.get('comb_main', [0.6, 0.8, 0.05]))
    short = np.array(s.get('comb_short', [-0.8, 0.55, -0.1]))
    sw = smoothstep(part - 0.04, part + 0.04, x)
    F = main * sw + short * (1 - sw)
    back = smoothstep(-0.15, 0.45, y) * (1 - smoothstep(0.7, 0.95, z) * 0.5)
    F = F * (1 - back) + np.array(s.get("comb_back", [0.12, 0.15, -1.0])) * np.array([1.0 + 0.0 * x, 1.0, 1.0]) * back + np.array([0.25 * x, 0, 0]) * back
    g = s.get('gravity', 0.9) * (1 - smoothstep(0.15, 0.8, z))
    F = F + np.array([0.0, 0.2, -1.0]) * g
    front = smoothstep(-0.5, -0.85, y) * smoothstep(-0.1, 0.35, z) * (1 - smoothstep(0.75, 0.95, z))
    F = F * (1 - front) + np.array(s.get('comb_front', [0.45, 0.3, 1.0])) * front * 1.4
    return F


def _step(d, ds, spec, comb, sign):
    F = _field(d, spec if comb is None else dict(spec, comb_main=comb, comb_short=comb))
    Ft = F - (F @ d) * d
    n = np.linalg.norm(Ft)
    if n < 1e-9:
        return None
    nd = d + sign * Ft / n * ds
    return nd / np.linalg.norm(nd)


def _fibonacci(n):
    k = np.arange(n) + 0.5
    z = 1 - 2 * k / n
    r = np.sqrt(1 - z * z)
    a = np.pi * (1 + 5 ** 0.5) * k
    return np.stack([r * np.cos(a), r * np.sin(a), z], axis=1)


def clump_lines(field, st, spec, rng):
    """Evenly spaced comb lines over the scalp (designed seeds first, then greedy fill).

    Each line becomes one chunky clump of the sculpted shell. Lines run backwards to their root
    (the hairline, the part, or a neighbour) and forwards to a pointed tip a little below the
    hairline (sides, back) or until they come too close to a neighbour."""
    sep = spec.get('clump_sep', 0.026)
    stop = spec.get('clump_stop', 0.5)
    tip_below = spec.get('tip_below_deg', 10.0)
    max_len = spec.get('clump_max_len', 0.24)
    R0 = float(np.mean(field.R))
    ds = math.radians(spec.get('clump_step_deg', 1.5))
    samples = np.zeros((0, 3))
    owner = np.zeros(0, dtype=int)
    lines = []

    def near(d, dist):
        if len(samples) == 0:
            return False
        return bool(np.any(np.linalg.norm(samples - d, axis=1) * R0 < dist))

    def run(d, sign, comb, below):
        pts, L, prev = [], 0.0, None
        while L < max_len:
            nd = _step(d, ds, spec, comb, sign)
            if nd is None:
                break
            stepv = nd - d
            if prev is not None and stepv @ prev < 0.3 * np.linalg.norm(stepv) * np.linalg.norm(prev):
                break  # the flow turns back on itself (the part line, a whorl)
            th, ph = angles_of(nd)
            if ph < float(st.hairline(th)) - below or near(nd, stop * sep):
                break
            prev, d = stepv, nd
            pts.append(d)
            L += ds * R0
        return pts

    def add(d0, g):
        nonlocal samples, owner
        comb = g.get('comb') if g else None
        fwd = run(d0, 1.0, comb, g.get('tip_below_deg', tip_below) if g else tip_below)
        bwd = run(d0, -1.0, comb, 0.0)
        pts = np.array(bwd[::-1] + [d0] + fwd)
        if (len(pts) - 1) * ds * R0 < spec.get('clump_min_len', 0.03):
            return
        lid = len(lines)
        half = (g.get('width', 0.0) / 2 if g and 'width' in g else 0.0) or spec.get('clump_half', 0.62) * sep
        lines.append({'pts': pts, 'half': half * rng.uniform(0.9, 1.1), 'tint': rng.uniform(*spec.get('clump_tint', [-0.25, 0.45])),
                      'lift': (g.get('relief', 1.0) if g else 1.0) * rng.uniform(0.8, 1.2)})
        samples = np.vstack([samples, pts])
        owner = np.concatenate([owner, np.full(len(pts), lid)])

    for g in spec.get('clump_groups', []):
        for sd in g['seeds']:
            th = sd[0] + rng.uniform(-1, 1) * g.get('jitter_deg', 1.5)
            ph = sd[1] + (float(st.hairline(th)) if (len(sd) > 2 and sd[2]) else 0.0) + rng.uniform(-1, 1) * g.get('jitter_deg', 1.5)
            add(dir_of(th, ph), g)
    cand = _fibonacci(spec.get('clump_candidates', 900))
    cand = cand[rng.r.permutation(len(cand))]
    for d in cand:
        th, ph = angles_of(d)
        if ph < float(st.hairline(th)) + 1.5 or near(d, sep):
            continue
        add(d, None)
    return lines, R0


def build(skin, lm, spec, palette, bones, seed=7):
    """One closed, sculpted hair shell: volume from the style, chunky clumps along comb lines
    (grooves between them), pointed clump tips past the hairline, the rim tucked under the skin."""
    rng = Rng(seed)
    hc = head_centre(lm)
    field = HeadField(skin, hc)
    st = Style(spec)
    lines, R0 = clump_lines(field, st, spec, rng)
    base = hex_lin(palette['hair'])
    light = hex_lin(palette.get('hair_light', '#8a6448'))
    dark = hex_lin(palette.get('hair_dark', '#4a3426'))
    tuck = spec.get('tuck', 0.004)
    ext = spec.get('tip_ext_deg', 8.0)
    floor = spec.get('groove_floor', 0.62)
    relief = spec.get('relief', 0.005)
    power = spec.get('clump_power', 0.7)

    # ---- grid over the scalp: columns around the head, rows from below the hairline to the crown
    NJ = spec.get('cap_columns', 112)
    M = spec.get('cap_rows', 32)
    TH, PH = np.zeros((NJ, M)), np.zeros((NJ, M))
    for j in range(NJ):
        th = -180.0 + 360.0 * j / NJ
        h0 = float(st.hairline(th)) - 1.5 - ext
        u = np.linspace(0, 1, M) ** 0.9
        TH[j] = th
        PH[j] = h0 + (87.0 - h0) * u
    th = np.append(TH.ravel(), 0.0)
    ph = np.append(PH.ravel(), 90.0)
    D = dir_of(th, ph)
    # ---- clump coverage: nearest comb line sample per vertex
    C = np.zeros(len(D))
    Ctip = np.zeros(len(D))
    Sv = np.zeros(len(D))  # position along the owning clump (0 root, 1 tip)
    lid = np.full(len(D), -1)
    for k, L in enumerate(lines):
        P = L['pts']
        n = len(P)
        sk = np.linspace(0, 1, n)
        dist = np.linalg.norm(D[:, None, :] - P[None, :, :], axis=2) * R0
        a = np.argmin(dist, axis=1)
        dmin = dist[np.arange(len(D)), a]
        sv = sk[a]
        w = L['half'] * (0.6 + 0.4 * smoothstep(0.0, 0.12, sv)) * (1 - 0.8 * smoothstep(0.55, 1.0, sv))
        c = np.clip(1 - (dmin / w) ** 2, 0, 1) ** power * L['lift']
        better = c > C
        C = np.where(better, c, C)
        lid = np.where(better, k, lid)
        Sv = np.where(better, sv, Sv)
        Ctip = np.maximum(Ctip, np.clip(c, 0, 1) * smoothstep(0.35, 0.7, sv))
    Cc = np.clip(C, 0, 1)
    h = st.hairline(th)
    h_eff = h - ext * Ctip
    vol = st.volume(th, ph)
    e = st.edge(th, ph, h_eff)
    r = field.radius(th, ph)
    sink = tuck * smoothstep(h_eff + 2.0, h_eff - 1.5, ph)
    rad = r + (vol * (floor + (1 - floor) * Cc) + relief * C) * e + 0.0015 - sink
    # a side part: a groove along the comb field's parting line, from the front hairline to the crown
    pg = spec.get('part_groove')
    groove = np.zeros(len(D))
    if pg:
        px = spec.get('part_x', -0.36)
        groove = np.exp(-((D[:, 0] - px) / pg.get('width', 0.035)) ** 2) * smoothstep(pg.get('from_y', -1.0), pg.get('from_y', -1.0) + 0.15, -D[:, 1] * -1)
        groove = groove * smoothstep(pg.get('to_y', 0.2) + 0.12, pg.get('to_y', 0.2) - 0.05, D[:, 1]) * smoothstep(0.1, 0.35, D[:, 2])
        rad = rad - vol * e * pg.get('depth', 0.6) * groove
    if spec.get('smooth_passes'):
        # soften the shell (stylised look): smooth the hair's own height over the scalp grid, so
        # the clumps stay big rounded forms without small lumps; the tucked rim is held
        hh = (rad[:-1] - r[:-1]).reshape(NJ, M)
        held = (sink[:-1] > 1e-5).reshape(NJ, M) | (e[:-1] < 0.05).reshape(NJ, M)
        for _ in range(int(spec['smooth_passes'])):
            avg = hh.copy()
            avg[:, 1:-1] = 0.5 * hh[:, 1:-1] + 0.125 * (np.roll(hh, 1, 0)[:, 1:-1] + np.roll(hh, -1, 0)[:, 1:-1] + hh[:, :-2] + hh[:, 2:])
            hh = np.where(held, hh, avg)
        rad = np.append(r[:-1] + hh.ravel(), rad[-1])
    co = hc + D * rad[:, None]
    # ---- colour: a tint per clump (the lighter strands), darker grooves, a soft crest highlight
    tint = np.array([L['tint'] for L in lines] + [0.0])
    t = tint[lid]
    col = np.where((t >= 0)[:, None], mix(base[None], light[None], np.clip(t, 0, 1)), mix(base[None], dark[None], np.clip(-t, 0, 1)))
    col = mix(dark[None], col, 0.45 + 0.55 * smoothstep(0.0, 0.7, Cc))
    up = smoothstep(-0.1, 0.8, D[:, 2])
    col = mix(col, light[None], spec.get('crest', 0.3) * smoothstep(0.7, 1.0, Cc) * up)
    if spec.get('tips'):
        # lighter strand tips (the clump ends catch light, so the hair keeps its colour at a distance)
        col = mix(col, light[None] * spec.get('tip_boost', 1.12), spec['tips'] * np.clip(Ctip, 0, 1))
    rt = spec.get('root_tip')
    if rt:
        # a painterly value gradient along each clump: darker roots, lighter tips (big shapes, no noise)
        col = mix(col, dark[None], rt[0] * smoothstep(0.45, 0.0, Sv) * (lid >= 0))
        col = mix(col, light[None], rt[1] * smoothstep(0.35, 0.95, Sv) * Cc)
    ud = spec.get('under_dark')
    if ud:
        # darker underneath (the nape and the low sides sit in the head's own shade)
        col = mix(col, dark[None], ud * smoothstep(0.25, -0.35, D[:, 2]))
    if pg:
        col = mix(col, dark[None] * 0.8, pg.get('dark', 0.6) * groove)
        if 'scalp' in pg:
            px = spec.get('part_x', -0.36)
            core = np.exp(-((D[:, 0] - px) / (pg.get('width', 0.035) * 0.35)) ** 2) * (groove > 0.3)
            col = mix(col, hex_lin(pg['scalp'])[None], pg.get('scalp_amount', 0.6) * core)
    # ---- faces
    faces = []
    top = NJ * M
    for j in range(NJ):
        jn = (j + 1) % NJ
        for i in range(M - 1):
            faces.append((j * M + i, jn * M + i, jn * M + i + 1, j * M + i + 1))
        faces.append((j * M + M - 1, jn * M + M - 1, top))
    part = Part('hair', spec.get('material', 'Hair'), co, faces, col=col, weights=rigid_weights(len(co), bones, 'head'))
    return [part], hc, field, st
