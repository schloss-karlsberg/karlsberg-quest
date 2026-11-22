"""Bake-retarget Quaternius clips (the rigged CC0 humans already in the repo) onto the MPFB
game_engine rig of a built character, and measure how well they transfer.

    blender -b --factory-startup --disable-autoexec --python-exit-code 1 -P scripts/chars/mpfb/retarget.py -- \\
        --char <built character .blend> --src <quaternius .glb (a temp copy)> \\
        [--clips Idle,Walk,Run,...|all] [--abduct 10] [--out <with-clips.blend>] [--glb <with-clips.glb>] [--report <report.json>] \\
        [--point Interact]   (also bake 'Point': that reaching clip with the reaching hand pointing, see point_clip)
        [--stand Idle,Interact,Wave] [--stand-width 0.03] [--stand-abduct -8]   (standing clips: stance, arms in)
        [--stand-shoulders 7] [--walk-shoulders 6]   (standing clips / Walk: the shoulders dropped, degrees)
        [--stand-knee 5] [--stand-feet 0.095] [--stand-toe 8] [--stand-upright 0.8] [--stand-lean 5] [--level-head 1]
        [--relax-fingers 30]   (people tiers: the standing pose and relaxed hands, see below)
        [--knees 1 --knees-loco 0.6]   (straighter planted legs: pelvis_lift, see below)
        [--stand-hips 0.85] [--relax-fingers 30]   (people tiers: the standing pose and relaxed hands, see below)
        [--talk Idle] [--talk-seconds 4] [--talk-open 0.7]   (also bake 'Talk': a looping explaining clip on that standing clip)
        [--arm-swing Walk=26] [--walk-lean 5]   (an arm counter-swing per clip, a forward lean of Walk)

Method: world-space rotation transfer with rest-pose alignment. For every mapped bone pair the
target's rest direction is first swung onto the source's rest direction (the Quaternius rest is a
T-pose, ours an A-pose), then the source bone's world rotation change from its rest is applied:

    R_target(t) = R_source(t) * R_source_rest^-1 * C * R_target_rest,   C = swing(target rest -> source rest)

so twist and roll differences between the rigs do not matter. The pelvis also takes the hips'
translation, scaled by the hip-height ratio. Unmapped target bones (balls, finger 4th joints) keep
their rest. Every frame of the clip is keyed (no curve fitting), named after the source clip.

Feet: the source's Idle is its flat-foot reference (its T-pose rest feet are not flat), so the feet
take the source's change from its Idle stance (`--ankle-ref Idle`, `none` turns it off). Then a foot
lock (`foot_lock`, a reusable step on the baked pose matrices; `--no-lock Roll` by default): planted phases come from the source
foot (its lowest 1.5 cm); in them the ankle is pinned to the source's planted path (scaled, plus the
phase's mean offset, so our stance width stays and in-place walks keep their treadmill speed) at our
rest ankle height, the legs solved with two-bone IK in their own bend plane, and the sole turned flat
under the foot's heading; three-frame ramps in and out (`--lock 0` turns it off).

Standing clips (`--stand`, people tiers): `--stand-knee` lifts the body until the knees bend about
that many degrees (half the frames; the rest reach full stretch) and pins the feet again;
`--stand-feet` sets the planted ankles at +-x m, level front to back; `--stand-toe` turns the toes
out that many degrees; `--stand-upright` gives back that share of the source's stoop (the forward
pitch of the upper spine, neck and head against the rest pose); `--stand-lean` then adds a slight
forward lean of the upper spine and neck (degrees); `--stand-hips` turns that share of the hips'
yaw back under the chest (the trunk above keeps its heading); `--level-head 1` rolls the neck and
head level. `--relax-fingers` curls every finger gently toward the palm in every clip (relax_fingers).

Pose edits (kqchar/motion.py, on the baked frames): `--arm-swing Clip=deg` swings each upper arm
against its own thigh (the elbow bending more as the arm comes forward); `--walk-lean` leans Walk's
upper spine and neck forward (degrees); `--talk Idle` bakes 'Talk', that clip's baked frames played
twice over `--talk-seconds` with open-palm explaining gestures on top (motion.talk_frames: the right
hand explains at chest height in three beats, the left joins for a sweep, small nods; the feet stay
the clip's, so its foot lock holds), the explaining fingers opened (open_fingers; `--talk-open`
the share they open by at full gesture weight, 0.7 by default, lower keeps more of the relaxed
curl). `--walk-shoulders` drops the shoulders in Walk as `--stand-shoulders` does in the standing
clips.

Legs: `--knees` (and `--knees-loco` for the idle and locomotion clips) raise the pelvis before the
lock so planted knees bend that fraction of the source's flexion (`pelvis_lift`): a lower-hipped rig
does not crouch to reach its pinned feet.

Checks per clip (report): foot sliding against the source (scaled), sole pitch while planted (tiptoe),
knee / elbow bend direction against the source, shoulder drop, hands inside the trunk (per costume).
"""
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kqchar import motion  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    return argv[argv.index('--' + name) + 1] if '--' + name in argv else default


MAP = {'Hips': 'pelvis', 'Abdomen': 'spine_01', 'Torso': 'spine_02', 'Chest': 'spine_03', 'Neck': 'neck_01', 'Head': 'head'}
for qs, ms in (('L', 'l'), ('R', 'r')):
    MAP.update({f'Shoulder.{qs}': f'clavicle_{ms}', f'UpperArm.{qs}': f'upperarm_{ms}', f'LowerArm.{qs}': f'lowerarm_{ms}',
                f'Wrist.{qs}': f'hand_{ms}', f'UpperLeg.{qs}': f'thigh_{ms}', f'LowerLeg.{qs}': f'calf_{ms}', f'Foot.{qs}': f'foot_{ms}'})
    for f, g in (('Index', 'index'), ('Middle', 'middle'), ('Ring', 'ring'), ('Pinky', 'pinky'), ('Thumb', 'thumb')):
        for k in (1, 2, 3):
            MAP[f'{f}{k}.{qs}'] = f'{g}_0{k}_{ms}'

SK_S = ['Hips', 'Foot.L', 'Foot.R', 'UpperLeg.L', 'LowerLeg.L', 'UpperLeg.R', 'LowerLeg.R',
        'UpperArm.L', 'LowerArm.L', 'Wrist.L', 'UpperArm.R', 'LowerArm.R', 'Wrist.R']
SK_T = ['pelvis', 'foot_l', 'foot_r', 'thigh_l', 'calf_l', 'thigh_r', 'calf_r',
        'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'neck_01', 'spine_03', 'ball_l', 'ball_r']
#: an upper arm's children that swing with it (the girth swing, --abduct)
ARM_CHAIN = ('lowerarm_', 'hand_', 'thumb_', 'index_', 'middle_', 'ring_', 'pinky_')
FOOT_REST = {}
SOLE_REST = {}  # rest pitch of the ankle -> ball line (degrees), per foot
SHOULDER_REST = [0.0, 0.0]


def _bend(a, b, c):
    """Unit normal of the bend at b (a -> b -> c), or None when the limb is nearly straight."""
    u, v = np.subtract(b, a), np.subtract(c, b)
    n = np.cross(u, v)
    ln = np.linalg.norm(n)
    if ln < 0.12 * np.linalg.norm(u) * np.linalg.norm(v):  # under ~7 degrees of bend
        return None
    return n / ln


def metrics(rec, f0, f1, fps):
    """Skeleton-level checks against the (scaled) source clip."""
    S, T = rec['s'], rec['t']
    out = {'frames': rec['frames'], 'seconds': round((f1 - f0) / fps, 2)}
    # knees / elbows: does the target bend the same way as the source?
    for label, limbs in (('knee', (('UpperLeg.L', 'LowerLeg.L', 'Foot.L', 'thigh_l', 'calf_l', 'foot_l'),
                                   ('UpperLeg.R', 'LowerLeg.R', 'Foot.R', 'thigh_r', 'calf_r', 'foot_r'))),
                         ('elbow', (('UpperArm.L', 'LowerArm.L', 'Wrist.L', 'upperarm_l', 'lowerarm_l', 'hand_l'),
                                    ('UpperArm.R', 'LowerArm.R', 'Wrist.R', 'upperarm_r', 'lowerarm_r', 'hand_r')))):
        agree, flips = [], 0
        for fs, ft in zip(S, T):
            for sa, sb, sc_, ta, tb, tc in limbs:
                ns, nt = _bend(fs[sa], fs[sb], fs[sc_]), _bend(ft[ta], ft[tb], ft[tc])
                if ns is not None and nt is not None:
                    d = float(np.dot(ns, nt))
                    agree.append(d)
                    flips += d < 0
        out[f'{label}_agree_min'] = round(min(agree), 3) if agree else None
        out[f'{label}_flip_frames'] = int(flips)
    # feet: contact phases of the source foot (lowest 1.5 cm), target speed and jitter in them
    feet = {}
    for sk, tk in (('Foot.L', 'foot_l'), ('Foot.R', 'foot_r')):
        ps, pt = np.array([f[sk] for f in S]), np.array([f[tk] for f in T])
        contact = ps[:, 2] < ps[:, 2].min() + 0.015
        vs = np.diff(ps[:, :2], axis=0) * fps
        vt = np.diff(pt[:, :2], axis=0) * fps
        c = contact[1:] & contact[:-1]
        if c.sum() >= 2:
            ms, mt = vs[c].mean(0), vt[c].mean(0)
            feet[tk] = {
                'contact_frames': int(c.sum()),
                'src_speed': round(float(np.linalg.norm(ms)), 3),
                'tgt_speed': round(float(np.linalg.norm(mt)), 3),
                # deviation from a constant treadmill speed while planted: sliding the game cannot hide
                'src_jitter': round(float(np.linalg.norm(vs[c] - ms, axis=1).mean()), 3),
                'tgt_jitter': round(float(np.linalg.norm(vt[c] - mt, axis=1).mean()), 3),
                # ankle height while planted, against the rest pose (+ = floating, - = sinking)
                'tgt_contact_height_cm': round(float(pt[contact, 2].mean() - FOOT_REST[tk]) * 100, 1),
                'src_contact_height_cm': round(float(ps[contact, 2].mean() - FOOT_REST[tk]) * 100, 1),
            }
            bk = 'ball_' + tk[-1]
            if bk in T[0]:
                fv = np.array([f[bk] for f in T]) - pt
                pitch = np.degrees(np.arctan2(fv[:, 2], np.linalg.norm(fv[:, :2], axis=1))) - SOLE_REST[tk]
                # + = toes up, - = toes down (tiptoe) against the flat rest sole
                # (only while the body is up: in a fall the feet roll off the ground on purpose)
                up_ok = contact & (np.asarray(rec.get('upright', np.ones(len(T)))) > 0.9)
                if up_ok.any():
                    feet[tk]['sole_pitch_planted_deg'] = [round(float(pitch[up_ok].min()), 1), round(float(pitch[up_ok].max()), 1)]
    out['feet'] = feet
    # shoulders: width and height of the upper-arm heads in the chest frame, against rest
    sh = []
    for ft, fr in zip(T, rec['t_rot']):
        q = Quaternion(fr['spine_03'])
        a = q.inverted() @ (Vector(ft['upperarm_l']) - Vector(ft['spine_03']))
        b = q.inverted() @ (Vector(ft['upperarm_r']) - Vector(ft['spine_03']))
        sh.append(((a - b).length - SHOULDER_REST[0], (a.y + b.y) / 2 - SHOULDER_REST[1]))
    sh = np.array(sh) * 100
    out['shoulder_width_delta_cm'] = [round(float(sh[:, 0].min()), 1), round(float(sh[:, 0].max()), 1)]
    out['shoulder_height_delta_cm'] = [round(float(sh[:, 1].min()), 1), round(float(sh[:, 1].max()), 1)]
    return out


def _eval_co(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ob = obj.evaluated_get(dg)
    me = ob.to_mesh()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    mw = np.array(ob.matrix_world)
    co = co @ mw[:3, :3].T + mw[:3, 3]
    ob.to_mesh_clear()
    return co


def _dominant(obj):
    """Per vertex: the dominant bone's name and the zone of (one of) its faces; per face its zone.
    A people-tier body has one palette material and keeps its zones in the face attribute `kq_zone`
    (kqchar/palette.py); a hero body (and every outfit piece) has one material per zone."""
    names = [g.name for g in obj.vertex_groups]
    me = obj.data
    nv = len(me.vertices)
    dom = np.full(nv, -1)
    best = np.zeros(nv)
    for v in me.vertices:
        for g in v.groups:
            if g.weight > best[v.index]:
                best[v.index], dom[v.index] = g.weight, g.group
    mats = [s.material.name if s.material else '' for s in obj.material_slots]
    zone = me.attributes.get('kq_zone')
    if zone is not None and 'kq_zones' in me:
        zn = json.loads(me['kq_zones'])
        zv = np.empty(len(me.polygons), dtype=np.int32)
        zone.data.foreach_get('value', zv)
        fz = [zn[i] for i in zv]
    else:
        fz = [mats[p.material_index] for p in me.polygons]
    vmat = np.array([''] * nv, dtype=object)
    for p in me.polygons:
        for vi in p.vertices:
            vmat[vi] = fz[p.index]
    return names, dom, fz, vmat, [names[g] if g >= 0 else '' for g in dom]


def _to_head(rig, co):
    hm = np.array((rig.matrix_world @ rig.pose.bones['head'].matrix).inverted())
    return co @ hm[:3, :3].T + hm[:3, 3]


def mesh_setup(scene, rig):
    """Vertex sets for the mesh checks, measured in the rest pose."""
    body = bpy.data.objects['avatar-body']
    glasses = bpy.data.objects.get('avatar-glasses')
    names, dom, fz, vmat, gname = _dominant(body)
    me = body.data
    fingers = ('thumb', 'index', 'middle', 'ring', 'pinky')
    hand = np.array([(m == 'Skin') and (n.startswith('hand_') or n.startswith(fingers)) for n, m in zip(gname, vmat)])
    trunk_bones = {'pelvis', 'spine_01', 'spine_02', 'spine_03'}
    pelvis_y = (rig.matrix_world @ rig.data.bones['pelvis'].head_local).y

    def trunk_of(objs, materials, skirts=False):
        """(object, faces) of the trunk surface the hands must stay out of. With `skirts`, the coat
        skirts count too (pelvis at the waist, thighs at the hem): their outer cloth only, so a hand
        that passes through into the gap between the skirts and the legs shows as inside."""
        out = []
        for o in objs:
            _, _, ofz, _, ogname = _dominant(o)
            trunk_v = np.array([n in trunk_bones for n in ogname])
            thigh_v = np.array([n.startswith('thigh_') for n in ogname])
            fs = []
            for p in o.data.polygons:
                vs = list(p.vertices)
                m = ofz[p.index]
                if m not in materials:
                    continue
                if trunk_v[vs].all():
                    fs.append(vs)
                elif skirts and m == 'Coat' and (trunk_v[vs] | thigh_v[vs]).all():
                    radial = Vector((p.center.x, p.center.y - pelvis_y, 0.0))
                    if radial.length > 1e-6 and p.normal.dot(radial.normalized()) > 0.5:
                        fs.append(vs)
            if fs:
                out.append((o, fs))
        return out

    # per costume: the body plus that costume's pieces when the character has them (kqchar/court.py:
    # avatar-default-jacket, -trousers …; avatar-court-coat, -waistcoat, -breeches)
    def pieces(c):
        return [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(f'avatar-{c}-')]
    trunks = {'default': trunk_of([body] + pieces('default'), ('Jacket', 'Shirt', 'Skin', 'Trousers'))}
    if pieces('court'):
        trunks['court'] = trunk_of([body] + pieces('court'), ('Skin', 'Coat', 'Waistcoat', 'Breeches'), skirts=True)
    beard = np.where(vmat == 'Beard')[0]
    head_i = names.index('head') if 'head' in names else -1
    beard_head = beard[dom[beard] == head_i]
    rig.data.pose_position = 'REST'
    scene.frame_set(scene.frame_current)
    co0 = _eval_co(body)
    rest_b = _to_head(rig, co0[beard_head])
    # face / neck skin under the beard: the beard must stay on top of it in every frame
    face_bones = {'head', 'neck_01'}
    face_v = np.array([n in face_bones for n in gname])
    face_f = [list(p.vertices) for p in me.polygons if fz[p.index] == 'Skin' and face_v[list(p.vertices)].any()]
    # (a skin beard, beard.mode 'skin', is part of the skin itself: nothing to check)
    rest_gap = _gaps(co0, face_f, co0[beard]) if len(beard) else np.zeros(0)
    rest_g = _to_head(rig, _eval_co(glasses)) if glasses else None
    for k in ('foot_l', 'foot_r'):
        FOOT_REST[k] = (rig.matrix_world @ rig.data.bones[k].head_local).z
        bk = 'ball_' + k[-1]
        if bk in rig.data.bones:
            fv = rig.matrix_world @ rig.data.bones[bk].head_local - rig.matrix_world @ rig.data.bones[k].head_local
            SOLE_REST[k] = math.degrees(math.atan2(fv.z, fv.xy.length))
    q = rot(rig.matrix_world @ rig.data.bones['spine_03'].matrix_local)
    c3 = rig.matrix_world @ rig.data.bones['spine_03'].head_local
    a = q.inverted() @ (rig.matrix_world @ rig.data.bones['upperarm_l'].head_local - c3)
    b = q.inverted() @ (rig.matrix_world @ rig.data.bones['upperarm_r'].head_local - c3)
    SHOULDER_REST[:] = [(a - b).length, (a.y + b.y) / 2]
    rig.data.pose_position = 'POSE'
    info = {'hand_verts': int(hand.sum()), 'trunk_faces': {c: sum(len(fs) for _, fs in t) for c, t in trunks.items()},
            'beard_head_verts': int(len(beard_head)), 'beard_verts': int(len(beard)),
            'glasses_verts': 0 if rest_g is None else int(len(rest_g))}
    return {'body': body, 'glasses': glasses, 'hand': np.where(hand)[0], 'trunks': trunks, 'beard_head': beard_head,
            'beard': beard, 'face_f': face_f, 'rest_gap': rest_gap,
            'rest_b': rest_b, 'rest_g': rest_g, 'rest_info': info}


def _gaps(co, faces, pts):
    """Signed distance of points to a surface (positive: outside, along the face normal)."""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromPolygons([tuple(c) for c in co], faces)
    out = np.zeros(len(pts))
    for i, q in enumerate(pts):
        v = Vector(q)
        loc, nrm, _, _ = tree.find_nearest(v, 0.05)
        out[i] = (v - loc).dot(nrm) if loc is not None else 1.0
    return out


def mesh_checks(scene, rig, chk, f0, f1):
    """Deformed-mesh checks per frame: hands inside the trunk; beard and glasses riding the head."""
    from mathutils.bvhtree import BVHTree
    pen = {c: {'frames': 0, 'max': 0.0} for c in chk['trunks']}
    drift_b, drift_g = [], []
    bt_frames, bt_max = 0, 0.0
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        co = _eval_co(chk['body'])
        evald = {chk['body'].name: co}
        # hands inside the trunk, in each costume (the body plus that costume's pieces)
        for c, trunk in chk['trunks'].items():
            tco, tf = [], []
            for o, fs in trunk:
                oc = evald.get(o.name)
                if oc is None:
                    oc = evald[o.name] = _eval_co(o)
                tf += [[i + len(tco) for i in fc] for fc in fs]
                tco += [tuple(v) for v in oc]
            tree = BVHTree.FromPolygons(tco, tf)
            deep = 0.0
            for vi in chk['hand']:
                p = Vector(co[vi])
                loc, nrm, _, _ = tree.find_nearest(p, 0.08)
                if loc is not None:
                    deep = max(deep, -(p - loc).dot(nrm))
            pen[c]['max'] = max(pen[c]['max'], deep)
            pen[c]['frames'] += deep > 0.012
        drift_b.append(np.linalg.norm(_to_head(rig, co[chk['beard_head']]) - chk['rest_b'], axis=1))
        gap = _gaps(co, chk['face_f'], co[chk['beard']]) if len(chk['beard']) else np.zeros(0)
        # beard vertices that sat on top of the skin at rest and now lie under it (skin pokes through)
        through = (chk['rest_gap'] > 0.0005) & (gap < -0.0005)
        bt_frames += bool(through.any())
        bt_max = max(bt_max, float(-gap[through].min()) if through.any() else 0.0)
        if chk['glasses'] is not None:
            drift_g.append(np.linalg.norm(_to_head(rig, _eval_co(chk['glasses'])) - chk['rest_g'], axis=1).max())
    db = np.concatenate(drift_b + [np.zeros(1)]) * 1000
    by = {c: {'frames': int(v['frames']), 'max_cm': round(v['max'] * 100, 1)} for c, v in pen.items()}
    return {'hand_in_trunk_frames': max(v['frames'] for v in by.values()), 'hand_in_trunk_max_cm': max(v['max_cm'] for v in by.values()),
            'hand_in_trunk_by_costume': by,
            'beard_drift_mm_p95': round(float(np.percentile(db, 95)), 2), 'beard_drift_mm_max': round(float(db.max()), 2),
            'skin_through_beard_frames': int(bt_frames), 'skin_through_beard_max_mm': round(bt_max * 1000, 2),
            'glasses_drift_mm_max': round(float(max(drift_g)) * 1000, 2) if drift_g else None}


def verdict(r):
    issues = []
    if r['knee_flip_frames']:
        issues.append(f"knee flips in {r['knee_flip_frames']} frames")
    if r['elbow_flip_frames']:
        issues.append(f"elbow bend differs from the source in {r['elbow_flip_frames']} frames")
    for k, v in r['feet'].items():
        if v['tgt_jitter'] > v['src_jitter'] + 0.05:
            issues.append(f"{k} slides beyond the source while planted ({v['tgt_jitter']} vs {v['src_jitter']} m/s)")
        if abs(v['tgt_contact_height_cm']) > 3:
            issues.append(f"{k} ankle {v['tgt_contact_height_cm']} cm off its rest height while planted")
        sp = v.get('sole_pitch_planted_deg')
        if sp and (sp[0] < -8 or sp[1] > 8):
            issues.append(f"{k} sole not flat while planted ({sp[0]} .. {sp[1]} deg)")
    if r['shoulder_height_delta_cm'][0] < -4:
        issues.append(f"shoulders drop {r['shoulder_height_delta_cm'][0]} cm")
    for c, v in r.get('hand_in_trunk_by_costume', {}).items():
        if v['frames']:
            issues.append(f"hand inside the trunk ({c}) in {v['frames']} frames (max {v['max_cm']} cm)")
    if r['glasses_drift_mm_max'] and r['glasses_drift_mm_max'] > 0.5:
        issues.append(f"glasses drift {r['glasses_drift_mm_max']} mm against the head")
    # beard_drift (against the head bone) is informative only: the under-chin beard follows the neck
    # like the skin beneath it; what matters is that the skin never comes through the beard
    if r['skin_through_beard_frames']:
        issues.append(f"skin comes through the beard in {r['skin_through_beard_frames']} frames (max {r['skin_through_beard_max_mm']} mm)")
    return not issues, issues


def _smooth_weight(contact, ramp):
    """0..1 lock weight: 1 in planted frames, smooth ramps of `ramp` frames either side."""
    n = len(contact)
    w = contact.astype(float)
    idx = np.nonzero(contact)[0]
    if len(idx) == 0 or ramp <= 0:
        return w
    for f in range(n):
        if contact[f]:
            continue
        d = np.abs(idx - f).min()
        if d <= ramp:
            x = 1.0 - d / (ramp + 1.0)
            w[f] = x * x * (3 - 2 * x)
    return w


def _phases(contact):
    out, a = [], None
    for f, c in enumerate(list(contact) + [False]):
        if c and a is None:
            a = f
        elif not c and a is not None:
            out.append((a, f - 1))
            a = None
    return out


def _contact(src, up, contact_cm, min_frames):
    """Planted frames of a source ankle path: within `contact_cm` of its lowest, phases of at least
    `min_frames`; also the path's height along `up`."""
    h = np.asarray(src) @ np.array(up)
    contact = h < h.min() + contact_cm / 100.0
    for a, b in _phases(contact):
        if b - a + 1 < min_frames:
            contact[a:b + 1] = False
    return contact, h


def _knee_flex(h, k, a):
    """Knee flexion (degrees, 0 = straight) of a hip, knee, ankle triple."""
    u, v = (Vector(k) - Vector(h)).normalized(), (Vector(a) - Vector(k)).normalized()
    return math.degrees(u.angle(v)) if u.length and v.length else 0.0


def pelvis_lift(frames, src_feet, src_flex, legs, bones, up, rest_z, ratio, contact_cm=1.5, ramp=3, min_frames=2, upright=None):
    """Straighter planted legs, in place on baked armature-space pose matrices (before `foot_lock`).

    A rig whose hips sit lower on its legs than the source's (or a stockier build carried on the
    source's hip height) ends up crouched once the feet are pinned: the IK bends the knees to reach.
    Per frame, the pelvis (and everything on it) is raised until each planted leg, its ankle where the
    lock will pin it, bends `ratio` times the source's own knee flexion at that frame (1 = as the
    source; never lowered, never past 99.5 % of the leg's reach; double support takes the smaller
    lift). Unplanted frames take the planted ones' lift, smoothed. Returns the lift per frame (m)."""
    up = Vector(up).normalized()
    upn = np.array(up)
    F = len(frames)
    need = np.full((len(legs), F), np.nan)
    for li, (thigh, calf, foot, _ball, _desc) in enumerate(legs):
        contact, h = _contact(src_feet[foot], up, contact_cm, min_frames)
        l1 = (bones[calf].head_local - bones[thigh].head_local).length
        l2 = (bones[foot].head_local - bones[calf].head_local).length
        for f in np.nonzero(contact)[0]:
            fr = frames[f]
            H = np.array(fr[thigh].translation)
            A = np.array(fr[foot].translation)
            A = A + (rest_z[foot] + (h[f] - h.min()) - A @ upn) * upn  # where the lock pins it
            v = H - A
            vz = v @ upn
            horiz2 = max(0.0, v @ v - vz * vz)
            phi = math.radians(max(0.0, ratio * src_flex[foot][f]))
            d = min(math.sqrt(l1 * l1 + l2 * l2 + 2 * l1 * l2 * math.cos(phi)), 0.995 * (l1 + l2))
            need[li, f] = max(0.0, math.sqrt(max(0.0, d * d - horiz2)) - vz)
    lift = np.nanmin(np.where(np.isnan(need), np.inf, need), axis=0)
    lift[~np.isfinite(lift)] = np.nan
    idx = np.nonzero(~np.isnan(lift))[0]
    if len(idx) == 0:
        return np.zeros(F)
    lift = np.interp(np.arange(F), idx, lift[idx])  # flight / swing: from the planted frames around
    k = np.exp(-0.5 * (np.arange(-ramp, ramp + 1) / max(ramp / 2.0, 1e-6)) ** 2)
    lift = np.convolve(np.pad(lift, ramp, mode='edge'), k / k.sum(), mode='valid')
    if upright is not None:
        lift = lift * np.asarray(upright)
    root = next((b.name for b in bones if b.parent is None), None)
    for f, fr in enumerate(frames):
        for name, M in fr.items():
            if name != root:
                M.translation = M.translation + up * float(lift[f])
    return lift


def foot_lock(frames, src_feet, legs, bones, up, rest_z, contact_cm=1.5, ramp=3, flat=1.0, min_frames=2, upright=None, spread=None, heading=None):
    """Pin planted feet and flatten their soles, in place on baked armature-space pose matrices.

    frames: per frame {bone: Matrix (armature space)}; src_feet: {foot: (F, 3) source ankle path in
    armature space, at our size}; legs: [(thigh, calf, foot, ball or None, [foot descendants])];
    bones: the armature's rest bones; up: the armature-space up vector; rest_z: {foot: our rest ankle
    height along up}. Planted = the source ankle within `contact_cm` of its lowest. In a planted phase
    the ankle goes to the source path plus the phase's mean offset (horizontal), at our rest height
    plus the source's height over its own lowest; the thigh and calf are re-solved (two-bone IK, the
    knee kept in its current bend plane), the foot keeps its heading and turns sole-flat. `upright`
    (per frame, 0..1) scales the lock: no pinning while the body is down (rolls, falls). `spread`
    ({foot: armature-space offset}) moves the planted feet apart (a wider stance). `heading`
    ({foot: armature-space direction}) turns a planted foot's toes that way (no splay)."""
    up = Vector(up).normalized()
    F = len(frames)
    stats = {}
    for thigh, calf, foot, ball, desc in legs:
        src = np.asarray(src_feet[foot])
        h = src @ np.array(up)
        contact = h < h.min() + contact_cm / 100.0
        for a, b in _phases(contact):
            if b - a + 1 < min_frames:
                contact[a:b + 1] = False
        w = _smooth_weight(contact, ramp)
        if upright is not None:
            w = w * np.asarray(upright)
        A = np.array([list(fr[foot].translation) for fr in frames])
        # the pinned path: per phase, the source path + its mean horizontal offset; height from rest
        tgt = A.copy()
        owner = -np.ones(F, dtype=int)
        phases = _phases(contact)
        for pi, (a, b) in enumerate(phases):
            off = (A[a:b + 1] - src[a:b + 1]).mean(0)
            off -= (off @ np.array(up)) * np.array(up)
            if spread and foot in spread:
                off = off + np.array(spread[foot])
            path = src + off
            path += np.outer(rest_z[foot] + (h - h[a:b + 1].min()) - path @ np.array(up), np.array(up))
            lo, hi = max(0, a - ramp), min(F - 1, b + ramp)
            for f in range(lo, hi + 1):
                if owner[f] < 0 or abs(f - (a + b) / 2) < abs(f - sum(phases[owner[f]]) / 2):
                    owner[f] = pi
                    ff = min(max(f, a), b)  # the ramps hold the phase's end positions
                    tgt[f] = path[ff]
        rest_q = bones[foot].matrix_local.to_quaternion()
        fwd_rest = (bones[ball].head_local - bones[foot].head_local) if ball else bones[foot].matrix_local.to_3x3() @ Vector((0, 1, 0))
        l1 = (bones[calf].head_local - bones[thigh].head_local).length
        l2 = (bones[foot].head_local - bones[calf].head_local).length
        prev_b = None
        moved = []
        for f, fr in enumerate(frames):
            if w[f] <= 1e-4:
                continue
            H = fr[thigh].translation.copy()
            K = fr[calf].translation.copy()
            Af = fr[foot].translation.copy()
            P = Af.lerp(Vector(tgt[f]), w[f])
            d_vec = P - H
            d = min(max(d_vec.length, abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4)
            e = d_vec.normalized()
            bvec = (K - H) - (K - H).dot(e) * e
            if bvec.length < 1e-5:
                bvec = prev_b if prev_b is not None else Vector((0, -1, 0)) - Vector((0, -1, 0)).dot(e) * e
            bvec.normalize()
            prev_b = bvec
            ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
            al = math.acos(min(1.0, max(-1.0, ca)))
            K2 = H + l1 * (math.cos(al) * e + math.sin(al) * bvec)
            A2 = H + e * d
            R1 = (K - H).rotation_difference(K2 - H)
            R2 = (R1 @ (Af - K)).rotation_difference(A2 - K2)
            qf = fr[foot].to_quaternion()
            # sole flat: the rest orientation turned to the current heading (about up)
            cur = qf @ rest_q.inverted() @ fwd_rest
            cur_h = cur - cur.dot(up) * up
            if heading and foot in heading:
                cur_h = Vector(heading[foot])
            rst_h = fwd_rest - fwd_rest.dot(up) * up
            if cur_h.length > 1e-6 and rst_h.length > 1e-6:
                yaw = rst_h.normalized().rotation_difference(cur_h.normalized())
                qflat = yaw @ rest_q
                if qflat.dot(qf) < 0:
                    qflat.negate()
                qf = qf.slerp(qflat, w[f] * flat)
            for name, q, t in ((thigh, R1 @ fr[thigh].to_quaternion(), H), (calf, R2 @ R1 @ fr[calf].to_quaternion(), K2),
                               (foot, qf, A2)):
                M = q.to_matrix().to_4x4()
                M.translation = t
                fr[name] = M
            for name in desc:  # unmapped children of the foot follow it at their rest offsets
                b = bones[name]
                fr[name] = fr[b.parent.name] @ (b.parent.matrix_local.inverted() @ b.matrix_local)
            moved.append((Vector(tgt[f]) - Af).length * w[f])
        stats[foot] = {'planted_frames': int(contact.sum()), 'phases': len(phases),
                       'mean_move_cm': round(float(np.mean(moved)) * 100, 2) if moved else 0.0,
                       'max_move_cm': round(float(np.max(moved)) * 100, 2) if moved else 0.0}
    return stats


def ankle_reference(srcarm, act, scene, sw, srest, qn, feet):
    """The source's flat-foot reference: its feet in the first frame of a standing clip (Idle), as a
    correction C per foot (applied like the limbs' rest swing): the clip-time foot then takes the source's
    change from that stance, keeping only the stance's heading."""
    srcarm.animation_data.action = act
    scene.frame_set(int(round(act.frame_range[0])))
    out = {}
    for s, t in feet:
        D = qn(rot(sw @ srcarm.pose.bones[s].matrix)) @ qn(rot(srest[s])).inverted()
        tw_ = Quaternion((D.w, 0.0, 0.0, D.z))
        tw_ = tw_.normalized() if tw_.magnitude > 1e-9 else Quaternion()
        out[t] = D.inverted() @ tw_
    return out


DEFAULT_CLIPS = 'Idle,Walk,Run,Interact,Wave,Sword_Slash,Roll,Death'
# --stand-lean: the share of the lean per bone (rotations are world-space; the head turns back part
# of it, so the gaze stays level while the neck comes forward)
LEAN = {'spine_02': 0.25, 'spine_03': 0.55, 'neck_01': 1.0, 'head': 0.35}
UPRIGHT = {'spine_01': 0.5, 'spine_02': 0.8, 'spine_03': 1.0, 'neck_01': 1.0, 'head': 1.0}  # --stand-upright shares


POINT_CURL = {  # degrees toward the palm per finger joint (index straight: 0)
    'index': (0.0, 0.0, 0.0), 'middle': (75.0, 95.0, 60.0), 'ring': (80.0, 95.0, 60.0), 'pinky': (85.0, 90.0, 55.0),
    'thumb': (15.0, 30.0, 30.0),
}


def point_clip(tgt, scene, base, name='Point', reach=(0.15, 0.55)):
    """A pointing gesture from a reaching clip (`--point Interact`): the same arm, but the reaching
    hand points: index straight, middle / ring / pinky curled into the palm, the thumb tucked. The
    hand shape eases in and out with the reach (the hand's distance from its first-frame place,
    `reach` = smoothstep edges as fractions of the furthest reach). Returns the new action."""
    out = base.copy()
    out.name = name
    tgt.animation_data.action = out
    f0, f1 = (int(round(v)) for v in out.frame_range)
    frames = list(range(f0, f1 + 1))
    pos = {'l': [], 'r': []}
    for f in frames:
        scene.frame_set(f)
        for s in pos:
            pos[s].append((tgt.matrix_world @ tgt.pose.bones['hand_' + s].head).copy())
    travel = {s: [(p - pos[s][0]).length for p in pos[s]] for s in pos}
    side = max(travel, key=lambda s: max(travel[s]))
    far = max(travel[side]) or 1.0
    bones = tgt.data.bones
    hand = bones['hand_' + side]
    along = hand.tail_local - hand.head_local
    across = bones['index_01_' + side].head_local - bones['pinky_01_' + side].head_local
    palm = (across.cross(along) if side == 'r' else along.cross(across)).normalized()
    targets = {}
    for finger, degs in POINT_CURL.items():
        for k, deg in enumerate(degs, 1):
            b = bones.get(f'{finger}_0{k}_{side}')
            if b is None:
                continue
            d = (b.tail_local - b.head_local).normalized()
            axis = d.cross(palm)
            if axis.length < 1e-6 or deg == 0.0:
                targets[b.name] = Quaternion()
                continue
            local = (b.matrix_local.to_3x3().inverted() @ axis).normalized()
            targets[b.name] = Quaternion(local, math.radians(deg))
    for i, f in enumerate(frames):
        t = min(1.0, travel[side][i] / far)
        e0, e1 = reach
        x = min(1.0, max(0.0, (t - e0) / (e1 - e0)))
        w = x * x * (3 - 2 * x)
        scene.frame_set(f)
        for bn, q in targets.items():
            pb = tgt.pose.bones[bn]
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = pb.rotation_quaternion.slerp(q, w)
            pb.keyframe_insert('rotation_quaternion', frame=f, group=bn)
    print(f'[retarget] {name}: from {base.name}, the {side} hand points ({len(targets)} finger bones, reach {far:.2f} m)')
    return out


RELAX_CURL = (0.6, 1.0, 0.75)  # share of --relax-fingers per finger joint (01, 02, 03)
RELAX_BLEND = 0.85  # how much of the relaxed pose replaces the source's finger pose
RELAX_FINGER = {'index': 0.8, 'middle': 1.0, 'ring': 1.1, 'pinky': 1.2, 'thumb': 0.35}


def relax_fingers(tgt, scene, actions, deg):
    """Relaxed hands in every clip (`--relax-fingers deg`): each finger joint takes a gentle curl
    toward the palm on the rest hand (RELAX_CURL x RELAX_FINGER x deg, RELAX_BLEND of it over the
    source's finger pose), so a hanging hand reads as relaxed, not as long fanned-out fingers."""
    bones = tgt.data.bones
    curl = {}
    for side in ('l', 'r'):
        hand = bones['hand_' + side]
        along = hand.tail_local - hand.head_local
        across = bones['index_01_' + side].head_local - bones['pinky_01_' + side].head_local
        palm = (across.cross(along) if side == 'r' else along.cross(across)).normalized()
        for finger, share in RELAX_FINGER.items():
            for k, part in enumerate(RELAX_CURL, 1):
                b = bones.get(f'{finger}_0{k}_{side}')
                if b is None:
                    continue
                d = (b.tail_local - b.head_local).normalized()
                axis = d.cross(palm)
                if axis.length < 1e-6:
                    continue
                local = (b.matrix_local.to_3x3().inverted() @ axis).normalized()
                curl[b.name] = Quaternion(local, math.radians(deg * share * part))
    for act in actions.values():
        tgt.animation_data.action = act
        f0, f1 = (int(round(v)) for v in act.frame_range)
        for f in range(f0, f1 + 1):
            scene.frame_set(f)
            for bn, q in curl.items():
                pb = tgt.pose.bones[bn]
                pb.rotation_mode = 'QUATERNION'
                # the source's finger pose (stiff, fanned out) mostly replaced by the relaxed curl on
                # the MPFB rest hand (its fingers lie together)
                pb.rotation_quaternion = pb.rotation_quaternion.slerp(q, RELAX_BLEND)
                pb.keyframe_insert('rotation_quaternion', frame=f, group=bn)
    print(f'[retarget] relaxed hands: {len(curl)} finger bones, {deg} deg in {len(actions)} clips')


def key_frames(tgt, tbones, order, s2t, frames, f0):
    """Key baked frames (armature-space pose matrices per bone) into the rig's current action from
    frame f0: each bone's local rotation from its pose and its parent's; mapped bones only (unmapped
    ones stay at rest, no channel), plus the pelvis's location."""
    for f, pm in enumerate(frames, f0):
        for name in order:
            b = tbones[name]
            pb = tgt.pose.bones[name]
            M = pm[name]
            if b.parent is not None:
                basis = (b.parent.matrix_local.inverted() @ b.matrix_local).inverted() @ pm[b.parent.name].inverted() @ M
            else:
                basis = b.matrix_local.inverted() @ M
            loc, q, _ = basis.decompose()
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = q
            if name in s2t:  # unmapped bones stay at rest: no channel at all (smaller clips)
                pb.keyframe_insert('rotation_quaternion', frame=f, group=name)
            if name == 'pelvis':
                pb.location = loc
                pb.keyframe_insert('location', frame=f, group=name)


def open_fingers(tgt, scene, act, hand_w, share=0.7):
    """The explaining hands of the Talk loop open up: every finger joint of a hand turns back toward
    the rest hand (straight fingers lying together) by `share` x that hand's gesture weight."""
    tgt.animation_data.action = act
    f0 = int(round(act.frame_range[0]))
    names = {s: [f'{g}_0{k}_{s}' for g in RELAX_FINGER for k in (1, 2, 3) if f'{g}_0{k}_{s}' in tgt.pose.bones] for s in ('l', 'r')}
    for i, (wr, wl) in enumerate(hand_w):
        scene.frame_set(f0 + i)
        for s, w in (('r', wr), ('l', wl)):
            if w < 1e-4:
                continue
            for bn in names[s]:
                pb = tgt.pose.bones[bn]
                pb.rotation_mode = 'QUATERNION'
                pb.rotation_quaternion = pb.rotation_quaternion.slerp(Quaternion(), share * w)
                pb.keyframe_insert('rotation_quaternion', frame=f0 + i, group=bn)


def rot(m):
    """Rotation part of a 4x4 (scale removed) as a quaternion."""
    return m.to_3x3().normalized().to_quaternion()


def main():
    char, src = opt('char'), opt('src')
    clips = opt('clips', DEFAULT_CLIPS).split(',')
    abduct = math.radians(float(opt('abduct', '10')))
    lock = float(opt('lock', '1'))
    no_lock = set(opt('no-lock', 'Roll').split(','))  # clips without planted feet to keep (tumbles)
    # standing clips: a wider stance (m, added between the planted feet) and arms closer to the body
    stand = set(opt('stand', '').split(',')) - {''}
    stand_width = float(opt('stand-width', '0'))
    stand_abduct = math.radians(float(opt('stand-abduct', opt('abduct', '10'))))
    # standing clips, the pose itself (people tiers): straighter knees (the body lifted to a knee bend
    # of --stand-knee degrees), the feet set at +-x with the toes turned out a little, the source's
    # stoop given back (--stand-upright), a slight forward lean of the upper spine and neck, the head
    # and neck rolled level (no tilt)
    stand_knee = float(opt('stand-knee')) if opt('stand-knee') is not None else None
    stand_feet = opt('stand-feet')
    stand_toe = opt('stand-toe')
    stand_lean = math.radians(float(opt('stand-lean', '0')))
    stand_upright = float(opt('stand-upright', '0'))
    # standing clips: the shoulders dropped this many degrees (the clavicles turned down about the
    # chest's forward axis; the arms keep their direction, so only the shoulder line comes down)
    stand_shoulders = math.radians(float(opt('stand-shoulders', '0')))
    walk_shoulders = math.radians(float(opt('walk-shoulders', '0')))  # the same drop in Walk
    level_head = opt('level-head', '0') == '1'
    # planted knees: bend this fraction of the source's knee flexion (the pelvis rises, pelvis_lift);
    # the locomotion and idle clips (`--loco`) can stand straighter still (`--knees-loco`)
    knees = float(opt('knees')) if opt('knees') else None
    knees_loco = float(opt('knees-loco')) if opt('knees-loco') else knees
    loco = set(opt('loco', 'Idle,Idle_Sword,Walk,Run,Run_Back,Run_Left,Run_Right').split(','))
    # people tiers, more clips and motion: a forward lean in Walk too (degrees, LEAN shares), a
    # counter-swing of the arms (`--arm-swing Walk=22`: clip=degrees), and the Talk loop made from a
    # standing clip (`--talk Idle`, `--talk-seconds 4`; see kqchar/motion.py talk_frames)
    stand_hips = float(opt('stand-hips', '0'))
    walk_lean = math.radians(float(opt('walk-lean', '0')))
    swing = {k: float(v) for k, v in (p.split('=') for p in opt('arm-swing', '').split(',') if '=' in p)}
    talk_src = opt('talk')
    talk_base = None
    ankle_ref = opt('ankle-ref', 'Idle')
    bpy.ops.wm.open_mainfile(filepath=char, load_ui=False, use_scripts=False)
    tgt = bpy.data.objects['avatar-rig']
    before = set(bpy.data.objects)
    acts_before = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=src)
    for a in [a for a in bpy.data.actions if a not in acts_before]:
        a.name = 'src:' + a.name  # the baked clips take the plain names
    if clips == ['all']:
        clips = sorted(a.name[4:] for a in bpy.data.actions if a.name.startswith('src:'))
    new = [o for o in bpy.data.objects if o not in before]
    srcarm = next(o for o in new if o.type == 'ARMATURE')
    # the source is only a driver: hide its meshes and props
    for o in new:
        if o is not srcarm:
            o.hide_render = True
            o.hide_viewport = True
    scene = bpy.context.scene
    base_pose = {pb.name: pb.matrix_basis.copy() for pb in srcarm.pose.bones}
    sw = srcarm.matrix_world.copy()
    tw = tgt.matrix_world.copy()
    tbones = tgt.data.bones
    sbones = srcarm.data.bones
    pairs = [(s, t) for s, t in MAP.items() if s in sbones and t in tbones]
    missing = [s for s, t in MAP.items() if s not in sbones or t not in tbones]
    # rest frames in world space. The Quaternius rest sits far from where the clips put the rig (the
    # Root bone's pose carries a large offset), so move the rest by the Root's rest -> pose transform
    # to put rest and clips in the same frame.
    G = Matrix.Identity(4)
    if 'Root' in sbones:
        scene0 = bpy.context.scene
        srcarm.animation_data_create()
        # from a standing clip (the Idle reference when there is one), so the result does not depend
        # on the order of --clips
        srcarm.animation_data.action = bpy.data.actions.get('src:' + ankle_ref) or bpy.data.actions.get('src:' + clips[0]) or next(
            a for a in bpy.data.actions if a.name.startswith('src:'))
        scene0.frame_set(int(srcarm.animation_data.action.frame_range[0]))
        G = (sw @ srcarm.pose.bones['Root'].matrix) @ (sw @ sbones['Root'].matrix_local).inverted()
    srest = {s: G @ sw @ sbones[s].matrix_local for s, _ in pairs}
    trest = {t: tw @ tbones[t].matrix_local for _, t in pairs}
    # the source's own character frame (glTF imports can carry any axis / unit setup): left, forward,
    # up from its rest skeleton -> our frame (left +X, forward -Y, up +Z, metres at our size)
    hips0 = srest['Hips'].translation
    up = (srest['Head'].translation - hips0).normalized()
    left = srest['UpperArm.L'].translation - srest['UpperArm.R'].translation
    left = (left - left.dot(up) * up).normalized()
    fwd = left.cross(up)
    B = Matrix((left, fwd, up)).transposed()  # columns: the source's left / forward / up in world
    RN = (Matrix(((1, 0, 0), (0, -1, 0), (0, 0, 1))) @ B.transposed()).to_quaternion()
    s_h = (hips0 - srest['Foot.L'].translation).dot(up)
    t_h = trest['pelvis'].translation.z - trest['foot_l'].translation.z
    hip_ratio = t_h / max(s_h, 1e-9)
    pel0 = trest['pelvis'].translation.copy()

    def to_t(p):
        """A source world point in our frame and size."""
        return pel0 + (RN @ (p - hips0)) * hip_ratio

    def qn(q):
        return RN @ q

    # Limbs and fingers take the source's direction (T-pose vs A-pose rest); the trunk, clavicles and
    # feet only take the source's change from rest (both rests stand upright with flat feet; their bone
    # directions differ by joint placement, which would otherwise hunch the shoulders or tip the feet).
    delta_only = {'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'clavicle_r', 'foot_l', 'foot_r'}
    C = {t: Quaternion() for _, t in pairs if t in delta_only}
    for s, t in pairs:
        if t in delta_only:
            continue
        ys = (qn(rot(srest[s])) @ Vector((0, 1, 0))).normalized()
        yt = (rot(trest[t]) @ Vector((0, 1, 0))).normalized()
        C[t] = yt.rotation_difference(ys)
    s2t = {t: s for s, t in pairs}
    order = [b.name for b in tbones]  # parents come before children in Blender's bone list
    ref_act = bpy.data.actions.get('src:' + ankle_ref) if ankle_ref != 'none' else None
    if ref_act is not None:
        C.update(ankle_reference(srcarm, ref_act, scene, sw, srest, qn, [(s, t) for s, t in pairs if t in ('foot_l', 'foot_r')]))
    legs = []
    for sd in ('l', 'r'):
        foot = 'foot_' + sd
        ball = 'ball_' + sd if 'ball_' + sd in tbones else None
        desc = [b.name for b in tbones[foot].children_recursive]
        legs.append(('thigh_' + sd, 'calf_' + sd, foot, ball, desc))
    up_a = (tw.to_3x3().inverted() @ Vector((0, 0, 1))).normalized()
    rest_z = {lg[2]: tbones[lg[2]].head_local.dot(up_a) for lg in legs}
    side_a = (tw.to_3x3().inverted() @ Vector((1, 0, 0))).normalized()  # the figure's left
    tw_inv = tw.inverted()
    actions = {}
    report = {'source': os.path.basename(src), 'missing_map': missing, 'hip_ratio': hip_ratio, 'clips': {}}
    tgt.animation_data_create()
    srcarm.animation_data_create()
    fps = scene.render.fps / scene.render.fps_base
    chk = mesh_setup(scene, tgt)
    report['rest'] = chk['rest_info']
    for clip in clips:
        act = bpy.data.actions.get('src:' + clip)
        if act is None:
            report['clips'][clip] = {'ok': False, 'why': 'not in the source file'}
            continue
        # channels a clip does not key must not keep the previous clip's pose (the Root after a roll):
        # back to the pose the import left
        for pb in srcarm.pose.bones:
            pb.matrix_basis = base_pose[pb.name]
        srcarm.animation_data.action = act
        f0, f1 = (int(round(v)) for v in act.frame_range)
        abd = stand_abduct if clip in stand else abduct
        out = bpy.data.actions.new(clip)
        tgt.animation_data.action = out
        rec = {'s': [], 't': [], 't_rot': [], 'frames': f1 - f0 + 1}
        baked, src_feet, src_flex = [], {'foot_l': [], 'foot_r': []}, {'foot_l': [], 'foot_r': []}
        for f in range(f0, f1 + 1):
            scene.frame_set(f)
            spose = {s: sw @ srcarm.pose.bones[s].matrix for s, _ in pairs}
            pm = {}  # target pose matrices, armature space
            swing = {}  # per side: the arm's girth swing (applied to the whole arm, see below)
            for name in order:
                b = tbones[name]
                pb = tgt.pose.bones[name]
                if b.parent is not None:
                    chain = pm[b.parent.name] @ (b.parent.matrix_local.inverted() @ b.matrix_local)
                else:
                    chain = b.matrix_local.copy()
                if name in s2t:
                    s = s2t[name]
                    q = qn(rot(spose[s])) @ qn(rot(srest[s])).inverted() @ C[name] @ rot(trest[name])
                    if name in ('upperarm_l', 'upperarm_r') and abd:
                        # girth compensation: a stockier trunk than the source's; swing a hanging
                        # arm out a little (less as the arm rises) so the hands clear the hips. The
                        # whole arm swings (forearm, hand, fingers too, below), so the elbow keeps
                        # the source's bend: turning only the upper arm bows the elbows out
                        ch = rot(tw @ pm['spine_03']) @ rot(trest['spine_03']).inverted()
                        fwd_c, down_c = ch @ Vector((0, -1, 0)), ch @ Vector((0, 0, -1))
                        hang = max(0.0, (q @ Vector((0, 1, 0))).dot(down_c))
                        sgn = 1.0 if name.endswith('_l') else -1.0
                        swing[name[-1]] = Quaternion(fwd_c, sgn * abd * hang)
                        q = swing[name[-1]] @ q
                    elif name.startswith(ARM_CHAIN) and name[-1] in swing:
                        q = swing[name[-1]] @ q
                    sh_c = stand_shoulders if clip in stand else (walk_shoulders if clip == 'Walk' else 0.0)
                    if sh_c and name in ('clavicle_l', 'clavicle_r'):
                        ch = rot(tw @ pm['spine_03']) @ rot(trest['spine_03']).inverted()
                        sgn = 1.0 if name.endswith('_l') else -1.0
                        q = Quaternion(ch @ Vector((0, -1, 0)), -sgn * sh_c) @ q
                    if clip in stand and stand_upright and name in UPRIGHT:
                        # the source's stoop given back: a share of each upper bone's forward pitch
                        # against the rest pose (yaw and roll, the clip's life, stay)
                        sx = (rot(tw) @ Vector((1, 0, 0))).normalized()
                        dn = q @ Vector((0, 1, 0))
                        dr = rot(trest[name]) @ Vector((0, 1, 0))
                        dn, dr = dn - sx * dn.dot(sx), dr - sx * dr.dot(sx)
                        if dn.length > 1e-6 and dr.length > 1e-6:
                            ang = math.atan2(dr.cross(dn).dot(sx), dr.dot(dn))
                            q = Quaternion(sx, -stand_upright * UPRIGHT[name] * ang) @ q
                    if clip in stand and stand_hips and name in ('pelvis', 'spine_01', 'spine_02'):
                        # the hips turned back under the chest (a share of their yaw against the rest
                        # pose): the jacket hangs from the chest, its zip and hem stay on the centre line
                        fa = rot(tw).inverted() @ (q @ rot(trest[name]).inverted() @ (rot(tw) @ Vector((0, -1, 0))))
                        q = Quaternion(rot(tw) @ Vector((0, 0, 1)), -stand_hips * math.atan2(fa.x, -fa.y)) @ q
                    lean_c = stand_lean if clip in stand else (walk_lean if clip == 'Walk' else 0.0)
                    if lean_c and name in LEAN:
                        q = Quaternion(rot(tw) @ Vector((1, 0, 0)), lean_c * LEAN[name]) @ q
                    if clip in stand and level_head and name in ('neck_01', 'head'):
                        upv = rot(tw).inverted() @ (q @ Vector((0, 1, 0)))
                        q = Quaternion(rot(tw) @ Vector((0, 1, 0)), -math.atan2(upv.x, upv.z)) @ q
                    qa = rot(tw).inverted() @ q
                    M = qa.to_matrix().to_4x4()
                    M.translation = chain.translation
                    if name == 'pelvis':
                        M.translation = tw.inverted() @ to_t(spose[s].translation)
                else:
                    M = chain
                pm[name] = M
            baked.append(pm)
            for sd, tk in (('L', 'foot_l'), ('R', 'foot_r')):
                src_feet[tk].append(list(tw_inv @ to_t(spose[f'Foot.{sd}'].translation)))
                src_flex[tk].append(_knee_flex(*(spose[f'{b}.{sd}'].translation for b in ('UpperLeg', 'LowerLeg', 'Foot'))))
            rec['s'].append({k: list(to_t(spose[k].translation)) for k in SK_S})
        rec['upright'] = np.ones(len(rec['s']))
        if lock > 0 and clip not in no_lock:
            # the source pelvis height against standing: the lock fades out when the body goes down
            hz = np.array([fr['Hips'][2] for fr in rec['s']])
            upright = np.clip((hz - pel0.z * 0.65) / (pel0.z * 0.2), 0.0, 1.0)
            upright = upright * upright * (3 - 2 * upright)
            rec['upright'] = upright
            spread = None
            side = (tw.to_3x3().inverted() @ Vector((1, 0, 0))).normalized()
            if clip in stand and stand_width:
                spread = {'foot_l': list(side * stand_width / 2), 'foot_r': list(-side * stand_width / 2)}
            heading = None
            if clip in stand and stand_feet:
                # both planted feet at +-x (their mean place over the clip), level front to back
                fx = float(stand_feet)
                fwd_a = up_a.cross(side).normalized()
                mean = {k: np.mean([np.array(fr[k].translation) for fr in baked], axis=0) for k in ('foot_l', 'foot_r')}
                ymid = (np.dot(mean['foot_l'], fwd_a) + np.dot(mean['foot_r'], fwd_a)) / 2
                spread = {}
                for k, sg in (('foot_l', 1.0), ('foot_r', -1.0)):
                    dx = sg * fx - float(np.dot(mean[k], side))
                    dy = ymid - float(np.dot(mean[k], fwd_a))
                    spread[k] = list(side * dx + fwd_a * dy)
            if clip in stand and stand_toe is not None:
                a_ = math.radians(float(stand_toe))
                fwd_a = side.cross(up_a).normalized()  # the figure's forward (-Y)
                heading = {'foot_l': list(fwd_a * math.cos(a_) + side * math.sin(a_)), 'foot_r': list(fwd_a * math.cos(a_) - side * math.sin(a_))}
            kr = knees_loco if clip in loco else knees
            if kr is not None:
                lift = pelvis_lift(baked, src_feet, src_flex, legs, tbones, up_a, rest_z, kr, upright=upright)
                rec['pelvis_lift_cm'] = [round(float(lift.min()) * 100, 2), round(float(lift.max()) * 100, 2)]
            rec_lock = foot_lock(baked, src_feet, legs, tbones, up_a, rest_z, flat=lock, upright=upright, spread=spread, heading=heading)
            if clip in stand and stand_knee is not None:
                # straighter knees: lift the body until the mean knee bend of the more bent leg is
                # `--stand-knee` degrees, then pin the feet again (the legs re-solve under the hips)
                lifts, bends = [], []
                for fr in baked:
                    for thigh, calf, foot, _, _ in legs:
                        l1 = (tbones[calf].head_local - tbones[thigh].head_local).length
                        l2 = (tbones[foot].head_local - tbones[calf].head_local).length
                        want = math.sqrt(l1 * l1 + l2 * l2 + 2 * l1 * l2 * math.cos(math.radians(stand_knee)))
                        v = fr[thigh].translation - fr[foot].translation
                        dz = v.dot(up_a)
                        hz = (v - up_a * dz).length
                        lifts.append(math.sqrt(max(want * want - hz * hz, 0.0)) - dz)
                        bends.append(math.degrees((fr[calf].translation - fr[thigh].translation).angle(fr[foot].translation - fr[calf].translation)))
                lift = max(0.0, float(np.percentile(lifts, 50)))  # half the frames at the bend, the rest at full stretch (the solver clamps; the feet stay in the planted tolerance)
                above = set()  # the pelvis's ancestors (a root bone) stay put: they carry no channel
                pb_ = tbones['pelvis'].parent
                while pb_ is not None:
                    above.add(pb_.name)
                    pb_ = pb_.parent
                for fr in baked:
                    for k in fr:
                        if k not in above:
                            fr[k].translation = fr[k].translation + up_a * lift
                rec_lock = foot_lock(baked, src_feet, legs, tbones, up_a, rest_z, flat=lock, upright=upright, spread=None, heading=heading)  # the feet already sit where `spread` put them
                print(f'[retarget] {clip}: knee bend mean {np.mean(bends):.1f} deg, lifted {lift * 100:.1f} cm for {stand_knee:.0f} deg')
        if clip in swing:
            motion.arm_swing(baked, tbones, side_a, up_a, swing[clip])
            print(f'[retarget] {clip}: arm swing +-{swing[clip]:.0f} deg against the thighs')
        if clip == talk_src:
            talk_base = [{k: m.copy() for k, m in fr.items()} for fr in baked]
        key_frames(tgt, tbones, order, s2t, baked, f0)
        for f, pm in zip(range(f0, f1 + 1), baked):
            # ---- skeleton samples (world space, target frame and size)
            tpos = {n: tw @ pm[n] for n in pm}
            rec['t'].append({k: list(tpos[k].translation) for k in SK_T if k in tpos})
            rec['t_rot'].append({k: list(rot(tpos[k])) for k in ('spine_03',)})
        actions[clip] = out
        r = metrics(rec, f0, f1, fps)
        r.update(mesh_checks(scene, tgt, chk, f0, f1))
        if lock > 0 and clip not in no_lock:
            r['foot_lock'] = rec_lock
        if 'pelvis_lift_cm' in rec:
            r['pelvis_lift_cm'] = rec['pelvis_lift_cm']
        r['ok'], r['issues'] = verdict(r)
        report['clips'][clip] = r
        print(f'[retarget] {clip}: {json.dumps(r)}')
    srcarm.animation_data.action = None
    # remove the source rig and its props
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    talk_w = None
    if talk_base is not None:
        # the Talk loop: the standing clip's frames (feet locked as baked) with explaining hands
        gap = motion.frame_gap(talk_base[0], talk_base[-1])
        if gap[0] > 0.004 or gap[1] > 2.0:
            talk_base = talk_base + [talk_base[0]]  # an open loop: wrap round to its first frame
        secs = float(opt('talk-seconds', '4'))
        frames, talk_w = motion.talk_frames(talk_base, tbones, side_a, up_a, secs, fps)
        out = bpy.data.actions.new('Talk')
        tgt.animation_data.action = out
        key_frames(tgt, tbones, order, s2t, frames, 0)
        actions['Talk'] = out
        report['clips']['Talk'] = {'ok': True, 'from': talk_src, 'seconds': secs, 'frames': len(frames), 'seam_gap': [round(gap[0], 4), round(gap[1], 2)]}
        print(f'[retarget] Talk: from {talk_src} ({len(frames)} frames, {secs:.1f} s; source seam {gap[0] * 100:.2f} cm / {gap[1]:.1f} deg)')
    if float(opt('relax-fingers', '0')):
        relax_fingers(tgt, scene, actions, float(opt('relax-fingers')))
    if talk_w is not None:
        open_fingers(tgt, scene, actions['Talk'], talk_w, float(opt('talk-open', '0.7')))
    if opt('point') and opt('point') in actions:
        # a pointing gesture from the reaching clip (the people's 'point'; see point_clip)
        actions['Point'] = point_clip(tgt, scene, actions[opt('point')])
        report['clips']['Point'] = {'ok': True, 'from': opt('point')}
    for a in list(bpy.data.actions):
        if a not in actions.values():
            bpy.data.actions.remove(a)
    for a in actions.values():
        a.use_fake_user = True
    tgt.animation_data.action = actions.get('Idle') or next(iter(actions.values()), None)
    if opt('out'):
        bpy.ops.wm.save_as_mainfile(filepath=opt('out'))
    if opt('report'):
        with open(opt('report'), 'w', encoding='utf-8') as fh:
            json.dump(report, fh, indent=1)
    if opt('glb'):
        for o in scene.objects:
            o.select_set(o.name.startswith('avatar-'))
        bpy.ops.export_scene.gltf(filepath=opt('glb'), export_format='GLB', use_selection=True, export_yup=True, export_skins=True,
                                  export_influence_nb=4, export_leaf_bone=False, export_def_bones=False, export_morph=True,
                                  export_materials='EXPORT', export_vertex_color='MATERIAL', export_animations=True,
                                  export_animation_mode='ACTIONS', export_apply=False, export_texcoords=False,
                                  export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=False,
                                  export_bake_animation=False, export_force_sampling=True,
                                  export_draco_mesh_compression_enable=False, export_extras=False)


main()
