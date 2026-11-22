"""Costumes as outfit pieces: the default outfit split off the body, and the court disguise.

A spec with `costumes` is exported as separate skinned meshes on the one rig, so the game can swap
outfits (src/player/costume.ts, the dither swap in src/player/avatar.ts):

  avatar-body               always worn: the bare skin (head, neck, hands) and everything on the
                            head (materials Skin, Eye, Hair, Beard)
  avatar-glasses            always worn (glasses.py)
  avatar-default-<material> the default wardrobe (outfit.py), one mesh per garment material:
                            avatar-default-jacket, -trousers, -gear (footwear, bag)
  avatar-court-<material>   the court costume, hidden by default (hide_render in the .blend; the
                            game hides it until 'court'): avatar-court-coat (coat, skirts, collar,
                            cuffs, buttons, tricorn), -waistcoat (waistcoat, stock, shirt cuffs,
                            stockings), -breeches (breeches, knee bands, shoes, buckles)

One mesh per material keeps every costume at the body's draw calls plus one per garment material
(hero budget: 8 draw calls, 25k triangles visible at once; `stats` checks both per costume).

The court costume (spec['costumes']['court']) is a plain 1780s secretary: a dark-blue coat whose
fronts are cut away over a cream waistcoat, skirts to the knee (split by a back vent), a white
stock, black breeches with knee bands, white stockings, black buckled shoes and a plain black
tricorn. Like the default wardrobe, the garments that hug the body are zones on a copy of the
decimated skin (cut along their own planes, pushed out per zone); trims, skirts, buttons and the
hat are solids on top. The skirts are weighted from the pelvis and spine at the waist towards the
thighs at the hem (each vent half mostly to its own thigh), so they follow the legs in Walk / Run.
avatar-body and avatar-glasses stay in every costume.

Spec keys (spec['costumes']['court'], merged over COURT):
  palette        colours by name (sRGB hex)
  materials      roughness per court material (Coat, Waistcoat, Breeches)
  coat           waist (m above the pelvis head), front [x at the top, x at the waist, top z above
                 the neck head], offset, sleeve_offset, cuff_at, cuff [height, flare], collar
                 [height, stand-off, front gap deg], neckline [m above the neck head, rise per m towards
                 the nape: the coat / stock border], buttons (per side), edge_width
  waistcoat      hem (m above the pelvis head), offset, buttons, smooth [passes, inward share]
                 (a straighter vest: outward-kept smoothing fills the navel and belly creases)
  stock          top (m above the neck head), tilt (rise per m towards the nape), offset
  skirts         hem_above_knee, front [deg at the waist, deg at the hem], rows, columns (per half),
                 clearance [waist, hem], flare, folds [count, depth], vent (fraction from the hem),
                 legs (thigh share at the hem), thick, tuck (how far the top reaches up under the coat)
  breeches       knee (m below the knee joint), offset, band
  stockings      offset
  shoes          top (m), offset, sole (offset under the sole, matches the boots), toe_extra, sole_h
  hat            above_eye (crown base above the eyes), inradius_extra, corner, up, lean, columns,
                 tilt_deg, clearance, thick
"""
import math

import numpy as np

from . import geom, lod, outfit
from .bind import Surface, vertex_normals
from .parts import Part, build_object, limit_weights
from .util import hex_lin, smoothstep

COURT = {
    'palette': {
        'coat': '#1F2B48', 'coat_lining': '#141B30', 'coat_edge': '#26345A', 'button': '#9A8148',
        'waistcoat': '#E6DCC3', 'waistcoat_button': '#C9B98E', 'stock': '#F1EDE3', 'shirt': '#EEEAE0',
        'breeches': '#1D1B1C', 'stockings': '#E9E5DB', 'shoes': '#141212', 'shoe_sole': '#0B0A0A',
        'buckle': '#B8B4AA', 'hat': '#151416', 'hat_edge': '#2B2926',
    },
    'materials': {'Coat': {'rough': 0.86}, 'Waistcoat': {'rough': 0.78}, 'Breeches': {'rough': 0.72}},
    'coat': {'waist': 0.09, 'front': [0.04, 0.14, -0.035], 'offset': 0.016, 'sleeve_offset': 0.012, 'cuff_at': 0.92,
             'cuff': [0.075, 0.013], 'collar': [0.034, 0.013, 52.0], 'neckline': [-0.025, 0.3], 'buttons': 4, 'edge_width': 0.012},
    'waistcoat': {'hem': -0.01, 'offset': 0.009, 'buttons': 6},
    'stock': {'top': 0.026, 'tilt': 0.33, 'offset': 0.014},
    'skirts': {'hem_above_knee': 0.0, 'front': [48.0, 78.0], 'rows': 7, 'columns': 11, 'clearance': [-0.003, 0.03],
               'flare': 0.03, 'folds': [5, 0.006], 'vent': 0.5, 'legs': 0.62, 'thick': 0.006, 'tuck': 0.02},
    'breeches': {'knee': 0.06, 'offset': 0.009, 'band': 0.022},
    'stockings': {'offset': 0.003},
    'shoes': {'top': 0.085, 'offset': 0.01, 'sole': 0.026, 'toe_extra': 0.003, 'sole_h': 0.022},
    'hat': {'above_eye': 0.074, 'inradius_extra': 0.012, 'corner': 1.5, 'up': 0.072, 'lean': 0.01, 'columns': 30,
            'tilt_deg': 2.5, 'clearance': 0.006, 'thick': 0.005},
}

#: court sub-zones → material (one mesh per material: avatar-court-<material>)
ZONE_MATERIAL = {'coat': 'Coat', 'waistcoat': 'Waistcoat', 'stock': 'Waistcoat', 'stockings': 'Waistcoat',
                 'breeches': 'Breeches', 'shoes': 'Breeches'}

TRUNK = ('pelvis', 'spine_01', 'spine_02', 'spine_03')
ARM = ('clavicle', 'upperarm', 'lowerarm', 'hand', 'thumb', 'index', 'middle', 'ring', 'pinky')
LEG = ('thigh', 'calf', 'foot', 'ball')


def deep_merge(a, b):
    out = dict(a)
    for k, v in (b or {}).items():
        out[k] = deep_merge(a[k], v) if isinstance(v, dict) and isinstance(a.get(k), dict) else v
    return out


def court_spec(spec):
    """The court costume of a spec (merged over COURT), or None."""
    c = (spec.get('costumes') or {}).get('court')
    return deep_merge(COURT, c) if c else None


# ---- splitting parts into pieces ----------------------------------------------------------------

def subpart(p, face_ids, name, material, col=None):
    """The faces `face_ids` of part `p` as a compact part of one material."""
    sel = [p.faces[k] for k in face_ids]
    used = sorted({i for f in sel for i in f})
    remap = {o: n for n, o in enumerate(used)}
    src = p.col if col is None else col
    return Part(name, material, p.co[used], [tuple(remap[i] for i in f) for f in sel], col=src[used],
                weights=None if p.weights is None else p.weights[used],
                keys={k: v[used] for k, v in p.keys.items()} if p.keys else None, smooth=p.smooth)


def split_default(parts, garments):
    """Body and default-outfit pieces: {object name: [parts]}. Faces of a garment material go to
    avatar-default-<material>, the rest to avatar-body (a part with per-face materials, the skin,
    is split by face)."""
    out = {'avatar-body': []}

    def put(m, part):
        key = f'avatar-default-{m.lower()}' if m in garments else 'avatar-body'
        out.setdefault(key, []).append(part)

    for p in parts:
        if p.face_mat is None:
            put(p.material, p)
            continue
        by = {}
        for k, m in enumerate(p.face_mat):
            by.setdefault(m, []).append(k)
        for m, ids in by.items():
            put(m, subpart(p, ids, f'{p.name}_{m.lower()}', m, p.mat_col.get(m)))
    return out


def moves(parts, tol=1e-6):
    """Does any vertex of these parts move under a morph (smile, blink)?"""
    for p in parts:
        for v in p.keys.values():
            if len(v) and np.abs(v - p.co).max() > tol:
                return True
    return False


# ---- the court costume: zones on a copy of the skin ---------------------------------------------

def _dom(W, bones):
    return np.array(bones)[np.argmax(W, axis=1)]


def _levels(rig, cs):
    pel, _ = outfit.bone_pos(rig, 'pelvis')
    neck, _ = outfit.bone_pos(rig, 'neck_01')
    knee = outfit.bone_pos(rig, 'calf_l')[0][2]
    return {
        'pelvis': pel, 'neck': neck, 'knee': knee,
        'waist': pel[2] + cs['coat']['waist'],
        'wc_hem': pel[2] + cs['waistcoat']['hem'],
        'knee_cut': knee - cs['breeches']['knee'],
        'shoe': cs['shoes']['top'],
    }


def front_edge(cs, lv, side):
    """The coat's front edge on one side: (x at height z) as a line from the top of the opening to
    the waist, and the plane through it (normal outward, in the x-z plane)."""
    x0, x1, dz = cs['coat']['front']
    z0, z1 = lv['neck'][2] + dz, lv['waist']
    e = np.array([side * (x1 - x0), 0.0, z1 - z0])
    n = np.array([e[2], 0.0, -e[0]])
    if n[0] * side < 0:
        n = -n
    return (z0, z1, x0, x1), np.array([side * x0, 0.0, z0]), n / np.linalg.norm(n)


def stock_plane(cs, lv):
    """The stock's top edge (skin above it): lower at the throat, higher at the nape."""
    st = cs['stock']
    n = np.array([0.0, -st['tilt'], 1.0])
    return np.array([0.0, lv['neck'][1], lv['neck'][2] + st['top']]), n / np.linalg.norm(n)


def neckline_plane(cs, lv):
    """The coat's neckline (the stock above it, the coat collar standing on it)."""
    dz, tilt = cs['coat']['neckline']
    n = np.array([0.0, -tilt, 1.0])
    return np.array([0.0, lv['neck'][1], lv['neck'][2] + dz]), n / np.linalg.norm(n)


NECK_TOP = ('neck_01', 'head', 'spine_03')


def neck_radius(co, W, bones, lv):
    """The neck's horizontal radius round the neck bone, near its base."""
    dom = _dom(W, bones)
    nz = lv['neck'][2]
    sel = (dom == 'neck_01') & (np.abs(co[:, 2] - nz) < 0.03)
    if not sel.any():
        return 0.06
    return float(np.percentile(np.hypot(co[sel, 0], co[sel, 1] - lv['neck'][1]), 90))


def round_neck(co, W, bones, lv, extra):
    """Vertices on the neck or round its base (within the neck radius + `extra`), by dominant bone."""
    dom = _dom(W, bones)
    r = np.hypot(co[:, 0], co[:, 1] - lv['neck'][1])
    near = r < neck_radius(co, W, bones, lv) + extra
    return np.array([d in NECK_TOP or d.startswith('clavicle') for d in dom]) & near


def cut(base, rig, bones, cs, log=print):
    """The skin copy cut along the court's zone borders (straight lines instead of sawteeth)."""
    co, faces, W, col, G, keys = base
    lv = _levels(rig, cs)
    planes = []

    def by(pred):
        return lambda c, W_: np.array([pred(d) for d in _dom(W_, bones)])

    p, n = neckline_plane(cs, lv)
    planes.append(('neckline', p, n, lambda c, W_: round_neck(c, W_, bones, lv, 0.03)))

    trunk = by(lambda d: d in TRUNK)
    legs = by(lambda d: d.startswith(LEG))
    planes.append(('waist', np.array([0.0, 0.0, lv['waist']]), np.array([0.0, 0.0, 1.0]), trunk))
    planes.append(('waistcoat hem', np.array([0.0, 0.0, lv['wc_hem']]), np.array([0.0, 0.0, 1.0]),
                   by(lambda d: d in TRUNK or d.startswith('thigh'))))
    planes.append(('knee', np.array([0.0, 0.0, lv['knee_cut']]), np.array([0.0, 0.0, 1.0]), legs))
    planes.append(('shoes', np.array([0.0, 0.0, lv['shoe']]), np.array([0.0, 0.0, 1.0]), legs))
    for s in ('l', 'r'):
        h, t = outfit.bone_pos(rig, f'lowerarm_{s}')
        ax = (t - h) / np.linalg.norm(t - h)
        fa = by(lambda d, s=s: d.startswith((f'lowerarm_{s}', f'hand_{s}')) or (d.startswith(ARM[4:]) and d.endswith(s)))
        planes.append((f'cuff_{s}', h + (t - h) * cs['coat']['cuff_at'], ax, fa))
    p, n = stock_plane(cs, lv)
    planes.append(('stock', p, n, by(lambda d: d in ('head', 'neck_01', 'spine_03') or d.startswith('clavicle'))))
    yc = lv['neck'][1]
    for side in (1, -1):
        _, pt, nv = front_edge(cs, lv, side)

        def front(c, W_, side=side):
            d = _dom(W_, bones)
            return np.array([d[i] in TRUNK and c[i, 1] < yc and c[i, 0] * side > -0.01 for i in range(len(c))])
        planes.append((f'front_{"l" if side > 0 else "r"}', pt, nv, front))
    for name, pt, nv, allowed in planes:
        n0 = len(co)
        co, faces, W, col, G, keys = lod.cut_plane(co, faces, W, col, G, keys, pt, nv, allowed(co, W))
        log(f'[court] cut {name}: +{len(co) - n0} verts')
    return co, faces, W, col, G, keys


def zones(co, faces, W, bones, rig, cs):
    """Court sub-zone per face ('Skin' where the skin shows)."""
    lv = _levels(rig, cs)
    dom = _dom(W, bones)
    fc = np.array([co[list(f)].mean(0) for f in faces])
    sp, sn = stock_plane(cs, lv)
    lp, ln = neckline_plane(cs, lv)
    neck = round_neck(co, W, bones, lv, 0.02)
    edges = {side: front_edge(cs, lv, side)[0] for side in (1, -1)}
    yc = lv['neck'][1]
    hand = {b for b in bones if b.startswith(('hand_', 'thumb', 'index', 'middle', 'ring', 'pinky'))}
    arm = {s: outfit.bone_pos(rig, f'lowerarm_{s}') for s in ('l', 'r')}
    out = []
    for k, f in enumerate(faces):
        c = fc[k]
        ds = [dom[i] for i in f]
        side = 'l' if c[0] > 0 else 'r'
        if any(d.startswith('lowerarm') or d in hand for d in ds) and all(d in hand or d.startswith('lowerarm') for d in ds):
            h, t = arm[side]
            u = (c - h) @ (t - h) / ((t - h) @ (t - h))
            out.append('Skin' if u > cs['coat']['cuff_at'] else 'coat')
            continue
        if all(d == 'head' for d in ds):
            out.append('Skin')
            continue
        neckish = any(d in ('head', 'neck_01') for d in ds)
        if neckish and (c - sp) @ sn > 0:
            out.append('Skin')
            continue
        if any(d.startswith(('foot', 'ball')) for d in ds) or c[2] < lv['shoe']:
            out.append('shoes')
            continue
        if any(d.startswith(('thigh', 'calf')) for d in ds) and c[2] < lv['knee_cut']:
            out.append('stockings')
            continue
        if c[2] < lv['wc_hem']:
            out.append('breeches')
            continue
        if (c - lp) @ ln > 0 and all(neck[i] for i in f):
            # above the coat's neckline: the stock
            out.append('stock')
            continue
        if any(d.startswith(ARM) for d in ds):
            out.append('coat')
            continue
        if c[2] < lv['waist']:
            out.append('waistcoat')
            continue
        (z0, z1, x0, x1) = edges[1 if c[0] > 0 else -1]
        if c[1] < yc and c[2] <= z0:
            xe = x0 + (x1 - x0) * np.clip((z0 - c[2]) / (z0 - z1), 0, 1)
            if abs(c[0]) < xe:
                out.append('waistcoat')
                continue
        out.append('coat')
    return out


def offsets(co, faces, zs, W, bones, cs, nrm):
    """Per-vertex outward offset (the largest of the zones round each vertex: no cracks)."""
    dom = _dom(W, bones)
    on_arm = np.array([d.startswith(('upperarm', 'lowerarm')) for d in dom])
    sh = cs['shoes']
    shoe = sh['offset'] + (sh['sole'] - sh['offset']) * smoothstep(-0.25, -0.75, nrm[:, 2])
    shoe = shoe + sh.get('toe_extra', 0.0) * np.array([d.startswith('ball') for d in dom])
    by = {
        'Skin': np.zeros(len(co)),
        'coat': np.where(on_arm, cs['coat']['sleeve_offset'], cs['coat']['offset']),
        'waistcoat': np.full(len(co), cs['waistcoat']['offset']),
        'stock': np.full(len(co), cs['stock']['offset']),
        'breeches': np.full(len(co), cs['breeches']['offset']),
        'stockings': np.full(len(co), cs['stockings']['offset']),
        'shoes': shoe,
    }
    off = np.zeros(len(co))
    for k, f in enumerate(faces):
        o = by[zs[k]]
        for i in f:
            off[i] = max(off[i], o[i])
    return off


def vest(co, faces, zs, nrm, passes, inward):
    """A straighter waistcoat front: Laplacian passes over the waistcoat zone, along the normals only
    (the zone borders keep their line), that keep every outward move and only `inward` of each inward
    one, so creases (the navel, under the belly) fill in."""
    co = co.copy()
    nb = [set() for _ in range(len(co))]
    sel = np.zeros(len(co), bool)
    for k, f in enumerate(faces):
        for a in range(len(f)):
            nb[f[a]].update((f[a - 1], f[(a + 1) % len(f)]))
        if zs[k] == 'waistcoat':
            sel[list(f)] = True
    ids = np.nonzero(sel)[0]
    for _ in range(passes):
        new = co.copy()
        for i in ids:
            d = co[list(nb[i])].mean(0) - co[i]
            out = d @ nrm[i]
            new[i] = co[i] + (out if out >= 0 else inward * out) * nrm[i]
        co = new
    return co


def zone_colours(co, nrm, cs):
    """Per-zone vertex colours (linear RGBA): the palette colour with a soft top light."""
    pal = cs['palette']
    up = smoothstep(-0.6, 0.9, nrm[:, 2])
    out = {}
    for z, key, lo in (('coat', 'coat', 0.8), ('waistcoat', 'waistcoat', 0.88), ('stock', 'stock', 0.9),
                       ('breeches', 'breeches', 0.8), ('stockings', 'stockings', 0.86), ('shoes', 'shoes', 0.85)):
        col = hex_lin(pal[key])[None].repeat(len(co), 0) * (lo + (1 - lo) * up)[:, None]
        if z == 'shoes':
            sole = co[:, 2] < cs['shoes']['sole_h']
            col[sole] = hex_lin(pal['shoe_sole'])
        out[z] = np.hstack([col, np.ones((len(co), 1))])
    return out


# ---- solids on top ------------------------------------------------------------------------------

def _rgba(c):
    return np.append(c, 1.0)


def _W(n, bones, mix_):
    W = np.zeros((n, len(bones)))
    for b, w in mix_.items():
        W[:, bones.index(b)] = w
    return W


def skin_weights(surface, W, pts):
    """Skin weights at points (nearest triangle of the surface, barycentric)."""
    out = np.zeros((len(pts), W.shape[1]))
    for i, p in enumerate(pts):
        loc, idx, _ = surface.nearest(p)
        b = surface.bary(loc, idx)
        out[i] = (W[surface.tris[idx]] * b[:, None]).sum(0)
    return out


def _orient(co, faces, ref):
    """Faces turned so their normal points along ref(face centre, face index) (a direction)."""
    out = []
    for k, f in enumerate(faces):
        p = co[list(f)]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        out.append(f if n @ ref(p.mean(0), k) >= 0 else tuple(reversed(f)))
    return out


def skirts(surf_co, W, bones, rig, cs, surface):
    """Coat skirts from the waist to the knee: two halves (a back vent below `vent`), a thin solid
    (outer cloth, lining, edges) hung round the body's convex envelope (legs together, no gap
    between them), weighted from pelvis / spine at the waist towards the thighs at the hem."""
    sk = cs['skirts']
    lv = _levels(rig, cs)
    pal = cs['palette']
    dom = _dom(W, bones)
    body = np.array([d in TRUNK or d.startswith(('thigh', 'calf')) for d in dom])
    pts = surf_co[body]
    cx, cy = 0.0, lv['pelvis'][1]
    z_top = lv['waist'] + sk['tuck']
    z_hem = lv['knee'] + sk['hem_above_knee']
    R, K = sk['rows'], sk['columns']
    ts = np.linspace(0.0, 1.0, R)
    fw, fh = sk['front']
    fo, fd = sk['folds']
    halves = []
    for half, sgn in (('l', 1), ('r', -1)):
        outer, inner, lat, tt = [], [], [], []
        prev = None
        for r, t in enumerate(ts):
            z = z_top + (z_hem - z_top) * t
            th0 = fw + (fh - fw) * t ** 0.8
            # angle from the front (0) round the left (+x, 90) to the back (180); the right half mirrors
            th = np.radians(np.linspace(th0, 180.0, K + 1))
            d = np.stack([np.sin(th) * sgn, -np.cos(th)], axis=1)
            slab = pts[np.abs(pts[:, 2] - z) < 0.035]
            if len(slab) == 0:
                slab = pts[np.argsort(np.abs(pts[:, 2] - z))[:50]]
            rel = slab[:, :2] - np.array([cx, cy])
            env = (rel @ d.T).max(0)
            clear = sk['clearance'][0] + (sk['clearance'][1] - sk['clearance'][0]) * smoothstep(0.0, 0.35, t)
            # a few soft folds towards the hem
            rad = env + clear + sk['flare'] * t ** 1.5 + fd * t * np.sin(th * fo) ** 2
            # smooth along the row, never much tighter than the row above (cloth hangs)
            rad = np.convolve(np.pad(rad, 1, mode='edge'), [0.25, 0.5, 0.25], mode='valid')
            if prev is not None:
                rad = np.maximum(rad, prev - 0.004)
            prev = rad
            o = np.column_stack([cx + d[:, 0] * rad, cy + d[:, 1] * rad, np.full(K + 1, z)])
            i_ = np.column_stack([cx + d[:, 0] * (rad - sk['thick']), cy + d[:, 1] * (rad - sk['thick']), np.full(K + 1, z)])
            outer.append(o)
            inner.append(i_)
            lat.append(np.sin(th) * sgn)
            tt.append(np.full(K + 1, t))
        halves.append((half, sgn, np.array(outer), np.array(inner), np.array(lat), np.array(tt)))
    # vertices: per half, outer grid then inner grid; the back column welded above the vent
    co, col, Wv, idx, row_of = [], [], [], {}, []
    coat = hex_lin(pal['coat'])
    lining = hex_lin(pal['coat_lining'])
    r_vent = int(round((1.0 - sk['vent']) * (R - 1)))
    leg = sk['legs']
    pel, sp1 = bones.index('pelvis'), bones.index('spine_01')
    tl, tr = bones.index('thigh_l'), bones.index('thigh_r')
    for half, sgn, O, I, L, T in halves:
        for layer, G_ in (('o', O), ('i', I)):
            for r in range(R):
                for k in range(K + 1):
                    if half == 'r' and k == K and r <= r_vent:
                        idx[(half, layer, r, k)] = idx[('l', layer, r, K)]
                        continue
                    idx[(half, layer, r, k)] = len(co)
                    co.append(G_[r, k])
                    row_of.append(r)
                    t = T[r, k]
                    shade = 0.78 + 0.22 * (1 - t) if layer == 'o' else 0.9
                    col.append(_rgba((coat if layer == 'o' else lining) * shade))
                    # thighs: the vent halves lean to their own leg, the back above it splits evenly
                    lateral = L[r, k] if not (k == K and r > r_vent) else 0.18 * sgn
                    wl = smoothstep(-0.4, 0.4, lateral)
                    kl = leg * smoothstep(0.0, 1.0, t) ** 1.2
                    w = np.zeros(len(bones))
                    w[pel] += (1 - kl) * 0.75
                    w[sp1] += (1 - kl) * 0.25
                    w[tl] += kl * wl
                    w[tr] += kl * (1 - wl)
                    Wv.append(w)
    co = np.array(co)
    Wv = np.array(Wv)
    row_of = np.array(row_of)
    # the top rows take the coat body's own weights (no seam opening at the waist in a twist)
    for r, b in ((0, 0.0), (1, 0.5)):
        sel = np.nonzero(row_of == r)[0]
        if len(sel):
            Wv[sel] = skin_weights(surface, W, co[sel]) * (1 - b) + Wv[sel] * b
    faces, kinds = [], []
    for half, sgn, *_ in halves:
        for r in range(R - 1):
            for k in range(K):
                for layer in ('o', 'i'):
                    q = (idx[(half, layer, r, k)], idx[(half, layer, r, k + 1)], idx[(half, layer, r + 1, k + 1)], idx[(half, layer, r + 1, k)])
                    faces.append(q)
                    kinds.append(('out' if layer == 'o' else 'in', half))
        # hem
        for k in range(K):
            faces.append((idx[(half, 'o', R - 1, k)], idx[(half, 'o', R - 1, k + 1)], idx[(half, 'i', R - 1, k + 1)], idx[(half, 'i', R - 1, k)]))
            kinds.append(('hem', half))
        # front edge (k = 0) and the vent edge (k = K, below the weld)
        for r in range(R - 1):
            faces.append((idx[(half, 'o', r, 0)], idx[(half, 'o', r + 1, 0)], idx[(half, 'i', r + 1, 0)], idx[(half, 'i', r, 0)]))
            kinds.append(('front', half))
            if r + 1 > r_vent:
                faces.append((idx[(half, 'o', r, K)], idx[(half, 'o', r + 1, K)], idx[(half, 'i', r + 1, K)], idx[(half, 'i', r, K)]))
                kinds.append(('vent', half))
    centre = np.array([cx, cy, 0.0])

    def ref(c, k):
        kind, half = kinds[k]
        rad = c - centre
        rad[2] = 0
        rad /= max(np.linalg.norm(rad), 1e-9)
        tang = np.array([-rad[1], rad[0], 0.0])  # counter-clockwise seen from above
        if kind == 'out':
            return rad
        if kind == 'in':
            return -rad
        if kind == 'hem':
            return np.array([0.0, 0.0, -1.0])
        # front: away from the skirt's span; vent: towards the other half
        s = 1 if half == 'l' else -1
        return -tang * s if kind == 'front' else tang * s

    faces = _orient(co, faces, ref)
    return Part('skirts', 'Coat', co, faces, col=np.array(col), weights=limit_weights(Wv))


def hat(parts, lm, bones, cs):
    """A plain tricorn on the head bone: a crown over the hair (its envelope plus clearance) and a
    brim turned up on three sides, the points front and back-left / back-right, the turned-up edge
    lower towards each point. One swept profile per angle round the crown."""
    hs = cs['hat']
    pal = cs['palette']
    hair = [p for p in parts if p.name == 'hair']
    pts = hair[0].co if hair else np.zeros((0, 3))
    z0 = lm['eye_z'] + hs['above_eye']
    above = pts[pts[:, 2] > z0 - 0.01] if len(pts) else pts
    if len(above) < 20:
        return None
    cx, cy = float((above[:, 0].max() + above[:, 0].min()) / 2), float((above[:, 1].max() + above[:, 1].min()) / 2)
    top = float(above[:, 2].max()) + hs['clearance'] + 0.004
    N = hs['columns']
    phis = np.linspace(0, 2 * np.pi, N, endpoint=False)
    d = np.stack([np.sin(phis), -np.cos(phis)], axis=1)  # 0 = front (-y), +x left

    def envelope(z, band=0.012):
        s = above[np.abs(above[:, 2] - z) < band]
        if len(s) < 6:
            s = above[np.argsort(np.abs(above[:, 2] - z))[:40]]
        rel = s[:, :2] - np.array([cx, cy])
        e = (rel @ d.T).max(0)
        return np.convolve(np.pad(e, 2, mode='wrap'), [0.1, 0.2, 0.4, 0.2, 0.1], mode='valid')

    clr = hs['clearance']
    zc = [z0, z0 + 0.45 * (top - z0), z0 + 0.8 * (top - z0)]
    rc = [envelope(z) + clr for z in zc]
    rc[1] = np.maximum(rc[1], rc[0] * 0.97)
    rc[2] = np.maximum(rc[2] * 1.0, rc[1] * 0.8)
    r_in = float(np.mean(rc[0])) + hs['inradius_extra']
    # the fold line: a triangle round the crown (points at 0, 120, 240 deg, side middles at 60,
    # 180, 300), corners rounded; `rel` is the angle from the nearest side's middle
    rel = phis % (2 * np.pi / 3) - np.pi / 3
    r_f = np.minimum(r_in / np.cos(rel), r_in * hs['corner'])
    r_f = np.maximum(r_f, rc[0] + 0.012)
    corner = 1 - np.abs(rel) / (np.pi / 3)  # 1 at a side's middle, 0 at a point
    h_up = hs['up'] * (0.35 + 0.65 * smoothstep(0.0, 0.7, corner))
    t = hs['thick']
    lean = hs['lean']
    # profile rows (radius, height) from the crown top round to the brim's underside
    prof = [
        (rc[2] * 0.45, np.full(N, top)),
        (rc[2], np.full(N, zc[2])),
        (rc[1], np.full(N, zc[1])),
        (rc[0], np.full(N, z0 + t)),
        (r_f - 0.004, np.full(N, z0 + t)),
        (r_f + lean - t, z0 + h_up),
        (r_f + lean + 0.2 * t, z0 + h_up + 0.6 * t),
        (r_f + lean + t, z0 + h_up - 0.002),
        (r_f + t, np.full(N, z0 - 0.5 * t)),
        (rc[0] + 0.002, np.full(N, z0 - t)),
    ]
    P = len(prof)
    co = []
    for r, z in prof:
        co.append(np.column_stack([cx + d[:, 0] * r, cy + d[:, 1] * r, z]))
    co = np.array(co).reshape(-1, 3)  # row-major: row j, column i -> j * N + i
    cap = len(co)
    co = np.vstack([co, [[cx, cy, top + 0.002]]])
    faces = []
    for j in range(P - 1):
        for i in range(N):
            i2 = (i + 1) % N
            faces.append((j * N + i, j * N + i2, (j + 1) * N + i2, (j + 1) * N + i))
    for i in range(N):
        faces.append((cap, (i + 1) % N, i))
    # outward per profile segment j (rows j → j + 1): crown (0-2) away from its middle, brim top (3)
    # up, the turned-up wall's inside (4) towards the crown, its top edge (5, 6) up, its outside (7)
    # away from the crown, the brim's underside (8) down; the cap up
    inside = np.array([cx, cy, (z0 + top) / 2])
    up = np.array([0.0, 0.0, 1.0])

    def ref(c, k):
        j = k // N if k < (P - 1) * N else -1
        v = c - np.array([cx, cy, c[2]])
        v /= max(np.linalg.norm(v), 1e-9)
        if j in (0, 1, 2):
            return c - inside
        if j == 4:
            return -v
        if j == 7:
            return v
        if j == 8:
            return -up
        return up
    faces = _orient(co, faces, ref)
    col = np.tile(_rgba(hex_lin(pal['hat'])), (len(co), 1))
    rows = np.repeat(np.arange(P), N)
    edge = np.isin(rows, (5, 6, 7))
    col[:P * N][edge, :3] = hex_lin(pal['hat_edge'])
    # tilt the hat forward round the head centre (the front down)
    a = math.radians(hs['tilt_deg'])
    piv = np.array([0.0, cy, z0])
    rel3 = co - piv
    y = rel3[:, 1] * math.cos(a) - rel3[:, 2] * math.sin(a)
    z = rel3[:, 1] * math.sin(a) + rel3[:, 2] * math.cos(a)
    co = np.column_stack([co[:, 0], y + piv[1], z + piv[2]])
    return Part('tricorn', 'Coat', co, faces, col=col, weights=_W(len(co), bones, {'head': 1.0}))


def _button(centre, normal, size, colour, bones, wmix, name, material):
    n = normal / np.linalg.norm(normal)
    ex = np.cross(n, np.array([0.0, 0.0, 1.0]))
    if np.linalg.norm(ex) < 1e-6:
        ex = np.array([1.0, 0.0, 0.0])
    ex /= np.linalg.norm(ex)
    ez = np.cross(ex, n)
    co, faces = geom.rounded_box(centre + n * size[1] * 0.4, size, e=0.55, nu=3, nv=6, axes=np.array([ex, n, ez]))
    col = np.tile(_rgba(colour), (len(co), 1))
    return Part(name, material, co, faces, col=col, weights=_W(len(co), bones, wmix))


def extras(surface, W, bones, rig, cs, lm):
    """Trims and gear on the dressed court body: collar, cuffs and shirt cuffs, the coat's front
    edges and buttons, waistcoat buttons, knee bands, shoe buckles."""
    pal = cs['palette']
    lv = _levels(rig, cs)
    out = []
    coat = hex_lin(pal['coat'])
    zaxis = np.array([0.0, 0.0, 1.0])
    front = np.array([0.0, -1.0, 0.0])
    neck = lv['neck']
    # coat collar: a low stand collar round the back of the neck, open at the front
    # standing on the neckline (its base a little below it, covering the coat / stock seam)
    ch, cso, cg = cs['coat']['collar']
    nz, tilt = cs['coat']['neckline']
    r_n = neck_radius(surface.co, W, bones, lv)

    def crow(a):
        f = 0.5 + 0.5 * math.cos(math.radians(a))
        z = neck[2] + nz - tilt * r_n * math.cos(math.radians(a)) - 0.004
        return [(z, 0.004, coat * 0.92, True), (z + 0.45 * ch, cso * 0.85, coat, True), (z + ch * (1 - 0.35 * f), cso, coat * 1.08, True)]
    co, faces, col = geom.band(surface, np.array([0.0, neck[1] + 0.005, 0.0]), zaxis, front, np.linspace(cg, 360 - cg, 17), crow, coat * 0.7, 0.004, closed=False, stand=0.006)
    out.append(Part('court_collar', 'Coat', co, faces, col=np.hstack([col, np.ones((len(co), 1))]), weights=_W(len(co), bones, {'neck_01': 0.45, 'spine_03': 0.55})))
    # cuffs: deep turned-back coat cuffs, a white shirt cuff showing at the wrist
    shirt = hex_lin(pal['shirt'])
    cuh, cuf = cs['coat']['cuff']
    for s in ('l', 'r'):
        h, t = outfit.bone_pos(rig, f'lowerarm_{s}')
        ax = t - h
        ln = np.linalg.norm(ax)
        u = cs['coat']['cuff_at'] * ln
        ref = np.cross(ax / ln, np.array([0.0, 1.0, 0.0]))
        co, faces, col = geom.band(surface, h, ax, ref, np.linspace(0, 360, 12, endpoint=False),
                                   lambda a: [(u - cuh, 0.002, coat * 0.9, True), (u - cuh + 0.006, cuf * 0.8, coat, True), (u - 0.004, cuf, coat * 1.05, True)],
                                   coat * 0.6, 0.004, closed=True)
        out.append(Part(f'court_cuff_{s}', 'Coat', co, faces, col=np.hstack([col, np.ones((len(co), 1))]), weights=_W(len(co), bones, {f'lowerarm_{s}': 0.75, f'hand_{s}': 0.25})))
        co, faces, col = geom.band(surface, h, ax, ref, np.linspace(0, 360, 12, endpoint=False),
                                   lambda a: [(u - 0.012, 0.004, shirt, True), (u + 0.014, 0.006, shirt * 0.92, True)],
                                   shirt * 0.8, 0.003, closed=True)
        out.append(Part(f'court_shirt_cuff_{s}', 'Waistcoat', co, faces, col=np.hstack([col, np.ones((len(co), 1))]), weights=_W(len(co), bones, {f'lowerarm_{s}': 0.5, f'hand_{s}': 0.5})))
    # the coat's front edges (a facing strip) and its buttons
    edge_c = hex_lin(pal['coat_edge'])
    button = hex_lin(pal['button'])
    ew = cs['coat']['edge_width']
    for side in (1, -1):
        (z0, z1, x0, x1), _, _ = front_edge(cs, lv, side)

        def at(z, out_=0.0, side=side, z0=z0, z1=z1, x0=x0, x1=x1):
            x = x0 + (x1 - x0) * np.clip((z0 - z) / (z0 - z1), 0, 1) + out_
            return np.array([side * x, -0.5, z]), -front
        strip = outfit._strip(surface, lambda z: at(z, ew * 0.5), np.linspace(z0 - 0.005, z1 + 0.004, 16), ew, 0.0025, edge_c, bones,
                              {'spine_03': 0.4, 'spine_02': 0.35, 'spine_01': 0.25}, f'coat_edge_{side}', 'Coat')
        out.append(strip)
        nb = cs['coat']['buttons']
        for b in range(nb):
            z = z0 - 0.03 - (z0 - 0.03 - (z1 + 0.06)) * b / max(nb - 1, 1)
            o, dvec = at(z, ew + 0.008)
            hit = surface.ray(o, dvec, 1.0)
            if hit is None:
                continue
            wb = {'spine_03': 1.0} if z > lv['pelvis'][2] + 0.3 else {'spine_02': 0.5, 'spine_01': 0.5}
            out.append(_button(hit[0], hit[1], (0.017, 0.006, 0.017), button, bones, wb, f'coat_button_{side}_{b}', 'Coat'))
    # waistcoat buttons down the middle
    wcb = hex_lin(pal['waistcoat_button'])
    nb = cs['waistcoat']['buttons']
    ztop = neck[2] + nz - tilt * r_n - 0.022
    for b in range(nb):
        z = ztop - (ztop - (lv['wc_hem'] + 0.05)) * b / max(nb - 1, 1)
        hit = surface.ray(np.array([0.0, -0.5, z]), -front, 1.0)
        if hit is None:
            continue
        wb = {'spine_03': 1.0} if z > lv['pelvis'][2] + 0.3 else {'spine_02': 0.5, 'spine_01': 0.5}
        out.append(_button(hit[0], hit[1], (0.011, 0.005, 0.011), wcb, bones, wb, f'waistcoat_button_{b}', 'Waistcoat'))
    # knee bands of the breeches
    br = hex_lin(pal['breeches'])
    bh = cs['breeches']['band']
    for s in ('l', 'r'):
        h, t = outfit.bone_pos(rig, f'calf_{s}')
        ax = t - h
        ln = np.linalg.norm(ax)
        u = (h[2] - lv['knee_cut']) / max(h[2] - t[2], 1e-6) * ln
        co, faces, col = geom.band(surface, h, ax, np.array([0.0, -1.0, 0.0]), np.linspace(0, 360, 12, endpoint=False),
                                   lambda a: [(u - bh * 0.6, 0.005, br * 1.15, True), (u + bh * 0.4, 0.005, br, True)],
                                   br, 0.004, closed=True)
        out.append(Part(f'knee_band_{s}', 'Breeches', co, faces, col=np.hstack([col, np.ones((len(co), 1))]), weights=_W(len(co), bones, {f'calf_{s}': 0.7, f'thigh_{s}': 0.3})))
    # shoe buckles on the instep
    buckle = hex_lin(pal['buckle'])
    for s in ('l', 'r'):
        fh, ft = outfit.bone_pos(rig, f'foot_{s}')
        inst = fh + (ft - fh) * 0.45
        o = inst + np.array([0.0, -0.08, 0.09])
        dvec = inst - o
        hit = surface.ray(o, dvec / np.linalg.norm(dvec), 0.4)
        if hit is None:
            continue
        out.append(_button(hit[0], hit[1], (0.03, 0.006, 0.022), buckle, bones, {f'foot_{s}': 1.0}, f'shoe_buckle_{s}', 'Breeches'))
    return out


def build(spec, base, rig, lm, bones, parts, log=print):
    """The court costume's parts {object name: [parts]} from the decimated skin copy `base`."""
    cs = court_spec(spec)
    if cs is None:
        return {}
    co, faces, W, col, G, keys = cut(base, rig, bones, cs, log)
    zs = zones(co, faces, W, bones, rig, cs)
    nrm = vertex_normals(co, faces)
    off = offsets(co, faces, zs, W, bones, cs, nrm)
    co2 = co + nrm * off[:, None]
    vs = cs['waistcoat'].get('smooth')
    if vs:
        co2 = vest(co2, faces, zs, nrm, int(vs[0]), float(vs[1]))
    zc = zone_colours(co, nrm, cs)
    skin = Part('court_skin', 'Skin', co2, faces, col=np.hstack([col[:, :3], np.ones((len(co), 1))]), weights=W)
    out = {}
    by = {}
    for k, z in enumerate(zs):
        if z != 'Skin':
            by.setdefault(z, []).append(k)
    for z, ids in by.items():
        m = ZONE_MATERIAL[z]
        out.setdefault(f'avatar-court-{m.lower()}', []).append(subpart(skin, ids, f'court_{z}', m, zc[z]))
    surface = Surface(co2, faces)
    extra = [skirts(co2, W, bones, rig, cs, surface)]
    extra += extras(surface, W, bones, rig, cs, lm)
    tri = hat(parts, lm, bones, cs)
    if tri is not None:
        extra.append(tri)
    for p in extra:
        out.setdefault(f'avatar-court-{p.material.lower()}', []).append(p)
    log('[court] zones: ' + ', '.join(f'{z} {sum(len(faces[k]) - 2 for k in ids)}' for z, ids in sorted(by.items())))
    return out


def objects(groups, bones, rig, key_names, materials, cs=None):
    """Build one skinned object per group; morphs only where a vertex moves. Court objects are hidden
    in renders (hide_render) and exported all the same."""
    mats = dict(materials)
    if cs:
        mats.update(cs['materials'])
    objs = []
    for name, ps in groups.items():
        if not ps:
            continue
        keys = key_names if moves(ps) else []
        o = build_object(name, ps, bones, rig, keys, mats)
        if name.startswith('avatar-court-'):
            o.hide_render = True
        objs.append(o)
    return objs


def stats(objs, groups=None):
    """Triangles and draw calls visible at once, per costume (and the costume pieces' parts)."""
    out = {}
    for c in ('default', 'court'):
        tris, calls = 0, 0
        for o in objs:
            n = o.name
            if n.startswith('avatar-') and (n.startswith(f'avatar-{c}-') or not n.startswith(('avatar-default-', 'avatar-court-'))):
                tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
                calls += len({p.material_index for p in o.data.polygons})
        out[c] = {'triangles': tris, 'draw_calls': calls}
        if groups and c != 'default':
            out[c]['by_part'] = {p.name: sum(len(f) - 2 for f in p.faces)
                                 for n, ps in groups.items() if n.startswith(f'avatar-{c}-') for p in ps}
    return out


