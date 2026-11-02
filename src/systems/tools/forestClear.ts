import { type ShaderMaterial, Vector3 } from 'three';

/**
 * Trees fade inside a disc around the player while Röntgenblick (or the plan sheet) is on.
 * Runtime insert into the forest ShaderMaterial (world/forest.ts stays untouched): a uniform
 * pair next to the scan-lens fade. If the anchors are missing the patch is skipped (trees stay).
 */
const DECL_ANCHOR = 'uniform float uScanRadius;';
const FADE_ANCHOR = 'float c = cos(aVar.x), s = sin(aVar.x);';

export class ForestClear {
  readonly ok: boolean;
  private readonly u: { uKqClear: { value: number }; uKqClearC: { value: Vector3 }; uKqClearR: { value: number } };
  private target = 0;

  constructor(material: ShaderMaterial) {
    this.u = { uKqClear: { value: 0 }, uKqClearC: { value: new Vector3() }, uKqClearR: { value: 60 } };
    let vs = material.vertexShader;
    if (vs.includes('uKqClear')) {
      this.ok = true;
    } else if (vs.includes(DECL_ANCHOR) && vs.includes(FADE_ANCHOR)) {
      vs = vs.replace(DECL_ANCHOR, `${DECL_ANCHOR}\nuniform float uKqClear;\nuniform vec3 uKqClearC;\nuniform float uKqClearR;`);
      vs = vs.replace(
        FADE_ANCHOR,
        `fade *= 1.0 - uKqClear * (1.0 - smoothstep(uKqClearR * 0.78, uKqClearR, length(aInst.xz - uKqClearC.xz)));\n  ${FADE_ANCHOR}`,
      );
      material.vertexShader = vs;
      material.needsUpdate = true;
      this.ok = true;
    } else {
      this.ok = false;
    }
    if (this.ok) Object.assign(material.uniforms, this.u);
  }

  /** Request the clearing (0..1) around x/z with radius r; eased in `frame`. */
  set(on: number, x: number, z: number, r: number): void {
    this.target = on;
    this.u.uKqClearC.value.set(x, 0, z);
    this.u.uKqClearR.value = r;
  }

  frame(dt: number, instant: boolean): void {
    const u = this.u.uKqClear;
    u.value = instant ? this.target : u.value + (this.target - u.value) * Math.min(1, dt * 3);
    if (Math.abs(u.value - this.target) < 0.002) u.value = this.target;
  }

  get value(): number {
    return this.u.uKqClear.value;
  }
}
