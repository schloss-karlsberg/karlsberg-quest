"""Small solid-mesh builders for wardrobe and gear: bands around a body axis, swept profiles,
rounded boxes. All return (co, faces, col) with outward winding (checked by signed volume)."""
import math

import numpy as np

from .util import normalize


def tri_list(faces):
    out = []
    for f in faces:
        for k in range(1, len(f) - 1):
            out.append((f[0], f[k], f[k + 1]))
    return np.array(out, dtype=int)


def fix_winding(co, faces, ref=None):
    """Flip every face when the solid's signed volume (seen from `ref`) is negative."""
    co = np.asarray(co)
    ref = co.mean(0) if ref is None else np.asarray(ref)
    t = tri_list(faces)
    a, b, c = co[t[:, 0]] - ref, co[t[:, 1]] - ref, co[t[:, 2]] - ref
    vol = np.einsum('ij,ij->i', a, np.cross(b, c)).sum()
    return faces if vol > 0 else [tuple(reversed(f)) for f in faces]


def frame(axis, ref):
    axis = normalize(axis)
    ref = normalize(ref - (ref @ axis) * axis)
    return axis, ref, np.cross(axis, ref)


def band(surface, origin, axis, ref, angles_deg, rows, inner, thick, closed, stand=None, smooth=0):
    """A solid band hugging the surface around an axis (collars, hems, cuffs).

    rows(a_deg) -> [(h, out, colour, link_to_next)] from the bottom edge up: the outer face at
    height h along the axis, `out` metres off the surface (ray from the axis); `link_to_next`
    False starts a crisp colour step. `inner` is the lining / edge colour. `smooth`: passes of a
    [1, 2, 1] filter over each row's distance from the axis round the band (a faceted, decimated
    surface under it then gives a clean, even edge instead of a jagged one)."""
    axis, e1, e2 = frame(np.asarray(axis, float), np.asarray(ref, float))
    sections, cols, links = [], None, None
    for a in angles_deg:
        r = math.radians(a)
        d = math.cos(r) * e1 + math.sin(r) * e2
        rs = rows(a)
        pts, cc, ll = [], [], []

        def at(h, out):
            p0 = origin + axis * h
            hit = surface.ray(p0, d, 0.5)
            rad = np.linalg.norm(hit[0] - p0) if hit else 0.06
            return p0 + d * (rad + out)

        outer = [at(h, o) for h, o, _, _ in rs]
        if stand is not None:
            # a stand collar: no row tucks in closer to the axis than the bottom edge (minus a taper)
            r0 = np.linalg.norm((outer[0] - origin) - ((outer[0] - origin) @ axis) * axis)
            for k in range(1, len(rs)):
                rel = outer[k] - origin
                rk = np.linalg.norm(rel - (rel @ axis) * axis)
                want = r0 - stand * k / (len(rs) - 1)
                if rk < want:
                    outer[k] = outer[k] + d * (want - rk)
        for k, (h, o, c, lk) in enumerate(rs):
            pts.append(outer[k])
            cc.append(c)
            ll.append(lk if k < len(rs) - 1 else False)
        # top edge and lining (inner colour), back down to the bottom
        pts.append(outer[-1])
        cc.append(inner)
        ll.append(True)
        for k in range(len(rs) - 1, -1, -1):
            pts.append(outer[k] - d * thick)
            cc.append(inner)
            ll.append(True)
        pts.append(outer[0])
        cc.append(inner)
        ll.append(False)
        sections.append(pts)
        cols, links = cc, ll
    S = len(sections)
    L = len(sections[0])
    if smooth and S > 2:
        P = np.array(sections, float)  # (S, L, 3)
        rel = P - origin
        h = rel @ axis
        radial = rel - h[..., None] * axis
        r = np.linalg.norm(radial, axis=2)
        dirs = radial / np.maximum(r, 1e-9)[..., None]
        for _ in range(int(smooth)):
            if closed:
                r = 0.25 * np.roll(r, 1, 0) + 0.5 * r + 0.25 * np.roll(r, -1, 0)
            else:
                r[1:-1] = 0.25 * r[:-2] + 0.5 * r[1:-1] + 0.25 * r[2:]
        sections = list(origin + h[..., None] * axis + dirs * r[..., None])
    co = np.array([p for s in sections for p in s])
    col = np.array([c for _ in sections for c in cols])
    faces = []
    for i in range(S if closed else S - 1):
        j = (i + 1) % S
        for k in range(L - 1):
            if links[k]:
                faces.append((i * L + k, j * L + k, j * L + k + 1, i * L + k + 1))
    if not closed:
        # end caps: outer row k (index k) against its lining (index 2R - k)
        R = (L - 2) // 2
        for i in (0, S - 1):
            for k in range(R - 1):
                a, b, c2, d2 = i * L + k, i * L + k + 1, i * L + 2 * R - k - 1, i * L + 2 * R - k
                faces.append((a, b, c2, d2) if i == 0 else (d2, c2, b, a))
    faces = fix_winding(co, faces, origin + axis * np.mean([r[0] for r in rows(angles_deg[0])]))
    return co, faces, col


def sweep(path, ups, profile, scale=None, caps=True):
    """Sweep a closed 2D profile [(side, up), ...] along a path (n,3); `ups` (n,3) orient it."""
    path = np.asarray(path, float)
    n = len(path)
    scale = np.ones(n) if scale is None else np.asarray(scale, float)
    co, faces = [], []
    K = len(profile)
    for i in range(n):
        t = path[min(i + 1, n - 1)] - path[max(i - 1, 0)]
        t = normalize(t)
        u = normalize(ups[i] - (ups[i] @ t) * t)
        s = np.cross(t, u)
        for px, py in profile:
            co.append(path[i] + (s * px + u * py) * scale[i])
    for i in range(n - 1):
        for k in range(K):
            kn = (k + 1) % K
            faces.append((i * K + k, i * K + kn, (i + 1) * K + kn, (i + 1) * K + k))
    if caps:
        for i in (0, n - 1):
            c = len(co)
            co.append(path[i])
            for k in range(K):
                kn = (k + 1) % K
                faces.append((i * K + kn, i * K + k, c) if i == 0 else (i * K + k, i * K + kn, c))
    co = np.array(co)
    return co, fix_winding(co, faces, path.mean(0)) if caps else faces


def rounded_box(centre, size, e=0.35, nu=10, nv=16, axes=None):
    """A superellipsoid ("soft box"): size = full (x, y, z) extents, e < 1 makes it boxier."""
    a, b, c = np.asarray(size, float) / 2

    def f(w, p):
        return np.sign(w) * np.abs(w) ** p

    co = []
    us = np.linspace(-math.pi / 2, math.pi / 2, nu + 1)[1:-1]
    for u in us:
        for k in range(nv):
            v = -math.pi + 2 * math.pi * k / nv
            co.append([a * f(math.cos(u), e) * f(math.cos(v), e), b * f(math.cos(u), e) * f(math.sin(v), e), c * f(math.sin(u), e)])
    co.append([0, 0, -c])
    co.append([0, 0, c])
    co = np.array(co)
    if axes is not None:
        co = co @ np.asarray(axes, float)
    co += np.asarray(centre, float)
    R = len(us)
    faces = []
    for i in range(R - 1):
        for k in range(nv):
            kn = (k + 1) % nv
            faces.append((i * nv + k, i * nv + kn, (i + 1) * nv + kn, (i + 1) * nv + k))
    bot, top = R * nv, R * nv + 1
    for k in range(nv):
        kn = (k + 1) % nv
        faces.append((kn, k, bot))
        faces.append(((R - 1) * nv + k, (R - 1) * nv + kn, top))
    return co, fix_winding(co, faces, np.asarray(centre, float))
