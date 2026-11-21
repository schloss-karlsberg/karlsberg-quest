"""Budget step: decimate the MPFB skin (the face is protected) and carry weights, colours, groups
and morphs across.

Blender's Decimate (collapse) interpolates vertex groups and colour attributes; it cannot run on a
mesh with shape keys, so the morphs are re-created on the low mesh by binding it to the full one.
"""
import bpy
import numpy as np

from .bind import Binding, Surface


def decimate(co, faces, weights, bones, col, groups, keep, ratio, keys):
    """Returns (co, faces, weights, col, groups, keys) of the decimated skin."""
    me = bpy.data.meshes.new('lod_tmp')
    me.from_pydata(co.tolist(), [], [list(f) for f in faces])
    me.update()
    obj = bpy.data.objects.new('lod_tmp', me)
    bpy.context.scene.collection.objects.link(obj)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', col.astype(np.float32).ravel())
    vgs = {}
    names = list(bones) + ['__g_' + g for g in groups] + ['__keep']
    data = [weights[:, i] for i in range(len(bones))] + [groups[g] for g in groups] + [keep]
    for name, w in zip(names, data):
        vg = obj.vertex_groups.new(name=name)
        vgs[name] = vg
        idx = np.nonzero(w > 1e-5)[0]
        for val in np.unique(np.round(w[idx], 3)):
            sel = idx[np.abs(w[idx] - val) < 5e-4]
            vg.add(sel.tolist(), float(val), 'REPLACE')
    mod = obj.modifiers.new('dec', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    mod.use_symmetry = True
    mod.symmetry_axis = 'X'
    mod.vertex_group = '__keep'
    mod.vertex_group_factor = 20.0
    mod.invert_vertex_group = True  # weight 1 = keep (the group marks what to protect)
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier='dec')
    m2 = obj.data
    n = len(m2.vertices)
    lco = np.empty(n * 3)
    m2.vertices.foreach_get('co', lco)
    lco = lco.reshape(n, 3)
    lf = [tuple(p.vertices) for p in m2.polygons]
    lcol = np.empty(n * 4, dtype=np.float32)
    m2.color_attributes['Col'].data.foreach_get('color', lcol)
    lcol = lcol.reshape(n, 4).astype(np.float64)
    W = np.zeros((n, len(bones)))
    G = {g: np.zeros(n) for g in groups}
    gi = {g.index: g.name for g in obj.vertex_groups}
    bcol = {b: i for i, b in enumerate(bones)}
    for v in m2.vertices:
        for g in v.groups:
            nm = gi[g.group]
            if nm in bcol:
                W[v.index, bcol[nm]] = g.weight
            elif nm.startswith('__g_'):
                G[nm[4:]][v.index] = g.weight
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(me)
    # morphs: bind the low mesh to the full rest surface and re-evaluate on each morph
    surf = Surface(co, faces)
    bind = Binding(surf, lco)
    lkeys = {k: bind.eval(kc) for k, kc in keys.items()}
    return lco, lf, W, lcol, G, lkeys


def cut_plane(co, faces, W, col, G, keys, point, normal, allowed=None, eps=1e-6):
    """Split the triangles that cross a plane, so a zone border placed on it is a straight line
    instead of a sawtooth of whole triangles. New vertices sit on the crossing edges (one per edge,
    so the mesh stays welded); weights, colours, groups and morph positions are interpolated along
    the edge. `allowed` (per-vertex bool) limits the cut to triangles whose vertices all pass.
    Returns (co, faces, W, col, G, keys)."""
    normal = np.asarray(normal, dtype=np.float64)
    d = (co - np.asarray(point)) @ normal
    new, edges = {}, []

    def on_edge(i, j):
        if abs(d[i]) < eps:
            return i
        if abs(d[j]) < eps:
            return j
        key = (min(i, j), max(i, j))
        if key not in new:
            a, b = key
            new[key] = len(co) + len(edges)
            edges.append((a, b, d[a] / (d[a] - d[b])))
        return new[key]

    out = []
    for f in faces:
        s = [d[i] for i in f]
        if len(f) != 3 or all(x >= -eps for x in s) or all(x <= eps for x in s) or (allowed is not None and not all(allowed[i] for i in f)):
            out.append(tuple(f))
            continue
        pos = [x > 0 for x in s]
        r = next(k for k in range(3) if pos[k] != pos[(k + 1) % 3] and pos[k] != pos[(k + 2) % 3])
        a, b, c = f[r], f[(r + 1) % 3], f[(r + 2) % 3]
        ab, ac = on_edge(a, b), on_edge(a, c)
        for t in ((a, ab, ac), (ab, b, c), (ab, c, ac)):
            if len(set(t)) == 3:
                out.append(t)
    if not edges:
        return co, out, W, col, G, keys
    # a neighbour left whole (not `allowed`) that shares a cut edge would keep a T-junction there,
    # and the cloth offsets would open it into a slit: split it at the edge's new vertex too
    fixed = []
    stack = list(out)
    while stack:
        t = stack.pop()
        if len(t) != 3:
            fixed.append(t)
            continue
        for k in range(3):
            i, j, o_ = t[k], t[(k + 1) % 3], t[(k + 2) % 3]
            m = new.get((min(i, j), max(i, j)))
            if m is not None and m not in t:
                stack.append((i, m, o_))
                stack.append((m, j, o_))
                break
        else:
            fixed.append(t)
    out = fixed
    A = np.array([e[0] for e in edges])
    B = np.array([e[1] for e in edges])
    T = np.array([e[2] for e in edges])[:, None]

    def lerp(x):
        return np.vstack([x, x[A] + (x[B] - x[A]) * T]) if x.ndim == 2 else np.concatenate([x, x[A] + (x[B] - x[A]) * T[:, 0]])

    return lerp(co), out, lerp(W), lerp(col), {g: lerp(v) for g, v in G.items()}, {k: lerp(v) for k, v in keys.items()}


def lod1(obj, ratio=0.5, keep_group=None, keep=0.0, suffix='_lod1'):
    """LOD1 of a built body: a copy decimated to `ratio` of its triangles (collapse, symmetric in x),
    named '<obj><suffix>', with the same materials, vertex groups and armature, so the GLB carries
    it skinned to the same rig (the game switches to it beyond PEOPLE_LOD.lod1). No morphs: beyond
    15 m a smile or a blink does not read. `keep_group` (a vertex group, e.g. the head bone's) and
    `keep` (0..1) protect that region from the collapse a little. Returns the new object."""
    lo = obj.copy()
    lo.data = obj.data.copy()
    lo.name = obj.name + suffix
    lo.data.name = obj.data.name + suffix
    for c in obj.users_collection:
        c.objects.link(lo)
    lo.shape_key_clear()
    # the armature goes back on after the collapse (modifier_apply must see the plain mesh)
    arm = [(m.name, m.object) for m in lo.modifiers if m.type == 'ARMATURE']
    for m in list(lo.modifiers):
        lo.modifiers.remove(m)
    mod = lo.modifiers.new('dec', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    mod.use_symmetry = True
    mod.symmetry_axis = 'X'
    mod.use_collapse_triangulate = True
    if keep > 0 and keep_group in lo.vertex_groups:
        src = lo.vertex_groups[keep_group].index
        vg = lo.vertex_groups.new(name='__lod1_keep')
        for v in lo.data.vertices:
            for g in v.groups:
                if g.group == src and g.weight > 1e-4:
                    vg.add([v.index], min(1.0, g.weight * keep), 'REPLACE')
        mod.vertex_group = vg.name
        mod.vertex_group_factor = 10.0
        mod.invert_vertex_group = True  # weight 1 = keep
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = lo
    lo.select_set(True)
    bpy.ops.object.modifier_apply(modifier='dec')
    if '__lod1_keep' in lo.vertex_groups:
        lo.vertex_groups.remove(lo.vertex_groups['__lod1_keep'])
    lo.data.validate()  # collapsed slivers
    # the collapse blends weights: back to 4 influences per vertex (glTF), normalised
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    for name, rig in arm:
        m = lo.modifiers.new(name, 'ARMATURE')
        m.object = rig
    return lo


def tris(obj):
    """Triangle count of a mesh object."""
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)
