import { BoxGeometry, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector3, Vector4, WebGLRenderTarget, type WebGLRenderer } from 'three';
import type { QualityPreset } from '../render/quality';
import { SHADOW_FOCUS_LEAD, SunShadows } from '../render/shadows';
import { ATMOS_GLSL, atmosphere } from '../world/atmosphere';
import { TREE_SHADOW_CULL_GLSL, TREE_VARIANTS } from '../world/vegetation/trees';

/** Sample two ground pixels at the foot of a low-sun shadow in an isolated scene. */
export function sampleSunShadow(renderer: WebGLRenderer, preset: QualityPreset): { occluded: number; lit: number } {
  const a = atmosphere;
  const prev = {
    target: renderer.getRenderTarget(),
    sun: a.uSunDir.value.clone(),
    camera: a.uCamPos.value.clone(),
    map: a.uShadowMap.value,
    matrix: a.uShadowMatrix.value.clone(),
    params: a.uShadowParams.value.clone(),
    detail: a.uShadowDetailSq.value.clone(),
    center: a.uShadowCenter.value.clone(),
  };
  const tree = new Vector4(115, 0, 0, 26);
  const caster = new Mesh(new BoxGeometry(6, tree.w, 4), new ShaderMaterial({
    uniforms: {
      uSunDir: a.uSunDir,
      uTreeShadowPad: { value: TREE_VARIANTS.map(() => 4 / tree.w) },
      uTree: { value: tree },
    },
    vertexShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec4 uTree;
      ${TREE_SHADOW_CULL_GLSL}
      void main() {
        if (kqTreeOutsideShadow(uTree, 0)) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
        else gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
  }));
  caster.position.set(tree.x, tree.w / 2, 0);
  const casters = new Scene();
  casters.add(caster);

  const plane = new Mesh(new PlaneGeometry(8, 8), new ShaderMaterial({
    uniforms: a,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${ATMOS_GLSL}
      varying vec3 vWorld;
      void main() {
        gl_FragColor = vec4(vec3(kqShadow(vWorld, vec3(0.0, 1.0, 0.0))), 1.0);
      }
    `,
  }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.x = 4;
  const receivers = new Scene();
  receivers.add(plane);
  const camera = new OrthographicCamera(-4, 4, 4, -4, 0.1, 10);
  camera.position.set(4, 6, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(plane.position);
  const target = new WebGLRenderTarget(8, 8);
  const shadows = new SunShadows();
  try {
    const elevation = 13 * Math.PI / 180;
    a.uSunDir.value.set(Math.cos(elevation), Math.sin(elevation), 0);
    a.uCamPos.value.set(0, 2, 0);
    const { shadowSize, shadowRange, shadowTaps, shadowDetail } = preset;
    shadows.configure(shadowSize, shadowRange, shadowTaps, shadowDetail);
    shadows.update(renderer, casters, new Vector3(shadowRange * SHADOW_FOCUS_LEAD, 2, 0));
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(receivers, camera);
    const pixel = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, 4, 4, 1, 1, pixel);
    const occluded = pixel[0]!;
    renderer.readRenderTargetPixels(target, 4, 0, 1, 1, pixel);
    return { occluded, lit: pixel[0]! };
  } finally {
    renderer.setRenderTarget(prev.target);
    a.uSunDir.value.copy(prev.sun);
    a.uCamPos.value.copy(prev.camera);
    a.uShadowMap.value = prev.map;
    a.uShadowMatrix.value.copy(prev.matrix);
    a.uShadowParams.value.copy(prev.params);
    a.uShadowDetailSq.value.copy(prev.detail);
    a.uShadowCenter.value.copy(prev.center);
    shadows.dispose();
    target.dispose();
    caster.geometry.dispose();
    caster.material.dispose();
    plane.geometry.dispose();
    plane.material.dispose();
  }
}
