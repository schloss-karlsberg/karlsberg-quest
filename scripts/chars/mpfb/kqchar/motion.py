"""Pose edits on baked retarget frames (retarget.py, people tiers): a talking loop made from Idle
(`talk_frames`), a counter-swing of the arms in Walk (`arm_swing`).

A frame is a dict bone name -> 4x4 pose matrix in armature space, as retarget.py bakes them: every
bone's rotation is absolute (not inherited from its parent) and its head is chained from its parent.
Turning a bone therefore means turning it and everything below it about a pivot (`turn`), which
keeps the chain whole. Axes: `side` is the figure's left (+X), `up` is +Z, forward is side x up (-Y).
"""
import math

from mathutils import Matrix, Quaternion, Vector


def subtree(tbones, name):
    """A bone and all the bones below it."""
    return [name] + [c.name for c in tbones[name].children_recursive]


def turn(pm, names, q, pivot):
    """Turn the bones `names` of frame `pm` by `q` (armature space) about `pivot`."""
    R = q.to_matrix().to_4x4()
    pivot = Vector(pivot)
    for n in names:
        M = pm[n]
        t = M.translation.copy()
        N = R @ M
        N.translation = pivot + q @ (t - pivot)
        pm[n] = N


def lerp_frame(a, b, t):
    """Two frames blended (rotations slerped, heads lerped)."""
    out = {}
    for k, Ma in a.items():
        q = Ma.to_quaternion().slerp(b[k].to_quaternion(), t)
        M = q.to_matrix().to_4x4()
        M.translation = Ma.translation.lerp(b[k].translation, t)
        out[k] = M
    return out


def frame_gap(a, b):
    """The largest head distance (m) and rotation difference (degrees) between two frames."""
    dt = max((a[k].translation - b[k].translation).length for k in a)
    da = max(math.degrees(a[k].to_quaternion().rotation_difference(b[k].to_quaternion()).angle) for k in a)
    return dt, min(da, 360.0 - da)


def loop_resample(frames, cycles, n_out):
    """One loop of `frames` (closed: the last frame repeats the first) played `cycles` times over
    `n_out` intervals: n_out + 1 frames, the last again equal to the first."""
    n = len(frames) - 1
    out = []
    for j in range(n_out + 1):
        tau = (j * cycles * n / n_out) % n
        i = min(int(math.floor(tau)), n - 1)
        out.append(lerp_frame(frames[i], frames[i + 1], tau - i))
    return out


def _clamp(x, lo=-1.0, hi=1.0):
    return max(lo, min(hi, x))


def smoothstep(e0, e1, x):
    t = _clamp((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def pulse(u, c, w):
    """A bump at loop time c (width w), wrapped round the loop."""
    d = (u - c + 0.5) % 1.0 - 0.5
    return math.exp(-(d / w) ** 2)


def arm_reach(pm, tbones, s, target, pole, flex_axis):
    """Two-bone IK of arm `s` ('l' / 'r') on frame `pm`: the elbow bends about its own hinge (the bend
    plane of the arm, or `flex_axis` when the arm is straight) to the shoulder-target distance, the
    whole arm swings from the shoulder onto the target, then turns about the shoulder-target line
    until the elbow points toward `pole` (a direction from the shoulder)."""
    ua, la, ha = 'upperarm_' + s, 'lowerarm_' + s, 'hand_' + s
    S = pm[ua].translation.copy()
    E = pm[la].translation.copy()
    W = pm[ha].translation.copy()
    l1, l2 = (E - S).length, (W - E).length
    d = _clamp((target - S).length, 0.4 * (l1 + l2), 0.97 * (l1 + l2))
    u, v = E - S, W - E
    n = u.cross(v)
    n = n.normalized() if n.length > 0.05 * l1 * l2 else Vector(flex_axis).normalized()
    cur = math.acos(_clamp((-u).normalized().dot(v.normalized())))  # the elbow's inner angle
    want = math.acos(_clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)))
    best = None
    for sg in (1.0, -1.0):  # + bends further (about u x v); checked by the distance it gives
        q = Quaternion(n, sg * (cur - want))
        err = abs((E + q @ v - S).length - d)
        if best is None or err < best[0] - 1e-6:
            best = (err, q)
    turn(pm, subtree(tbones, la), best[1], E)
    sub = subtree(tbones, ua)
    W = pm[ha].translation.copy()
    turn(pm, sub, (W - S).rotation_difference(target - S), S)
    a = (target - S).normalized()
    e = pm[la].translation - S
    ep, pp = e - a * e.dot(a), pole - a * pole.dot(a)
    if ep.length > 1e-6 and pp.length > 1e-6:
        turn(pm, sub, Quaternion(a, math.atan2(a.dot(ep.cross(pp)), ep.dot(pp))), S)


def hand_frame(pm, s):
    """The hand's finger direction and palm normal (out of the palm) on frame `pm`."""
    h = pm['hand_' + s].translation
    along = (pm['middle_01_' + s].translation - h).normalized()
    across = pm['index_01_' + s].translation - pm['pinky_01_' + s].translation
    palm = across.cross(along) if s == 'r' else along.cross(across)
    return along, (palm - along * palm.dot(along)).normalized()


def _basis_q(a, p):
    """The rotation taking X, Y to the orthonormal pair a, p."""
    return Matrix((a, p, a.cross(p))).transposed().to_quaternion()


def orient_hand(pm, tbones, s, along_t, palm_t, w, forearm_share=0.5):
    """Turn hand `s` toward fingers `along_t` and palm normal `palm_t` (share `w`). Part of the twist
    about the forearm (`forearm_share`) is the forearm's, so the wrist does not wrap."""
    along, palm = hand_frame(pm, s)
    along_t = along_t.normalized()
    palm_t = (palm_t - along_t * palm_t.dot(along_t)).normalized()
    q = Quaternion().slerp(_basis_q(along_t, palm_t) @ _basis_q(along, palm).inverted(), w)
    E = pm['lowerarm_' + s].translation.copy()
    W = pm['hand_' + s].translation.copy()
    ax = (W - E).normalized()
    if q.w < 0:
        q = -q
    tw_ang = 2.0 * math.atan2(Vector((q.x, q.y, q.z)).dot(ax), q.w)
    qf = Quaternion(ax, forearm_share * tw_ang)
    turn(pm, subtree(tbones, 'lowerarm_' + s), qf, E)
    turn(pm, subtree(tbones, 'hand_' + s), q @ qf.inverted(), W)


# ---- the talking loop ----------------------------------------------------------------------------

# Loop time u (0..1): the right hand comes up to the chest and explains in three beats; the left hand
# joins for an open, two-handed sweep in the middle; small nods on the beats. Both hands rest at the
# loop's seam, so it loops on the idle body underneath.
TALK = {
    'right': (0.0, 0.13, 0.76, 0.93),  # up from, up at, down from, down at
    'left': (0.36, 0.47, 0.62, 0.74),
    'beats': (0.24, 0.41, 0.58),  # the right hand's strokes
    'open': 0.52,  # the two-handed open sweep
    'nods': (0.26, 0.43, 0.60),
    'nod_deg': 5.0,
    'reach': (0.30, -0.02, -0.20),  # right hand from the shoulder: forward, out, up (m)
    'reach_left': (0.27, 0.0, -0.22),
    'palm_in': 45.0,  # palm normal from straight up toward the middle (degrees); open sweep: less
    'chest_yaw': 3.0,  # the chest turns a little with the gesturing hand (degrees)
}


def _weights(u):
    r0, r1, r2, r3 = TALK['right']
    l0, l1, l2, l3 = TALK['left']
    return smoothstep(r0, r1, u) * (1 - smoothstep(r2, r3, u)), smoothstep(l0, l1, u) * (1 - smoothstep(l2, l3, u))


def talk_frames(idle, tbones, side, up, seconds, fps, cycles=2):
    """The Talk loop: `idle` (one closed loop of baked frames, feet locked) played `cycles` times over
    `seconds`, with the open-palm explaining gestures and nods of TALK on top (legs and feet are
    Idle's). Returns (frames, per-frame hand weights [(right, left)]), the hand weights for the
    finger pass (open fingers while a hand explains)."""
    side, up = Vector(side).normalized(), Vector(up).normalized()
    fwd = side.cross(up).normalized()
    n_out = max(2, int(round(seconds * fps)))
    frames = loop_resample(idle, cycles, n_out)
    hw = []
    for j, pm in enumerate(frames):
        u = (j / n_out) % 1.0
        wr, wl = _weights(u)
        hw.append((wr, wl))
        beat = sum(pulse(u, c, 0.045) for c in TALK['beats'])
        opn = pulse(u, TALK['open'], 0.07)
        # the chest turns a little toward the listener with the explaining hand
        yaw = math.radians(TALK['chest_yaw']) * (wr - 0.7 * wl)
        if abs(yaw) > 1e-5:
            turn(pm, subtree(tbones, 'spine_03'), Quaternion(up, yaw), pm['spine_03'].translation.copy())
        for s, w in (('r', wr), ('l', wl)):
            if w < 1e-4:
                continue
            out = -side if s == 'r' else side  # away from the middle
            S = pm['upperarm_' + s].translation.copy()
            W0 = pm['hand_' + s].translation.copy()
            e0 = (pm['lowerarm_' + s].translation - S).normalized()
            f_, o_, h_ = TALK['reach'] if s == 'r' else TALK['reach_left']
            if s == 'r':
                f_ += 0.025 * beat
                h_ += -0.04 * beat + 0.02 * opn
                o_ += 0.08 * opn
            else:
                f_ += 0.02 * opn
                o_ += 0.05 * opn
                h_ += 0.02 * opn
            T = S + fwd * f_ + out * o_ + up * h_
            pole = (-up + out * 0.6 - fwd * 0.25).normalized()
            arm_reach(pm, tbones, s, W0.lerp(T, w), e0.lerp(pole, w).normalized(), -side)
            # the open palm: fingers forward and a little out, the palm up and in (more up in the sweep)
            along_t = (fwd + out * 0.3 + up * 0.12).normalized()
            p0 = (up - along_t * up.dot(along_t)).normalized()
            m0 = along_t.cross(p0)
            if m0.dot(-out) < 0:
                m0 = -m0
            r = math.radians(TALK['palm_in'] * (1 - 0.6 * opn) - 8.0 * beat)
            orient_hand(pm, tbones, s, along_t, p0 * math.cos(r) + m0 * math.sin(r), w)
        nod = math.radians(TALK['nod_deg']) * sum(pulse(u, c, 0.035) for c in TALK['nods'])
        if nod > 1e-5:  # chin down: + about the figure's left
            turn(pm, subtree(tbones, 'neck_01'), Quaternion(side, 0.4 * nod), pm['neck_01'].translation.copy())
            turn(pm, subtree(tbones, 'head'), Quaternion(side, 0.6 * nod), pm['head'].translation.copy())
    return frames, hw


# ---- the walk's arm swing ------------------------------------------------------------------------

def arm_swing(frames, tbones, side, up, amp_deg, bend=(12.0, 30.0), base_deg=2.0):
    """A natural counter-swing of the arms (`--arm-swing Walk=deg`): each upper arm swings opposite
    its own thigh (the thigh's forward pitch, centred and scaled to +-1 over the clip) by +-amp_deg
    about base_deg forward, and its elbow bends from bend[0] (arm back) to bend[1] degrees (arm
    forward). Edits `frames` in place."""
    side, up = Vector(side).normalized(), Vector(up).normalized()
    fwd = side.cross(up).normalized()

    def pitch(v):  # forward pitch of a downward vector (degrees)
        return math.degrees(math.atan2(v.dot(fwd), -v.dot(up)))

    for s in ('l', 'r'):
        th = [pitch(fr['calf_' + s].translation - fr['thigh_' + s].translation) for fr in frames]
        mid = (max(th) + min(th)) / 2
        amp = max((max(th) - min(th)) / 2, 1e-3)
        for fr, t in zip(frames, th):
            x = (t - mid) / amp  # +1: this thigh fully forward
            S = fr['upperarm_' + s].translation.copy()
            want = base_deg - x * amp_deg
            cur = pitch(fr['lowerarm_' + s].translation - S)
            turn(fr, subtree(tbones, 'upperarm_' + s), Quaternion(side, -math.radians(want - cur)), S)
            E = fr['lowerarm_' + s].translation.copy()
            u, v = E - S, fr['hand_' + s].translation - E
            n = u.cross(v)
            n = n.normalized() if n.length > 0.05 * u.length * v.length else -side
            fwd_share = _clamp(-x, 0.0, 1.0)
            want_b = bend[0] + (bend[1] - bend[0]) * fwd_share
            turn(fr, subtree(tbones, 'lowerarm_' + s), Quaternion(n, math.radians(want_b - math.degrees(u.angle(v)))), E)
