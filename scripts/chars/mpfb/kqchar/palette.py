"""Shared palette for the people tiers (featured, extra): every surface colour of a body in ONE
material, so the game draws a person in one call and all people share one material instance.

Route: vertex colours, not a palette texture. The stylised colours already live in the mesh's colour
attribute (COLOR_0, see parts.py); the material carries no colour of its own. So the game can draw
every person and every variant with the SAME three.js material instance, whatever GLB the body came
from (src/systems/people/authored.ts). A palette texture would need either one global atlas that
every new spec re-packs (and every GLB re-points its UVs at), or a texture per GLB, which means a
material per GLB and no sharing.

What this step does to the built body (hero-tier specs, the player, are left alone):

- joins every exported object into the body (glasses, if any, ride the head bone as a skinned part),
- replaces the semantic materials (Skin, Hair, Jacket, Trousers, Gear, Eye ...) with one material
  `People` (or two with `budget.eye_call`: `PeopleEye` for the eyes and glasses),
- keeps the semantic zone of every face in a face attribute `kq_zone` (names in the mesh's
  `kq_zones` property): retarget.py's mesh checks still know skin from cloth; it is not exported.

Spec:
  budget.tier          'featured' | 'extra' turns the step on.
  palette_slots        the six named slots {skin, hair, top, bottom, shoes, accent}: a palette key
                       or a hex colour each. Every palette entry the build paints with is a shade of
                       one of them; the stats list the resolved slots.
  budget.eye_call      true: the eyes (and glasses) get the second material (default false).
  ao                   optional baked ambient occlusion in the vertex colours (bake_ao): the
                       creases keep their shade under a flat ambient light.
"""
import json

import numpy as np

from .parts import make_material

TIERS = ('featured', 'extra')
SLOTS = ('skin', 'hair', 'top', 'bottom', 'shoes', 'accent')
MATERIAL = 'People'
EYE_MATERIAL = 'PeopleEye'
EYE_ZONES = ('Eye', 'Glasses')
# the people material's own roughness in the GLB (the game's shared material sets its own)
ROUGH = 0.72


def applies(spec):
    return spec.get('budget', {}).get('tier') in TIERS


def _hex(v, palette):
    if isinstance(v, str) and v.startswith('#'):
        return v.upper()
    if isinstance(v, str) and v in palette and isinstance(palette[v], str):
        return palette[v].upper()
    return None


def slots(spec):
    """The six palette slots as sRGB hex: `palette_slots` (palette key or hex), else the usual keys."""
    pal = spec.get('palette', {})
    wd = spec.get('wardrobe', {}) or {}
    top = (wd.get('jacket') or wd.get('shirt') or {}).get('colour', 'jacket')
    defaults = {
        'skin': 'skin',
        'hair': 'hair' if 'hair' in pal else 'brows',
        'top': top,
        'bottom': (wd.get('trousers') or {}).get('colour', 'trousers'),
        'shoes': (wd.get('shoes') or {}).get('colour', 'boots'),
        'accent': (wd.get('jacket') or {}).get('trim', 'jacket_trim'),
    }
    given = spec.get('palette_slots', {})
    out, missing = {}, []
    for s in SLOTS:
        c = _hex(given.get(s, defaults[s]), pal)
        if c is None:
            missing.append(s)
        out[s] = c
    if missing:
        raise ValueError(f'palette slots without a colour: {missing} (set palette_slots or the palette keys)')
    return out


def apply(objs, spec, log=print):
    """Join `objs` into the first one and give it the shared palette material(s). Returns [body]."""
    import bpy

    body = objs[0]
    if len(objs) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.join()
    me = body.data
    names = [m.name if m else '' for m in me.materials]
    n = len(me.polygons)
    idx = np.empty(n, dtype=np.int32)
    me.polygons.foreach_get('material_index', idx)
    zone = me.attributes.get('kq_zone') or me.attributes.new('kq_zone', 'INT', 'FACE')
    zone.data.foreach_set('value', idx)
    me['kq_zones'] = json.dumps(names)
    eye_call = bool(spec.get('budget', {}).get('eye_call', False))
    eye = np.array([names[i] in EYE_ZONES for i in idx]) if eye_call else np.zeros(n, dtype=bool)
    me.materials.clear()
    me.materials.append(make_material(MATERIAL, ROUGH, 0.0, 0.4))
    if eye.any():
        me.materials.append(make_material(EYE_MATERIAL, 0.15, 0.0, 0.6))
    me.polygons.foreach_set('material_index', eye.astype(np.int32))
    me.update()
    used = [m.name for m in me.materials]
    log(f'[palette] {len(objs)} object(s) -> {body.name}: {len(names)} zones {names} -> {used}')
    if spec.get('ao'):
        bake_ao(body, names, idx, spec['ao'], log)
    return [body]


def bake_ao(body, names, face_zone, ao, log=print):
    """Ambient occlusion baked into the vertex colours (`spec.ao`): the shared material has no
    texture, so the creases (eye sockets, under the brows, nose and chin, the ears, the collar, the
    armpits) carry their own shade and a body keeps a value range under a flat ambient light.
    `ao`: {"distance": m, "rays": n, "zones": {zone: strength 0..1}, "default": strength,
    "smooth": passes of neighbour averaging, "floor": lowest visibility kept}. The
    colour is multiplied by mix(1, visibility, strength) (visibility = unoccluded share, closer hits
    count more). The core is shared with the hero's per-costume bake (ao.py)."""
    from mathutils.bvhtree import BVHTree

    from . import ao as ao_mod

    me = body.data
    nv = len(me.vertices)
    co = np.empty(nv * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(nv, 3)
    nrm = np.empty(nv * 3)
    me.vertex_normals.foreach_get('vector', nrm)
    nrm = nrm.reshape(nv, 3)
    polys = [tuple(p.vertices) for p in me.polygons]
    tree = BVHTree.FromPolygons([tuple(v) for v in co], polys, all_triangles=False)
    vs = ao_mod.vertex_strength(me, [names[i] for i in face_zone], ao)
    vis = ao_mod.shade(me, ao_mod.visibility(co, nrm, vs, tree, ao), vs, ao)
    log(f'[palette] ao baked: {nv} vertices, {int(ao.get("rays", 24))} rays, {float(ao.get("distance", 0.1))} m; visibility mean {vis.mean():.2f}, min {vis.min():.2f}')


def zones(obj):
    """Per-face semantic zone names of a palette body (or of a hero body: its material names)."""
    me = obj.data
    a = me.attributes.get('kq_zone')
    if a is None or 'kq_zones' not in me:
        mats = [m.name if m else '' for m in me.materials]
        return [mats[p.material_index] for p in me.polygons]
    names = json.loads(me['kq_zones'])
    v = np.empty(len(me.polygons), dtype=np.int32)
    a.data.foreach_get('value', v)
    return [names[i] for i in v]


def check(stats, spec):
    """Budget issues of a people build (empty when it fits): triangles, draw calls, LOD1 ratio."""
    b = spec.get('budget', {})
    out = []
    if stats['triangles'] > b.get('max_triangles', 1e9):
        out.append(f"LOD0 {stats['triangles']} tris > {b['max_triangles']}")
    if stats['draw_calls'] > b.get('max_draw_calls', 1e9):
        out.append(f"LOD0 {stats['draw_calls']} draw calls > {b['max_draw_calls']}")
    l1 = stats.get('lod1')
    if applies(spec):
        if not l1:
            out.append('no LOD1')
        else:
            r = l1['triangles'] / max(1, stats['triangles'])
            if not 0.35 <= r <= 0.65:
                out.append(f'LOD1 ratio {r:.2f} (want about {b.get("lod1_ratio", 0.5)})')
            if l1['draw_calls'] > b.get('max_draw_calls', 1e9):
                out.append(f"LOD1 {l1['draw_calls']} draw calls > {b['max_draw_calls']}")
    return out


def finish(body, stats, spec, log=print):
    """After the report: build LOD1 (lod.lod1), add the slots, the standing height and the LOD1
    numbers to `stats`, check the budget (issues are logged and listed in stats['budget_issues']).
    Returns the LOD1 object (exported with the body)."""
    from . import lod

    b = spec.get('budget', {})
    lo = lod.lod1(body, b.get('lod1_ratio', 0.5), 'head', b.get('lod1_keep_face', 0.0))
    stats['lod1'] = {'object': lo.name, 'triangles': lod.tris(lo), 'draw_calls': len(lo.data.materials)}
    stats['palette'] = slots(spec)
    n = len(body.data.vertices)
    co = np.empty(n * 3)
    body.data.vertices.foreach_get('co', co)
    stats['height'] = round(float(co.reshape(n, 3)[:, 2].max()), 3)
    stats['tier'] = b.get('tier')
    stats['budget_issues'] = check(stats, spec)
    for msg in stats['budget_issues']:
        log(f'[palette] OVER BUDGET: {msg}')
    log(f"[palette] LOD0 {stats['triangles']} tris / {stats['draw_calls']} calls, LOD1 {stats['lod1']['triangles']} tris, height {stats['height']} m")
    return lo
