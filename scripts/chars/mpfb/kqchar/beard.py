"""Solid stylised beard: an offset shell of the face region (moustache, cheeks, jaw, chin, sideburns).

The shell shares the face's topology, so it follows every face morph exactly: each morph's beard is
the morphed skin pushed out along its own normals by the same thickness field, then smoothed with the
same linear operator. Thickness is fullest at the chin; the border rises out of the skin along an iso-line of the mask.
"""
import numpy as np
from mathutils import Vector, noise

from .bind import Surface, vertex_normals
from .parts import Part
from .util import hex_lin, mix, smoothstep


def mask(co, nrm, groups, lm, spec):
    """Soft beard coverage (0..1) per skin vertex and its thickness (m)."""
    sc = lm['eye_radius'] / 0.0158
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    ax = np.abs(x)
    mz = lm['mouth'][2]
    nb = lm['nose_bottom']
    up = spec.get('cheek_line', [[0.0, -0.002], [0.018, -0.001], [0.03, None], [0.046, None], [0.06, None], [0.075, None]])
    # the cheek line as heights: under the nose, under the nostrils, beside the mouth, on the cheek, up to the sideburn
    xs = np.array([0.0, 0.018, 0.031, 0.047, 0.062, 0.078]) * sc
    un = spec.get('under_nose', 0.002)
    zs = np.array([nb - un, nb - un * 0.8, mz + spec.get('corner_up', 0.016) * sc, mz + spec.get('cheek_up', 0.03) * sc,
                   lm['eye_z'] - spec.get('cheek_top_below_eye', 0.026) * sc, lm['ear_top'] - spec.get('sideburn_below_ear_top', 0.008)])
    zu = np.interp(ax, xs, zs)
    nz = np.array([noise.noise(Vector(p * 90.0)) for p in co])
    zu = zu + nz * spec.get('edge_noise', 0.0012)
    soft = spec.get('edge_width', 0.016)
    ms = spec.get('moustache_soft', soft)  # a tighter top edge under the nose
    soft_up = np.interp(ax, xs, [ms, ms, (ms + soft) / 2, soft, soft, soft])
    b_up = smoothstep(-soft_up / 2, soft_up / 2, zu - z)
    zl = lm['chin_z'] - spec.get('neck_drop', 0.022) * sc + spec.get('neck_slope', 0.55) * (y - lm['chin_y'])
    b_lo = smoothstep(-soft / 2, soft / 2, z - zl + nz * 0.002)
    b_back = smoothstep(soft / 2, -soft / 2, y - (lm['ear_front_y'] - spec.get('sideburn_gap', 0.004)))
    # the lips (an ellipse round the mouth slit, measured, not the MakeHuman 'lips' group, which
    # also covers the skin round the mouth) stay free; the moustache and chin hug them
    m = lm['mouth']
    cx = lm['mouth_corner_x'] + spec.get('lip_margin_x', 0.003) * sc
    cz = np.where(z > m[2], spec.get('upper_lip', 0.0075) * sc, spec.get('lower_lip', 0.0085) * sc)
    e = (x / cx) ** 2 + ((z - m[2]) / cz) ** 2
    b_lip = smoothstep(spec.get('lip_e0', 0.9), spec.get('lip_e1', 1.8), e)
    # the mouth's inside: behind the lips and facing back / up / down (not the receding skin at the corners)
    inner = (y > m[1] + 0.01) & (y < m[1] + 0.06) & (ax < cx * spec.get('inner_x', 1.1)) & (np.abs(z - m[2]) < 0.012) & (nrm[:, 1] > spec.get('inner_ny', -0.3))
    front = smoothstep(0.5, 0.2, nrm[:, 1])  # fade out on anything facing back into the head
    ears = 1.0 - smoothstep(0.1, 0.5, groups['ears'])
    B = b_up * b_lo * b_back * b_lip * front * ears
    if spec.get('nose_gap') is not None:  # nothing on the nose base or the nostrils
        g = spec['nose_gap']
        B *= 1.0 - smoothstep(nb - g - 0.003, nb - g, z) * smoothstep(0.03 * sc, 0.022 * sc, ax)
    B[inner] = 0.0
    if spec.get('debug_mask'):
        sel = (ax > 0.03) & (ax < 0.05) & (z < m[2] - 0.002) & (z > m[2] - 0.014) & (y < m[1] + 0.03)
        for i in np.nonzero(sel)[0][:12]:
            print('[mpfb] mask@ %s B %.2f up %.2f lo %.2f back %.2f lip %.2f front %.2f ears %.2f inner %d ny %.2f' % (
                np.round(co[i], 3).tolist(), B[i], b_up[i], b_lo[i], b_back[i], b_lip[i], front[i], ears[i], inner[i], nrm[i, 1]))
    # thickness: moustache thin, cheeks medium, jaw fuller, chin fullest (rounded)
    chin = np.exp(-((x / (0.032 * sc)) ** 2 + ((z - (lm['chin_z'] + 0.014 * sc)) / (0.032 * sc)) ** 2))
    jaw = smoothstep(mz + 0.004, lm['chin_z'] + 0.012, z)
    T = spec.get('cheek', 0.009) + (spec.get('jaw', 0.016) - spec.get('cheek', 0.009)) * jaw
    T = T + (spec.get('chin', 0.026) - spec.get('jaw', 0.016)) * chin
    T = T * (spec.get('lip_thin', 0.3) + (1 - spec.get('lip_thin', 0.3)) * smoothstep(1.0, spec.get('lip_full_e', 4.0), e))  # short next to the lips
    must = smoothstep(mz - 0.002, mz + 0.006, z) * smoothstep(0.04 * sc, 0.03 * sc, ax)
    T = T * (1 - must) + spec.get('moustache', 0.0065) * must
    side = smoothstep(0.055 * sc, 0.075 * sc, ax) * smoothstep(mz, lm['eye_z'] - 0.03, z)
    T = T * (1 - side) + spec.get('sideburn', 0.005) * side
    return B, T, chin


def subdivide(co, faces, mark, arrays):
    """Split the marked quads into four (edge midpoints + centre), linearly, so the new vertices lie
    on the skin's own facets. `arrays` (per-vertex, any trailing shape) are interpolated the same
    way. Returns co, faces, arrays and the 'hanging' midpoints (on an edge shared with an unsplit
    face, to be kept on that straight edge) as (vertex, a, b)."""
    co = list(co)
    arr = [list(x) for x in arrays]
    mid = {}
    out = []
    owner = {}
    for f in faces:
        for k in range(len(f)):
            e = (min(f[k], f[(k + 1) % len(f)]), max(f[k], f[(k + 1) % len(f)]))
            owner.setdefault(e, []).append(bool(mark.get(f, False)))

    def new_vertex(ids):
        co.append(np.mean([co[i] for i in ids], axis=0))
        for x in arr:
            x.append(np.mean([x[i] for i in ids], axis=0))
        return len(co) - 1

    for f in faces:
        if not mark.get(f, False) or len(f) != 4:
            out.append(f)
            continue
        m = []
        for k in range(4):
            a, b2 = f[k], f[(k + 1) % 4]
            e = (min(a, b2), max(a, b2))
            if e not in mid:
                mid[e] = new_vertex(e)
            m.append(mid[e])
        c = new_vertex(f)
        a0, a1, a2, a3 = f
        out += [(a0, m[0], c, m[3]), (m[0], a1, m[1], c), (c, m[1], a2, m[2]), (m[3], c, m[2], a3)]
    hanging = [(v, e[0], e[1]) for e, v in mid.items() if not all(owner[e])]
    return np.array(co), out, [np.array(x) for x in arr], hanging


def build(co, faces, keys, nrm, groups, W, lm, spec, palette, hc, lo=None):
    B0, _, _ = mask(co, nrm, groups, lm, spec)
    # ---- the beard patch of the skin, split finer where the border runs (a smooth outline)
    region = [f for f in faces if B0[list(f)].max() > 0.02]
    used = sorted({i for f in region for i in f})
    remap = -np.ones(len(co), dtype=int)
    remap[used] = np.arange(len(used))
    pf = [tuple(int(i) for i in remap[list(f)]) for f in region]
    idx = np.array(used)
    gnames = sorted(groups)
    key_names = list(keys)
    arrays = [nrm[idx], W[idx]] + [groups[g][idx] for g in gnames] + [keys[k][idx] for k in key_names]
    pco = co[idx]
    hanging = []
    for _ in range(spec.get('subdiv', 1)):
        pn = arrays[0] / np.linalg.norm(arrays[0], axis=1, keepdims=True)
        Bp, _, _ = mask(pco, pn, {g: arrays[2 + i] for i, g in enumerate(gnames)}, lm, spec)
        # split only where the border runs (the interior keeps the skin's resolution)
        mark = {f: Bp[list(f)].min() < spec.get('split_below', 0.55) and Bp[list(f)].max() > spec.get('split_above', 0.08) for f in pf}
        pco, pf, arrays, h = subdivide(pco, pf, mark, arrays)
        hanging += h
    pn = arrays[0] / np.linalg.norm(arrays[0], axis=1, keepdims=True)
    pW = arrays[1]
    pgroups = {g: arrays[2 + i] for i, g in enumerate(gnames)}
    pkeys = {k: arrays[2 + len(gnames) + i] for i, k in enumerate(key_names)}
    B, T, chin = mask(pco, pn, pgroups, lm, spec)
    # shell directions from the clean (split, not yet projected or snapped) patch, per morph
    vns = {None: vertex_normals(pco, pf)}
    vns.update({k: vertex_normals(v, pf) for k, v in pkeys.items()})
    lo_dn = np.zeros(len(pco))
    if lo is not None:
        # how far the visible (decimated) skin sits above (+) or below (-) the patch, along the normal
        vn0 = vns[None] / np.linalg.norm(vns[None], axis=1, keepdims=True)
        lo_dn = np.einsum('ij,ij->i', np.array([lo.nearest(p)[0] for p in pco]) - pco, vn0)

    tau = spec.get('edge_iso', 0.35)
    band = spec.get('edge_band', 0.12)
    tuck = spec.get('tuck', 0.0012)
    # relief: vertical clumps across the face, plus a little noise
    ang = np.arctan2(pco[:, 0], -(pco[:, 1] - hc[1]))
    nz = np.array([noise.noise(Vector(p * 90.0 + 3.1)) for p in pco])
    ridge = 0.5 + 0.5 * np.sin(2 * np.pi * ang * 0.09 / spec.get('clump_width', 0.011) + nz * 2.5)
    # the border: the shell rises out of the skin along the B = tau iso-line, a few millimetres
    # proud right away (a defined edge), fuller inside
    rim = smoothstep(tau, tau + spec.get('edge_soft', 0.3), B)
    edge = smoothstep(tau - band, tau, B)
    t = (-tuck + (spec.get('edge_min', 0.004) + tuck) * edge + T * rim) * (1 + spec.get('relief', 0.16) * (ridge - 0.5))
    # follow the visible skin exactly at the border (so 'sunk' is under it), and only where it
    # bulges out inside (no facet creases copied into the beard)
    rw = smoothstep(0.1, 0.6, rim)
    t = t + lo_dn * (1 - rw) + np.maximum(lo_dn, 0.0) * rw
    # cut the patch along the outline (marching triangles on the level t = L): the border becomes
    # the exact iso-line of the piecewise-linear thickness, a smooth curve, a hair under the skin
    L = -spec.get('cut_below', 0.0004)
    vals = {'co': pco, 'ridge': ridge, 'chin': chin, 'rim': rim, 'B': B, 'W': pW}
    vals.update({'k:' + k: v for k, v in pkeys.items()})
    vals.update({'n:' + str(k): v for k, v in vns.items()})
    vals = {k: list(v) for k, v in vals.items()}
    tl = list(t)
    cross = {}

    def x(a2, b2):
        e = (min(a2, b2), max(a2, b2))
        if e not in cross:
            u = (tl[e[0]] - L) / (tl[e[0]] - tl[e[1]])
            for arr in vals.values():
                arr.append(arr[e[0]] + u * (arr[e[1]] - arr[e[0]]))
            tl.append(L)
            cross[e] = len(tl) - 1
        return cross[e]

    keep = []
    for f in pf:
        if (B[list(f)] <= 0.0).any():
            continue
        for tri in ((f[0], f[1], f[2]), (f[0], f[2], f[3])) if len(f) == 4 else (tuple(f),):
            up = [tl[i] > L for i in tri]
            n_up = sum(up)
            if n_up == 3:
                keep.append(tri)
            elif n_up == 1:
                k = up.index(True)
                o, p2, q = tri[k], tri[(k + 1) % 3], tri[(k + 2) % 3]
                keep.append((o, x(o, p2), x(o, q)))
            elif n_up == 2:
                k = up.index(False)
                o, p2, q = tri[k], tri[(k + 1) % 3], tri[(k + 2) % 3]
                keep.append((p2, q, x(q, o), x(o, p2)))
    pco = np.array(vals['co'])
    ridge, chin, rim, B, pW = (np.array(vals[k]) for k in ('ridge', 'chin', 'rim', 'B', 'W'))
    pkeys = {k: np.array(vals['k:' + k]) for k in pkeys}
    vns = {k: np.array(vals['n:' + str(k)]) for k in vns}
    t = np.array(tl)
    used = sorted({i for f in keep for i in f})
    remap = -np.ones(len(pco), dtype=int)
    remap[used] = np.arange(len(used))
    rf = [tuple(int(i) for i in remap[list(f)]) for f in keep]
    sidx = np.array(used)
    hang = [(remap[v], remap[a], remap[b2]) for v, a, b2 in hanging if remap[v] >= 0 and remap[a] >= 0 and remap[b2] >= 0]
    edge_count = {}
    for f in rf:
        for k in range(len(f)):
            e = (min(f[k], f[(k + 1) % len(f)]), max(f[k], f[(k + 1) % len(f)]))
            edge_count[e] = edge_count.get(e, 0) + 1
    boundary = np.zeros(len(sidx), dtype=bool)
    for (a, c), n in edge_count.items():
        if n == 1:
            boundary[a] = boundary[c] = True
    E = np.array(sorted(edge_count.keys()), dtype=int).reshape(-1, 2)
    deg = np.zeros(len(sidx))
    np.add.at(deg, E[:, 0], 1)
    np.add.at(deg, E[:, 1], 1)
    t, rim, ridge, chin, b = t[sidx], rim[sidx], ridge[sidx], chin[sidx], B[sidx]
    calm = smoothstep(0.2, 0.8, rim)  # the edge band keeps its exact profile (no smoothing)
    down = np.array([0.0, -0.25, -1.0])
    down /= np.linalg.norm(down)
    iters = spec.get('smooth_iters', 6)

    def shell(skin_co, key=None):
        sc_ = skin_co[sidx]
        vn = vns[key][sidx]
        vn = vn / np.linalg.norm(vn, axis=1, keepdims=True)
        dvec = vn + (chin * spec.get('chin_down', 0.6))[:, None] * down
        dvec /= np.linalg.norm(dvec, axis=1, keepdims=True)
        P = sc_ + dvec * t[:, None]
        # smooth the height only (along the normals): a calmer surface than the skin below
        for _ in range(iters):
            acc = np.zeros_like(P)
            np.add.at(acc, E[:, 0], P[E[:, 1]])
            np.add.at(acc, E[:, 1], P[E[:, 0]])
            Q = 0.5 * P + 0.5 * acc / np.maximum(deg, 1)[:, None]
            dn = np.einsum('ij,ij->i', Q - P, vn) * calm
            dn[boundary | (deg == 0)] = 0.0
            P = P + vn * dn[:, None]
        for v, a, b2 in hang:  # no cracks where split and unsplit faces meet
            P[v] = 0.5 * (P[a] + P[b2])
        return P

    P = shell(pco)
    kk = {name: shell(kc, name) for name, kc in pkeys.items()}
    base = hex_lin(palette['beard'])
    light = hex_lin(palette.get('beard_light', '#8a6448'))
    dark = hex_lin(palette.get('beard_dark', '#4a3426'))
    c = mix(dark[None], base[None], 0.8 + 0.2 * rim)  # the outline comes from the shape, not a dark band
    c = mix(c, light[None], spec.get('highlight', 0.3) * ridge * rim * smoothstep(0.006, 0.02, t))
    if spec.get('debug_t'):
        c = np.stack([np.clip(t / 0.01, 0, 1), b, np.clip(-t / 0.001, 0, 1)], axis=1)
    part = Part('beard', spec.get('material', 'Beard'), P, rf, col=c, weights=pW[sidx], keys=kk)
    part.pin = boundary | (t < 0)  # sunk vertices stay sunk (see clear_surface)
    return part, B0


def clear_surface(part, surface, margin):
    """Push the beard out where the (decimated) visible skin would poke through it; the tucked rim
    stays. The same offsets go into every morph, so the beard keeps following the face."""
    push = np.zeros_like(part.co)
    for i, p in enumerate(part.co):
        if part.pin[i]:
            continue
        loc, fi, _ = surface.nearest(p)
        n = surface.smooth_normal(loc, fi)
        sd = (p - loc) @ n
        if sd < margin:
            push[i] = n * (margin - sd)
    part.co = part.co + push
    part.keys = {k: v + push for k, v in part.keys.items()}
    return int((np.linalg.norm(push, axis=1) > 0).sum())


def displace(co, faces, keys, nrm, groups, lm, spec, palette, hc):
    """The beard as part of the skin itself (`beard.mode: skin`): the face region is pushed out
    along smoothed normals by the thickness field, so skin and beard are ONE closed surface (no
    border where two meshes cut each other, no gaps at the mouth corners). The outline is a soft
    rounded rise plus a colour fade into the skin. Returns (co, keys, weight, colour): the displaced
    skin, its displaced morph keys, the beard-colour weight per vertex and the beard colours."""
    B, T, chin = mask(co, nrm, groups, lm, spec)
    n = len(co)
    E = set()
    for f in faces:
        for k in range(len(f)):
            a, b = f[k], f[(k + 1) % len(f)]
            E.add((min(a, b), max(a, b)))
    E = np.array(sorted(E))
    deg = np.bincount(E.ravel(), minlength=n).astype(float)

    def avg(v):
        acc = np.zeros_like(v)
        np.add.at(acc, E[:, 0], v[E[:, 1]])
        np.add.at(acc, E[:, 1], v[E[:, 0]])
        return acc / np.maximum(deg, 1)[:, None] if v.ndim == 2 else acc / np.maximum(deg, 1)

    # smoothed normals: the push direction ignores small facets and fans out less in creases
    ns = nrm.copy()
    for _ in range(spec.get('normal_smooth', 10)):
        ns = 0.5 * ns + 0.5 * avg(ns)
        ns /= np.maximum(np.linalg.norm(ns, axis=1, keepdims=True), 1e-9)
    down = np.array([0.0, 0.0, -1.0])
    d = ns + (chin * spec.get('chin_down', 0.5))[:, None] * down
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    # thickness: a rounded rise at the outline (sqrt profile), then a calm surface
    rise = smoothstep(spec.get('rise_from', 0.04), spec.get('rise_to', 0.6), B)
    nz = np.array([noise.noise(Vector(p * 60.0 + 1.7)) for p in co])
    ang = np.arctan2(co[:, 0], -(co[:, 1] - hc[1]))
    ridge = 0.5 + 0.5 * np.sin(2 * np.pi * ang * 0.09 / spec.get('clump_width', 0.011) + nz * 2.0)
    t = T * np.sqrt(rise) * (1 + spec.get('relief', 0.1) * (ridge - 0.5))
    for _ in range(spec.get('thickness_smooth', 4)):
        t = np.where(B > 0, 0.5 * t + 0.5 * avg(t), t)
    t[B <= 0] = 0.0
    print('[mpfb] skin beard: B>0.5 %d verts, t max %.4f, p90 %.4f, T max %.4f' % ((B > 0.5).sum(), t.max(), np.percentile(t[B > 0.5], 90) if (B > 0.5).any() else 0, T.max()))
    disp = d * t[:, None]
    inside = B > 0
    # calm the push vectors (concave spots: the mouth corners, under the chin) so the surface does
    # not fold over; then shrink the push wherever a face still turns over
    for _ in range(spec.get('disp_smooth', 4)):
        disp = np.where(inside[:, None], 0.5 * disp + 0.5 * avg(disp), disp)
    disp[~inside] = 0.0
    F = np.array([f[:3] for f in faces])

    def folds(dv):
        c2 = co + dv
        n0 = np.cross(co[F[:, 1]] - co[F[:, 0]], co[F[:, 2]] - co[F[:, 0]])
        n1 = np.cross(c2[F[:, 1]] - c2[F[:, 0]], c2[F[:, 2]] - c2[F[:, 0]])
        dot = np.einsum('ij,ij->i', n0, n1)
        return dot < 0.2 * np.linalg.norm(n0, axis=1) * np.linalg.norm(n1, axis=1)

    for it in range(12):
        bad = folds(disp)
        if not bad.any():
            break
        vs = np.unique(F[bad].ravel())
        disp[vs] *= 0.7
        disp = np.where(inside[:, None], 0.6 * disp + 0.4 * avg(disp), disp)
    print('[mpfb] skin beard folds left: %d' % folds(disp).sum())
    co2 = co + disp
    keys2 = {k: v + disp for k, v in keys.items()}
    # colour: base colour from the palette, lighter crests, darker grooves, a soft fade at the outline
    base = hex_lin(palette['beard'])
    light = hex_lin(palette.get('beard_light', '#8a6448'))
    dark = hex_lin(palette.get('beard_dark', '#4a3426'))
    var = spec.get('colour_var', 0.25)  # strand variation: kept low so the beard reads as one mass
    c = mix(dark[None], base[None], 1 - var + var * smoothstep(0.2, 0.7, ridge))
    c = mix(c, light[None], spec.get('highlight', 0.2) * smoothstep(0.6, 1.0, ridge) * smoothstep(0.004, 0.015, t))
    w = smoothstep(spec.get('fade_from', 0.06), spec.get('fade_to', 0.45), B)
    return co2, keys2, w, c


SOLID_DEFAULTS = {
    # cheek line (top) and neck line (bottom): [theta deg from the front, landmark, dz (m)], mirrored
    'upper': [[0, 'nose', -0.0025], [9, 'nose', -0.003], [18, 'nose', -0.007], [28, 'mouth', 0.017], [42, 'mouth', 0.029],
              [58, 'eye', -0.036], [74, 'eye', -0.027], [88, 'ear_top', -0.013], [94, 'ear_top', -0.008]],
    'lower': [[0, 'chin', -0.03], [30, 'chin', -0.024], [55, 'chin', -0.01], [75, 'ear_bottom', -0.03], [94, 'ear_bottom', -0.012]],
    'theta_max': 94, 'columns': 60, 'rows': 30, 'rows_moustache': 6, 'rows_lip': 3, 'corner_blend_deg': 24,
    'cheek': 0.011, 'jaw': 0.02, 'chin': 0.03, 'moustache': 0.009, 'sideburn': 0.006,
    'edge_min': 0.0028, 'tuck': 0.003, 'edge_rows': 4, 'drop': 0.009, 'lip_rim': 0.0012, 'lip_rise': 0.45,
    'clumps': 28, 'clump_depth': 0.22, 'lip_margin': 0.0012, 'lip_corner_pow': 6.0, 'throat': 0.0, 'near_blend': [0.012, 0.003],
    # a broken, irregular cheek line (m, between the sideburn and the moustache) and irregular clump spacing
    'edge_jitter': 0.0, 'edge_jitter_from': 24.0, 'spacing_jitter': 0.0, 'seed': 3,
    # smoothing passes over the shell surface (more = softer, bigger forms for a stylised look)
    'round_passes': 2,
    # stubble tint on the skin under and just beyond the beard edge (m of fade above the cheek line / below the neck line)
    'stubble_fade': [0.009, 0.012],
    # a feathered edge: the rise from the edge follows smoothstep ** edge_pow (0.5 = the default round
    # step; ~1 = a longer, softer taper), the clump relief fades out over the edge rows (no notches
    # along the outline), the cheek-line rows blend toward the stubble colour (`edge_tint`), and the
    # moustache roots darken (`moustache_dark`) so it parts from the skin by value; `edge_rows_cheek`
    # (0 = edge_rows) lengthens the rise along the cheek line only; `edge_tint_colour`
    # (a spec key, not a default here) names the palette colour of the cheek line, default 'stubble'
    # `clump_soft` (0..1) rounds the clump grooves and lifts their floor (shallower, lighter streaks)
    'edge_pow': 0.5, 'clump_soft': 0.0, 'clump_edge_fade': False, 'edge_tint': 0.0, 'moustache_dark': 0.0, 'edge_rows_cheek': 0,
}


def _land(lm, ref):
    return {'nose': lm['nose_bottom'], 'mouth': lm['mouth'][2], 'eye': lm['eye_z'], 'ear_top': lm['ear_top'],
            'ear_bottom': lm['ear_bottom'], 'chin': lm['chin_z']}[ref]


def _lip_contour(co, nrm, lips, lm, margin):
    """The lips seen from the front: per-x upper and lower z of the lip skin (follows the smile)."""
    sel = (lips > 0.4) & (nrm[:, 1] < 0.1) & (co[:, 1] < lm['mouth'][1] + 0.02)
    c = co[sel]
    cx = float(np.abs(c[:, 0]).max())
    xs = np.linspace(0.0, cx, 12)
    up, lo = [], []
    for x0 in xs:
        b = c[np.abs(np.abs(c[:, 0]) - x0) < 0.004]
        if len(b) == 0:
            up.append(up[-1] if up else lm['lips_top'])
            lo.append(lo[-1] if lo else lm['lips_bottom'])
            continue
        up.append(b[:, 2].max())
        lo.append(b[:, 2].min())
    up, lo = np.array(up), np.array(lo)
    up[1:-1] = 0.25 * up[:-2] + 0.5 * up[1:-1] + 0.25 * up[2:]
    lo[1:-1] = 0.25 * lo[:-2] + 0.5 * lo[1:-1] + 0.25 * lo[2:]
    lo_out = lo - margin[1]
    if len(margin) > 3 and margin[3]:
        # tuck the lower lip: the beard's lower edge rides up over this fraction of the lips' height
        lo_out = lo + margin[3] * (up - lo)
    return xs, up + margin[0], lo_out, cx + margin[2]


def solid(skin, W, keys, lm, spec, palette, bones, lips=None):
    """The beard as a sculpted solid shell (like the hair) on a structured grid over the jaw.

    Columns fan round the face from a centre inside the jaw; rows run from the cheek line down to the
    neck line, both smooth curves, so the outline is clean. Two rows of every column inside the mouth
    width sit exactly on the lip outline (upper and lower), and a column lands on each mouth corner, so
    the lip opening is cut along whole grid rows: a clean loop that follows the smile, no stair steps.
    The shell stands off the skin by the thickness field (fullest at the chin, breaking the jaw
    outline); its outermost ring tucks under the skin (one soft-rounded edge, no gaps) and it thins to
    the lips round the opening. Weights and morph deltas come from the skin under each grid point, so
    it follows the smile and the jaw."""
    s = dict(SOLID_DEFAULTS)
    s.update({k: v for k, v in spec.items() if k in SOLID_DEFAULTS})
    m = lm['mouth']
    o = np.array([0.0, m[1] + spec.get('centre_back', 0.1), m[2] + 0.01])
    tmax = s['theta_max']
    NV, R1, R2 = int(s['rows']), int(s['rows_moustache']), int(s['rows_lip'])
    i_u, i_l = R1, R1 + R2

    def line(tab, th):
        xs = np.array([r[0] for r in tab], dtype=float)
        zs = np.array([_land(lm, r[1]) + r[2] for r in tab])
        return np.interp(np.abs(th), xs, zs)

    def d_of(t, p):
        t, p = np.radians(t), np.radians(p)
        return np.stack([np.sin(t) * np.cos(p), -np.cos(t) * np.cos(p), np.sin(p)], axis=-1)

    # cast on the head and neck only (no shoulders in the way), from outside: the outermost skin
    zc_cut = lm['chin_z'] - spec.get('neck_cut', 0.06)
    tco = skin.co[skin.tris]
    keep = (tco[:, :, 2].min(1) > zc_cut) & (np.abs(tco[:, :, 0]).max(1) < 0.13)
    tmap = np.nonzero(keep)[0]
    head = Surface(skin.co, skin.tris[keep])

    def hit(dv):
        h = head.ray(o + dv * 0.3, -dv, 0.3)
        return None if h is None else (h[0], h[1], int(tmap[h[2]]), h[3])

    phis = np.arange(-84.0, 46.0, 1.0)

    def column(t):
        zs = []
        for p in phis:
            h = hit(d_of(t, p))
            zs.append(h[0][2] if h is not None else np.nan)
        zs = np.array(zs)
        ok = ~np.isnan(zs)
        zv, pv = zs[ok], phis[ok]
        i0 = int(np.argmin(zv))  # below the lowest hit the rays graze the neck: start there
        return np.maximum.accumulate(zv[i0:]), pv[i0:]  # z rises with the ray elevation

    def phi_at(prof, zq):
        return float(np.interp(zq, prof[0], prof[1]))

    # ---- the lip outline (front view): per-x upper / lower contour, superelliptic corners
    lmg = s['lip_margin']
    lip_margin = spec.get('lip_margins', [lmg, lmg * 1.5, lmg])
    if lips is not None:
        cxs, cup, clo, ex = _lip_contour(skin.co, skin.vn, lips, lm, lip_margin)
    else:
        ex = lm['mouth_corner_x'] + lip_margin[2]
        cxs = np.array([0.0, ex])
        cup = np.array([lm['lips_top'], m[2]]) + lip_margin[0]
        clo = np.array([lm['lips_bottom'], m[2]]) - lip_margin[1]
    cpow = s['lip_corner_pow']

    def lip_mid_half(xq):
        axq = np.minimum(np.abs(xq), cxs[-1])
        zu, zl = np.interp(axq, cxs, cup), np.interp(axq, cxs, clo)
        return 0.5 * (zu + zl), np.maximum(0.5 * (zu - zl), 1e-4)

    def lip_de(xq, zq):
        mid, half = lip_mid_half(xq)
        return np.sqrt((np.abs(xq) / ex) ** cpow + ((zq - mid) / half) ** 2) - 1.0

    zc = float(lip_mid_half(ex)[0])  # the corner height

    def x_at(t, prof, zq):
        h = hit(d_of(t, phi_at(prof, zq)))
        return abs(h[0][0]) if h is not None else 1.0

    # the column that lands on the mouth corner
    lo_t, hi_t = 2.0, 70.0
    for _ in range(14):
        tm = 0.5 * (lo_t + hi_t)
        if x_at(tm, column(tm), zc) < ex:
            lo_t = tm
        else:
            hi_t = tm
    thc = 0.5 * (lo_t + hi_t)
    dth = 2 * tmax / (int(s['columns']) - 1)
    n_in = max(4, int(round(2 * thc / dth)))
    n_out = max(2, int(round((tmax - thc) / dth)))
    thetas = np.concatenate([np.linspace(-tmax, -thc, n_out + 1)[:-1], np.linspace(-thc, thc, n_in + 1),
                             np.linspace(thc, tmax, n_out + 1)[1:]])
    NT = len(thetas)
    inner = np.abs(thetas) <= thc + 1e-6  # inside the mouth width (corners included)
    z_up, z_lo = line(s['upper'], thetas), line(s['lower'], thetas)
    rs = np.random.default_rng(int(s['seed']))
    if s['edge_jitter']:
        # tufts and notches along the cheek line: smooth waves plus a little per-column break-up,
        # fading out towards the moustache (that edge stays clean under the nose)
        at = np.abs(thetas)
        ph = rs.uniform(0, 6.3, 3)
        wv = 0.55 * np.sin(np.radians(thetas) * 9 + ph[0]) + 0.3 * np.sin(np.radians(thetas) * 23 + ph[1]) + 0.15 * np.sin(np.radians(thetas) * 41 + ph[2])
        br = rs.uniform(-1, 1, len(thetas))
        br = np.convolve(br, [0.25, 0.5, 0.25], mode='same')
        jit = (0.75 * wv + 0.45 * br) * s['edge_jitter'] * smoothstep(s['edge_jitter_from'], s['edge_jitter_from'] + 10, at) * smoothstep(96.0, 80.0, at)
        z_up = z_up + jit
    fu, fl = i_u / (NV - 1), i_l / (NV - 1)
    S = np.zeros((NV, NT, 3))
    N = np.zeros((NV, NT, 3))
    D = np.zeros((NV, NT, 3))
    TRI = np.zeros((NV, NT), dtype=int)
    for j, t in enumerate(thetas):
        prof = column(t)
        zt, zb = z_up[j], z_lo[j]
        if inner[j] and abs(abs(t) - thc) > 1e-6:
            xm = x_at(t, prof, zc)
            for _ in range(2):  # the outline height at this column (x moves a little with z)
                mid, half = lip_mid_half(xm)
                vmax = np.sqrt(max(0.0, 1.0 - min(xm / ex, 1.0) ** cpow))
                zu, zl = mid + vmax * half, mid - vmax * half
                xm = 0.5 * (x_at(t, prof, zu) + x_at(t, prof, zl))
        else:
            b = smoothstep(0.0, s['corner_blend_deg'], abs(t) - thc)
            zu = zc + (zt - fu * (zt - zb) - zc) * b
            zl = zc + (zt - fl * (zt - zb) - zc) * b
        zu = min(zu, zt - 0.002)
        zl = min(max(zl, zb + 0.002), zu)
        pt, pu, pl, pb = (phi_at(prof, q) for q in (zt, zu, zl, zb))
        rows = np.concatenate([np.linspace(pt, pu, R1 + 1)[:-1], np.linspace(pu, pl, R2 + 1)[:-1], np.linspace(pl, pb, NV - i_l)])
        for i, p in enumerate(rows):
            dv = d_of(t, p)
            h = hit(dv)
            if h is None:
                h = (o + dv * 0.1, dv, 0, 0.0)
            S[i, j], N[i, j], TRI[i, j], D[i, j] = h[0], h[1], h[2], dv
    x, z = S[..., 0], S[..., 2]
    ax = np.abs(x)
    ii, jj = np.meshgrid(np.arange(NV), np.arange(NT), indexing='ij')
    # the opening: faces between two inner columns, in the lip rows
    hole = (ii >= i_u) & (ii < i_l) & inner[None, :] & np.roll(inner, -1)[None, :] & (jj < NT - 1)
    corner = np.abs(np.abs(thetas) - thc) < 1e-6
    rim = (((ii == i_u) | (ii == i_l)) & inner[None, :]) | ((ii >= i_u) & (ii <= i_l) & corner[None, :])
    # ---- thickness field
    chin = np.exp(-((x / 0.034) ** 2 + ((z - (lm['chin_z'] + 0.012)) / 0.03) ** 2))
    jaw = smoothstep(m[2] + 0.004, lm['chin_z'] + 0.012, z)
    T = s['cheek'] + (s['jaw'] - s['cheek']) * jaw
    T = T + (s['chin'] - s['jaw']) * chin
    must = smoothstep(m[2] - 0.002, m[2] + 0.006, z) * smoothstep(0.044, 0.032, ax)
    T = T * (1 - must) + s['moustache'] * must
    side = smoothstep(70.0, 88.0, np.abs(thetas))[None, :] * np.ones((NV, 1))
    T = T * (1 - side) + s['sideburn'] * side
    # under the chin: the beard can lie against the throat (`throat` thickness)
    # (optional: off by default; a full beard bridges the chin-throat crease, which keeps the crease
    # skin well inside it when the head nods)
    throat = np.zeros_like(T)
    if s['throat']:
        throat = smoothstep(lm['chin_z'] + 0.004, lm['chin_z'] - 0.014, z) * smoothstep(lm['chin_y'] + 0.004, lm['chin_y'] + 0.02, S[..., 1])
        T = T * (1 - throat) + s['throat'] * throat
    # downward clumps (sculpted relief, also drives the colour)
    vr = np.linspace(0, 1, NV)[:, None] * np.ones((1, NT))
    u = thetas[None, :] / tmax * s['clumps'] * 0.5 + 0.25 * np.sin(vr * 7 + np.radians(thetas)[None, :] * 4)
    if s['spacing_jitter']:
        # uneven clumps: the spacing drifts across the face and clumps lean / merge down the rows
        sj = s['spacing_jitter']
        th_r = np.radians(thetas)[None, :]
        u = u + sj * (0.9 * np.sin(th_r * 5.3 + 1.1) + 0.6 * np.sin(th_r * 11.7 + 0.4) + 0.5 * np.sin(vr * 4.1 + th_r * 6.0 + 2.0))
    idx = np.floor(u)
    fr = u - idx
    prof_c = np.sqrt(np.clip(1 - (2 * fr - 1) ** 2, 0, 1))
    if s['clump_soft']:
        # rounded, shallow grooves (a soft wave, not corduroy): the valley floor is raised and flat
        prof_c = prof_c + s['clump_soft'] * (0.55 + 0.45 * np.sin(np.pi * fr) ** 2 - prof_c)
    amp = 0.85 + 0.3 * (0.5 + 0.5 * np.sin(idx * 12.9898 + 78.233))
    if s['spacing_jitter']:
        amp = 0.7 + 0.6 * (0.5 + 0.5 * np.sin(idx * 12.9898 + 78.233)) * (0.75 + 0.25 * np.sin(vr * 6.0 + idx * 1.7))
    k = np.minimum(np.minimum(ii, NV - 1 - ii), np.minimum(jj, NT - 1 - jj)).astype(float)
    er = float(s['edge_rows'])
    if s['edge_rows_cheek']:
        # a longer rise along the cheek line than round the moustache (whose rows are few)
        er = er + (float(s['edge_rows_cheek']) - er) * smoothstep(24.0, 40.0, np.abs(thetas))[None, :] * np.ones((NV, 1))
    cd = s['clump_depth'] * (smoothstep(1.0, er, k) if s['clump_edge_fade'] else 1.0)
    T = T * (1 - cd + cd * prof_c * amp)
    # ---- edge profile: the outermost ring tucks under the skin, then a rounded rise
    rise = smoothstep(0.0, er, k - 1.0) ** s['edge_pow']
    t = s['edge_min'] + (T - s['edge_min']) * rise
    t = np.where(k == 0, -s['tuck'], t)
    # thin down to the lips round the opening (distance in outline units)
    front = S[..., 1] < m[1] + 0.035
    de = np.where(front, np.maximum(lip_de(x, z), 0.0), 5.0)
    de = np.where(rim, 0.0, de)
    lr = s['lip_rim']
    lip_rise = np.sqrt(smoothstep(0.0, s['lip_rise'], de))
    t = np.where(de < s['lip_rise'], np.minimum(t, lr + (t - lr) * lip_rise), t)
    # ---- the shell
    n = D * 0.5 + N * 0.5
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    n = np.where(rim[..., None], N, n)
    P = S + n * t[..., None]
    P[..., 2] -= s['drop'] * chin * smoothstep(0.35, 1.0, vr) * rise * (1 - throat)  # the tucked edge stays under the skin
    fixed_v = (k <= 1) | rim
    for _ in range(int(s['round_passes'])):  # round the surface (not the edge ring nor the lip rim)
        Q = P.copy()
        Q[1:-1, 1:-1] = 0.5 * P[1:-1, 1:-1] + 0.125 * (P[:-2, 1:-1] + P[2:, 1:-1] + P[1:-1, :-2] + P[1:-1, 2:])
        P = np.where(fixed_v[..., None], P, Q)
    verts = P.reshape(-1, 3)
    # the corner columns collapse over the lip rows to one vertex: weld them
    weld = np.arange(NV * NT)
    for jc in np.nonzero(corner)[0]:
        for i in range(i_u, i_l + 1):
            weld[i * NT + jc] = i_u * NT + jc
    faces = []
    for i in range(NV - 1):
        for j in range(NT - 1):
            if hole[i, j]:
                continue
            a = i * NT + j
            uq = []
            for vi in (a, a + NT, a + NT + 1, a + 1):
                if weld[vi] not in uq:
                    uq.append(int(weld[vi]))
            if len(uq) >= 3:  # collapsed corner edges: the face is a triangle
                faces.append(tuple(uq))
    # outward winding
    fixed = []
    for f in faces:
        p = verts[list(f)]
        nn = np.cross(p[1] - p[0], p[2] - p[0])
        fixed.append(f if nn @ (p.mean(0) - o) > 0 else f[::-1])
    faces = fixed
    # ---- colour: darker roots (at the skin edge and in the grooves), lighter tips
    base = hex_lin(palette['beard'])
    light = hex_lin(palette.get('beard_light', '#8a6448'))
    dark = hex_lin(palette.get('beard_dark', '#4a3426'))
    kk = (prof_c * amp).reshape(-1)
    tip = (smoothstep(0.3, 1.0, vr) * (0.4 + 0.6 * chin) + 0.35 * must).reshape(-1)
    edge = (smoothstep(0.0, er + 1, k) * np.sqrt(smoothstep(0.0, 0.6, np.minimum(de, 5.0)))).reshape(-1)
    col = mix(dark[None], base[None], (0.35 + 0.65 * kk) * (0.55 + 0.45 * edge))
    col = mix(col, light[None], np.clip(0.55 * tip * kk + 0.25 * smoothstep(0.75, 1.0, kk), 0, 1))
    if s['moustache_dark']:
        col = mix(col, dark[None], s['moustache_dark'] * must.reshape(-1))
    if s['edge_tint']:
        # the cheek line (the top rows away from the moustache) fades into stubble
        cheek_e = ((1 - smoothstep(0.0, er + 3.0, ii.astype(float))) ** 2 * smoothstep(20.0, 36.0, np.abs(thetas))[None, :]).reshape(-1)
        stub = hex_lin(palette.get(spec.get('edge_tint_colour', 'stubble'), palette.get('stubble', palette['beard'])))
        col = mix(col, stub[None], s['edge_tint'] * cheek_e)
    # ---- skinning and morphs from the skin under each grid point
    tris = skin.tris
    Wv = np.zeros((len(verts), W.shape[1]))
    kd = {name: np.zeros((len(verts), 3)) for name in keys}
    Sf, Tf = S.reshape(-1, 3), TRI.reshape(-1)
    nb0, nb1 = s['near_blend']
    for vi in range(len(verts)):
        b = skin.bary(Sf[vi], Tf[vi])
        tv = tris[Tf[vi]]
        Wv[vi] = b @ W[tv]
        for name, kc in keys.items():
            kd[name][vi] = b @ (kc[tv] - skin.co[tv])
        # a shell vertex hanging close to other skin (the full chin over the throat) moves with that
        # skin as well, so the skin never comes through it
        loc, ni, dist = head.nearest(verts[vi])
        bn = smoothstep(nb0, nb1, dist)
        if bn > 0:
            tn = tris[tmap[ni]]
            Wv[vi] = (1 - bn) * Wv[vi] + bn * (skin.bary(loc, tmap[ni]) @ W[tn])
    used = sorted({i for f in faces for i in f})
    remap = -np.ones(len(verts), dtype=int)
    remap[used] = np.arange(len(used))
    faces = [tuple(int(remap[i]) for i in f) for f in faces]
    verts, col, Wv = verts[used], col[used], Wv[used]
    kpos = {name: verts + kd[name][used] for name in keys}
    if spec.get('debug_lips'):
        print('[mpfb] lip outline: cx %.4f corner theta %.1f z %.4f, %d columns (%d inside)' % (ex, thc, zc, NT, int(inner.sum())))
    print('[mpfb] solid beard: %d verts, %d faces, t max %.4f' % (len(verts), len(faces), float(t.max())))
    # stubble weight on the skin: 1 under the beard, fading out just beyond the cheek and neck lines
    sc_ = skin.co
    dv = sc_ - o
    th_s = np.degrees(np.arctan2(dv[:, 0], -dv[:, 1]))
    zu_s = np.interp(th_s, thetas, z_up)
    zl_s = np.interp(th_s, thetas, z_lo)
    fu, fl = s['stubble_fade']
    sw = smoothstep(zu_s + fu, zu_s - 0.002, sc_[:, 2]) * smoothstep(zl_s - fl, zl_s + 0.002, sc_[:, 2])
    sw = sw * smoothstep(tmax + 6.0, tmax - 4.0, np.abs(th_s)) * (-dv[:, 1] > -0.06)
    if lips is not None:
        lc = s.get('stubble_lip_cut', [0.15, 0.5])  # the lip weights over which the stubble fades out
        sw = sw * (1 - smoothstep(lc[0], lc[1], lips))
    return Part('beard', spec.get('material', 'Beard'), verts, faces, col=col, weights=Wv, keys=kpos), sw
