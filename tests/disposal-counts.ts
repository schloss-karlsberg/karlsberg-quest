import { BufferGeometry, InstancedMesh, Material, type Object3D, RenderTarget, Sprite, Texture } from 'three';

type Resource = BufferGeometry | InstancedMesh | Material | RenderTarget | Texture;

export function disposalCounts() {
  const counts = new Map<Resource, number>();
  const watch = (resource: Resource) => {
    if (counts.has(resource)) return;
    counts.set(resource, 0);
    const emitter: { addEventListener(type: 'dispose', listener: () => void): void } = resource;
    emitter.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
  };
  return {
    watch,
    watchTree(root: Object3D) {
      root.traverse((node) => {
        if (node instanceof InstancedMesh) watch(node);
        // Sprites share three.js's own quad. Texture ownership is set explicitly by the test.
        if (!(node instanceof Sprite) && 'geometry' in node && node.geometry instanceof BufferGeometry) watch(node.geometry);
        if ('material' in node) {
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            if (material instanceof Material) watch(material);
          }
        }
      });
    },
    live: () => [...counts.values()].filter((count) => count === 0).length,
    calls: (resource: Resource) => counts.get(resource),
    repeated: () => [...counts].filter(([, count]) => count > 1).map(([resource]) => resource.constructor.name),
  };
}
