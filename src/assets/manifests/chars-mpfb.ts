import type { AssetEntry } from '../types';

/**
 * Authored-mesh characters, MPFB2 route (scripts/chars/mpfb/): built by headless Blender scripts
 * from the CC0 MakeHuman core assets (base mesh hm08, targets, expression units, the 53-bone
 * "game_engine" rig), stylised (vertex-colour palette, solid hair / beard, our own glasses) and
 * packed with pnpm assets:pack. Pivot at the feet, facing +z, metres. Bind pose (A-pose); clips
 * retargeted from the Quaternius humans already in the repo.
 *
 * - The player (hero tier): built by the same pipeline; its spec, build script, GLB and manifest
 *   entry ship with the avatar MR, not here.
 * - People (featured / extra tiers): drawn by the people system (src/systems/people/authored.ts)
 *   with ONE shared palette material: every surface colour sits in the vertex colours, the GLB has
 *   one material 'People' and a decimated LOD1 mesh ('avatar-body_lod1', about half the triangles,
 *   same skin) for beyond 15 m.
 */
const entries: AssetEntry[] = [
  {
    id: 'chars.people.guide',
    kind: 'model',
    url: 'models/chars/guide-mpfb.glb',
    area: 'characters',
    bytes: 281960,
    licence: 'makehuman.mpfb2.people',
    note: 'The placeholder tour guide (people spec `guide`, an invented generic face), built by scripts/chars/mpfb/build.py from specs/guide.json: 1.95 m, lanky, about 50, bald, a hip-length forest-green softshell (closed collar, centre zip, cuffs), grey trousers, brown walking shoes, a mustard lanyard with a light badge. Featured tier: avatar-body 11.6k tris and avatar-body_lod1 5.8k tris, one material `People` (vertex colours with baked occlusion), morphs smile / blink on LOD0. Clips Idle, Walk, Run, Interact, Wave (retarget.py, foot lock; the standing clips upright with straight knees, relaxed fingers) and Point (Interact with a pointing hand, retarget.py --point). Opt-in for now: the game draws it only with ?people=authored (PEOPLE_AUTHORED_DEFAULT false) until his look passes review.',
  },
];
export default entries;
