"""MPFB2 step: a parametric MakeHuman body from a spec, baked to one rest shape plus morphs.

Everything here uses only the CC0 core data that ships inside the MPFB extension (base mesh hm08,
macro and detail targets, the expression units, the "game_engine" rig and its weights). No asset
pack is needed.

Blender convention after `create_human`: Z up, the face looks along -Y, +X is the character's left,
metres (scale 0.1 of the MakeHuman decimetre mesh), feet on Z = 0.
"""
import glob
import importlib
import math
import os

import bpy
import numpy as np

MPFB_MODULE = 'bl_ext.blender_org.mpfb'

_svc = {}


def enable():
    """Enable the installed MPFB extension (factory startup does not load user add-ons)."""
    import addon_utils

    mod = addon_utils.enable(MPFB_MODULE, default_set=True, persistent=False)
    if mod is None:
        raise RuntimeError('MPFB is not installed: see scripts/chars/README.md (blender --command extension install --enable mpfb)')
    for name, cls in (('humanservice', 'HumanService'), ('targetservice', 'TargetService'), ('locationservice', 'LocationService')):
        _svc[cls] = getattr(importlib.import_module(f'{MPFB_MODULE}.services.{name}'), cls)
    return mod


def mpfb_version():
    import addon_utils

    for m in addon_utils.modules():
        if m.__name__ == MPFB_MODULE:
            return '.'.join(str(x) for x in addon_utils.module_bl_info(m).get('version', ()))
    return '?'


def data_dir():
    return _svc['LocationService'].get_mpfb_data()


_target_index = None


def find_target(name):
    """Path of a core target by its file stem ('head-round', 'l-cheek-volume-incr')."""
    global _target_index
    if _target_index is None:
        _target_index = {}
        root = os.path.join(data_dir(), 'targets')
        for p in glob.glob(os.path.join(root, '**', '*.target.gz'), recursive=True):
            stem = os.path.basename(p)[: -len('.target.gz')]
            # expression units exist per ethnic set; prefer the caucasian copy, keep the first otherwise
            if stem in _target_index and '/caucasian/' not in p.replace(os.sep, '/'):
                continue
            _target_index[stem] = p
    if name not in _target_index:
        raise KeyError(f'MPFB target not found: {name}')
    return _target_index[name]


def expand_lr(d):
    """{'lr-cheek-volume-incr': 0.5} -> both sides; other keys unchanged."""
    out = {}
    for k, v in (d or {}).items():
        if k.startswith('lr-'):
            out['l-' + k[3:]] = v
            out['r-' + k[3:]] = v
        else:
            out[k] = v
    return out


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for d in list(coll):
            coll.remove(d)


def _key_coords(obj, kb):
    n = len(obj.data.vertices)
    a = np.empty(n * 3, dtype=np.float64)
    kb.data.foreach_get('co', a)
    return a.reshape(n, 3)


class Human:
    """The baked MPFB body: rest positions, morph positions, groups, rig and skin weights."""

    def __init__(self):
        self.obj = None
        self.rig = None
        self.co = None  # (N,3) rest (default expression baked in)
        self.keys = {}  # morph name -> (N,3)
        self.faces = []
        self.groups = {}  # vertex group name -> (N,) weights
        self.bones = []
        self.weights = None  # (N, nbones)
        self.lm = {}  # landmarks


def build(spec):
    """Create, shape, bake and rig the MPFB human described by `spec['body']` / `spec['face']`."""
    HS, TS = _svc['HumanService'], _svc['TargetService']
    body = spec['body']
    face = spec.get('face', {})
    macro = TS.get_default_macro_info_dict()
    for k, v in body.get('macro', {}).items():
        if k != 'race':
            macro[k] = float(v)
    if 'race' in body.get('macro', {}):
        macro['race'] = dict(body['macro']['race'])
    obj = HS.create_human(mask_helpers=False, detailed_helpers=True, extra_vertex_groups=True, feet_on_ground=True, scale=0.1, macro_detail_dict=macro)

    # detail targets (body + face): plain shape keys at their weight
    details = expand_lr(body.get('targets', {}))
    details.update(expand_lr(face.get('targets', {})))
    for name, w in details.items():
        TS.load_target(obj, find_target(name), weight=float(w), name='t-' + name)
    # expression units: loaded at 0, combined into morphs below
    units = set()
    exprs = face.get('expressions', {})
    for e in exprs.values():
        units.update(e.keys())
    for u in sorted(units):
        TS.load_target(obj, find_target(u), weight=0.0, name='x-' + u)

    kbs = obj.data.shape_keys.key_blocks
    base = _key_coords(obj, kbs[0])
    shape = base.copy()
    unit_delta = {}
    for kb in kbs[1:]:
        d = _key_coords(obj, kb) - base
        if kb.name.startswith('x-'):
            unit_delta[kb.name[2:]] = d
        else:
            shape += kb.value * d
    obj.shape_key_clear()

    def expr(name):
        e = exprs.get(name, {})
        d = np.zeros_like(base)
        for u, w in e.items():
            d += float(w) * unit_delta[u]
        return d

    rest_expr = expr('rest')
    co = shape + rest_expr
    obj.data.vertices.foreach_set('co', co.ravel())
    obj.data.update()

    rig = HS.add_builtin_rig(obj, body.get('rig', 'game_engine'))
    rig.name = rig.data.name = 'avatar-rig'
    h = Human()
    h.obj, h.rig = obj, rig
    h.bones = [b.name for b in rig.data.bones]
    n = len(obj.data.vertices)
    gidx = {g.index: g.name for g in obj.vertex_groups}
    bone_col = {b: i for i, b in enumerate(h.bones)}
    W = np.zeros((n, len(h.bones)))
    groups = {g.name: np.zeros(n) for g in obj.vertex_groups}
    for v in obj.data.vertices:
        for g in v.groups:
            name = gidx[g.group]
            groups[name][v.index] = g.weight
            if name in bone_col:
                W[v.index, bone_col[name]] = g.weight
    h.groups = groups
    h.faces = [tuple(p.vertices) for p in obj.data.polygons]

    # morphs relative to the rest shape (the rest expression is already in `co`)
    morph_d = {}
    for name in exprs:
        if name == 'rest':
            continue
        morph_d[name] = expr(name)

    # stylisation: a slightly larger head, scaled about the top of the neck under the ears
    hb = bone_col.get('head')
    eyes = groups['helper-l-eye'] + groups['helper-r-eye'] > 0.5
    wh = W[:, hb].copy() if hb is not None else np.zeros(n)
    wh[eyes] = 1.0
    lm0 = landmarks(co, groups)
    s = float(face.get('head_scale', 1.0))
    if abs(s - 1.0) > 1e-4:
        c = np.array([0.0, lm0['ear_y'], lm0['chin_z'] + 0.01])
        f = (1.0 + (s - 1.0) * wh)[:, None]
        co = c + (co - c) * f
        for k in morph_d:
            morph_d[k] = morph_d[k] * f
        # move the head bone tail with the head (its head stays at the neck)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode='EDIT')
        eb = rig.data.edit_bones.get('head')
        if eb is not None:
            t = np.array(eb.tail)
            eb.tail = tuple(c + (t - c) * s)
        bpy.ops.object.mode_set(mode='OBJECT')
    if face.get('skull'):
        co = skull(co, groups, wh, landmarks(co, groups), face['skull'])
        # the head bone's tail follows the lowered crown
        lm1 = landmarks(co, groups)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode='EDIT')
        eb = rig.data.edit_bones.get('head')
        if eb is not None and eb.tail[2] > lm1['head_top']:
            eb.tail = (eb.tail[0], eb.tail[1], lm1['head_top'])
        bpy.ops.object.mode_set(mode='OBJECT')
    obj.data.vertices.foreach_set('co', co.ravel())
    obj.data.update()
    h.co = co
    h.keys = {k: co + d for k, d in morph_d.items()}
    W[eyes] = 0.0
    if hb is not None:
        W[eyes, hb] = 1.0
    h.weights = W
    h.lm = landmarks(co, groups)
    h.lm['head_weight'] = wh
    return h


def skull(co, g, wh, lm, spec):
    """A lower, rounder cranium (bald heads): above `face.skull.base` (m over the eye line) the
    crown is lowered by `lower` (fraction of the dome's height) and each slice is pulled toward a
    smooth dome (`round`, 0..1): an ellipse fitted to the head at the base level, narrowing like a
    sphere's cap to the crown. Below the base (the face, the ears) nothing moves; a 2.5 cm blend."""
    co = co.copy()
    body = g['body'] > 0.5
    ears = g['ears'] > 0.3
    z0 = lm['eye_z'] + spec.get('base', 0.03)
    yc = spec.get('centre_y', (lm['head_front'] + lm['head_back']) / 2 + 0.01)
    on = body & (wh > 0.5) & ~ears & (co[:, 2] > z0 - 0.03)
    top = float(co[on][:, 2].max())
    H = top - z0
    # the ellipse at the base level (half width / half depth, centre yc)
    ring = on & (np.abs(co[:, 2] - z0) < 0.006)
    rel = co[ring][:, :2] - np.array([0.0, yc])
    ax = float(np.abs(rel[:, 0]).max())
    ay_f = float(-rel[:, 1].min())  # to the forehead
    ay_b = float(rel[:, 1].max())  # to the back
    lower = spec.get('lower', 0.1)
    rnd = spec.get('round', 0.6)
    H2 = H * (1 - lower)
    blend = np.clip((co[:, 2] - z0) / 0.025, 0, 1)
    blend = blend * blend * (3 - 2 * blend) * on
    sel = np.nonzero(blend > 0)[0]
    for i in sel:
        x, y, z = co[i]
        u = max(0.0, (z - z0) / H)
        z2 = z0 + (z - z0) * (1 - lower)
        dx, dy = x, y - yc
        rho = math.hypot(dx, dy)
        if rho < 1e-6:
            co[i, 2] = z + (z2 - z) * blend[i]
            continue
        th = math.atan2(dx, dy)
        # the base ellipse's radius in this direction (front and back half-depths differ)
        ay = ay_b if dy > 0 else ay_f
        r_e = 1.0 / math.sqrt((math.sin(th) / ax) ** 2 + (math.cos(th) / ay) ** 2)
        u2 = min(1.0, (z2 - z0) / max(H2, 1e-6))
        r_dome = r_e * math.sqrt(max(0.0, 1 - u2 ** 2))
        r_new = rho + (r_dome - rho) * rnd * min(1.0, u * 1.6)
        b = blend[i]
        co[i, 0] = x + (dx / rho * r_new - x) * b
        co[i, 1] = y + (yc + dy / rho * r_new - y) * b
        co[i, 2] = z + (z2 - z) * b
    return co


def landmarks(co, g):
    """Measured points of the face (metres, rest pose)."""
    lm = {}
    body = g['body'] > 0.5
    le = g['helper-l-eye'] > 0.5
    re_ = g['helper-r-eye'] > 0.5
    lm['eye_l'] = co[le].mean(0)
    lm['eye_r'] = co[re_].mean(0)
    lm['eye_radius'] = float(np.linalg.norm(co[le] - lm['eye_l'], axis=1).mean())
    lips = (g['lips'] > 0.5) & body
    lc = co[lips]
    lm['mouth'] = np.array([0.0, lc[:, 1].min(), (lc[:, 2].min() + lc[:, 2].max()) / 2])
    lm['mouth_w'] = float(lc[:, 0].max() - lc[:, 0].min())
    # mouth corners: the widest point of the slit (inner-mouth vertices just behind the lips)
    slit = body & (co[:, 1] > lc[:, 1].min() + 0.006) & (co[:, 1] < lc[:, 1].min() + 0.02) & (np.abs(co[:, 2] - lm['mouth'][2]) < 0.012) & (np.abs(co[:, 0]) < lm['mouth_w'] * 0.6)
    lm['mouth_corner_x'] = float(np.abs(co[slit][:, 0]).max()) if slit.any() else lm['mouth_w'] * 0.38
    lm['lips_top'] = float(lc[:, 2].max())
    lm['lips_bottom'] = float(lc[:, 2].min())
    ears = (g['ears'] > 0.5) & body
    ec = co[ears]
    lm['ear_y'] = float(ec[:, 1].mean())
    lm['ear_top'] = float(ec[:, 2].max())
    lm['ear_bottom'] = float(ec[:, 2].min())
    lm['ear_x'] = float(np.abs(ec[:, 0]).max())
    lm['ear_front_y'] = float(ec[:, 1].min())
    eye_z = (lm['eye_l'][2] + lm['eye_r'][2]) / 2
    lm['eye_z'] = float(eye_z)
    lm['eye_y'] = float((lm['eye_l'][1] + lm['eye_r'][1]) / 2)
    # chin: the most forward midline point below the lower lip; its underside is the chin height
    mid = body & (np.abs(co[:, 0]) < 0.012) & (co[:, 1] < lm['mouth'][1] + 0.05) & (co[:, 2] < lm['lips_bottom'] - 0.01) & (co[:, 2] > lm['mouth'][2] - 0.09)
    # the chin is the most forward point below the lips; its underside is where the front turns back
    mc = co[mid]
    chin_front = mc[np.argmin(mc[:, 1] + 0.0 * mc[:, 2])] if len(mc) else lm['mouth']
    lm['chin_front'] = chin_front
    under = mc[mc[:, 1] < chin_front[1] + 0.03]
    lm['chin_z'] = float(under[:, 2].min()) if len(under) else float(lm['mouth'][2] - 0.05)
    lm['chin_y'] = float(chin_front[1])
    nose = body & (np.abs(co[:, 0]) < 0.01) & (co[:, 2] > lm['mouth'][2]) & (co[:, 2] < eye_z)
    nc = co[nose]
    tip = nc[np.argmin(nc[:, 1])]
    lm['nose_tip'] = tip
    # the bottom of the nose (subnasale): the deepest midline point between the tip and the upper lip
    nb = co[body & (np.abs(co[:, 0]) < 0.004) & (co[:, 2] < tip[2]) & (co[:, 2] > lm['lips_top']) & (co[:, 1] < tip[1] + 0.04)]
    lm['nose_bottom'] = float(nb[np.argmax(nb[:, 1]), 2]) if len(nb) else float(tip[2] - 0.012)
    head = body & (co[:, 2] > lm['mouth'][2] - 0.1)
    lm['head_top'] = float(co[head][:, 2].max())
    lm['head_back'] = float(co[body & (co[:, 2] > eye_z - 0.02) & (np.abs(co[:, 0]) < 0.03)][:, 1].max())
    lm['head_front'] = float(tip[1])
    return lm
