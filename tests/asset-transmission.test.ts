/**
 * No transmission in the world (src/assets/loader.ts `dropTransmission`): the CC0 chandelier's
 * glass (KHR_materials_transmission 0.7) would switch on three.js' transmission pre-pass, which
 * redraws every opaque object. Loaded in node from the real GLB (textures stripped: no images in
 * node), the load step leaves no material with transmission > 0.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Material, type Mesh, MeshPhysicalMaterial, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { describe, expect, it } from 'vitest';
import { dropTransmission } from '../src/assets/loader';

/** The GLB with every texture reference removed (GLTFLoader cannot decode images in node). */
function glbWithoutTextures(file: string): ArrayBuffer {
  const b = readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const rest = b.subarray(20 + jsonLen);
  delete json.textures;
  delete json.images;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
    if (m.pbrMetallicRoughness) {
      delete m.pbrMetallicRoughness.baseColorTexture;
      delete m.pbrMetallicRoughness.metallicRoughnessTexture;
    }
  }
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const jb = Buffer.from(text, 'utf8');
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + jb.length + rest.length, 8);
  head.writeUInt32LE(jb.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  const out = Buffer.concat([head, jb, rest]);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

const materials = (root: Object3D): (Material & { transmission?: number })[] => {
  const out: Material[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) out.push(...(Array.isArray(m.material) ? m.material : [m.material]));
  });
  return out;
};

describe('assets: no transmission after load', () => {
  it('the chandelier glass becomes plain alpha-blended glass (roughness, metalness, IOR kept)', async () => {
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const g = await loader.parseAsync(glbWithoutTextures(resolve(import.meta.dirname, '../public/assets/models/architecture/Chandelier_03.glb')), '');
    const before = materials(g.scene).filter((m) => (m.transmission ?? 0) > 0);
    expect(before.length).toBeGreaterThan(0); // the asset really ships transmission
    const glass = before[0] as MeshPhysicalMaterial;
    const look = { roughness: glass.roughness, metalness: glass.metalness, ior: glass.ior };
    expect(dropTransmission(g.scene)).toBe(before.length);
    expect(materials(g.scene).filter((m) => (m.transmission ?? 0) > 0)).toEqual([]);
    expect(glass.transparent).toBe(true);
    expect(glass.opacity).toBeGreaterThan(0.2);
    expect(glass.opacity).toBeLessThan(0.8);
    expect({ roughness: glass.roughness, metalness: glass.metalness, ior: glass.ior }).toEqual(look);
  });

  it('leaves materials without transmission alone', () => {
    const m = new MeshPhysicalMaterial({ opacity: 1 });
    const root = { traverse: (fn: (o: unknown) => void) => fn({ isMesh: true, material: m }) } as unknown as Object3D;
    expect(dropTransmission(root)).toBe(0);
    expect(m.transparent).toBe(false);
  });
});
