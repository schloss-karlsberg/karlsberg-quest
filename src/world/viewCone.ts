import { Vector3 } from 'three';

/**
 * A cone around the camera's 3D view direction that holds the whole frustum (its corner rays)
 * plus a turn margin, for instance lists that are rebuilt only now and then (forest tiles, ground
 * cover). Unlike the horizontal sector it stays right when the view points steeply down. Pure
 * (any object with a position, fov, aspect and getWorldDirection will do).
 */
export interface ConeCamera {
  position: { x: number; y: number; z: number };
  fov: number;
  aspect: number;
  getWorldDirection(out: Vector3): Vector3;
}

/** Half angle (rad) from the view axis to a frustum corner: vertical `fov` in degrees, `aspect` = w / h. */
export function frustumCornerAngle(fovDeg: number, aspect: number): number {
  const tv = Math.tan((fovDeg * Math.PI) / 360);
  return Math.atan(Math.hypot(tv, tv * aspect));
}

export class ViewCone {
  x = 0;
  y = 0;
  z = 0;
  readonly dir = new Vector3(0, 0, -1);
  /** Half angle (rad) = frustum corner + margin. */
  half = Math.PI;
  private readonly tmp = new Vector3();

  /** Take the camera's position and direction; `margin` (rad) covers turning until the next rebuild. */
  set(camera: ConeCamera, margin: number): void {
    this.x = camera.position.x;
    this.y = camera.position.y;
    this.z = camera.position.z;
    camera.getWorldDirection(this.dir);
    this.half = frustumCornerAngle(camera.fov, camera.aspect) + margin;
  }

  /**
   * Can a sphere at c (radius r) be on screen? Everything within `near` m (horizontal) of the
   * camera always is (the camera turns fast).
   */
  keeps(cx: number, cy: number, cz: number, r: number, near = 0): boolean {
    if (this.half >= Math.PI) return true;
    const vx = cx - this.x;
    const vy = cy - this.y;
    const vz = cz - this.z;
    if (vx * vx + vz * vz <= near * near) return true;
    const d = Math.hypot(vx, vy, vz);
    if (d <= r) return true;
    const cos = (vx * this.dir.x + vy * this.dir.y + vz * this.dir.z) / d;
    const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
    return angle <= this.half + Math.asin(r / d);
  }

  /** The view direction turned more than `angle` (rad) since `set`. */
  turned(camera: ConeCamera, angle: number): boolean {
    return camera.getWorldDirection(this.tmp).dot(this.dir) < Math.cos(angle);
  }
}
