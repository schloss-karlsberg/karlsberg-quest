"""Ambient occlusion baked into the vertex colours (no texture: the creases carry their own shade).

Per vertex, rays over the outer hemisphere (`rays`, up to `distance` m) give the unoccluded share;
the colour is multiplied by mix(1, visibility, strength), the strength per zone (`zones`, the face's
material or `kq_zone`, else `default`). `smooth`: passes of neighbour averaging (no specks on a
coarse mesh); `floor`: the lowest visibility kept.

- `visibility` / `shade`: the shared core (palette.bake_ao uses it for the people's one body).
- `bake_costumes`: the hero (spec `ao`, a costume build): each costume is baked against itself, the
  body and its default outfit together, every court piece against the body and the other court
  pieces (glasses are left out: they would ring the eyes). The body takes its default-outfit shade
  (the collar, the sleeves' cuffs and the bag straps over it).
"""
import math

import numpy as np


def hemisphere(n_rays, seed=7):
    """Cosine-weighted unit directions around +z (a fixed, even spread: a Fibonacci disc lifted)."""
    k = np.arange(n_rays) + 0.5
    r = np.sqrt(k / n_rays)
    a = k * math.pi * (3 - math.sqrt(5)) + seed
    return np.stack([r * np.cos(a), r * np.sin(a), np.sqrt(np.clip(1 - r * r, 0, 1))], 1)


def visibility(co, nrm, strength, tree, ao):
    """Unoccluded share per vertex (1 where strength is 0), rays against the BVH `tree`."""
    from mathutils import Vector

    dist = float(ao.get('distance', 0.1))
    dirs = hemisphere(int(ao.get('rays', 24)))
    vis = np.ones(len(co))
    for i in range(len(co)):
        if strength[i] <= 0:
            continue
        n = nrm[i]
        t = np.cross(n, (1.0, 0.0, 0.0) if abs(n[0]) < 0.9 else (0.0, 1.0, 0.0))
        t /= np.linalg.norm(t) + 1e-12
        b = np.cross(n, t)
        o = Vector(co[i] + n * 0.0015)
        occ = 0.0
        for d in dirs:
            w = t * d[0] + b * d[1] + n * d[2]
            hit = tree.ray_cast(o, Vector(w), dist)
            if hit[0] is not None:
                occ += 1.0 - 0.5 * hit[3] / dist
        vis[i] = 1.0 - occ / len(dirs)
    return vis


def shade(me, vis, strength, ao):
    """Smooth / floor the visibility and multiply the mesh's colour attribute by it."""
    nv = len(me.vertices)
    if ao.get('smooth'):
        ev = np.empty(len(me.edges) * 2, dtype=np.int64)
        me.edges.foreach_get('vertices', ev)
        ev = ev.reshape(-1, 2)
        deg = np.bincount(ev.ravel(), minlength=nv).astype(float)
        for _ in range(int(ao['smooth'])):
            acc = np.zeros(nv)
            np.add.at(acc, ev[:, 0], vis[ev[:, 1]])
            np.add.at(acc, ev[:, 1], vis[ev[:, 0]])
            vis = np.where(deg > 0, 0.5 * vis + 0.5 * acc / np.maximum(deg, 1), vis)
    if ao.get('floor') is not None:
        vis = ao['floor'] + (1 - ao['floor']) * vis
    f = 1.0 - strength * (1.0 - vis)
    loops = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get('vertex_index', loops)
    ca = me.color_attributes.active_color or me.color_attributes[0]
    m = len(ca.data)
    col = np.empty(m * 4, dtype=np.float32)
    ca.data.foreach_get('color', col)
    col = col.reshape(m, 4)
    per = f[loops] if ca.domain == 'CORNER' else f
    col[:, :3] *= per[:, None].astype(np.float32)
    ca.data.foreach_set('color', col.ravel())
    me.update()
    return vis


def vertex_strength(me, face_zone_names, ao):
    """Per vertex: the strongest zone strength of its faces."""
    zs = ao.get('zones', {})
    face_s = np.array([zs.get(z, ao.get('default', 0.5)) for z in face_zone_names])
    nv = len(me.vertices)
    vs = np.zeros(nv)
    loops = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get('vertex_index', loops)
    counts = np.empty(len(me.polygons), dtype=np.int64)
    me.polygons.foreach_get('loop_total', counts)
    if len(face_s):
        np.maximum.at(vs, loops, face_s[np.repeat(np.arange(len(me.polygons)), counts)])
    return vs


def _world(o):
    me = o.data
    nv = len(me.vertices)
    co = np.empty(nv * 3)
    me.vertices.foreach_get('co', co)
    M = np.array(o.matrix_world)
    co = co.reshape(nv, 3) @ M[:3, :3].T + M[:3, 3]
    nrm = np.empty(nv * 3)
    me.vertex_normals.foreach_get('vector', nrm)
    nrm = nrm.reshape(nv, 3) @ M[:3, :3].T
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
    return co, nrm


def bake_costumes(objs, ao, log=print):
    """The hero's AO (see the module doc). `objs`: the build's exported mesh objects."""
    from mathutils.bvhtree import BVHTree

    meshes = [o for o in objs if o.type == 'MESH' and o.name != 'avatar-glasses']
    body = [o for o in meshes if not o.name.startswith(('avatar-default-', 'avatar-court-'))]
    sets = {'default': body + [o for o in meshes if o.name.startswith('avatar-default-')],
            'court': body + [o for o in meshes if o.name.startswith('avatar-court-')]}
    baked = set()
    for cname, group in sets.items():
        if cname != 'default' and len(group) == len(body):
            continue
        verts, polys = [], []
        for o in group:
            co, _ = _world(o)
            base = len(verts)
            verts += [tuple(v) for v in co]
            polys += [tuple(base + i for i in p.vertices) for p in o.data.polygons]
        tree = BVHTree.FromPolygons(verts, polys, all_triangles=False)
        for o in group:
            if o.name in baked:
                continue
            baked.add(o.name)
            me = o.data
            names = [s.material.name if s.material else '' for s in o.material_slots]
            fz = [names[p.material_index] if names else '' for p in me.polygons]
            vs = vertex_strength(me, fz, ao)
            co, nrm = _world(o)
            vis = shade(me, visibility(co, nrm, vs, tree, ao), vs, ao)
            log(f'[mpfb] ao ({cname}): {o.name} {len(co)} vertices, visibility mean {vis.mean():.2f}, min {vis.min():.2f}')
