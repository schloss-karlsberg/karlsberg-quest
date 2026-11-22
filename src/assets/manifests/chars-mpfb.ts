import type { AssetEntry } from '../types';

/**
 * Authored-mesh characters, MPFB2 route (scripts/chars/mpfb/): built by headless Blender scripts
 * from the CC0 MakeHuman core assets (base mesh hm08, targets, expression units, the 53-bone
 * "game_engine" rig), stylised (vertex-colour palette, solid hair / beard, our own glasses) and
 * packed with pnpm assets:pack. Pivot at the feet, facing +z, metres. Bind pose (A-pose); clips
 * retargeted from the Quaternius humans already in the repo.
 *
 * - The player (hero tier, `chars.player.mpfb`): the playable avatar behind `?avatar=mpfb` /
 *   kq.avatar.useMpfb() (src/player/avatar.ts); area 'dev', loaded only on demand. Toon shading
 *   (`shading: 'toon'`, src/systems/characters/toon.ts). Pivot at the feet, facing +z, metres.
 *   Morph targets smile, blink (on avatar-body). Outfit pieces (scripts/chars/mpfb/kqchar/court.py):
 *   avatar-body and avatar-glasses always, avatar-default-* for the default outfit, avatar-court-*
 *   for the court costume (shown only in it); all on one skin.
 * - People (featured / extra tiers): drawn by the people system (src/systems/people/authored.ts)
 *   with ONE shared palette material: every surface colour sits in the vertex colours, the GLB has
 *   one material 'People' and a decimated LOD1 mesh ('avatar-body_lod1', about half the triangles,
 *   same skin) for beyond 15 m.
 */
const entries: AssetEntry[] = [
  {
    id: 'chars.player.mpfb',
    kind: 'model',
    url: 'models/chars/player-head-mpfb.glb',
    area: 'dev',
    bytes: 606340,
    licence: 'makehuman.mpfb2.player',
    shading: 'toon',
    note: 'Built by scripts/chars/mpfb/build_player.py from specs/player.json (stylised: big open eyes with smiling lids, an open smile, simple planes, a big head, about 5.6 heads tall, stocky). Object avatar-body: Skin, Hair (incl. brows), Beard (a sculpted solid shell) and Eye, each with a faint warm emissive; avatar-default-jacket: Jacket (shell with a colour-blocked yoke, collar, solid zip, cuffs, chest pocket flap, and the hip part as a hanging skirt with a hem band); avatar-default-trousers: Trousers; avatar-default-gear: Gear (laced ankle boots with collars, daypack); avatar-glasses: Glasses; the court costume, hidden until worn: avatar-court-coat: Coat (coat, skirts, collar, cuffs, buttons, tricorn), avatar-court-waistcoat: Waistcoat (waistcoat, stock, shirt cuffs, stockings), avatar-court-breeches: Breeches (breeches, knee bands, buckled shoes). Vertex colours with occlusion baked per costume. Each costume: under 25k triangles and 8 draw calls visible. Clips: the Quaternius humanoid clips already in the repo, bake-retargeted with a foot lock (scripts/chars/mpfb/retarget.py); the standing clips take a wider, upright stance with a level head and lowered, relaxed shoulders; the idle and locomotion clips stand straighter than the source (the pelvis raised so planted knees bend 0.6 of its flexion); relaxed, gently curled fingers in every clip. All meshes share one skin.',
  },
  {
    id: 'chars.people.guide',
    kind: 'model',
    url: 'models/chars/guide-mpfb.glb',
    area: 'characters',
    bytes: 338964,
    licence: 'makehuman.mpfb2.people',
    shading: 'toon',
    note: 'The placeholder tour guide (people spec `guide`, an invented generic face in the shared face style B, specs/_style_b.json; toon shading), built by scripts/chars/mpfb/build.py from specs/guide.json: 1.95 m, lanky, about 50, bald, a hip-length forest-green softshell that hangs from the shoulder blades (stiff closed collar with a zip garage, centre zip, a yoke and a chest pocket in vertex colour, cuffs), grey trousers with a clean hem, brown walking shoes with light soles, a mustard lanyard with a light badge. Featured tier: avatar-body 11.9k tris and avatar-body_lod1 6.0k tris, one material `People` (vertex colours with baked occlusion), morphs smile / blink on LOD0. Clips Idle, Walk, Run, Interact, Wave (retarget.py, foot lock; the standing clips with a forward lean, straight knees, the hips under the chest, relaxed fingers; Walk with an arm swing), Point (Interact with a pointing hand, retarget.py --point) and Talk (a 4 s explaining loop made from Idle, retarget.py --talk). Opt-in for now: the game draws it only with ?people=authored (PEOPLE_AUTHORED_DEFAULT false) until his look passes review.',
  },
];
export default entries;
