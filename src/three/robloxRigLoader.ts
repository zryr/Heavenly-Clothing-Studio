import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type RobloxR15PartName =
  | 'Head'
  | 'UpperTorso'
  | 'LowerTorso'
  | 'RightUpperArm'
  | 'RightLowerArm'
  | 'RightHand'
  | 'LeftUpperArm'
  | 'LeftLowerArm'
  | 'LeftHand'
  | 'RightUpperLeg'
  | 'RightLowerLeg'
  | 'RightFoot'
  | 'LeftUpperLeg'
  | 'LeftLowerLeg'
  | 'LeftFoot';

export interface RobloxR15MeshPack {
  parts: Partial<Record<RobloxR15PartName, THREE.BufferGeometry>>;
}

const loader = new GLTFLoader();
const packCache = new Map<string, Promise<RobloxR15MeshPack>>();
const resolvedCache = new Map<string, RobloxR15MeshPack>();

const WOMAN_GLB_URL = '/models/roblox_r15_woman.glb';
const BLOCK_GLB_URL = '/models/roblox_r15_block.glb';

function loadMeshPack(url: string): Promise<RobloxR15MeshPack> {
  const existing = packCache.get(url);
  if (existing) return existing;

  const promise = new Promise<RobloxR15MeshPack>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const parts: Partial<Record<RobloxR15PartName, THREE.BufferGeometry>> = {};
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            const name = mesh.name as RobloxR15PartName;
            if (name && mesh.geometry) {
              const geo = mesh.geometry.clone();
              // Ensure vertex normals exist and are smooth/clean
              if (!geo.getAttribute('normal')) {
                geo.computeVertexNormals();
              }
              parts[name] = geo;
            }
          }
        });
        const pack: RobloxR15MeshPack = { parts };
        resolvedCache.set(url, pack);
        resolve(pack);
      },
      undefined,
      (err) => {
        packCache.delete(url);
        reject(err);
      }
    );
  });

  packCache.set(url, promise);
  return promise;
}

export function getCachedRobloxRigPacks(): {
  woman: RobloxR15MeshPack | null;
  block: RobloxR15MeshPack | null;
} {
  return {
    woman: resolvedCache.get(WOMAN_GLB_URL) ?? null,
    block: resolvedCache.get(BLOCK_GLB_URL) ?? null
  };
}

export async function preloadOfficialRobloxRigs(): Promise<{
  woman: RobloxR15MeshPack;
  block: RobloxR15MeshPack;
}> {
  const [woman, block] = await Promise.all([
    loadMeshPack(WOMAN_GLB_URL),
    loadMeshPack(BLOCK_GLB_URL)
  ]);
  return { woman, block };
}
