// glTF model loading.
//
// Everything here is optional decoration. The game was built out of box
// primitives and still runs on them: every caller keeps its procedural version
// and swaps in a model only once one has actually arrived. A 404, a corrupt file
// or a slow connection costs you the nice guns, not the match.
//
// Models are CC0 from Quaternius (Toon Shooter Game Kit). They're fetched at
// runtime from /models rather than bundled, so 3MB of geometry never blocks the
// first paint.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// GLTFLoader is safe to share: nothing here configures it per-call. OBJLoader is
// not, and deliberately isn't kept here — see loadObjModel.
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

/** url -> Promise<{ scene, animations } | null> */
const cache = new Map();
const failed = new Set();

/**
 * The kit ships PBR materials, but the rest of the game is Lambert under a
 * two-light rig with no environment map, where PBR reads as murky and flat.
 * Converting keeps one art direction and drops a pile of shader work we get
 * nothing for.
 */
function toLambert(material) {
  const lambert = new THREE.MeshLambertMaterial({
    color: material.color?.clone() ?? new THREE.Color(0xffffff),
    map: material.map ?? null,
    transparent: material.transparent,
    opacity: material.opacity,
    side: material.side,
    vertexColors: material.vertexColors,
  });
  lambert.name = material.name;
  // Emissive materials in the kit are lights and signage — keep them lit rather
  // than letting them fall dark with the rest of the surface.
  if (material.emissive && material.emissive.getHex() !== 0x000000) {
    lambert.emissive = material.emissive.clone();
    lambert.emissiveIntensity = material.emissiveIntensity ?? 1;
  }
  return lambert;
}

function prepare(scene, preservePbr = false) {
  scene.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (!preservePbr) {
      node.material = Array.isArray(node.material)
        ? node.material.map(toLambert)
        : toLambert(node.material);
    }
  });
  return scene;
}

/**
 * Blender writes MTL `Kd` in linear space. MTLLoader reads it as sRGB and converts
 * it to linear anyway, so the value gets darkened twice.
 *
 * It matters enormously here because this pack authors dark guns: `Kd 0.016231`
 * becomes 0.016231 / 12.92 = 0.0013, and every gun renders as a black silhouette
 * with no readable shape at all. Undoing the extra conversion restores the value
 * the artist actually wrote.
 *
 * Only OBJ needs this. glTF carries its colour space in the format and GLTFLoader
 * already gets it right, which is why this lives here and not in toLambert.
 */
function correctMtlColorSpace(materials) {
  for (const material of Object.values(materials.materials ?? {})) {
    material.color?.convertLinearToSRGB();
  }
}

// Quaternius's CC0 sniper OBJ has neither texture coordinates nor image maps.
// Keep its five authored material regions while giving each part a distinct
// physical finish. Object-space grain provides subtle surface variation without
// depending on UVs or distributing third-party texture files.
const SNIPER_FINISH = {
  Black:     { color: 0x161b1f, metalness: 0.16, roughness: 0.78 },
  DarkMetal: { color: 0x30363a, metalness: 0.86, roughness: 0.31 },
  Glass:     { color: 0x0b2135, metalness: 0.52, roughness: 0.12 },
  Green:     { color: 0x3f5139, metalness: 0.06, roughness: 0.9 },
  Grey:      { color: 0x525a5f, metalness: 0.74, roughness: 0.43 },
};

function sniperMaterial(source) {
  const finish = SNIPER_FINISH[source.name] ?? SNIPER_FINISH.Black;
  const material = new THREE.MeshStandardMaterial({
    color: finish.color,
    metalness: finish.metalness,
    roughness: finish.roughness,
    envMapIntensity: 0.8,
    side: source.side,
  });
  material.name = source.name;
  material.onBeforeCompile = (shader) => {
    const grain = `
      varying vec3 sniperLocalPosition;
      float sniperHash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
    `;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${grain}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n sniperLocalPosition = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${grain}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float sniperGrain = sniperHash(floor(sniperLocalPosition * 260.0));
        diffuseColor.rgb *= 0.945 + sniperGrain * 0.075;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (sniperGrain - 0.5) * 0.12, 0.1, 1.0);`);
  };
  material.customProgramCacheKey = () => 'quaternius-sniper-finish-v1';
  return material;
}

// The CC0 chassis sniper has detailed geometry but no image textures or UVs.
// Its authored bright steel finish clips under our bright inspection studio.
// Retain its nine separately modeled material regions while applying a darker,
// low-glare tactical finish in both the Arsenal and first-person view.
const CHASSIS_SNIPER_FINISH = {
  alloyDark:    { color: 0x27363e, metalness: 0.66, roughness: 0.56 },
  steelBright:  { color: 0x506068, metalness: 0.72, roughness: 0.48 },
  polymerBlack: { color: 0x182128, metalness: 0.05, roughness: 0.83 },
  gunmetal:     { color: 0x29363e, metalness: 0.75, roughness: 0.51 },
  rubber:       { color: 0x151b1f, metalness: 0.01, roughness: 0.94 },
  brass:        { color: 0x95734c, metalness: 0.68, roughness: 0.45 },
  copper:       { color: 0x97634b, metalness: 0.57, roughness: 0.5 },
  glass:        { color: 0x203d50, metalness: 0.28, roughness: 0.17 },
  emberRed:     { color: 0x8d3931, metalness: 0.1, roughness: 0.5 },
};

function finishChassisSniper(scene) {
  const finished = new Map();
  scene.traverse((node) => {
    if (!node.isMesh) return;
    const finish = (material) => {
      if (!material) return material;
      if (finished.has(material)) return finished.get(material);
      const settings = CHASSIS_SNIPER_FINISH[material.name];
      if (!settings) return material;
      const custom = material.clone();
      custom.color.setHex(settings.color);
      custom.metalness = settings.metalness;
      custom.roughness = settings.roughness;
      custom.envMapIntensity = 0.55;
      finished.set(material, custom);
      return custom;
    };
    node.material = Array.isArray(node.material)
      ? node.material.map(finish)
      : finish(node.material);
  });
}

// The original knife has three well-separated parts but is bright and nearly
// featureless under the Lambert fallback. Give the CC0 mesh an understated
// steel blade, a dark guard and a textured-looking polymer grip in the
// first-person PBR lighting; this does not modify the downloaded GLB.
const COMBAT_KNIFE_FINISH = {
  steelBright: { color: 0x667780, metalness: 0.72, roughness: 0.4 },
  gunmetal: { color: 0x27343b, metalness: 0.67, roughness: 0.55 },
  polymerBlack: { color: 0x1c2728, metalness: 0.03, roughness: 0.88 },
};

function finishCombatKnife(scene) {
  scene.traverse((node) => {
    if (!node.isMesh) return;
    const finish = (material) => {
      const settings = COMBAT_KNIFE_FINISH[material?.name];
      if (!settings) return material;
      const custom = material.clone();
      custom.color.setHex(settings.color);
      custom.metalness = settings.metalness;
      custom.roughness = settings.roughness;
      custom.envMapIntensity = 0.65;
      return custom;
    };
    node.material = Array.isArray(node.material) ? node.material.map(finish) : finish(node.material);
  });
}

/**
 * OBJ + MTL, for the Quaternius gun pack — which ships no glTF at all, only OBJ,
 * FBX and .blend. The MTL is loaded first because OBJLoader needs the materials
 * up front; if it's missing we still get geometry, just in default grey.
 *
 * These models carry no textures, only flat MTL colours, which suits the
 * flat-shaded look the rest of the game already has.
 *
 * Both loaders are built per call, and that is not incidental. OBJLoader carries
 * the material set as loader-wide state via setMaterials(), and reads it when it
 * *parses* — which is after the fetch has awaited. Fifteen guns load at once here,
 * so a shared loader means whichever load is furthest along decides the materials
 * for all of them, and a load that finishes early wipes the set out from under the
 * others. OBJLoader doesn't complain when it can't find a material name: it
 * silently substitutes a white MeshPhongMaterial. That is exactly what "why are
 * all the guns white?" looked like, and being a race, it produced a different set
 * of white guns on every reload. A loader instance is cheap; shared mutable state
 * across concurrent loads is not.
 */
async function loadObjModel(url) {
  const mtlUrl = url.replace(/\.obj$/i, '.mtl');
  const objLoader = new OBJLoader();

  const materials = await new MTLLoader().loadAsync(mtlUrl).catch(() => null);
  if (materials) {
    materials.preload();
    correctMtlColorSpace(materials);
    objLoader.setMaterials(materials);
  }
  const object = await objLoader.loadAsync(url);
  if (/\/SniperRifle_1\.obj$/i.test(url)) {
    object.traverse((node) => {
      if (!node.isMesh) return;
      node.material = Array.isArray(node.material)
        ? node.material.map(sniperMaterial)
        : sniperMaterial(node.material);
    });
  }
  // OBJ has no scene graph metadata and no animations.
  return { scene: prepare(object, /\/SniperRifle_1\.obj$/i.test(url)), animations: [] };
}

/** Detailed CC0 M4A1 FBX with optimized PBR maps; assets load on demand. */
async function loadFbxModel(url) {
  const scene = await new FBXLoader().loadAsync(url);
  const stem = url.slice(0, -4);
  const textures = await Promise.all(
    ['Base_Color', 'Metallic', 'Normal', 'Roughness']
      .map((kind) => new THREE.TextureLoader().loadAsync(`${stem}_${kind}.webp`)),
  );
  const [map, metalnessMap, normalMap, roughnessMap] = textures;
  map.colorSpace = THREE.SRGBColorSpace;
  // FBX UVs are already in the orientation expected by TextureLoader.
  // The source metalness texture averages ~84% metallic. Its reflective detail
  // needs the viewmodel's separate environment map; without one, it renders black.
  const material = new THREE.MeshStandardMaterial({
    map, metalnessMap, normalMap, roughnessMap,
    color: 0xffffff, metalness: 0.5, roughness: 0.95, envMapIntensity: 0.7,
  });
  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.material = material.clone();
  });
  return { scene: prepare(scene, true), animations: scene.animations ?? [] };
}

/**
 * Load a model, once. Resolves to null rather than rejecting — callers are
 * expected to carry on without it, so a failure isn't exceptional.
 *
 * Handles glTF, OBJ and the textured M4A1 FBX; the extension decides.
 */
export function loadModel(url) {
  if (cache.has(url)) return cache.get(url);

  const load = /\.obj$/i.test(url)
    ? loadObjModel(url)
    : /\.fbx$/i.test(url)
      ? loadFbxModel(url)
      : loader.loadAsync(url).then((gltf) => {
        if (/ChassisSniper_CC0\.glb$/i.test(url)) finishChassisSniper(gltf.scene);
        if (/CombatKnife_CC0\.glb$/i.test(url)) finishCombatKnife(gltf.scene);
        // Keep the animated soldier's authored PBR finish as well as FPS guns.
        // Other stylized props stay on the cheaper Lambert path.
        return {
          scene: prepare(gltf.scene, /Character_Soldier\.gltf$|(?:Operator_Tactical|Operator_Rifle|fp\/m4a1|ChassisSniper_CC0|BoltSniper_CC0|CombatKnife_CC0)\.glb$/i.test(url)),
          animations: gltf.animations ?? [],
        };
      });

  const promise = load
    .catch((err) => {
      // Once per URL: a broken path shouldn't scroll the console for the whole match.
      if (!failed.has(url)) {
        failed.add(url);
        console.warn(`[models] ${url} unavailable, using the built-in shape instead:`, err.message);
      }
      return null;
    });

  cache.set(url, promise);
  return promise;
}

/** Already-resolved model, or null. For the frame loop, which can't await. */
export function peekModel(url) {
  const entry = cache.get(url);
  return entry?.resolved ?? null;
}

/**
 * Start loading and remember the result for peekModel. Fire-and-forget: nothing
 * waits on it, things just start looking better a moment after they appear.
 */
export function preload(urls) {
  for (const url of urls) {
    const promise = loadModel(url);
    if (promise.resolved !== undefined) continue;
    promise.then((model) => {
      promise.resolved = model;
    });
  }
}

/** An independent copy, safe for skinned meshes and their skeletons. */
export function instantiate(model) {
  const root = cloneSkinned(model.scene);
  // Cloned materials so one player's team colour can't bleed into everyone else's.
  root.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    node.material = Array.isArray(node.material)
      ? node.material.map((m) => m.clone())
      : node.material.clone();
  });
  return root;
}

/** Uniform scale that makes a model exactly `targetHeight` tall. */
export function scaleToHeight(object, targetHeight) {
  const box = new THREE.Box3().setFromObject(object);
  const height = box.max.y - box.min.y;
  if (height <= 0) return 1;
  const scale = targetHeight / height;
  object.scale.setScalar(scale);
  return scale;
}

/** Longest horizontal dimension, used to point a gun down its own barrel. */
export function measure(object) {
  const box = new THREE.Box3().setFromObject(object);
  return {
    size: box.getSize(new THREE.Vector3()),
    center: box.getCenter(new THREE.Vector3()),
    box,
  };
}
