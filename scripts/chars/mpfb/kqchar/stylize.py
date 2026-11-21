"""Stylisation of the baked MPFB head (spec['face']['stylize'], optional): bigger eyes and simpler
facial planes, for a stylised indie look instead of a semi-realistic face.

Runs in `human.build` on the full-resolution mesh after the head scale, before the landmarks are
measured, so every later step (hair, beard, brows, glasses, skin paint) fits the stylised face.
Every step moves the rest shape AND the morph shapes (smile, blink) the same way, so the
expressions keep working (a blink still closes over the bigger eye).

Steps (each optional, all in metres / eye radii of the rest shape):

- `eye_scale`: the eye region (eyeball, lids, the socket rim) grows about each eye centre. The
  centre moves back by `eye_sink` of the growth so the bigger eyeball does not bulge out of the
  face, and apart by `eye_spread` (m). Full strength inside `eye_inner` eye radii, faded out by
  `eye_outer` radii.
- `smooth`: Taubin smoothing (shrink-free Laplacian) of the face front, which removes the
  realistic micro-forms (nasolabial folds, lid creases, under-eye bags, lumpy cheeks) and keeps the
  big shapes. The lid margins, the lips and the inner mouth are held (they carry the expression).
- `nose_smooth` / `ear_smooth`: extra smoothing passes on the nose and the ears (simpler shapes).
"""
import numpy as np

from .util import smoothstep


def _neighbours(n, faces):
    """Vertex adjacency (unique edges of the polygons) as index arrays for np.add.at."""
    a, b = [], []
    for f in faces:
        k = len(f)
        for i in range(k):
            a.append(f[i])
            b.append(f[(i + 1) % k])
    e = np.unique(np.sort(np.array([a, b]).T, axis=1), axis=0)
    i = np.concatenate([e[:, 0], e[:, 1]])
    j = np.concatenate([e[:, 1], e[:, 0]])
    deg = np.bincount(i, minlength=n).astype(np.float64)
    return i, j, deg


def _laplacian(co, nb):
    i, j, deg = nb
    acc = np.zeros_like(co)
    np.add.at(acc, i, co[j])
    has = deg > 0
    out = np.zeros_like(co)
    out[has] = acc[has] / deg[has, None] - co[has]
    return out


def taubin(co, nb, weight, iters, lam=0.5, mu=-0.53):
    """Shrink-free smoothing; `weight` (N,) in 0..1 scales the step per vertex (0 = held)."""
    p = co.copy()
    w = weight[:, None]
    for _ in range(int(iters)):
        p = p + lam * w * _laplacian(p, nb)
        p = p + mu * w * _laplacian(p, nb)
    return p


def eye_map(p, centres, r, s, sink, spread, inner, outer, mid=0.014):
    """The eye growth as a smooth map of points (N,3): each point follows the eye on its side,
    blended by its distance to that eye centre (in rest eye radii); faded out towards the midline
    (`mid` m), so the nose bridge never takes a pull from both eyes."""
    out = p.copy()
    for c in centres:
        side = 1.0 if c[0] > 0 else -1.0
        c2 = c + np.array([side * spread, r * (s - 1.0) * sink, 0.0])
        d = np.linalg.norm(p - c, axis=1) / r
        w = smoothstep(outer, inner, d) * smoothstep(0.0, mid, p[:, 0] * side)
        target = c2 + (p - c) * s
        out = out + w[:, None] * (target - p)
    return out


def apply(co, morph_pos, faces, groups, wh, lm, spec, log=print):
    """Stylise the rest shape `co` (N,3) and the morph shapes `morph_pos` {name: (N,3)} in place of
    the face. `faces`: the body polygons; `groups`: MPFB vertex groups; `wh`: head weight (N,);
    `lm`: landmarks of the unstylised rest shape. Returns (co, morph_pos)."""
    n = len(co)
    r = lm['eye_radius']
    centres = [lm['eye_l'], lm['eye_r']]
    s = float(spec.get('eye_scale', 1.0))
    if abs(s - 1.0) > 1e-4:
        args = (centres, r, s, spec.get('eye_sink', 0.6), spec.get('eye_spread', 0.0), spec.get('eye_inner', 1.3), spec.get('eye_outer', 2.6))
        co = eye_map(co, *args)
        morph_pos = {k: eye_map(v, *args) for k, v in morph_pos.items()}
        log(f'[mpfb] stylize: eyes x{s:.2f} (radius {r:.4f} -> {r * s:.4f})')
    r2 = r * s
    nb = _neighbours(n, faces)
    lips = np.clip(groups['lips'], 0, 1)
    ears = np.clip(groups['ears'], 0, 1)
    m = lm['mouth']
    # the face front: head-weighted, in front of the ears, from the jaw up to the brow
    front = smoothstep(lm['ear_front_y'] - 0.005, lm['ear_front_y'] - 0.03, co[:, 1])
    zone = np.clip(wh, 0, 1) * front * smoothstep(lm['chin_z'] - 0.03, lm['chin_z'] - 0.005, co[:, 2])
    zone = zone * smoothstep(lm['eye_z'] + 0.075, lm['eye_z'] + 0.05, co[:, 2])
    # held: the lid margins (they wrap the eyeball), the lips and the inner mouth
    d_eye = np.min([np.linalg.norm(co - c2, axis=1) for c2 in (co[groups['helper-l-eye'] > 0.5].mean(0), co[groups['helper-r-eye'] > 0.5].mean(0))], axis=0)
    hold_eye = smoothstep(spec.get('lid_hold', [1.12, 1.55])[0] * r2, spec.get('lid_hold', [1.12, 1.55])[1] * r2, d_eye)
    hold_lip = 1.0 - smoothstep(0.02, 0.35, lips)
    inner = (co[:, 1] > m[1] + 0.004) & (np.abs(co[:, 0]) < lm['mouth_w'] * 0.7) & (np.abs(co[:, 2] - m[2]) < 0.025)
    hold_mouth = np.where(inner, 0.0, 1.0)
    body = groups['body'] > 0.5
    w = zone * hold_eye * hold_lip * hold_mouth * body
    it = spec.get('smooth', 0)
    if it:
        d = taubin(co, nb, w * spec.get('smooth_weight', 1.0), it) - co
        co = co + d
        morph_pos = {k: v + d for k, v in morph_pos.items()}
        log(f'[mpfb] stylize: face smoothed ({it} Taubin passes, max move {np.abs(d).max() * 1000:.1f} mm)')
    it = spec.get('nose_smooth', 0)
    if it:
        nt = lm['nose_tip']
        dn = np.linalg.norm((co - nt) * np.array([1.0, 1.0, 0.7]), axis=1)
        wn = smoothstep(0.035, 0.018, dn) * body * hold_lip * hold_eye
        d = taubin(co, nb, wn, it) - co
        co = co + d
        morph_pos = {k: v + d for k, v in morph_pos.items()}
    it = spec.get('ear_smooth', 0)
    if it:
        we = smoothstep(0.05, 0.5, ears) * body
        d = taubin(co, nb, we, it, lam=0.6, mu=-0.62) - co
        co = co + d
        morph_pos = {k: v + d for k, v in morph_pos.items()}
        log(f'[mpfb] stylize: ears smoothed ({it} passes, max move {np.abs(d).max() * 1000:.1f} mm)')
    return co, morph_pos
