"""Bind points to a reference surface (closest triangle + barycentrics + normal offset).

Used to carry morphs (smile, blink) from the full-resolution MPFB skin onto the decimated skin and
onto every part that sits on the face (brows, beard), and to drape parts on the face.
"""
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def triangulate(faces):
    tris = []
    for f in faces:
        for k in range(1, len(f) - 1):
            tris.append((f[0], f[k], f[k + 1]))
    return np.array(tris, dtype=np.int64)


def tri_normals(co, tris):
    a, b, c = co[tris[:, 0]], co[tris[:, 1]], co[tris[:, 2]]
    n = np.cross(b - a, c - a)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def vertex_normals(co, faces_or_tris):
    tris = faces_or_tris if isinstance(faces_or_tris, np.ndarray) else triangulate(faces_or_tris)
    a, b, c = co[tris[:, 0]], co[tris[:, 1]], co[tris[:, 2]]
    fn = np.cross(b - a, c - a)  # area weighted
    vn = np.zeros_like(co)
    for k in range(3):
        np.add.at(vn, tris[:, k], fn)
    return vn / np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)


class Surface:
    """A triangle surface with a BVH, for ray casts and nearest-point queries."""

    def __init__(self, co, faces):
        self.co = np.asarray(co, dtype=np.float64)
        self.tris = triangulate(faces) if not isinstance(faces, np.ndarray) else faces
        self.bvh = BVHTree.FromPolygons(self.co.tolist(), self.tris.tolist())
        self.vn = vertex_normals(self.co, self.tris)

    def ray(self, origin, direction, dist=10.0):
        loc, nor, idx, d = self.bvh.ray_cast(Vector(origin), Vector(direction), dist)
        if loc is None:
            return None
        return np.array(loc), self.smooth_normal(np.array(loc), idx), idx, d

    def ray_all(self, origin, direction, dist=10.0):
        """Every hit along a ray (origin outward), nearest first."""
        hits = []
        o = Vector(origin)
        dvec = Vector(direction).normalized()
        travelled = 0.0
        for _ in range(16):
            loc, nor, idx, d = self.bvh.ray_cast(o, dvec, dist - travelled)
            if loc is None:
                break
            travelled += d
            hits.append((np.array(loc), idx, travelled))
            o = loc + dvec * 1e-5
        return hits

    def nearest(self, p):
        loc, nor, idx, d = self.bvh.find_nearest(Vector(p))
        return np.array(loc), idx, d

    def bary(self, p, idx):
        a, b, c = (self.co[i] for i in self.tris[idx])
        v0, v1, v2 = b - a, c - a, p - a
        d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
        d20, d21 = v2 @ v0, v2 @ v1
        den = max(d00 * d11 - d01 * d01, 1e-18)
        v = (d11 * d20 - d01 * d21) / den
        w = (d00 * d21 - d01 * d20) / den
        return np.array([1 - v - w, v, w])

    def smooth_normal(self, p, idx):
        b = self.bary(p, idx)
        n = (self.vn[self.tris[idx]] * b[:, None]).sum(0)
        return n / max(np.linalg.norm(n), 1e-12)


class Binding:
    """Points expressed on a surface: re-evaluated on any deformed copy of it (same topology)."""

    def __init__(self, surface, pts):
        self.s = surface
        pts = np.asarray(pts, dtype=np.float64)
        n = len(pts)
        self.tri = np.zeros(n, dtype=np.int64)
        self.b = np.zeros((n, 3))
        self.h = np.zeros(n)
        self.res = np.zeros((n, 3))
        for i, p in enumerate(pts):
            loc, idx, _ = surface.nearest(p)
            b = surface.bary(loc, idx)
            nrm = surface.smooth_normal(loc, idx)
            off = p - loc
            h = off @ nrm
            self.tri[i], self.b[i], self.h[i] = idx, b, h
            self.res[i] = off - h * nrm
        self.vtx = surface.tris[self.tri]

    def eval(self, co):
        co = np.asarray(co, dtype=np.float64)
        vn = vertex_normals(co, self.s.tris)
        p = (co[self.vtx] * self.b[:, :, None]).sum(1)
        n = (vn[self.vtx] * self.b[:, :, None]).sum(1)
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        return p + n * self.h[:, None] + self.res
