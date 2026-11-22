"""Garment solids for the people tiers (the guide): the jacket's hanging hip part, a solid centre
zip and solid walking shoes. The rest of the wardrobe stays zones on the body (outfit.py).

- `skirt` (wardrobe.jacket.skirt): the jacket below the waist as a solid ring that hangs straight
  round the body's convex envelope (no dip into the crotch, no wrap over the buttocks) down to a
  straight hem (`outfit.hem_height`, `hem_above_crotch` over the crotch), with a hem band and a
  short lip turned in. Its top row tucks into the jacket zone and takes the body's own weights; lower
  rows blend from pelvis / spine_01 to the thighs (`legs`), like a coat's skirts.
- `zip_part` (wardrobe.jacket.zip_solid): a thin solid strip down the centre front, from the collar
  top over the chest and the skirt to the hem (rays from the front onto every given surface, the
  nearest hit wins), its depth smoothed so it runs straight.
- `shoes` (wardrobe.shoes.solid): a walking shoe per foot, sized from the foot it covers: a lofted
  upper (rounded heel, rounded toe box, the collar under the trouser hem) on a thick sole that stands
  a little proud. The foot faces inside it are dropped by the build. Weights from the skin under it.

Spec keys are listed with each function; every key is optional except the switch itself.
"""
import math

import numpy as np

from . import geom
from .outfit import bone_pos
from .parts import Part, limit_weights
from .util import hex_lin, smoothstep

TRUNK = ('pelvis', 'spine_01', 'spine_02')


def _dom(W, bones):
    return np.array(bones)[np.argmax(W, axis=1)]


def skin_weights(surface, W, pts):
    """Skin weights at points: the nearest triangle of the surface, barycentric."""
    out = np.zeros((len(pts), W.shape[1]))
    for i, p in enumerate(pts):
        loc, idx, _ = surface.nearest(p)
        b = surface.bary(loc, idx)
        out[i] = (W[surface.tris[idx]] * b[:, None]).sum(0)
    return out


def _orient(co, faces, ref):
    out = []
    for k, f in enumerate(faces):
        p = co[list(f)]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        out.append(f if n @ ref(p.mean(0), k) >= 0 else tuple(reversed(f)))
    return out


def _ring_smooth(r, passes):
    for _ in range(passes):
        r = 0.25 * np.roll(r, 1) + 0.5 * r + 0.25 * np.roll(r, -1)
    return r


def hang(co, nrm, faces, mats, W, bones, rig, jk, body_hem, jacket_mats=None):
    """jacket.hang: {from (m over the body hem, where the cloth starts to hang), slope (m inward per
    m down), rise (m inward per m up from the seat: the drape over it), amount (0..1, at the back),
    front (0..1, the amount at the front; between them by the angle round the body)}. Extra outward offset (m, along the normals) for the jacket's trunk
    vertices between the body hem and `from` above it: the cloth hangs straight down from the widest
    place above (the chest, the shoulder blades) and bridges the waist and the spine groove, instead
    of hugging them. Each height's envelope is the support of the trunk's slice (convex), per angle.
    `jacket_mats`: the zone materials that are the jacket (its panels too)."""
    hg = jk['hang']
    dom = _dom(W, bones)
    trunk = np.array([d in ('pelvis', 'spine_01', 'spine_02', 'spine_03') for d in dom])
    pel = bone_pos(rig, 'pelvis')[0]
    cx, cy = 0.0, float(pel[1])
    z0, z1 = body_hem - 0.02, body_hem + hg['from']
    Z = np.arange(z0, z1 + 1e-6, 0.01)
    A = np.radians(np.arange(0, 360, 6))
    D = np.stack([np.sin(A), -np.cos(A)], axis=1)
    pts = co[trunk]
    env = np.zeros((len(Z), len(A)))
    for i, z in enumerate(Z):
        sl = pts[np.abs(pts[:, 2] - z) < 0.02]
        if len(sl) < 6:
            sl = pts[np.argsort(np.abs(pts[:, 2] - z))[:30]]
        env[i] = _ring_smooth(((sl[:, :2] - np.array([cx, cy])) @ D.T).max(0), 2)
    slope = hg.get('slope', 0.12)
    R = env.copy()
    for i in range(len(Z) - 2, -1, -1):  # from the top down: never tighter than the hang from above
        R[i] = np.maximum(R[i], R[i + 1] - slope * (Z[i + 1] - Z[i]))
    rise = hg.get('rise', 0.0)
    if rise:  # from the bottom up: the cloth drapes out over the seat in a curve, not a corner
        for i in range(1, len(Z)):
            R[i] = np.maximum(R[i], R[i - 1] - rise * (Z[i] - Z[i - 1]))
    jms = set(jacket_mats or [jk['material']])
    on = np.zeros(len(co), dtype=bool)
    for k, f in enumerate(faces):
        if mats[k] in jms:
            on[list(f)] = True
    on &= trunk & (co[:, 2] > z0) & (co[:, 2] < z1)
    out = np.zeros(len(co))
    for i in np.nonzero(on)[0]:
        x, y, z = co[i]
        dx, dy = x - cx, y - cy
        r = math.hypot(dx, dy)
        if r < 1e-6:
            continue
        a = math.atan2(dx, -dy) % (2 * math.pi)
        zi = min(max((z - z0) / 0.01, 0), len(Z) - 1.001)
        ai = a / math.radians(6)
        i0, j0 = int(zi), int(ai) % len(A)
        fz, fa = zi - i0, ai - int(ai)
        j1 = (j0 + 1) % len(A)
        Rv = (R[i0, j0] * (1 - fa) + R[i0, j1] * fa) * (1 - fz) + (R[i0 + 1, j0] * (1 - fa) + R[i0 + 1, j1] * fa) * fz
        horiz = (nrm[i, 0] * dx + nrm[i, 1] * dy) / r
        fade = smoothstep(z1, z1 - 0.06, z)  # eases in below `from`
        back = 0.5 - 0.5 * math.cos(a)  # 0 at the front, 1 at the back
        amt = hg.get('front', hg.get('amount', 1.0)) + (hg.get('amount', 1.0) - hg.get('front', hg.get('amount', 1.0))) * back
        out[i] = max(0.0, Rv - r) / max(horiz, 0.45) * amt * fade
    return out


def _axis_ray(surface, cx, cy, z, d2, fallback):
    """Distance from the axis point (cx, cy, z) to the dressed surface along the horizontal d2,
    a hair outside it (the skirt's top row covers the jacket under it, no dark seam)."""
    hit = surface.ray(np.array([cx, cy, z]), (float(d2[0]), float(d2[1]), 0.0), 0.5)
    return float(np.hypot(hit[0][0] - cx, hit[0][1] - cy)) + 0.0015 if hit is not None else fallback


def skirt(co, faces, W, bones, rig, jk, palette, hem, surface):
    """jacket.skirt: {above_hem (m, the top over the hem), columns, rows (fractions top -> hem),
    clearance [top, hem] (m off the envelope), flare, settle (where the rows reach the envelope),
    top_in (m the top row sits under the jacket's surface),
    legs (thigh share at the hem), band (hem band height), band_out, lip, colour_band (palette key)}. `co` / `faces` / `W`: the dressed low skin."""
    sk = jk['skirt']
    dom = _dom(W, bones)
    trunk = np.array([d in TRUNK or d.startswith('thigh') for d in dom])
    pts = co[trunk]
    pel = bone_pos(rig, 'pelvis')[0]
    cx, cy = 0.0, float(pel[1])
    z_top = hem + sk['above_hem']
    band = sk.get('band', 0.018)
    K = int(sk.get('columns', 36))
    th = np.radians(np.arange(K) * 360.0 / K)  # 0 = front (-y), 90 = the figure's left (+x)
    d = np.stack([np.sin(th), -np.cos(th)], axis=1)
    ts = sk.get('rows', [0.0, 0.3, 0.65, 1.0])
    c0, c1 = sk.get('clearance', [-0.002, 0.012])
    flare = sk.get('flare', 0.006)
    rows, prev = [], None
    for t in ts:
        z = z_top + (hem + band - z_top) * t
        slab = pts[np.abs(pts[:, 2] - z) < 0.03]
        if len(slab) < 8:
            slab = pts[np.argsort(np.abs(pts[:, 2] - z))[:60]]
        env = ((slab[:, :2] - np.array([cx, cy])) @ d.T).max(0)
        rad = _ring_smooth(env, 2) + c0 + (c1 - c0) * smoothstep(0.0, 0.6, t) + flare * t ** 1.5
        # from the jacket itself at the top (rays from the axis: no step where the skirt starts) to
        # the hanging envelope lower down
        body_r = np.array([_axis_ray(surface, cx, cy, z, d[k], rad[k]) for k in range(K)])
        st = smoothstep(0.0, sk.get('settle', 0.55), t)
        # the top row just under the jacket (no ledge to look down into): the skirt comes out of it
        rad = body_r + (rad - body_r) * st - sk.get('top_in', 0.0) * (1.0 - st)
        if prev is not None:
            rad = np.maximum(rad, prev - 0.004)  # cloth hangs: never much tighter than above
        prev = rad
        rows.append((z, rad, t, 'cloth'))
    bo = sk.get('band_out', 0.003)
    rows.append((hem + band, prev + bo, 1.0, 'band'))  # the crisp colour step: a second ring
    rows.append((hem, prev + bo, 1.0, 'band'))
    rows.append((hem - 0.002, prev + bo - sk.get('lip', 0.009), 1.0, 'lip'))
    base = hex_lin(palette.get(jk['colour'], '#3c6a56'))
    band_c = hex_lin(palette[sk['colour_band']]) if sk.get('colour_band') in palette else base * 0.8
    co_s, col, Wv, t_of = [], [], [], []
    leg = sk.get('legs', 0.25)
    pi, s1 = bones.index('pelvis'), bones.index('spine_01')
    tl, tr = bones.index('thigh_l'), bones.index('thigh_r')
    for z, rad, t, kind in rows:
        for k in range(K):
            co_s.append([cx + d[k, 0] * rad[k], cy + d[k, 1] * rad[k], z])
            if kind == 'cloth':
                c = base * (0.9 - 0.06 * t)
            elif kind == 'band':
                c = band_c
            else:
                c = band_c * 0.6
            col.append(np.append(c, 1.0))
            kl = leg * smoothstep(0.0, 1.0, t) ** 1.2
            wl = smoothstep(-0.4, 0.4, math.sin(th[k]))
            w = np.zeros(len(bones))
            w[pi] += (1 - kl) * 0.75
            w[s1] += (1 - kl) * 0.25
            w[tl] += kl * wl
            w[tr] += kl * (1 - wl)
            Wv.append(w)
            t_of.append(t)
    co_s, Wv = np.array(co_s), np.array(Wv)
    # the top rows take the jacket's own weights (no seam opening at the waist in a twist)
    for r, b in ((0, 0.0), (1, 0.5)):
        sel = np.arange(r * K, (r + 1) * K)
        Wv[sel] = skin_weights(surface, W, co_s[sel]) * (1 - b) + Wv[sel] * b
    fcs, kinds = [], []
    for r in range(len(rows) - 1):
        if rows[r][3] == 'cloth' and rows[r + 1][3] == 'band':
            continue  # the duplicated ring: no faces between the two copies
        for k in range(K):
            kn = (k + 1) % K
            fcs.append((r * K + k, r * K + kn, (r + 1) * K + kn, (r + 1) * K + k))
            kinds.append(rows[r + 1][3])

    def ref(c, k):
        if kinds[k] == 'lip':
            return np.array([0.0, 0.0, -1.0])
        v = np.array([c[0] - cx, c[1] - cy, 0.0])
        return v / max(np.linalg.norm(v), 1e-9)

    fcs = _orient(co_s, fcs, ref)
    return Part('skirt', jk['material'], co_s, fcs, col=np.array(col), weights=limit_weights(Wv))


def trouser_hems(surface, W, bones, tr, so, palette):
    """trousers.hem: {columns, height (m up from the hem), out (m off the trouser surface at the lower
    edge), tuck (m off it at the top, negative: under it), lip (m the turned-in edge reaches in),
    colour_lip (palette key)}: a clean straight hem ring per leg at the
    shoe top (`shoes.top`), over the cut edge of the trouser zone, its lower edge turned in so the
    opening shows cloth, never the inside of the leg. Rays from the leg's axis onto the dressed surface;
    weights from the skin under it."""
    hm = tr['hem']
    K = int(hm.get('columns', 12))
    z0 = so['top'] if so else 0.08
    h = hm.get('height', 0.03)
    base = hex_lin(palette.get(tr['colour'], '#5b5f64'))
    lip_c = hex_lin(palette[hm['colour_lip']]) if hm.get('colour_lip') in palette else base * 0.8
    dom = _dom(W, bones)
    parts = []
    for s in ('l', 'r'):
        sel = np.array([d in (f'calf_{s}', f'foot_{s}') for d in dom]) & (surface.co[:, 2] > z0 - 0.01) & (surface.co[:, 2] < z0 + h + 0.03)
        P = surface.co[sel]
        cx, cy = float(P[:, 0].mean()), float(P[:, 1].mean())
        th = np.radians(np.arange(K) * 360.0 / K)
        d = np.stack([np.sin(th), -np.cos(th)], axis=1)
        rows = []
        for z, o in ((z0 + h, hm.get('tuck', -0.003)), (z0 + 0.004, hm.get('out', 0.003))):
            # the top row tucks under the trouser surface (no gap to look down into), the lower edge
            # stands out a little
            rr = np.array([_axis_ray(surface, cx, cy, z, d[k], 0.06) for k in range(K)])
            rows.append((z, _ring_smooth(rr, 1) + o))
        bot = np.maximum(rows[0][1], rows[1][1])  # the cloth hangs: the hem no tighter than above
        rows[1] = (rows[1][0], bot)
        rows.append((z0 - 0.003, bot))
        rows.append((z0 - 0.003, bot - hm.get('lip', 0.008)))
        co_s, col = [], []
        for r, (z, rad) in enumerate(rows):
            for k in range(K):
                co_s.append([cx + d[k, 0] * rad[k], cy + d[k, 1] * rad[k], z])
                col.append(np.append(base * (0.96, 0.93, 0.9)[r] if r < 3 else lip_c, 1.0))
        co_s = np.array(co_s)
        fcs = []
        for r in range(len(rows) - 1):
            for k in range(K):
                kn = (k + 1) % K
                fcs.append((r * K + k, r * K + kn, (r + 1) * K + kn, (r + 1) * K + k))
        cen = np.array([cx, cy])

        def ref(c, k, cen=cen):
            if k >= 2 * K:  # the turned-in lip faces down
                return np.array([0.0, 0.0, -1.0])
            v = np.array([c[0] - cen[0], c[1] - cen[1], 0.0])
            return v / max(np.linalg.norm(v), 1e-9)
        fcs = _orient(co_s, fcs, ref)
        parts.append(Part(f'hem_{s}', tr['material'], co_s, fcs, col=np.array(col), weights=limit_weights(skin_weights(surface, W, co_s))))
    return parts


def zip_part(surfaces, weights, jk, palette, bones, z_top, z_bot):
    """jacket.zip_solid: true, with zip_width, zip_thick, zip_raise, zip_colour (palette key),
    zip_pull (palette key: a lighter pull tab at the top, 2.5 cm). `weights[k]` are the skin weights
    of `surfaces[k]` per vertex: each zip ring takes the weights of the cloth under it (the hit
    triangle's, barycentric), so the zip moves with the jacket and never sinks through it."""
    n = int(jk.get('zip_samples', 28))
    path, ups, wts = [], [], []
    for z in np.linspace(z_top, z_bot, n):
        best, bk = None, -1
        for k, sf in enumerate(surfaces):
            hit = sf.ray(np.array([0.0, -0.6, z]), (0.0, 1.0, 0.0), 1.2)
            if hit is not None and (best is None or hit[3] < best[3]):
                best, bk = hit, k
        if best is not None:
            sf = surfaces[bk]
            tri = sf.tris[best[2]]
            path.append(best[0])
            ups.append(best[1])
            wts.append(sf.bary(best[0], best[2]) @ weights[bk][tri])
    path, ups, wts = np.array(path), np.array(ups), np.array(wts)
    y0 = path[:, 1].copy()
    for _ in range(3):
        path[1:-1, 1] = 0.25 * path[:-2, 1] + 0.5 * path[1:-1, 1] + 0.25 * path[2:, 1]
    path[:, 1] = np.minimum(path[:, 1], y0)  # smoothed, but never behind the cloth
    for _ in range(2):
        ups[1:-1] = 0.25 * ups[:-2] + 0.5 * ups[1:-1] + 0.25 * ups[2:]
    ups /= np.linalg.norm(ups, axis=1, keepdims=True)
    path = path + ups * jk.get('zip_raise', 0.0015)
    w, t = jk.get('zip_width', 0.009), jk.get('zip_thick', 0.0016)
    prof = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, t), (-w / 2, t)]
    co, faces = geom.sweep(path, ups, prof)
    tape = hex_lin(palette.get(jk.get('zip_colour', jk['trim']), '#26262a'))
    pull = hex_lin(palette.get(jk.get('zip_pull', ''), '#000000')) if jk.get('zip_pull') in palette else tape
    col = np.tile(np.append(tape, 1.0), (len(co), 1))
    col[co[:, 2] > z_top - 0.025, :3] = pull
    # sweep order: len(prof) vertices per path point, then one cap centre per end
    W = np.vstack([np.repeat(wts, len(prof), axis=0), wts[[0, -1]]])
    return Part('zip', jk['material'], co, faces, col=col, weights=limit_weights(W))


def shoes(co, W, bones, so, palette, surface):
    """shoes.solid: true, with sections, around, offset (m over the foot), sole_h, sole_flare,
    toe_extra, collar_z (the heel collar's height), toe_h (the toe box's lowest top), colour, sole,
    toe_shade. Returns the Parts (upper + sole per foot)."""
    parts = []
    dom = _dom(W, bones)
    sole_h = so['sole_h']
    off = so['offset']
    N = int(so.get('sections', 8))
    M = int(so.get('around', 8))
    upper_c = hex_lin(palette[so['colour']])
    sole_c = hex_lin(palette.get(so['sole'], '#2a2420'))
    for s in ('l', 'r'):
        sel = np.array([dd in (f'foot_{s}', f'ball_{s}') for dd in dom]) & (co[:, 2] < 0.16)
        P = co[sel]
        heel_y, toe_y = float(P[:, 1].max()), float(P[:, 1].min())
        L = heel_y - toe_y
        ts = np.linspace(0.0, 1.0, N)
        ys = heel_y + off * 0.4 - (L + off * 0.8 + so.get('toe_extra', 0.0)) * ts
        cx, hw, top = np.zeros(N), np.zeros(N), np.zeros(N)
        for j, y in enumerate(ys):
            sl = P[np.abs(P[:, 1] - y) < max(L / N, 0.02)]
            if len(sl) < 3:
                sl = P[np.argsort(np.abs(P[:, 1] - y))[:12]]
            cx[j] = (sl[:, 0].max() + sl[:, 0].min()) / 2
            hw[j] = (sl[:, 0].max() - sl[:, 0].min()) / 2 + off
            top[j] = sl[:, 2].max() + off * 0.6
        for arr in (cx, hw):
            arr[1:-1] = 0.25 * arr[:-2] + 0.5 * arr[1:-1] + 0.25 * arr[2:]
        # a rounded toe box and heel in plan (no pointed slipper); `toe_box`: the toe box keeps the
        # width of the ball of the foot and ends in a blunt, round cap
        if so.get('toe_box'):
            ball = int(np.argmin(np.abs(ts - 0.62)))
            hw = np.where(ts > ts[ball], np.maximum(hw, hw[ball] * so['toe_box']), hw)
            hw *= np.where(ts > 0.7, np.clip(1 - ((ts - 0.7) / 0.34) ** 4, 0.05, 1) ** 0.25, 1.0)
        else:
            hw *= np.where(ts > 0.72, np.sqrt(np.clip(1 - ((ts - 0.72) / 0.32) ** 2, 0.3, 1)), 1.0)
        hw *= np.where(ts < 0.15, np.sqrt(np.clip(1 - ((0.15 - ts) / 0.2) ** 2, 0.55, 1)), 1.0)
        collar = so.get('collar_z', 0.085)
        toe_h = so.get('toe_h', 0.028)  # the toe box's lowest top over the sole
        h = np.minimum(np.maximum(top, sole_h + toe_h), collar)  # never above the collar line
        h = np.where(ts > 0.8, np.maximum(h * (1 - 0.2 * (ts - 0.8) / 0.2), sole_h + toe_h * 0.85), h)
        h[1:-1] = 0.25 * h[:-2] + 0.5 * h[1:-1] + 0.25 * h[2:]
        phis = np.linspace(0.0, math.pi, M)
        r_heel, r_toe = hw[0] * 0.7, hw[-1] * so.get('toe_round', 0.9)
        # the rings of the upper: the sections, plus `nose` rings of a rounded nose at the heel and the
        # toe (quarter ellipses in plan and profile, down to an end point on the sole: the caps close
        # onto the sole with no gap)
        nose = int(so.get('nose', 0))
        shade_c = so.get('toe_shade', 0.82)
        R = []  # (y, cx, hw, h, ts)
        for i in range(nose, 0, -1):
            th = math.pi / 2 * i / (nose + 1)
            R.append((ys[0] + r_heel * math.sin(th), cx[0], hw[0] * math.cos(th), sole_h + (h[0] - sole_h) * math.cos(th) ** 0.6, -1.0))
        for j in range(N):
            R.append((ys[j], cx[j], hw[j], h[j], ts[j]))
        for i in range(1, nose + 1):
            th = math.pi / 2 * i / (nose + 1)
            R.append((ys[-1] - r_toe * math.sin(th), cx[-1], hw[-1] * math.cos(th), sole_h + (h[-1] - sole_h) * math.cos(th) ** 0.6, 2.0))
        NR = len(R)
        lace = so.get('lace')  # {colour, from, to}: a lace line down the instep (vertex colour)
        lace_c = hex_lin(palette[lace['colour']]) if lace else None
        mid = (M - 1) / 2.0
        ucol, uco = [], []
        for y_, cx_, hw_, h_, t_ in R:
            for k, ph in enumerate(phis):
                c_, s_ = math.cos(ph), math.sin(ph)
                uco.append([cx_ + hw_ * math.copysign(abs(c_) ** 0.55, c_), y_, sole_h + (h_ - sole_h) * abs(s_) ** 0.6])
                shade = shade_c if (t_ < 0.12 or t_ > 0.82) else 1.0
                c0 = upper_c * shade * (0.86 + 0.14 * abs(s_))
                if lace and lace.get('from', 0.3) <= t_ <= lace.get('to', 0.62):
                    w = max(0.0, 1.0 - abs(k - mid) / max(lace.get('half', 0.6), 1e-3))
                    c0 = c0 * (1 - w) + lace_c * w
                ucol.append(np.append(c0, 1.0))
        if nose:
            heel_p = [cx[0], ys[0] + r_heel, sole_h]
            toe_p = [cx[-1], ys[-1] - r_toe, sole_h]
        else:
            heel_p = [cx[0], ys[0] + r_heel, sole_h + (h[0] - sole_h) * 0.5]
            toe_p = [cx[-1], ys[-1] - r_toe, sole_h + (h[-1] - sole_h) * 0.45]
        ih, it = len(uco), len(uco) + 1
        uco += [heel_p, toe_p]
        ucol += [np.append(upper_c * shade_c, 1.0)] * 2
        uco = np.array(uco)
        fu = []
        for j in range(NR - 1):
            for k in range(M - 1):
                fu.append((j * M + k, j * M + k + 1, (j + 1) * M + k + 1, (j + 1) * M + k))
        for k in range(M - 1):
            fu.append((k + 1, k, ih))
            fu.append(((NR - 1) * M + k, (NR - 1) * M + k + 1, it))
        fu.append((0, M - 1, ih))  # the heel cap down to the sole
        fu.append(((NR - 1) * M + M - 1, (NR - 1) * M, it))
        fu = geom.fix_winding(uco, fu, np.array([cx.mean(), ys.mean(), sole_h + 0.02]))
        parts.append(Part(f'shoe_{s}', so['material'], uco, fu, col=np.array(ucol), weights=limit_weights(skin_weights(surface, W, uco))))
        # the sole: the upper's base outline (top inner ring), a little proud (outer rings), a flat bottom
        fl = so.get('sole_flare', 0.004)
        inner = [[r[1] + r[2], r[0]] for r in R] + [[toe_p[0], toe_p[1]]] + [[r[1] - r[2], r[0]] for r in reversed(R)] + [[heel_p[0], heel_p[1]]]
        inner = np.array(inner)
        ctr = inner.mean(0)
        outer = ctr + (inner - ctr) * 1.0
        nrm2 = np.zeros_like(inner)
        nn = len(inner)
        for i in range(nn):
            a, b = inner[(i - 1) % nn], inner[(i + 1) % nn]
            t2 = b - a
            nv = np.array([t2[1], -t2[0]])
            nv /= max(np.linalg.norm(nv), 1e-9)
            if nv @ (inner[i] - ctr) < 0:
                nv = -nv
            nrm2[i] = nv
        outer = inner + nrm2 * fl
        sco = [[*p, sole_h] for p in inner] + [[*p, sole_h] for p in outer] + [[*p, 0.0] for p in outer] + [[ctr[0], ctr[1], 0.0]]
        sco = np.array(sco)
        fs = []
        for i in range(nn):
            i2 = (i + 1) % nn
            fs.append((i, i2, nn + i2, nn + i))  # the proud ledge
            fs.append((nn + i, nn + i2, 2 * nn + i2, 2 * nn + i))  # the side
            fs.append((2 * nn + i2, 2 * nn + i, 3 * nn))  # the bottom
        fs = geom.fix_winding(sco, fs, np.array([ctr[0], ctr[1], sole_h * 0.5]))
        scol = np.tile(np.append(sole_c, 1.0), (len(sco), 1))
        scol[nn:2 * nn, :3] = sole_c * so.get('sole_top', 1.25)  # the top edge catches a little light
        scol[2 * nn:, :3] = sole_c * so.get('sole_bottom', 1.0)  # the tread side
        parts.append(Part(f'sole_{s}', so['material'], sco, fs, col=scol, weights=limit_weights(skin_weights(surface, W, sco))))
    return parts
