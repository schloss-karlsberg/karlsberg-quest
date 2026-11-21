"""Mesh parts and the one-object builder.

Every visible piece (skin, eyes, brows, hair, beard, collar, glasses) is a `Part`: rest positions,
faces, a per-vertex colour (linear RGBA, the stylised palette lives in vertex colours), skin weights
over the rig's bones and optional morph positions. `build_object` joins parts into ONE Blender mesh
with one material slot per semantic material, so the GLB has one draw call per material and every
part shares the same morph targets (`smile`, `blink`).
"""
import bpy
import numpy as np


class Part:
    def __init__(self, name, material, co, faces, col=None, weights=None, keys=None, smooth=True, face_mat=None, mat_col=None):
        self.name = name
        self.material = material
        self.co = np.asarray(co, dtype=np.float64).reshape(-1, 3)
        self.faces = [tuple(int(i) for i in f) for f in faces]
        n = len(self.co)
        self.col = np.ones((n, 4)) if col is None else np.asarray(col, dtype=np.float64)
        if self.col.shape[1] == 3:
            self.col = np.hstack([self.col, np.ones((n, 1))])
        self.weights = weights
        self.keys = keys or {}
        self.smooth = smooth
        self.face_mat = face_mat  # optional per-face material names (overrides `material`)
        self.mat_col = mat_col or {}  # optional per-material vertex colours (crisp zone borders)

    @property
    def tris(self):
        return sum(len(f) - 2 for f in self.faces)


def rigid_weights(n, bones, bone, w=1.0):
    W = np.zeros((n, len(bones)))
    W[:, bones.index(bone)] = w
    return W


def limit_weights(W, k=4):
    """Keep the k largest influences per vertex and renormalise (glTF: 4 per vertex)."""
    W = np.where(W < 1e-4, 0.0, W)
    if W.shape[1] > k:
        idx = np.argsort(-W, axis=1)[:, k:]
        np.put_along_axis(W, idx, 0.0, axis=1)
    s = W.sum(1, keepdims=True)
    return np.where(s > 0, W / np.maximum(s, 1e-12), W)


def make_material(name, rough=0.6, metal=0.0, spec=0.5, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = spec
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    if emit:
        # glTF emissiveFactor: a faint warm self-light (skin keeps its warmth under moon / lantern light)
        c = [int(emit[i:i + 2], 16) / 255.0 for i in (1, 3, 5)] if isinstance(emit, str) else list(emit)
        bsdf.inputs['Emission Color'].default_value = (c[0], c[1], c[2], 1.0)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    # single-sided in the GLB (glTF doubleSided = false): every part has outward winding
    m.use_backface_culling = True
    return m


def build_object(name, parts, bones, rig, key_names, materials, sharp_angle=None):
    """Join `parts` into one skinned mesh object parented to `rig`.

    `materials`: ordered {name: {rough, metal}}; slot order follows it, unused ones are skipped.
    """
    used = []
    for p in parts:
        for m in (p.face_mat if p.face_mat is not None else [p.material]):
            if m not in used:
                used.append(m)
    order = [m for m in materials if m in used] + [m for m in used if m not in materials]
    slot = {m: i for i, m in enumerate(order)}
    cos, faces, fmat, corner, smooth = [], [], [], [], []
    Ws = []
    keys = {k: [] for k in key_names}
    off = 0
    for p in parts:
        cos.append(p.co)
        for i, f in enumerate(p.faces):
            faces.append(tuple(j + off for j in f))
            m = p.face_mat[i] if p.face_mat is not None else p.material
            fmat.append(slot[m])
            smooth.append(p.smooth)
            src = p.mat_col.get(m, p.col)
            corner.append(src[list(f)])
        Ws.append(p.weights if p.weights is not None else np.zeros((len(p.co), len(bones))))
        for k in key_names:
            keys[k].append(p.keys.get(k, p.co))
        off += len(p.co)
    co = np.vstack(cos)
    col = np.vstack(corner)
    W = limit_weights(np.vstack(Ws))
    me = bpy.data.meshes.new(name)
    me.from_pydata(co.tolist(), [], faces)
    me.update()
    me.polygons.foreach_set('material_index', np.array(fmat, dtype=np.int32))
    me.polygons.foreach_set('use_smooth', np.array(smooth, dtype=bool))
    # face-corner colours: a vertex on a zone border keeps one colour per side (split on export)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    ca.data.foreach_set('color', col.astype(np.float32).ravel())
    me.color_attributes.active_color = ca
    for m in order:
        spec = materials.get(m, {})
        me.materials.append(make_material(m, spec.get('rough', 0.6), spec.get('metal', 0.0), spec.get('spec', 0.5), spec.get('emit')))
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if sharp_angle is not None:
        me.set_sharp_from_angle(angle=sharp_angle)
    if rig is not None:
        for bi, b in enumerate(bones):
            idx = np.nonzero(W[:, bi] > 0)[0]
            if len(idx) == 0:
                continue
            vg = obj.vertex_groups.new(name=b)
            ws = W[idx, bi]
            # group equal weights into one call
            for w in np.unique(np.round(ws, 4)):
                sel = idx[np.abs(ws - w) < 5e-5]
                vg.add(sel.tolist(), float(w), 'REPLACE')
        mod = obj.modifiers.new('Armature', 'ARMATURE')
        mod.object = rig
        obj.parent = rig
    if key_names:
        obj.shape_key_add(name='Basis', from_mix=False)
        for k in key_names:
            kb = obj.shape_key_add(name=k, from_mix=False)
            kb.data.foreach_set('co', np.vstack(keys[k]).astype(np.float32).ravel())
            kb.value = 0.0
    return obj
