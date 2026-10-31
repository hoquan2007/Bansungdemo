// Tactical first-person finishes for the untextured CC0 weapon packs. Their
// original mesh regions, separated mechanical parts and material names survive;
// only the per-viewmodel lighting response changes. Authored textured models
// (including the M4A1) continue to use their original PBR surfaces.
import * as THREE from 'three';

const FINISHES = Object.freeze({
  Main:       { color: 0x364149, metalness: 0.40, roughness: 0.65 },
  MainDark:   { color: 0x1d252d, metalness: 0.13, roughness: 0.81 },
  MainLight:  { color: 0x47545a, metalness: 0.52, roughness: 0.62 },
  Black:      { color: 0x1d252a, metalness: 0.10, roughness: 0.83 },
  DarkGrey:   { color: 0x252e35, metalness: 0.28, roughness: 0.69 },
  DarkMetal:  { color: 0x303e46, metalness: 0.73, roughness: 0.45 },
  Grey:       { color: 0x303d46, metalness: 0.40, roughness: 0.70 },
  Grey2:      { color: 0x27343c, metalness: 0.47, roughness: 0.63 },
  LightMetal: { color: 0x485456, metalness: 0.60, roughness: 0.54 },
  Metal:      { color: 0x39464b, metalness: 0.60, roughness: 0.56 },
  Wood:       { color: 0x795537, metalness: 0.02, roughness: 0.87 },
  DarkWood:   { color: 0x443528, metalness: 0.01, roughness: 0.89 },
  Glass:      { color: 0x1b3445, metalness: 0.32, roughness: 0.18 },
});

/** Refinish a cloned, untextured source weapon, without touching cached assets. */
export function finishFirstPersonWeapon(root) {
  const cache = new Map();
  let changed = 0;
  root.traverse((node) => {
    if (!node.isMesh) return;
    const finish = (material) => {
      if (!material || material.map || material.userData?.tacticalFirstPersonFinish ||
          !FINISHES[material.name]) return material;
      if (cache.has(material)) return cache.get(material);
      const result = new THREE.MeshStandardMaterial({
        ...FINISHES[material.name],
        side: material.side,
        transparent: material.transparent,
        opacity: material.opacity,
        alphaTest: material.alphaTest,
        vertexColors: material.vertexColors,
        flatShading: material.flatShading,
        envMapIntensity: 0.58,
      });
      result.name = material.name;
      result.userData.tacticalFirstPersonFinish = true;
      cache.set(material, result);
      changed++;
      return result;
    };
    node.material = Array.isArray(node.material)
      ? node.material.map(finish) : finish(node.material);
  });
  return changed;
}
