/** Plan types of the walkable palace interiors (pure data, see layout.ts). */

/** How the palace stands in an era: intact (1789–1793), ruin (1796), foundations (today). */
export type InteriorMode = 'intact' | 'ruin' | 'today';

export type RoomKind =
  | 'gallery'
  | 'festsaal'
  | 'orangery'
  | 'library'
  | 'arms'
  | 'naturalia'
  | 'prints'
  | 'cabinet'
  | 'study'
  | 'temple'
  | 'registry'
  | 'stair'
  | 'vestibule'
  | 'passage'
  | 'link'
  | 'corridor'
  | 'kitchen'
  | 'dining'
  | 'bedroom'
  | 'salon'
  | 'guard'
  | 'gunsmith'
  | 'chamber';

/** Room-local frame: origin at a corner, u along the long side, v across (into the room). */
export interface RoomFrame {
  ox: number;
  oz: number;
  ux: number;
  uz: number;
  vx: number;
  vz: number;
  /** Length along u, width along v (m). */
  L: number;
  W: number;
}

/** A floor zone of a stair hall in room-frame coordinates: h(u) = h0 + k·(u − u0). */
export interface StairZone {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  h0: number;
  k: number;
  kind: 'landing' | 'flight';
}

export interface StairPlan {
  type: 'straight' | 'dogleg' | 'imperial';
  zones: StairZone[];
  /** Walls between lanes (room-frame segments, full height). */
  dividers: { u0: number; v0: number; u1: number; v1: number }[];
  low: number;
  mid: number;
  high: number;
}

export interface IRoom {
  /** Index in Plan.rooms. */
  index: number;
  /** Full id `KB-B01/B01.2.og-festsaal` (as used by fx `fire:room`). */
  id: string;
  /** Catalogue room id `B01.2.og-festsaal`. */
  roomId: string;
  building: string;
  name: string;
  fn: string;
  kind: RoomKind;
  storey: number;
  floor: number;
  ceiling: number;
  /** CCW polygon (x, z). */
  poly: [number, number][];
  cx: number;
  cz: number;
  area: number;
  frame: RoomFrame;
  stair: StairPlan | null;
  /** Floor finish: parquet, stone flags, plain boards. */
  floorKind: 'parquet' | 'stone' | 'boards';
}

export interface Door {
  index: number;
  /** Room on the near side (the door sits on this room's edge). */
  a: number;
  /** Room on the far side, −1 = outside. */
  b: number;
  building: string;
  /** Second building for passages between two wings. */
  buildingB: string | null;
  kind: 'inner' | 'outer' | 'cross';
  /** Centre on room a's edge, tangent along it, outward normal of room a. */
  cx: number;
  cz: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  width: number;
  /** Depth of the passage through the wall (to room b or to the outer face). */
  depth: number;
  floor: number;
  /** Lintel height (absolute). */
  top: number;
  arch: boolean;
  /** Outer doors: steps down/up to the terrain in front of the door. */
  stoop: { length: number; ground: number } | null;
  /** Edge index of room a. */
  edge: number;
}

export interface Win {
  room: number;
  edge: number;
  cx: number;
  cz: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  width: number;
  y0: number;
  y1: number;
  /** Distance from the room face to the shell's inner glass plane (0 if unknown). */
  reveal: number;
  /** Depth to the outer face (ring). */
  depth: number;
}

/** Height-aware 2D wall: blocks a body whose vertical extent overlaps [y0, y1]. */
export interface Wall {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y0: number;
  y1: number;
  kind: 'room' | 'ring' | 'jamb' | 'divider' | 'block';
  building: string;
}

/** Rectangle with a floor height (door passage or outdoor stoop). */
export interface GroundRect {
  poly: [number, number][];
  /** Linear height: h = h0 + k · dot((x,z) − (ox,oz), (dx,dz)). */
  ox: number;
  oz: number;
  dx: number;
  dz: number;
  h0: number;
  k: number;
  /** Stoops blend into the terrain at their outer end (h = max(...)). */
  stoop: boolean;
  door: number;
}

export interface BuildingPlan {
  id: string;
  name: string;
  /** Index in the palace model / footprint list. */
  ring: [number, number][];
  base: number;
  eaves: number;
  /** Walkable storeys in the intact palace. */
  storeys: number[];
  rooms: number[];
  /** Axis-aligned bounds of the ring (+ stoops), for fast rejection. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Lowest walkable floor. */
  floor: number;
}

export interface Plan {
  mode: InteriorMode;
  rooms: IRoom[];
  doors: Door[];
  windows: Win[];
  walls: Wall[];
  ground: GroundRect[];
  buildings: BuildingPlan[];
}

/** A window or door opening found in the palace model (glass / door leaf), on the facade. */
export interface ShellOpening {
  building: string;
  kind: 'window' | 'door';
  /** Bottom edge endpoints on the facade plane. */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y0: number;
  y1: number;
}
