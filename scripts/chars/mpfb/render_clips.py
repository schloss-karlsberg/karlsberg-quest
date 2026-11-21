"""Contact frames of retargeted clips (Cycles CPU, small, no GPU needed).

    blender -b --factory-startup --disable-autoexec -P scripts/chars/mpfb/render_clips.py -- \\
        <character-with-clips.blend> <out_dir> [--clips Walk,Run,Wave,Sword_Slash] [--frames 4] [--size 300] [--angle 35]

Writes <out_dir>/<clip>_<k>.png; compose them with any image tool.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]


def opt(name, default):
    return argv[argv.index('--' + name) + 1] if '--' + name in argv else default


clips = opt('clips', 'Walk,Run,Wave,Sword_Slash').split(',')
nfr = int(opt('frames', '4'))
size = int(opt('size', '300'))
angle = math.radians(float(opt('angle', '35')))
os.makedirs(out, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)
scene = bpy.context.scene
rig = bpy.data.objects['avatar-rig']
for o in list(scene.objects):
    if o.type in ('CAMERA', 'LIGHT'):
        bpy.data.objects.remove(o, do_unlink=True)
world = bpy.data.worlds.new('studio')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.36, 0.38, 0.42, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.6
scene.world = world
for name, e, rotz, rotx in (('key', 3.5, 35, 50), ('fill', 1.2, -60, 30), ('rim', 2.5, 170, 40)):
    ld = bpy.data.lights.new(name, 'SUN')
    ld.energy = e
    lo = bpy.data.objects.new(name, ld)
    lo.rotation_euler = (math.radians(rotx), 0, math.radians(rotz))
    scene.collection.objects.link(lo)
# a ground plane to judge foot contact
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
cam_d = bpy.data.cameras.new('cam')
cam_d.lens = 50
cam = bpy.data.objects.new('cam', cam_d)
scene.collection.objects.link(cam)
scene.camera = cam
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 8
scene.cycles.use_denoising = True
scene.render.resolution_x = size
scene.render.resolution_y = size
try:
    scene.view_settings.view_transform = 'ACES 1.3'
except TypeError:
    pass
for clip in clips:
    act = bpy.data.actions.get(clip)
    if act is None:
        continue
    rig.animation_data.action = act
    f0, f1 = act.frame_range
    for k in range(nfr):
        f = int(round(f0 + (f1 - f0) * k / max(nfr, 1)))
        scene.frame_set(f)
        pel = rig.matrix_world @ rig.pose.bones['pelvis'].head
        tgt = Vector((pel.x, pel.y, 0.9))
        dist = 4.2
        cam.location = tgt + Vector((math.sin(angle) * dist, -math.cos(angle) * dist, 0.25))
        cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(out, f'{clip}_{k}.png')
        bpy.ops.render.render(write_still=True)
        print('wrote', scene.render.filepath)
