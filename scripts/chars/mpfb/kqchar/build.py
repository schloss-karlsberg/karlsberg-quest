"""The character build: spec in, skinned GLB out (see scripts/chars/mpfb/README.md)."""
import json
import os
import time

import bpy
import numpy as np

from . import beard as beard_mod
from . import face, glasses, hair, human, lod, outfit
from .bind import Surface, vertex_normals
from .parts import Part, build_object
from .util import hex_lin, mix, smoothstep
from . import lanyard, palette, shell  # people tiers: the guide's lanyard, garment solids, the shared palette and LOD1


def load_spec(path):
    with open(path, encoding='utf-8') as f:
        spec = json.load(f)
    base = spec.pop('extends', None)
    if base:
        parent = load_spec(os.path.join(os.path.dirname(path), base))
        spec = deep_merge(parent, spec)
    return spec


def deep_merge(a, b):
    out = dict(a)
    for k, v in b.items():
        out[k] = deep_merge(a[k], v) if isinstance(v, dict) and isinstance(a.get(k), dict) else v
    return out


def run(spec, out_glb, out_blend=None, log=print):
    t0 = time.time()
    human.enable()
    human.clear_scene()
    h = human.build(spec)
    lm = h.lm
    pal = spec['palette']
    bones = h.bones
    key_names = [k for k in spec['face'].get('expressions', {}) if k != 'rest']
    # ---- the full-resolution skin (body faces only; helper geometry dropped)
    body = h.groups['body'] > 0.5
    sidx = np.nonzero(body)[0]
    remap = -np.ones(len(h.co), dtype=int)
    remap[sidx] = np.arange(len(sidx))
    sfaces = [tuple(remap[list(f)]) for f in h.faces if body[list(f)].all()]
    sco = h.co[sidx]
    skeys = {k: v[sidx] for k, v in h.keys.items()}
    sW = h.weights[sidx]
    sG = {g: h.groups[g][sidx] for g in ('lips', 'ears', 'scalp')}
    snrm = vertex_normals(sco, sfaces)
    # ---- a skin beard (beard.mode 'skin') is a displacement of the face itself: applied first, so
    # hair, brows and glasses fit the bearded face
    bspec = spec.get('beard', {'style': 'none'})
    skin_beard = bspec.get('style', 'none') != 'none' and bspec.get('mode') == 'skin'
    solid_beard = bspec.get('style', 'none') != 'none' and bspec.get('mode') == 'solid'
    col = face.skin_colours(sco, snrm, sG, lm, pal)
    col = face.brow_tint(sco, snrm, col, lm, pal, spec['face'].get('brow', {}))
    if skin_beard:
        sco, skeys, beard_w, beard_col = beard_mod.displace(sco, sfaces, skeys, snrm, sG, lm, bspec, pal, hair.head_centre(lm))
        snrm = vertex_normals(sco, sfaces)
    skin = Surface(sco, sfaces)
    log('[mpfb] landmarks: ' + json.dumps({k: (np.round(v, 4).tolist() if hasattr(v, '__len__') else round(float(v), 4)) for k, v in lm.items() if k != 'head_weight'}))
    log(f'[mpfb] human: {len(sco)} skin verts, {sum(len(f) - 2 for f in sfaces)} tris ({time.time() - t0:.1f}s)')

    # ---- hair (built on the full skin); its hairline also paints the scalp
    hspec = spec.get('hair', {'style': 'bald'})
    hair_parts, hc, field, style = [], hair.head_centre(lm), None, None
    if hspec.get('style', 'bald') != 'bald':
        hair_parts, hc, field, style = hair.build(skin, lm, hspec, pal, bones, seed=spec.get('seed', 7))
    # ---- beard mask (paints the skin under it), skin colours
    beard_part = None
    if skin_beard:
        col = mix(col, beard_col, beard_w)
        if spec.get('debug_beard_mask'):
            col = np.stack([beard_w, beard_w * 0 + 0.2, 1 - beard_w], axis=1)
    elif solid_beard:
        beard_part, stubble = beard_mod.solid(skin, sW, skeys, lm, bspec, pal, bones, lips=sG['lips'])
        if 'stubble' in pal:
            col = mix(col, hex_lin(pal['stubble'])[None], pal.get('stubble_amount', 0.5) * stubble)
    elif bspec.get('style', 'none') != 'none':
        B = beard_mod.mask(sco, snrm, sG, lm, bspec)[0]
        col = mix(col, hex_lin(pal.get('beard_dark', '#4a3426'))[None], 0.85 * smoothstep(0.6, 0.85, B))
        if spec.get('debug_beard_mask'):
            col = np.stack([B, B * 0 + 0.2, 1 - B], axis=1)
    if style is not None:
        d = sco - hc
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        th, ph = hair.angles_of(d)
        hl = style.hairline(th)
        # the nape skin is weighted to the neck: allow it at the back
        on_head = (sco[:, 2] > lm['eye_z'] - 0.16) & ((h.lm['head_weight'][sidx] > 0.25) | (np.abs(th) > 100))
        # under the shell, and a short faded nape / sides below the hairline (softens the rim)
        fade = np.interp(np.abs(th), [0.0, 90.0, 130.0, 180.0], hspec.get('nape_fade_deg', [0.5, 2.0, 7.0, 8.0]))
        w = smoothstep(hl - fade, hl + 2.5, ph) * on_head
        col = mix(col, hex_lin(pal.get("hair_dark", "#4a3426"))[None], 0.7 * w)
        # a soft shadow / tint band below the hairline: the hair sits in the skin, not on it
        hbl_ = hspec.get('hairline_blend')
        if hbl_:
            # a short skin-to-hair blend below the hairline (fine hairs), instead of a hard edge
            band_b = smoothstep(hl - hbl_[0], hl - 0.2, ph) * (1 - w) * on_head
            tone = mix(col, hex_lin(pal.get('hair_dark', '#4a3426'))[None], hbl_[2] if len(hbl_) > 2 else 0.6)
            col = mix(col, tone, hbl_[1] * band_b ** 1.5)
        hs = hspec.get('hairline_shadow')
        if hs:
            band = smoothstep(hl - hs[0], hl - 0.5, ph) * (1 - w) * on_head
            col = mix(col, col * np.array(hs[2:5]) if len(hs) >= 5 else col * 0.8, hs[1] * band)
    if 'hands' in pal:
        hand_bones = [i for i, b in enumerate(bones) if b.startswith(('hand_', 'thumb', 'index', 'middle', 'ring', 'pinky'))]
        hw_ = np.clip(sW[:, hand_bones].sum(1), 0, 1)
        col = mix(col, hex_lin(pal['hands'])[None], hw_ * pal.get('hands_amount', 0.8))
    cs = pal.get('collar_shadow')
    jk0 = outfit.slots(spec.get('wardrobe', {})).get('jacket')
    if cs and jk0:
        nh, _ = outfit.bone_pos(h.rig, 'neck_01')
        ztop, _ = outfit.collar_top(h.rig, jk0, sco)
        # shaded up to just under the collar's own top edge (all round), fading out over 1.5 cm
        top = ztop - (1 - cs[1]) * jk0['collar_height']
        arm_b = [i for i, b in enumerate(bones) if b.startswith(('upperarm', 'lowerarm', 'hand', 'thumb', 'index', 'middle', 'ring', 'pinky'))]
        on_neck = (1 - np.clip(sW[:, arm_b].sum(1), 0, 1)) * (np.abs(sco[:, 0]) < 0.13) * (sco[:, 2] > nh[2] - 0.12)
        sh_w = smoothstep(top + 0.004, top - 0.012, sco[:, 2]) * on_neck
        col = mix(col, hex_lin(cs[0])[None], cs[2] * sh_w)
    col = np.hstack([col, np.ones((len(col), 1))])

    # ---- budget: decimate the body, keep the face
    lspec = spec.get('budget', {})
    hw = h.lm['head_weight'][sidx]
    keep = np.clip(hw, 0, 1) * np.where(sco[:, 1] < lm['ear_y'] + 0.01, lspec.get('face_keep', 1.0), lspec.get('back_of_head_keep', 0.5))
    if lspec.get('body_keep'):
        # the clothed body keeps a share of the budget (the collapse otherwise eats the near-flat
        # cloth first and leaves a faceted shell with legs of a few dozen triangles)
        keep = np.maximum(keep, lspec['body_keep'] * (1 - np.clip(hw, 0, 1)))
    if lspec.get('hand_keep'):
        # low budgets: keep the fingers apart (a pointing hand still reads as one)
        hb_ = [i for i, b in enumerate(bones) if b.startswith(('hand_', 'thumb', 'index', 'middle', 'ring', 'pinky'))]
        keep = np.maximum(keep, lspec['hand_keep'] * np.clip(sW[:, hb_].sum(1), 0, 1))
    if lspec.get('ear_keep'):
        # the ear rim keeps its curve (a decimated rim turns the tips pointed)
        keep = np.maximum(keep, lspec['ear_keep'] * np.clip(sG['ears'], 0, 1))
    ratio = lspec.get('skin_ratio', 0.5)
    if ratio < 0.999:
        lco, lfaces, lW, lcol, lG, lkeys = lod.decimate(sco, sfaces, sW, bones, col, sG, keep, ratio, skeys)
    else:
        lco, lfaces, lW, lcol, lG, lkeys = sco, sfaces, sW, col, sG, skeys
    log(f'[mpfb] skin lod: {sum(len(f) - 2 for f in lfaces)} tris ({time.time() - t0:.1f}s)')
    # ---- clean zone borders: cut the low skin along the hem, cuff and boot-top planes
    if spec.get('budget', {}).get('cut_borders', True):
        jk_ = outfit.slots(spec.get('wardrobe', {})).get('jacket')
        for name, pt, nv, allowed in outfit.cut_planes(lW, bones, h.rig, spec.get('wardrobe', {})):
            if pt is None:
                pt = np.array([0.0, 0.0, outfit.body_hem(lco, h.rig, jk_)])
            n0 = len(lco)
            lco, lfaces, lW, lcol, lG, lkeys = lod.cut_plane(lco, lfaces, lW, lcol, lG, lkeys, pt, nv, allowed(lco, lW))
            log(f'[mpfb] cut {name}: +{len(lco) - n0} verts')
        log(f'[mpfb] skin after cuts: {sum(len(f) - 2 for f in lfaces)} tris')

    # ---- wardrobe zones on the low skin
    wardrobe = spec.get('wardrobe', {})
    lnrm = vertex_normals(lco, lfaces)
    mats, off = outfit.zones(lco, lfaces, lW, bones, h.rig, lm, wardrobe)
    jkh = outfit.slots(wardrobe).get('jacket')
    if jkh and jkh.get('hang'):
        # the jacket hangs straight from the chest (people tiers): the waist and spine groove bridged
        off = off + shell.hang(lco + lnrm * off[:, None], lnrm, lfaces, mats, lW, bones, h.rig, jkh, outfit.body_hem(lco, h.rig, jkh))
    lco2 = lco + lnrm * off[:, None]
    lkeys2 = {k: v + lnrm * off[:, None] for k, v in lkeys.items()}
    mat_col = outfit.cloth_colours(lco, lnrm, wardrobe, pal, h.rig)
    skin_part = Part('skin', 'Skin', lco2, lfaces, col=lcol, weights=lW, keys=lkeys2, face_mat=mats, mat_col=mat_col)
    if bspec.get('style', 'none') != 'none' and not skin_beard and not solid_beard:
        lo = Surface(lco2, lfaces)
        beard_part, _ = beard_mod.build(sco, sfaces, skeys, snrm, sG, sW, lm, bspec, pal, hc, lo=lo)
        n = beard_mod.clear_surface(beard_part, lo, bspec.get('clear', 0.0022))
        log(f'[mpfb] beard: {n} vertices pushed clear of the low skin')
    parts = [skin_part]
    # ---- eyes, brows, beard, hair, collar
    epal = {k[4:]: v for k, v in pal.items() if k.startswith('eye_')}
    epal['iris'] = pal['iris']
    for side in ('l', 'r'):
        c = lm['eye_' + side]
        parts.append(face.eye_part('eye_' + side, c, lm['eye_radius'] * spec['face'].get('eye_fill', 0.985), epal, bones))
    if spec['face'].get('brows', True):
        bs = spec['face'].get('brow', {})
        for side in ('l', 'r'):
            parts.append(face.brow_part(skin, side, lm, pal, bones, skeys, bs))
    if spec['face'].get('teeth'):
        parts.append(face.teeth_part(skin, lm, bones, pal, spec['face']['teeth']))
    if beard_part is not None and not spec.get('debug_beard_mask'):
        parts.append(beard_part)
    parts += hair_parts
    parts += outfit.extras(Surface(lco2, lfaces), h.rig, lm, wardrobe, pal, bones, hem=outfit.hem_height(lco, h.rig, outfit.slots(wardrobe).get('jacket')))
    jkc = outfit.slots(wardrobe).get('jacket')
    if jkc and jkc.get('collar_cull') and jkc.get('collar_tilt') is not None:
        # the neck skin hidden inside the collar is removed (it can not poke through the collar or
        # show as a pale sliver); the throat under the beard (round the collar's front gap) stays
        cp_, cn_ = outfit.collar_plane(h.rig, jkc)
        nh_, _ = outfit.bone_pos(h.rig, 'neck_01')
        zt_, ang = outfit.collar_top(h.rig, jkc, lco)
        dd = (lco - cp_) @ cn_
        hidden = (dd > -0.002) & (lco[:, 2] < zt_ - jkc['collar_cull'][0]) & (np.abs(ang) > jkc['collar_cull'][1]) & (np.abs(lco[:, 0]) < 0.1)
        keep_f = [k for k, f in enumerate(skin_part.faces) if not (skin_part.face_mat[k] == 'Skin' and all(hidden[i] for i in f))]
        log(f'[mpfb] collar: {len(skin_part.faces) - len(keep_f)} hidden neck faces removed')
        skin_part.faces = [skin_part.faces[k] for k in keep_f]
        skin_part.face_mat = [skin_part.face_mat[k] for k in keep_f]
    # ---- garment solids (people tiers): the jacket's hanging hip part, the centre zip, the shoes
    jk2, so2 = outfit.slots(wardrobe).get('jacket'), outfit.slots(wardrobe).get('shoes')
    hem_v = outfit.hem_height(lco, h.rig, jk2)
    dressed = Surface(lco2, lfaces)
    surfs, surf_w = [dressed], [lW]
    skirt_top = None
    if jk2 and jk2.get('skirt'):
        sk_part = shell.skirt(lco2, lfaces, lW, bones, h.rig, jk2, pal, hem_v, dressed)
        parts.append(sk_part)
        surfs.append(Surface(sk_part.co, sk_part.faces))
        surf_w.append(sk_part.weights)
        skirt_top = hem_v + jk2['skirt']['above_hem']
        log(f'[mpfb] skirt: hem {hem_v:.3f} m (crotch + {jk2.get("hem_above_crotch", 0.025):.3f}), top {skirt_top:.3f} m, {sk_part.tris} tris')
    if jk2 and jk2.get('zip_solid'):
        cpart = next((p for p in parts if p.name == 'collar'), None)
        if cpart is not None:
            surfs.append(Surface(cpart.co, cpart.faces))
            surf_w.append(cpart.weights)
        nh2, _ = outfit.bone_pos(h.rig, 'neck_01')
        zt2 = float(outfit.collar_top(h.rig, jk2, np.array([[0.0, nh2[1] + 0.005 - 1.0, 0.0]]))[0][0]) - 0.003
        parts.append(shell.zip_part(surfs, surf_w, jk2, pal, bones, zt2, hem_v + 0.004))
    if so2 and so2.get('solid'):
        parts += shell.shoes(lco, lW, bones, so2, pal, Surface(lco, lfaces))
    if (so2 and so2.get('solid')) or skirt_top is not None:
        # body faces fully hidden under the garment solids are not drawn: the feet in the shoes,
        # the hips under the skirt (a band just over the hem stays: it shows in the gap)
        dom_ = np.array(bones)[np.argmax(lW, axis=1)]
        arm_ = np.array([d.startswith(('upperarm', 'lowerarm', 'hand', 'thumb', 'index', 'middle', 'ring', 'pinky')) for d in dom_])
        z_ = lco[:, 2]
        trm = (outfit.slots(wardrobe).get('trousers') or {}).get('material', 'Trousers')
        hide_lo = hem_v + (jk2 or {}).get('skirt', {}).get('show_below', 0.035) if skirt_top is not None else 9.0

        n_hid = {'shoes': 0, 'skirt': 0}

        def hidden_face(k, f):
            m = skin_part.face_mat[k]
            if so2 and so2.get('solid') and m == so2['material'] and all(z_[i] < so2['top'] + 1e-4 for i in f):
                n_hid['shoes'] += 1
                return True
            if skirt_top is not None and m in (trm, jk2['material']) and all(hide_lo <= z_[i] <= skirt_top - 0.004 and not arm_[i] for i in f):
                n_hid['skirt'] += 1
                return True
            return False

        keep_f = [k for k, f in enumerate(skin_part.faces) if not hidden_face(k, f)]
        log(f'[mpfb] hidden under the garment solids: {len(skin_part.faces) - len(keep_f)} body faces removed ({n_hid})')
        skin_part.faces = [skin_part.faces[k] for k in keep_f]
        skin_part.face_mat = [skin_part.face_mat[k] for k in keep_f]
    parts += lanyard.build(Surface(lco2, lfaces), h.rig, wardrobe, pal, bones)
    materials = spec.get('materials', {})
    obj = build_object('avatar-body', parts, bones, h.rig, key_names, materials)
    objs = [obj]
    gpart = None
    if spec.get('glasses', {}).get('style', 'none') != 'none':
        gpart, gy = glasses.build(skin, lm, spec['glasses'], pal, bones, skin_keys=skeys)
        gobj = build_object('avatar-glasses', [gpart], bones, h.rig, [], materials)
        objs.append(gobj)
    if palette.applies(spec):
        objs = palette.apply(objs, spec, log)  # one shared material (featured / extra tiers)
    # the MPFB working mesh is not exported
    bpy.data.objects.remove(h.obj, do_unlink=True)
    stats = report(parts + ([gpart] if gpart else []), objs)
    stats['mpfb'] = human.mpfb_version()
    stats['bones'] = len(bones)
    stats['morphs'] = key_names
    if palette.applies(spec):
        objs.append(palette.finish(objs[0], stats, spec, log))  # LOD1, slots, height, budget check
    log('[mpfb] ' + json.dumps(stats))
    if out_blend:
        os.makedirs(os.path.dirname(os.path.abspath(out_blend)), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=out_blend)
    export(h.rig, objs, out_glb)
    log(f'[mpfb] wrote {out_glb} ({time.time() - t0:.1f}s)')
    return stats


def report(parts, objs):
    by_part = {}
    for p in parts:
        key = p.name.split('_lock')[0] if '_lock' in p.name else p.name
        by_part[key] = by_part.get(key, 0) + p.tris
    mats = []
    for o in objs:
        mats += [f'{o.name}:{m.name}' for m in o.data.materials]
    return {'triangles': sum(by_part.values()), 'by_part': by_part, 'draw_calls': len(mats), 'materials': mats, 'textures': 0}


def export(rig, objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_skins=True,
        export_influence_nb=4,
        export_leaf_bone=False,
        export_def_bones=False,
        export_morph=True,
        export_morph_normal=True,
        export_morph_tangent=False,
        export_materials='EXPORT',
        export_vertex_color='MATERIAL',
        export_animations=False,
        export_apply=False,
        export_texcoords=False,
        export_tangents=False,
        export_draco_mesh_compression_enable=False,
        export_meshopt_compression_enable=False,
        export_extras=False,
    )
