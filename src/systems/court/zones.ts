/**
 * Court zones (docs/IDEAS-ROUND11.md §2.6): where the court's eyes count tells, how hard, and where
 * a stranger is escorted to. Pure data + geometry (no three.js); tests/court.test.ts.
 *
 * Checked against the palace footprints (public/data/palace/footprints.json) and the scenery
 * (src/systems/scenery/sets.ts GITTER_PIERS):
 *  - The Ehrenhof circle (1212/−1116 r 36, the old guard circle of the story beat wache-rennen)
 *    reaches past the gitter (x ≈ 1192) to x 1176: the zone is only its part EAST of the gitter
 *    line (`side`), so the forecourt outside the gate — where you walk up to the Gardist and where
 *    you are put down — is not court. The exit 1180/−1112 stands in the gap between the two
 *    Wachhäuser (KB-B37 z −1106…−1096, KB-B38 z −1128…−1117), 12 m outside the gate.
 *  - The Orangerie circle (1260/−985 r 45) covers the Hauptflügel (KB-B10), the Rotunde (KB-B13),
 *    the Komödienhaus (KB-B11) and the court between them; its exit 1205/−952 lies 23 m west of the
 *    Hauptflügel, outside the circle (64 m from its centre), on the slope below the terrace.
 *  - Service zones (Küchenhof, Bauplatz, …) are simply not court zones: no checks, fights live there.
 */

export interface CourtZone {
  id: string;
  /** Circle on the ground (local metres). */
  x: number;
  z: number;
  r: number;
  /**
   * Optional clip: only the part of the circle where nx·x + nz·z ≥ d (a half-plane; the Ehrenhof's
   * side of the gitter).
   */
  side?: { nx: number; nz: number; d: number };
  /** Palace rooms (catalogue ids) that count as this zone too (interior flag `interior.room`). */
  rooms?: string[];
  /** Whole buildings (interior flag `interior.building`) that count as this zone. */
  buildings?: string[];
  /** Escorted to here (local x/z, facing yaw in degrees, 0 = north). */
  exit: { x: number; z: number; yaw: number };
  /** Rate multiplier for tells here. */
  mul: number;
  /** Multiplier once `court.admitted` is set. */
  admittedMul?: number;
  /** Teaching zone (the first one the story leads you through). */
  teaching?: boolean;
  /** Era the zone exists in. */
  era: string;
}

/** The gitter line (GITTER_PIERS first → last), its normal pointing into the Ehrenhof (east). */
const G0: [number, number] = [1195.75, -1094.75];
const G1: [number, number] = [1189.15, -1134.3];
const GL = Math.hypot(G1[0] - G0[0], G1[1] - G0[1]);
const GN = { nx: -(G1[1] - G0[1]) / GL, nz: (G1[0] - G0[0]) / GL };
const GATE_SIDE = { nx: GN.nx, nz: GN.nz, d: GN.nx * G0[0] + GN.nz * G0[1] };

export const ZONES: readonly CourtZone[] = [
  {
    id: 'court.orangerie',
    x: 1260,
    z: -985,
    r: 45,
    rooms: ['B10.1.s-pfeilersaal'],
    exit: { x: 1205, z: -952, yaw: 270 },
    mul: 0.6,
    teaching: true,
    era: '1789',
  },
  {
    id: 'court.ehrenhof',
    x: 1212,
    z: -1116,
    r: 36,
    side: GATE_SIDE,
    buildings: ['KB-B01', 'KB-B02', 'KB-B03', 'KB-B06'],
    exit: { x: 1180, z: -1112, yaw: 270 },
    mul: 1,
    admittedMul: 0.5,
    era: '1789',
  },
];

/** Where fast travel to the `ehrenhof` survey point puts a player who is not admitted (1789). */
export const EHRENHOF_OUTSIDE = { x: 1180, z: -1112, yaw: 90 } as const;

export function zoneById(id: string): CourtZone | undefined {
  return ZONES.find((z) => z.id === id);
}

/** Is x/z on the ground inside the zone (circle and side)? */
export function inZoneGround(z: CourtZone, x: number, zz: number): boolean {
  if (Math.hypot(x - z.x, zz - z.z) > z.r) return false;
  if (z.side && z.side.nx * x + z.side.nz * zz < z.side.d) return false;
  return true;
}

/** The zone the player stands in (ground circle, or the room / building they are inside), or null. */
export function zoneAt(x: number, z: number, era: string, room = '', building = '', zones: readonly CourtZone[] = ZONES): CourtZone | null {
  for (const zn of zones) {
    if (zn.era !== era) continue;
    if (room && zn.rooms?.includes(room)) return zn;
    if (building && zn.buildings?.includes(building)) return zn;
    if (inZoneGround(zn, x, z)) return zn;
  }
  return null;
}

/** The zone a watcher belongs to: the named one, else the one it stands in, else the nearest. */
export function watcherZone(x: number, z: number, era: string, named?: string, zones: readonly CourtZone[] = ZONES): CourtZone | null {
  if (named) return zones.find((zn) => zn.id === named) ?? null;
  const here = zones.find((zn) => zn.era === era && Math.hypot(x - zn.x, z - zn.z) <= zn.r);
  if (here) return here;
  let best: CourtZone | null = null;
  let bd = Infinity;
  for (const zn of zones) {
    if (zn.era !== era) continue;
    const d = Math.hypot(x - zn.x, z - zn.z) - zn.r;
    if (d < bd) {
      bd = d;
      best = zn;
    }
  }
  return best;
}
