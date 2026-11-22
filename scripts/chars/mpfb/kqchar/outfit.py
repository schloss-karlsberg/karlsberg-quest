"""Modular wardrobe: jacket / shirt / trousers / shoes / bag slots, each with palette slots.

Garments that hug the body are material zones on the (decimated) body mesh, pushed out a little
for volume; trims and gear are small solids on top (stand collar, hem and cuff bands, zips, a
stowed hood, a daypack with straps). Zones come from the rig (dominant bone, positions along the
bones), so the same rules dress any MPFB body shape. A slot set to null is left out.

Spec (spec['wardrobe']):
  jacket:   material, colour, trim, offset, hem_below_pelvis, cuff_at, open_front, collar
            ('stand' | 'shirt' | null), collar_height, hood, zip, pocket_zips, ...
  shirt:    material, colour, offset, sleeves ('long' | 'short'), collar (bool)
  trousers: material, colour, offset
  shoes:    material, colour, sole, top, offset
  bag:      style ('daypack'), material, colour, panel, trim, strap, size [w, d, h]
Colour values name palette entries (spec['palette']).
"""
import math

import numpy as np

from . import geom
from .parts import Part
from .util import mix, catmull, hex_lin, smoothstep

DEFAULTS = {
    'jacket': {'material': 'Jacket', 'colour': 'jacket', 'trim': 'jacket_trim', 'offset': 0.014, 'hem_below_pelvis': 0.1,
               'cuff_at': 0.9, 'open_front': False, 'v_depth': 0.17, 'v_half_width': 0.065, 'collar': 'stand',
               'collar_height': 0.046, 'collar_stand_off': 0.014, 'collar_above_neck': 0.012, 'collar_gap_deg': 10.0, 'collar_trim': 0.008,
               'hood': True, 'hood_size': [0.017, 0.011], 'zip': True, 'pocket_zips': True, 'hem_band': 0.026, 'cuff_band': 0.026},
    'shirt': {'material': 'Shirt', 'colour': 'shirt', 'offset': 0.004, 'sleeves': 'long', 'collar': True,
              'collar_height': 0.034, 'collar_above_neck': 0.012, 'collar_gap_deg': 22.0},
    'trousers': {'material': 'Trousers', 'colour': 'trousers', 'offset': 0.007},
    'shoes': {'material': 'Gear', 'colour': 'boots', 'sole': 'boot_sole', 'top': 0.16, 'offset': 0.01, 'sole_h': 0.028},
    'bag': {'style': 'daypack', 'material': 'Gear', 'colour': 'bag', 'panel': 'bag_panel', 'trim': 'bag_trim',
            'strap': 'bag_strap', 'size': [0.3, 0.15, 0.42], 'top_below_neck': 0.06, 'strap_x': 0.088, 'strap_w': 0.04},
}


def slots(wardrobe):
    """Merge each present slot with its defaults (a missing or null slot is left out)."""
    out = {}
    for k, d in DEFAULTS.items():
        v = wardrobe.get(k)
        if v:
            out[k] = {**d, **(v if isinstance(v, dict) else {})}
    return out


def garment_materials(wardrobe):
    """The materials the wardrobe's slots use: the default outfit's pieces (court.py splits them
    off the body as avatar-default-<material>)."""
    return {s['material'] for s in slots(wardrobe).values()}


def bone_pos(rig, name):
    b = rig.data.bones[name]
    return np.array(b.head_local), np.array(b.tail_local)


def _pal(palette, key, fallback='#808080'):
    return hex_lin(palette.get(key, fallback))


def hem_height(co, rig, jk):
    """The jacket hem: `hem_below_pelvis` under the pelvis, but never below the crotch (plus
    `hem_above_crotch`), so the hem runs straight round the hips and its band never spans the legs."""
    pelvis_h, _ = bone_pos(rig, 'pelvis')
    hem = pelvis_h[2] - (jk or {}).get('hem_below_pelvis', 0.1)
    mid = co[(np.abs(co[:, 0]) < 0.008) & (co[:, 2] > pelvis_h[2] - 0.4) & (co[:, 2] < pelvis_h[2])]
    if len(mid):
        hem = max(hem, float(mid[:, 2].min()) + (jk or {}).get('hem_above_crotch', 0.025))
    return hem


def body_hem(co, rig, jk):
    """The jacket / trousers border ON the body: the hem, or with a hanging `skirt` (the jacket's
    hip part as a solid that hangs over the trousers) just under the skirt's top, out of sight."""
    hem = hem_height(co, rig, jk)
    sk = (jk or {}).get('skirt')
    return hem + sk['above_hem'] - sk.get('tuck', 0.015) if sk else hem


def collar_plane(rig, top):
    """The skin / top border at the neck: a plane through the neck, `collar_border` above the collar
    base, tilted by `collar_tilt` (m of rise per m towards the nape), so it sits under the collar band
    at the throat (where the band is lower) and at the nape."""
    neck_h, _ = bone_pos(rig, 'neck_01')
    z = neck_h[2] + top.get('collar_above_neck', 0.012) + top.get('collar_border', 0.0)
    n = np.array([0.0, -top['collar_tilt'], 1.0])
    return np.array([0.0, neck_h[1], z]), n / np.linalg.norm(n)


def collar_top(rig, top, co):
    """Height of the stand collar's top edge at each point's angle round the neck (the collar is
    lower at the front, `collar_front_drop` / `collar_front_low`)."""
    neck_h, _ = bone_pos(rig, 'neck_01')
    z0 = neck_h[2] + top.get('collar_above_neck', 0.012)
    a = np.arctan2(co[:, 0], -(co[:, 1] - (neck_h[1] + 0.005)))
    f = 0.5 + 0.5 * np.cos(a)
    zb = z0 - top.get('collar_front_drop', 0.014) * f
    return zb + top.get('collar_height', 0.04) * (1 - top.get('collar_front_low', 0.3) * f), np.degrees(a)


def cut_planes(W, bones, rig, wardrobe):
    """Planes that zone borders follow (cut into the low skin before `zones`): the jacket hem, the
    sleeve cuffs, the boot tops. Each is (point, normal, allowed(co, W) -> per-vertex bool)."""
    S = slots(wardrobe)
    jk, so = S.get('jacket'), S.get('shoes')
    out = []
    arm_like = ('upperarm', 'lowerarm', 'hand_', 'thumb', 'index', 'middle', 'ring', 'pinky')

    def dom_of(W_):
        return np.array(bones)[np.argmax(W_, axis=1)]

    if jk:
        def trunk(co, W_):
            return ~np.array([d.startswith(arm_like) for d in dom_of(W_)])
        out.append(('hem', None, np.array([0.0, 0.0, 1.0]), trunk))  # point None: at body_hem
        if jk.get('blocks') and jk.get('yoke_cut'):
            # the colour-blocked yoke's border, over the chest, the back and the shoulders
            def upper(co, W_):
                return ~np.array([d in ('head', 'neck_01') or d.startswith(('hand_', 'thumb', 'index', 'middle', 'ring', 'pinky')) for d in dom_of(W_)])
            yz = bone_pos(rig, 'upperarm_l')[0][2] - jk.get('yoke_below_shoulder', 0.075)
            out.append(('yoke', np.array([0.0, 0.0, yz]), np.array([0.0, 0.0, 1.0]), upper))
        for s in ('l', 'r'):
            h, t = bone_pos(rig, f'lowerarm_{s}')
            ax = (t - h) / np.linalg.norm(t - h)

            def forearm(co, W_, s=s):
                return np.array([d.startswith((f'lowerarm_{s}', f'hand_{s}')) or (d.startswith(('thumb', 'index', 'middle', 'ring', 'pinky')) and d.endswith(s)) for d in dom_of(W_)])
            out.append((f'cuff_{s}', h + (t - h) * jk['cuff_at'], ax, forearm))
    top = jk or S.get('shirt')
    if top and top.get('collar_tilt') is not None:
        def neck(co, W_):
            return np.array([d in ('head', 'neck_01', 'spine_03') or d.startswith('clavicle') for d in dom_of(W_)])
        p, n = collar_plane(rig, top)
        out.append(('collar', p, n, neck))
    if so:
        def leg(co, W_):
            return np.array([d.startswith(('thigh', 'calf', 'foot', 'ball')) for d in dom_of(W_)])
        out.append(('boots', np.array([0.0, 0.0, so['top']]), np.array([0.0, 0.0, 1.0]), leg))
    return out


def zones(co, faces, W, bones, rig, lm, wardrobe):
    """Material name per face and per-vertex outward offset (m)."""
    S = slots(wardrobe)
    jk, sh, tr, so = S.get('jacket'), S.get('shirt'), S.get('trousers'), S.get('shoes')
    top = jk or sh
    dom = np.array(bones)[np.argmax(W, axis=1)]
    neck_h, _ = bone_pos(rig, 'neck_01')
    pelvis_h, _ = bone_pos(rig, 'pelvis')
    hem = body_hem(co, rig, jk)
    knee_z = bone_pos(rig, 'calf_l')[0][2]
    collar_z = neck_h[2] + (top or {}).get('collar_above_neck', 0.012)
    fc = np.array([co[list(f)].mean(0) for f in faces])
    hand_bones = {b for b in bones if b.startswith(('hand_', 'thumb', 'index', 'middle', 'ring', 'pinky'))}
    arm = {s: bone_pos(rig, f'lowerarm_{s}') for s in ('l', 'r')}
    upper = {s: bone_pos(rig, f'upperarm_{s}') for s in ('l', 'r')}

    def along(c, hb):
        h, t = hb
        return (c - h) @ (t - h) / ((t - h) @ (t - h))

    torso_mat = jk['material'] if jk else (sh['material'] if sh else 'Skin')
    cplane = collar_plane(rig, top) if top and top.get('collar_tilt') is not None else None
    mats = []
    for k, f in enumerate(faces):
        c = fc[k]
        ds = [dom[i] for i in f]
        side = 'l' if c[0] > 0 else 'r'
        if any(d.startswith('lowerarm') or d in hand_bones for d in ds) and all(d in hand_bones or d.startswith('lowerarm') for d in ds):
            u = along(c, arm[side])
            if jk:
                mats.append('Skin' if u > jk['cuff_at'] else jk['material'])
            elif sh and sh['sleeves'] == 'long':
                mats.append('Skin' if u > sh.get('cuff_at', 0.9) else sh['material'])
            else:
                mats.append('Skin')
            continue
        if all(d == 'head' for d in ds):
            mats.append('Skin')
            continue
        if top and top.get('collar_tilt') is not None:
            above = (c - cplane[0]) @ cplane[1] > 0
        else:
            above = c[2] > collar_z + 0.02 * (1 if c[1] > neck_h[1] else 0)
        if above and any(d in ('head', 'neck_01') for d in ds):
            mats.append('Skin')
            continue
        # a solid shoe (`shoes.solid`) covers the foot: only what is under the shoe top is shoe (no
        # foot-weighted wedges up the calf); the faces inside it are dropped later
        if so and ((not so.get('solid') and any(d.startswith(('foot', 'ball')) for d in ds)) or c[2] < so['top']):
            mats.append(so['material'])
            continue
        # a straight hem: everything under it is trousers, everything above it the top (thighs too)
        if c[2] < hem or (not top and any(d.startswith(('thigh', 'calf')) for d in ds)):
            mats.append(tr['material'] if tr else 'Skin')
            continue
        if not jk and sh and sh['sleeves'] == 'short' and any(d.startswith('upperarm') for d in ds) and along(c, upper[side]) > 0.5:
            mats.append('Skin')
            continue
        if jk and sh and jk['open_front']:
            vz = (collar_z - c[2]) / jk['v_depth']
            if c[1] < neck_h[1] and 0 <= vz <= 1 and abs(c[0]) < jk['v_half_width'] * (1 - vz) + 0.012:
                mats.append(sh['material'])
                continue
        mats.append(torso_mat)
    off_by = {'Skin': np.zeros(len(co))}
    for s in (sh, tr, so):
        if s:
            off_by[s['material']] = np.full(len(co), s['offset'])
    if tr and tr.get('straight'):
        # a straight cut: roomier from the knee down, so the leg hangs instead of hugging the calf
        off_by[tr['material']] = off_by[tr['material']] + tr['straight'] * smoothstep(knee_z + 0.08, knee_z - 0.22, co[:, 2])
    if so and so.get('toe_extra'):
        on_toe = np.array([d.startswith('ball') for d in dom])
        off_by[so['material']] = off_by[so['material']] + so['toe_extra'] * on_toe
    if jk:
        # a shell with volume: roomier sleeves, a little bagginess above the hem
        on_arm = np.array([d.startswith(('upperarm', 'lowerarm')) for d in dom])
        jo = np.where(on_arm, jk.get('sleeve_offset', jk['offset']), jk['offset'])
        jo = jo + jk.get('waist_extra', 0.0) * smoothstep(hem + 0.2, hem + 0.04, co[:, 2]) * (~on_arm)
        if 'shoulder_offset' in jk:
            # shaped shoulders: the shell sits closer over the shoulder tops and round the neck
            shz = upper['l'][0][2]
            band = smoothstep(shz - jk.get('shoulder_band', 0.12), shz, co[:, 2])
            near_sh = np.array([d.startswith('upperarm') or d.startswith('clavicle') or d in ('spine_03', 'neck_01') for d in dom])
            jo = np.where(near_sh, jo * (1 - band) + jk['shoulder_offset'] * band, jo)
        off_by[jk['material']] = jo
    off = np.zeros(len(co))
    for k, f in enumerate(faces):
        o = off_by.get(mats[k])
        if o is None:
            continue
        for i in f:
            off[i] = max(off[i], o[i])
    return mats, off


def cloth_colours(co, nrm, wardrobe, palette, rig=None):
    """Per-material vertex colours for the zones on the body (a soft top-light gradient on each);
    a jacket with `blocks` gets colour-blocked panels: a yoke over chest and shoulders (with a seam
    line), darker side panels, and pocket flaps (no textures). Optional painted detail (no
    geometry): `jacket.folds` (shade in the crook of each elbow), `trousers.knees` ([lighter knee
    fronts, darker hollows behind]), `shoes.details` ({toe: shade of the toe cap, toe_from: m in
    front of the ankle, welt: [height, colour], laces: colour, lace_w: m, lace_strip: {colour, rows,
    width, below_top, above_sole, tongue} laces as a strip of geometry down the boot front})."""
    S = slots(wardrobe)
    out = {}
    up = smoothstep(-0.6, 0.9, nrm[:, 2])
    for key, lo in (('trousers', 0.8), ('shirt', 0.9), ('jacket', 0.82), ('shoes', 0.85)):
        s = S.get(key)
        if not s:
            continue
        base = _pal(palette, s['colour'])[None].repeat(len(co), 0)
        if key == 'jacket' and s.get('blocks') and rig is not None:
            shz = bone_pos(rig, 'upperarm_l')[0][2]
            pel = bone_pos(rig, 'pelvis')[0][2]
            x, y, z = co[:, 0], co[:, 1], co[:, 2]
            yoke_z = shz - s.get('yoke_below_shoulder', 0.075)
            yoke = smoothstep(yoke_z - 0.003, yoke_z + 0.003, z)
            seam = smoothstep(0.006, 0.002, np.abs(z - yoke_z - 0.004))
            ax = np.abs(x)
            side = smoothstep(0.125, 0.135, ax) * (1 - yoke) * smoothstep(shz - 0.03, shz - 0.05, z)
            fl = s.get('flap', [0.075, 0.045, 0.1, 0.035])  # chest pocket flap: centre |x|, below yoke, width, height
            fz = yoke_z - fl[1]
            flap = ((np.abs(ax - fl[0]) < fl[2] / 2) & (z < fz + fl[3] / 2) & (z > fz - fl[3] / 2) & (y < 0)).astype(float)
            yoke_c = _pal(palette, s.get('yoke', 'jacket_yoke'), '#4a4a4e')[None]
            panel_c = _pal(palette, s.get('panel', 'jacket_panel'), '#3e3e42')[None]
            trim_c = _pal(palette, s.get('trim', 'jacket_trim'), '#24242a')[None]
            arm = ax > 0.2  # sleeves keep the main colour below the yoke
            base = mix(base, yoke_c, yoke)
            base = mix(base, panel_c, side * (~arm))
            base = mix(base, trim_c, np.maximum(seam * 0.85, flap * 0.9) * (~arm))
        col = base * (lo + (1 - lo) * up)[:, None]
        if rig is not None and key == 'jacket' and s.get('folds'):
            for sd in ('l', 'r'):
                el, _ = bone_pos(rig, f'lowerarm_{sd}')
                d2 = ((co - el) ** 2).sum(1)
                crook = np.exp(-d2 / (2 * 0.03 ** 2)) * smoothstep(-0.2, 0.5, -nrm[:, 1])
                col = col * (1 - s['folds'] * crook)[:, None]
        if rig is not None and key == 'trousers' and s.get('knees'):
            kf, kb = s['knees']
            for sd in ('l', 'r'):
                kn, _ = bone_pos(rig, f'calf_{sd}')
                near = np.exp(-((co - kn) ** 2).sum(1) / (2 * 0.06 ** 2))
                fr = smoothstep(-0.1, 0.6, -nrm[:, 1])
                bk = smoothstep(-0.1, 0.6, nrm[:, 1])
                col = col * (1 + kf * near * fr - kb * near * bk)[:, None]
        if key == 'shoes':
            sole = co[:, 2] < s['sole_h']
            dt = s.get('details')
            if dt and rig is not None:
                for sd in ('l', 'r'):
                    fh, _ = bone_pos(rig, f'foot_{sd}')
                    near = (np.abs(co[:, 0] - fh[0]) < 0.1) & (co[:, 2] < s['top'] + 0.01)
                    fwd = fh[1] - co[:, 1]  # in front of the ankle (the front is -y)
                    t0 = dt.get('toe_from', 0.08)
                    toe = smoothstep(t0, t0 + 0.035, fwd) * near
                    col = col * (1 - (1 - dt.get('toe', 0.8)) * toe)[:, None]
                    if dt.get('laces'):
                        lw = dt.get('lace_w', 0.014)
                        lace = (smoothstep(lw, lw * 0.5, np.abs(co[:, 0] - fh[0])) * smoothstep(-0.02, 0.0, fwd) * smoothstep(t0 + 0.01, t0 - 0.01, fwd)
                                * smoothstep(s['sole_h'] + 0.02, s['sole_h'] + 0.04, co[:, 2]) * smoothstep(s['top'] - 0.005, s['top'] - 0.025, co[:, 2])
                                * smoothstep(0.2, 0.6, -nrm[:, 1] + nrm[:, 2]) * near)
                        col = mix(col, _pal(palette, dt['laces'], '#2a2420')[None], 0.85 * lace)
                if dt.get('welt'):
                    wh, wc = dt['welt']
                    welt = smoothstep(s['sole_h'] - 0.002, s['sole_h'] + 0.002, co[:, 2]) * smoothstep(s['sole_h'] + wh + 0.003, s['sole_h'] + wh - 0.001, co[:, 2])
                    col = mix(col, _pal(palette, wc, '#8a6a4a')[None], 0.8 * welt)
            col[sole] = _pal(palette, s['sole'], '#1e1c1a')[None] * (0.9 + 0.1 * up[sole])[:, None]
        out[s['material']] = np.hstack([col, np.ones((len(co), 1))])
    return out


def _weights(n, bones, mix_):
    W = np.zeros((n, len(bones)))
    for b, w in mix_.items():
        W[:, bones.index(b)] = w
    return W


def _rgba(c):
    return np.append(c, 1.0)


def _strip(surface, pts_fn, ts, width, lift, colour, bones, wmix, name, material, thick=0.0):
    """A flat (or thin solid) strip draped on the surface along pts_fn(t) -> (origin, dir)."""
    path, ups = [], []
    for t in ts:
        o, d = pts_fn(t)
        hit = surface.ray(o, d, 0.6)
        if hit is None:
            continue
        path.append(hit[0] + hit[1] * lift)
        ups.append(hit[1])
    path = np.array(path)
    ups = np.array(ups)
    if thick > 0:
        prof = [(-width / 2, 0), (width / 2, 0), (width / 2, thick), (-width / 2, thick)]
        co, faces = geom.sweep(path, ups, prof)
    else:
        co, faces = geom.sweep(path, ups, [(-width / 2, 0.0), (width / 2, 0.0)], caps=False)
        faces = [f for k, f in enumerate(faces) if k % 2 == 0]  # one side only (the outward one)
        faces = _outward(co, faces, ups, len(path))
    col = np.tile(_rgba(colour), (len(co), 1))
    return Part(name, material, co, faces, col=col, weights=_weights(len(co), bones, wmix))


def _outward(co, faces, ups, n):
    out = []
    for f in faces:
        p = co[list(f)]
        nrm = np.cross(p[1] - p[0], p[2] - p[0])
        i = min(f[0] // 2, n - 1)
        out.append(f if nrm @ ups[i] > 0 else tuple(reversed(f)))
    return out


def flap(surface, centre_x, centre_z, size, thick, colour, edge, bones, wmix, name, material, nu=6, nv=4, lift=0.001):
    """A pocket flap: a small raised panel draped on the surface (rays from the front), its border
    tucked to the surface, the bottom edge darker (reads as the flap's shadow line)."""
    w, h = size
    us, vs = np.linspace(-0.5, 0.5, nu + 1), np.linspace(-0.5, 0.5, nv + 1)
    co, ring, vv = [], [], []
    for j, v in enumerate(vs):
        for i, u in enumerate(us):
            x = centre_x + u * w * (1 - 0.12 * (v < 0) * (abs(u) * 2) ** 4)  # a little taper at the bottom corners
            z = centre_z + v * h
            hit = surface.ray(np.array([x, -0.6, z]), (0.0, 1.0, 0.0), 1.2)
            if hit is None:
                return None
            k = min(i, nu - i, j, nv - j)
            off = lift + (thick if k >= 1 else 0.0)
            co.append(hit[0] + hit[1] * off)
            ring.append(k)
            vv.append(v)
    co = np.array(co)
    faces = []
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            faces.append((a, a + 1, a + nu + 2, a + nu + 1))
    faces = [f if np.cross(co[f[1]] - co[f[0]], co[f[2]] - co[f[0]]) @ np.array([0.0, -1.0, 0.0]) > 0 else f[::-1] for f in faces]
    col = np.tile(_rgba(colour), (len(co), 1))
    vv, ring = np.array(vv), np.array(ring)
    col[(vv < -0.3), :3] = edge
    col[(ring == 0) & (vv > -0.3), :3] = colour * 0.8
    return Part(name, material, co, faces, col=col, weights=_weights(len(co), bones, wmix))


def extras(surface, rig, lm, wardrobe, palette, bones, hem=None):
    """Solid trims and gear on the dressed body surface; returns a list of Parts."""
    S = slots(wardrobe)
    parts = []
    jk, sh, bag = S.get('jacket'), S.get('shirt'), S.get('bag')
    neck_h, _ = bone_pos(rig, 'neck_01')
    pelvis_h, _ = bone_pos(rig, 'pelvis')
    sp3, _ = bone_pos(rig, 'spine_03')
    cl_l, cl_l_t = bone_pos(rig, 'clavicle_l')
    zaxis = np.array([0.0, 0.0, 1.0])
    front = np.array([0.0, -1.0, 0.0])
    if jk:
        jacket_c = _pal(palette, jk['colour'])
        trim = _pal(palette, jk['trim'], '#26262a')
        jacket_dark = jacket_c * 0.72
        mat = jk['material']
        z0 = neck_h[2] + jk['collar_above_neck']
        origin = np.array([0.0, neck_h[1] + 0.005, 0.0])
        if jk['collar'] == 'stand':
            hgt, tr_h = jk['collar_height'], jk['collar_trim']
            ctrim = _pal(palette, jk.get('collar_trim_colour', jk['trim']), '#26262a')
            lining = _pal(palette, jk.get('collar_lining', jk['trim']), '#26262a')

            def rows(a):
                f = 0.5 + 0.5 * math.cos(math.radians(a))
                zb = z0 - jk.get('collar_front_drop', 0.014) * f
                zt = zb + hgt * (1 - jk.get('collar_front_low', 0.3) * f)
                so = jk['collar_stand_off']
                return [(zb, 0.004, jacket_c, True), (zb + 0.4 * (zt - zb), so * 0.8, jacket_c, True), (zt - tr_h, so, jacket_c, False), (zt - tr_h, so, ctrim, True), (zt, so + 0.001, ctrim, True)]

            g = jk['collar_gap_deg']
            closed = bool(jk.get('collar_closed'))  # zipped up to the top: one ring, the zip over the front
            angs = np.linspace(0, 360, jk.get('collar_segments', 33), endpoint=False) if closed else np.linspace(g, 360 - g, jk.get('collar_segments', 33))
            co, faces, col = geom.band(surface, origin, zaxis, front, angs, rows, lining, 0.004, closed=closed,
                                       stand=jk.get('collar_taper', 0.008), smooth=jk.get('collar_smooth', 0))
            parts.append(Part('collar', mat, co, faces, col=np.hstack([col, np.ones((len(co), 1))]), weights=_weights(len(co), bones, {'neck_01': 0.5, 'spine_03': 0.5})))
        if jk['hood']:
            # a stowed hood rolled up behind the collar, resting on the shoulders
            path, ups, sc = [], [], []
            for a in np.linspace(62, 298, 17):
                r = math.radians(a)
                d = np.array([math.sin(r), -math.cos(r), 0.0])
                p0 = origin + zaxis * (z0 - 0.002)
                hit = surface.ray(p0, d, 0.4)
                rad = np.linalg.norm(hit[0] - p0) if hit else 0.07
                path.append(p0 + d * (rad + jk['hood_size'][0] * 0.55) + zaxis * jk['hood_size'][1] * 0.5)
                ups.append(zaxis * 0.6 + d * 0.4)
                e = min(a - 62, 298 - a) / 40.0
                sc.append(0.45 + 0.55 * smoothstep(0, 1, e))
            hw_, hh_ = jk['hood_size']
            prof = [(hw_ * math.cos(t), hh_ * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 10, endpoint=False)]
            co, faces = geom.sweep(np.array(path), np.array(ups), prof, scale=np.array(sc))
            col = np.tile(_rgba(jacket_c), (len(co), 1))
            low = co[:, 2] < np.array(path)[:, 2].mean() - 0.004
            col[low, :3] = jacket_dark
            parts.append(Part('hood', mat, co, faces, col=col, weights=_weights(len(co), bones, {'spine_03': 0.7, 'neck_01': 0.3})))
        # hem and cuff bands (dark trim, hiding the zone steps); a hanging skirt has its own hem
        hem = hem if hem is not None else hem_height(surface.co, rig, jk)
        hb = jk['hem_band']
        hbl = jk.get('hem_band_below', 0.006)
        if not jk.get('skirt'):
            co, faces, col = geom.band(surface, np.array([0.0, pelvis_h[1], 0.0]), zaxis, front, np.linspace(0, 360, jk.get('hem_segments', 40), endpoint=False),
                                       lambda a: [(hem - hbl, 0.004, trim, True), (hem + 0.002, jk.get('hem_band_lift', 0.005), trim, True),
                                                  (hem + hb, 0.003, trim, True)], trim, 0.005, closed=True)
            parts.append(Part('hem', mat, co, faces, col=np.hstack([col, np.ones((len(co), 1))]), weights=_weights(len(co), bones, {'pelvis': 0.5, 'spine_01': 0.5})))
        cuff_c = _pal(palette, jk.get('cuff_colour', jk['trim']), '#26262a')
        for s in ('l', 'r'):
            h, t = bone_pos(rig, f'lowerarm_{s}')
            ax = t - h
            ln = np.linalg.norm(ax)
            u = jk['cuff_at'] * ln
            ref = np.cross(ax / ln, np.array([0.0, 1.0, 0.0]))
            cl = jk.get('cuff_lift', 0.0035)
            co, faces, col = geom.band(surface, h, ax, ref, np.linspace(0, 360, jk.get('cuff_segments', 16), endpoint=False),
                                       lambda a: [(u - jk['cuff_band'], cl * 0.7, cuff_c, True), (u, cl, cuff_c, True), (u + 0.004, cl * 0.7, cuff_c, True)], cuff_c * 0.8, 0.004, closed=True,
                                       smooth=jk.get('cuff_smooth', 0))
            parts.append(Part(f'cuff_{s}', mat, co, faces, col=np.hstack([col, np.ones((len(co), 1))]), weights=_weights(len(co), bones, {f'lowerarm_{s}': 0.6, f'hand_{s}': 0.4})))
        zt = z0 - 0.012
        if jk['zip'] and not jk.get('zip_solid'):
            parts.append(_strip(surface, lambda z: (np.array([0.0, -0.5, z]), -front), np.linspace(zt, hem + hb, 18), jk.get('zip_width', 0.008), jk.get('zip_raise', 0.0015), _pal(palette, jk.get('zip_colour', jk['trim']), '#26262a'), bones,
                                {'spine_03': 0.4, 'spine_02': 0.3, 'spine_01': 0.3}, 'zip', mat))
        if jk.get('chest_flaps'):
            cf = jk['chest_flaps']  # [centre |x|, below the collar, width, height]
            for s in jk.get('chest_flap_sides', (1, -1)):
                fp = flap(surface, s * cf[0], z0 - cf[1], (cf[2], cf[3]), 0.005, jacket_c * 0.9, trim, bones, {'spine_03': 1.0}, f'chest_flap_{s}', mat)
                if fp is not None:
                    parts.append(fp)
        if jk['pocket_zips']:
            for s in (1, -1):
                parts.append(_strip(surface, lambda t, s=s: (np.array([s * (0.035 + 0.05 * t), -0.5, zt - 0.075 - 0.09 * t]), -front), np.linspace(0, 1, 6),
                                    0.006, 0.0015, trim, bones, {'spine_03': 1.0}, f'pocket_zip_{s}', mat))
        if jk.get('hip_flaps'):
            hf = jk['hip_flaps']  # [centre |x|, above the hem, width, height]
            for s in (1, -1):
                fp = flap(surface, s * hf[0], hem + hf[1], (hf[2], hf[3]), 0.006, jacket_c * 0.9, trim, bones, {'spine_01': 0.5, 'pelvis': 0.5}, f'hip_flap_{s}', mat)
                if fp is not None:
                    parts.append(fp)
        elif jk.get('hip_pockets', True):
            # hand-warmer pockets: flat panels a shade darker, with a dark zip along the top
            for s in (1, -1):
                hit = surface.ray(np.array([s * jk.get('pocket_x', 0.1), -0.5, hem + jk.get('pocket_up', 0.1)]), (0.0, 1.0, 0.0), 0.6)
                if hit is None:
                    continue
                n = hit[1]
                ex = np.cross(n, zaxis)
                ex /= np.linalg.norm(ex)
                ez = np.cross(ex, n)
                pw, ph = jk.get('pocket_size', [0.12, 0.13])
                co, faces = geom.rounded_box(hit[0] + n * 0.002, (pw, 0.01, ph), e=0.25, nu=6, nv=12, axes=np.array([ex, n, ez]))
                local = (co - hit[0]) @ ez
                col = np.tile(_rgba(jacket_c * 0.82), (len(co), 1))
                col[local > ph * 0.36, :3] = trim
                parts.append(Part(f'pocket_{s}', mat, co, faces, col=col, weights=_weights(len(co), bones, {'spine_01': 0.5, 'pelvis': 0.5})))
    so = S.get('shoes')
    if so and so.get('collar'):
        dark = _pal(palette, so['colour']) * so.get('collar_shade', 0.6)
        for s in ('l', 'r'):
            h, t = bone_pos(rig, f'calf_{s}')
            ax = t - h
            u = (h[2] - so['top']) / max(h[2] - t[2], 1e-6) * np.linalg.norm(ax)
            ref = np.array([0.0, -1.0, 0.0])
            ch, co_ = so['collar']
            co, faces, col = geom.band(surface, h, ax, ref, np.linspace(0, 360, 16, endpoint=False),
                                       lambda a: [(u - 0.004, 0.002, dark, True), (u + ch * 0.5, co_, dark, True), (u + ch, 0.002, dark, True)], dark, 0.004, closed=True)
            parts.append(Part(f'boot_collar_{s}', so['material'], co, faces, col=np.hstack([col, np.ones((len(co), 1))]),
                              weights=_weights(len(co), bones, {f'calf_{s}': 1.0})))
    lace = (so or {}).get('details', {}).get('lace_strip') if so else None
    if lace:
        # laces as geometry (the boot zone is too coarse for painted ones): a strip down the boot
        # front from under the collar to the instep, rows alternating lace / tongue
        lc = _pal(palette, lace.get('colour', 'boot_laces'), '#1e1a18')
        tongue = _pal(palette, so['colour']) * lace.get('tongue', 1.15)
        for s_ in ('l', 'r'):
            ah, at = bone_pos(rig, f'foot_{s_}')
            x = ah[0] * 0.6 + at[0] * 0.4
            zs = np.linspace(so['top'] - lace.get('below_top', 0.03), so['sole_h'] + lace.get('above_sole', 0.035), int(lace.get('rows', 12)))
            pt = _strip(surface, lambda z, x=x, y=ah[1]: (np.array([x, y - 0.5, z]), np.array([0.0, 1.0, 0.0])), zs,
                        lace.get('width', 0.022), lace.get('lift', 0.002), lc, bones, {f'foot_{s_}': 1.0}, f'laces_{s_}', so['material'])
            zz = pt.co[:, 2]
            wf = smoothstep(so['top'] - 0.03, so['sole_h'] + 0.07, zz)
            Wl = np.zeros((len(zz), len(bones)))
            Wl[:, bones.index(f'foot_{s_}')] = wf
            Wl[:, bones.index(f'calf_{s_}')] = 1.0 - wf
            pt.weights = Wl
            row = np.arange(len(zz)) // 2
            pt.col[row % 2 == 1, :3] = tongue
            parts.append(pt)
    if bag:
        parts += daypack(surface, rig, bag, palette, bones, neck_h, sp3)
    if sh and sh['collar'] and not (jk and jk['collar']):
        shirt_c = _pal(palette, sh['colour'])
        z0 = neck_h[2] + sh['collar_above_neck']
        hgt = sh['collar_height']

        def rows(a):
            f = 0.5 + 0.5 * math.cos(math.radians(a))
            zb = z0 - 0.03 * f
            return [(zb, 0.009, shirt_c, True), (zb + hgt * (1 - 0.25 * f), 0.004, shirt_c, True)]

        g = sh['collar_gap_deg']
        co, faces, col = geom.band(surface, np.array([0.0, neck_h[1] + 0.005, 0.0]), zaxis, front, np.linspace(g, 360 - g, 29), rows, shirt_c, 0.003, closed=False)
        parts.append(Part('collar', sh['material'], co, faces, col=np.hstack([col, np.ones((len(co), 1))]), weights=_weights(len(co), bones, {'neck_01': 0.5, 'spine_03': 0.5})))
    return parts


def daypack(surface, rig, bag, palette, bones, neck_h, sp3):
    """A soft-box daypack on the back with a front pocket, top lid band and shoulder straps."""
    w, d, h = bag['size']
    body = _pal(palette, bag['colour'])
    panel = _pal(palette, bag['panel'], '#4a4a4e')
    trim = _pal(palette, bag['trim'], '#2a2a2c')
    strap = _pal(palette, bag['strap'], '#2a2d30')
    mat = bag['material']
    ztop = neck_h[2] - bag['top_below_neck']
    zc = ztop - h / 2
    hit = surface.ray(np.array([0.0, sp3[1], zc]), (0.0, 1.0, 0.0), 0.5)
    yb = hit[0][1] if hit else sp3[1] + 0.12
    hit2 = surface.ray(np.array([0.0, sp3[1], ztop - 0.04]), (0.0, 1.0, 0.0), 0.5)
    yb2 = hit2[0][1] if hit2 else yb
    yb = max(yb, yb2)
    centre = np.array([0.0, yb + d / 2 + 0.006, zc])
    parts = []
    W = {'spine_03': 0.6, 'spine_02': 0.4}
    co, faces = geom.rounded_box(centre, (w, d, h), e=0.32, nu=10, nv=16)
    rel = (co - centre) / (np.array([w, d, h]) / 2)
    col = np.tile(body, (len(co), 1))
    col[rel[:, 2] < -0.62] = trim
    col[rel[:, 2] > 0.72] = body * 0.8
    col = np.hstack([col, np.ones((len(co), 1))])
    parts.append(Part('bag', mat, co, faces, col=col, weights=_weights(len(co), bones, W)))
    pc = centre + np.array([0.0, d / 2 - 0.004, -h * 0.17])
    co, faces = geom.rounded_box(pc, (w * 0.7, 0.05, h * 0.42), e=0.3, nu=8, nv=12)
    col = np.tile(_rgba(panel), (len(co), 1))
    col[co[:, 2] > pc[2] + h * 0.17, :3] = trim
    parts.append(Part('bag_pocket', mat, co, faces, col=col, weights=_weights(len(co), bones, W)))
    # shoulder straps: front of the chest, over the shoulder, down to the pack's top
    sx = bag['strap_x']
    sw = bag['strap_w']
    for s in (1, -1):
        cl_h, cl_t = bone_pos(rig, 'clavicle_l' if s > 0 else 'clavicle_r')
        shoulder_z = cl_t[2] + 0.03
        o = np.array([s * sx, cl_t[1] + 0.005, shoulder_z - 0.07])
        pts = []
        for z in np.linspace(shoulder_z - 0.22, shoulder_z - 0.07, 6):
            pts.append((np.array([s * (sx + 0.012 * (shoulder_z - 0.07 - z) / 0.15), -0.5, z]), np.array([0.0, 1.0, 0.0])))
        for a in np.linspace(20, 165, 9):
            r = math.radians(a)
            pts.append((o, np.array([0.0, -math.cos(r), math.sin(r)])))
        for z in np.linspace(shoulder_z - 0.07, ztop - 0.02, 4):
            pts.append((np.array([s * sx, 0.5, z]), np.array([0.0, -1.0, 0.0])))
        path, ups = [], []
        for po, pd in pts:
            hit = surface.ray(po, pd, 0.6)
            if hit is None:
                continue
            path.append(hit[0] + hit[1] * 0.004)
            ups.append(hit[1])
        path = np.array(path)
        ups = np.array(ups)
        keep = [0]
        for i in range(1, len(path)):
            if np.linalg.norm(path[i] - path[keep[-1]]) > 0.012:
                keep.append(i)
        path, ups = path[keep], ups[keep]
        sm = catmull(path, 22)
        su = np.array([ups[min(int(round(i * (len(ups) - 1) / 21)), len(ups) - 1)] for i in range(22)])
        prof = [(-sw / 2, 0.0), (sw / 2, 0.0), (sw / 2, 0.006), (-sw / 2, 0.006)]
        co, faces = geom.sweep(sm, su, prof)
        col = np.tile(_rgba(strap), (len(co), 1))
        parts.append(Part(f'bag_strap_{s}', mat, co, faces, col=col, weights=_weights(len(co), bones, {'spine_03': 0.7, 'clavicle_l' if s > 0 else 'clavicle_r': 0.3})))
    # sternum strap between the two
    zs = neck_h[2] - 0.13
    parts.append(_strip(surface, lambda x: (np.array([x, -0.5, zs]), np.array([0.0, 1.0, 0.0])), np.linspace(-sx, sx, 8), 0.016, 0.006, strap, bones,
                        {'spine_03': 1.0}, 'bag_sternum', mat, thick=0.004))
    return parts
