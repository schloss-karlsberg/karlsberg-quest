import {
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  type PerspectiveCamera,
  ShaderMaterial,
  type Texture,
  type WebGLRenderer,
} from 'three';

/**
 * Full-screen triangle drawn straight into the HDR scene target (before tone mapping).
 * `skyOnly`: drawn at the far plane with depth test, so it only covers pixels nothing wrote depth
 * to (the sky dome and the clear colour).
 */
export function makeScreenPass(fragmentShader: string, uniforms: Record<string, { value: unknown }>, renderOrder: number, skyOnly = false): Mesh {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const m = new ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, ${skyOnly ? '0.99999' : '0.0'}, 1.0); }`,
    fragmentShader,
    uniforms,
    transparent: true,
    depthTest: skyOnly,
    depthWrite: false,
  });
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.visible = false;
  return mesh;
}

/** A quad (two triangles, corners in uv 0..1) as the base of an instanced billboard geometry. */
export function quadInstanced(): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Pixels per metre at 1 m distance (for gl_PointSize = size · scale / depth). */
export function pointScale(camera: PerspectiveCamera, renderer: WebGLRenderer): number {
  const h = renderer.domElement.height || window.innerHeight;
  return h / (2 * Math.tan((camera.fov * Math.PI) / 360));
}

export function disposeMesh(m: { geometry?: { dispose(): void }; material?: unknown } | null | undefined): void {
  if (!m) return;
  m.geometry?.dispose();
  const mat = m.material as { dispose?: () => void; uniforms?: Record<string, { value: unknown }> } | undefined;
  if (mat?.uniforms) for (const u of Object.values(mat.uniforms)) (u.value as Texture | null)?.isTexture && (u.value as Texture).dispose();
  mat?.dispose?.();
}

/** GLSL: cylindrical (vertical axis) billboard corner for flames; spherical for puffs. */
export const BILLBOARD_GLSL = /* glsl */ `
vec3 kqBillboardUp(vec3 base, vec2 corner, vec2 size, float spherical) {
  vec3 toCam = cameraPosition - base;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + 1e-5);
  vec3 up = vec3(0.0, 1.0, 0.0);
  if (spherical > 0.5) {
    right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  }
  return base + right * (corner.x - 0.5) * size.x + up * corner.y * size.y;
}
`;
