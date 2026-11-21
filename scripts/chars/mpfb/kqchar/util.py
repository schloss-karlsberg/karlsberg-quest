"""Small numeric helpers shared by the character build steps (pure numpy / mathutils)."""
import math

import numpy as np


def smoothstep(e0, e1, x):
    """Hermite step from e0 to e1 (e0 > e1 gives a falling step), numpy-friendly."""
    t = np.clip((np.asarray(x, dtype=np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def hex_rgb(h):
    """'#808080' or 0x808080 -> sRGB floats (3,)."""
    if isinstance(h, str):
        h = int(h.lstrip('#'), 16)
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], dtype=np.float64) / 255.0


def hex_lin(h):
    """Hex colour -> linear RGB (what Blender colour attributes and glTF COLOR_0 store)."""
    return srgb_to_linear(hex_rgb(h))


def mix(a, b, t):
    t = np.asarray(t, dtype=np.float64)
    if t.ndim == 1:
        t = t[:, None]
    return a * (1.0 - t) + b * t


def normalize(v, eps=1e-12):
    v = np.asarray(v, dtype=np.float64)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, eps)


def periodic_interp(x, xs, ys, period=360.0):
    """Linear interpolation on a periodic domain (control points xs in [0, period))."""
    xs = np.asarray(xs, dtype=np.float64)
    ys = np.asarray(ys, dtype=np.float64)
    order = np.argsort(xs)
    xs, ys = xs[order], ys[order]
    xe = np.concatenate([xs - period, xs, xs + period])
    ye = np.concatenate([ys, ys, ys])
    return np.interp(np.mod(x, period), xe, ye)


def catmull(points, n):
    """Resample a polyline (k,3) to n points along a centripetal-ish Catmull-Rom spline."""
    p = np.asarray(points, dtype=np.float64)
    if len(p) < 2:
        return np.repeat(p, n, axis=0)
    seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    s /= max(s[-1], 1e-9)
    t = np.linspace(0, 1, n)
    out = np.empty((n, 3))
    ext = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
    se = np.concatenate([[-s[1]], s, [2 - s[-2]]])
    for i, tt in enumerate(t):
        k = min(max(np.searchsorted(s, tt, side='right') - 1, 0), len(p) - 2)
        u = (tt - s[k]) / max(s[k + 1] - s[k], 1e-9)
        p0, p1, p2, p3 = ext[k], ext[k + 1], ext[k + 2], ext[k + 3]
        out[i] = 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)
    return out


class Rng:
    """Deterministic random numbers per build (seeded from the spec)."""

    def __init__(self, seed):
        self.r = np.random.default_rng(seed)

    def uniform(self, a=0.0, b=1.0, size=None):
        return self.r.uniform(a, b, size)

    def normal(self, m=0.0, s=1.0, size=None):
        return self.r.normal(m, s, size)


def deg(a):
    return a * math.pi / 180.0
