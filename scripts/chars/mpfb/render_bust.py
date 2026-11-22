"""Preview renders of a built character (studio light, not the game's light).

    blender -b --factory-startup --disable-autoexec -P scripts/chars/mpfb/render_bust.py -- \
        <character.glb|character.blend> <out_dir> [--engine cycles|eevee] [--views front,34,side,back,full,close,close34,backfull,mouth,eyes] [--hide Skin,...] [--view 'ACES 1.3'|AgX|Filmic] \
        [--size 640] [--morph smile=1] [--samples 24] [--costume default|court]

Cycles renders on the CPU (no GPU lock needed, a few seconds per view at 640 px). Eevee uses the GPU:
run it through the machine-wide heavy-job lock (docs/NEXT-SESSION.md §4). The judged shots are the
in-game ones (docs: scripts/chars/README.md); these are for the build loop.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2:
    print(__doc__)
    sys.exit(2)
src, out = argv[0], argv[1]


def opt(name, default):
    return argv[argv.index('--' + name) + 1] if '--' + name in argv else default


engine = opt('engine', 'cycles')
views = opt('views', 'front,34,side,back').split(',')
size = int(opt('size', '640'))
samples = int(opt('samples', '24'))
morphs = dict(kv.split('=') for kv in opt('morph', '').split(',') if '=' in kv)
os.makedirs(out, exist_ok=True)

if src.endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)
else:
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=src)
    # glTF import: Y-up converted back to Blender Z-up, the character faces -Y again
scene = bpy.context.scene
for o in list(scene.objects):
    if o.type in ('CAMERA', 'LIGHT'):
        bpy.data.objects.remove(o, do_unlink=True)
# outfit pieces (kqchar/court.py): show one costume's pieces, hide the others'
costume = opt('costume', 'default')
for o in scene.objects:
    if o.name.startswith(('avatar-default-', 'avatar-court-')):
        o.hide_render = not o.name.startswith(f'avatar-{costume}-')
meshes = [o for o in scene.objects if o.type == 'MESH' and not o.hide_render]
for o in meshes:
    if o.data.shape_keys:
        for kb in o.data.shape_keys.key_blocks[1:]:
            kb.value = float(morphs.get(kb.name, 0.0))
hide = [m for m in opt('hide', '').split(',') if m]
if hide:
    # debugging: drop the faces of the named materials (e.g. --hide Skin to see the beard alone)
    import bmesh
    for o in meshes:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        names = [s.material.name if s.material else '' for s in o.material_slots]
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if names[f.material_index] in hide], context='FACES')
        bm.to_mesh(o.data)
        bm.free()
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
pts = []
for o in meshes:
    ev = o.evaluated_get(dg)
    m = ev.to_mesh()
    pts.extend(ev.matrix_world @ v.co for v in m.vertices)
    ev.to_mesh_clear()
zmax = max(p.z for p in pts)
zmin = min(p.z for p in pts)
head = [p for p in pts if p.z > zmax - 0.26]
cx = sum(p.x for p in head) / len(head)
cy = sum(p.y for p in head) / len(head)

world = bpy.data.worlds.new('studio')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.42, 0.45, 0.5, 1)
bg.inputs['Strength'].default_value = 0.55


def light(name, kind, energy, loc, color, size_=1.0):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.size = size_
    lo = bpy.data.objects.new(name, ld)
    lo.location = loc
    d = Vector((cx, cy, zmax - 0.15)) - Vector(loc)
    lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(lo)


light('key', 'AREA', 180, (cx + 1.2, cy - 1.6, zmax + 0.6), (1.0, 0.9, 0.78), 1.2)
light('fill', 'AREA', 60, (cx - 1.6, cy - 1.2, zmax - 0.1), (0.75, 0.82, 1.0), 1.5)
light('rim', 'AREA', 120, (cx - 0.5, cy + 1.6, zmax + 0.5), (1.0, 0.95, 0.9), 1.0)

cam_d = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_d)
scene.collection.objects.link(cam)
scene.camera = cam
scene.render.resolution_x = size
scene.render.resolution_y = size
scene.render.film_transparent = False
# the game tone-maps with ACES filmic (docs/ART-DIRECTION.md §7): preview with the same curve
try:
    scene.view_settings.view_transform = opt('view', 'ACES 1.3')
except TypeError:
    scene.view_settings.view_transform = 'Filmic'
if engine == 'cycles':
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
else:
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'

ANG = {'neck34': 50, 'necktour': -30, 'hem34': 30, 'wrist': 70, 'top': 0, 'front': 0, '34': 35, 'side': 90, 'back': 180, 'otherside': -90, 'full': 20, 'close': 0, 'close34': 45, 'backfull': 160, 'mouth': 0, 'mouth34': 40, 'eyes': 0, 'eyes34': 35}
for v in views:
    a = math.radians(ANG.get(v, 0))
    if v.startswith('mouth'):
        tz = zmax - 0.2
        dist = 0.35
        cam_d.lens = 70
    elif v.startswith('eyes'):
        tz = zmax - 0.15
        dist = 0.32
        cam_d.lens = 70
    elif v.startswith('close'):
        tz = zmax - 0.14
        dist = 0.55
        cam_d.lens = 70
    elif v in ('neck34', 'necktour'):
        tz = zmax - 0.27
        dist = 0.5
        cam_d.lens = 60
    elif v in ('hem34', 'wrist'):
        tz = zmin + 0.9
        dist = 1.0 if v == 'hem34' else 0.6
        cam_d.lens = 50
    elif v == 'top':
        tz = zmax - 0.1
        dist = 0.7
        cam_d.lens = 60
    elif v in ('full', 'backfull'):
        tz = (zmax + zmin) / 2
        dist = (zmax - zmin) * 1.9
        cam_d.lens = 50
    else:
        tz = zmax - 0.15
        dist = 0.95
        cam_d.lens = 70
    # the character faces -Y: the front camera sits at -Y
    pos = Vector((cx + math.sin(a) * dist, cy - math.cos(a) * dist, tz + 0.03))
    if v == 'top':
        pos = Vector((cx, cy - 0.25, tz + 0.65))
    cam.location = pos
    cam.rotation_euler = (Vector((cx, cy, tz)) - pos).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(out, f'{v}.png')
    bpy.ops.render.render(write_still=True)
    print('wrote', scene.render.filepath)
