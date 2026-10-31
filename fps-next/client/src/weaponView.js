// First-person weapon models, tracers and impact effects.
//
// Every gun exists twice: as boxes built in code, and as a glTF model fetched at
// runtime. The boxes are what you see until the model arrives, and what you keep
// if it never does. What actually sells a shooter isn't polygon count anyway,
// it's the motion — the kick when you fire, the sway when you turn, the way the
// gun settles when you stop — and all of that is applied to the group both
// versions live in, so it works either way.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getWeapon, ALL_WEAPON_IDS } from '@shared/weapons.js';
import { loadModel, instantiate } from './models.js';
import { createSupplementalWeaponRig, poseSupplementalWeaponRig } from './weaponMechanisms.js';
import { createFirstPersonHandRig, poseFirstPersonHandRig } from './weaponHands.js';
import { createSkinnedWeaponHandRig, poseSkinnedWeaponHandRig } from './skinnedWeaponHands.js';
import { SOURCE_WEAPON_RIGS, createSourceWeaponRig, poseSourceWeaponRig } from './sourceWeaponRig.js';
import { finishFirstPersonWeapon } from './weaponFinishes.js';

// Where each weapon's model comes from, driven off the `model` field in the
// weapon table so adding a gun is one edit rather than three.
//
// Two packs, two conventions, and neither is guessable from the geometry:
//   glTF (Toon Shooter kit) — guns lie along -X, the knife points +Y
//   OBJ  (Quaternius pack)  — guns lie along +X
// Getting the sign wrong points the barrel at your own eye, so it's declared.
const MODEL_SOURCES = {
  gltf: { dir: 'models/guns', ext: 'gltf', forward: '-x' },
  obj: { dir: 'models/guns-obj', ext: 'obj', forward: '+x' },
  fbx: { dir: 'models/guns-real', ext: 'fbx', forward: '-z' },
  glb: { dir: 'models/characters', ext: 'glb', forward: '-z' },
  cc0gun: { dir: 'models/guns-real', ext: 'glb', forward: '+z' },
};

/**
 * The box shapes are the fallback for when a model doesn't download. There are
 * seventeen guns and eight hand-built shapes, so a gun without its own borrows
 * the one for its type — a new shotgun looks like the shotgun rather than like
 * nothing at all. Means adding a weapon needs no entry here.
 */
const TYPE_ARCHETYPE = {
  rifle: 'rifle',
  smg: 'smg',
  shotgun: 'shotgun',
  sniper: 'sniper',
  lmg: 'lmg',
  pistol: 'pistol',
  melee: 'knife',
};

function archetypeFor(weaponId) {
  if (SHAPES[weaponId]) return weaponId;
  return TYPE_ARCHETYPE[getWeapon(weaponId).type] ?? 'rifle';
}

function shapeFor(weaponId) {
  return SHAPES[archetypeFor(weaponId)];
}

function muzzleFor(weaponId) {
  return MUZZLE[archetypeFor(weaponId)] ?? MUZZLE.rifle;
}

/** `model: 'obj:AssaultRifle_1'` -> a url and the axis it was modelled along. */
export function modelSpecFor(weaponId) {
  const spec = getWeapon(weaponId).model;
  if (!spec) return null;
  const [kind, file] = spec.split(':');
  const source = MODEL_SOURCES[kind];
  if (!source || !file) return null;
  // The knife is the one model in either pack that stands upright.
  const forward = file.startsWith('Knife') ? '+y' : source.forward;
  return { url: `${source.dir}/${file}.${source.ext}`, forward };
}

// Each part is [x, y, z, w, h, d, colorMultiplier, part?]. Local space: the gun
// points down -Z, like the camera.
//
// The optional `part` tag marks a piece the reload animation moves: 'mag' for a
// detachable magazine, 'pump' for the shotgun's fore-end, 'bolt' for the sniper.
const SHAPES = {
  rifle: [
    [0, 0, -0.1, 0.09, 0.12, 0.5, 1.0], // receiver
    [0, -0.12, -0.02, 0.07, 0.16, 0.1, 0.8, 'mag'],
    [0, 0.005, -0.42, 0.045, 0.045, 0.34, 0.85], // barrel
    [0, 0.09, -0.12, 0.035, 0.05, 0.16, 0.7], // carry handle
    [0, -0.02, 0.19, 0.07, 0.11, 0.2, 0.75], // stock
    [0, -0.09, -0.26, 0.05, 0.1, 0.13, 0.8], // foregrip
  ],
  smg: [
    [0, 0, -0.08, 0.085, 0.11, 0.34, 1.0],
    [0, -0.13, -0.01, 0.055, 0.18, 0.08, 0.8, 'mag'],
    [0, 0.005, -0.31, 0.04, 0.04, 0.22, 0.85],
    [0, 0.075, -0.1, 0.03, 0.035, 0.12, 0.7],
    [0, -0.04, 0.13, 0.05, 0.07, 0.14, 0.75],
  ],
  pistol: [
    [0, 0, -0.06, 0.055, 0.1, 0.22, 1.0],
    [0, -0.11, 0.02, 0.05, 0.15, 0.07, 0.8, 'mag'],
    [0, 0.005, -0.2, 0.03, 0.03, 0.09, 0.85],
  ],
  shotgun: [
    [0, 0, -0.1, 0.085, 0.1, 0.44, 1.0],
    [0, 0.005, -0.46, 0.05, 0.05, 0.4, 0.85], // long barrel
    [0, -0.055, -0.4, 0.045, 0.045, 0.3, 0.7], // tube magazine
    [0, -0.03, 0.18, 0.075, 0.1, 0.22, 0.75],
    [0, -0.085, -0.28, 0.06, 0.07, 0.16, 0.65, 'pump'],
  ],
  sniper: [
    [0, 0, -0.12, 0.08, 0.11, 0.56, 1.0],
    [0, 0.005, -0.56, 0.042, 0.042, 0.42, 0.85],
    [0, 0.1, -0.16, 0.05, 0.05, 0.3, 0.55], // scope tube
    [0, 0.1, -0.31, 0.07, 0.07, 0.05, 0.45], // objective lens
    [0, -0.04, 0.22, 0.075, 0.12, 0.28, 0.75],
    [0, -0.11, -0.02, 0.055, 0.12, 0.07, 0.8, 'mag'],
    [0.055, 0.045, 0.02, 0.03, 0.03, 0.1, 0.6, 'bolt'],
  ],
  lmg: [
    [0, 0, -0.08, 0.1, 0.13, 0.54, 1.0], // receiver
    [0, -0.14, -0.04, 0.11, 0.19, 0.2, 0.8, 'mag'], // belt box
    [0, 0.01, -0.46, 0.05, 0.05, 0.42, 0.85], // heavy barrel
    [0, 0.085, -0.5, 0.05, 0.035, 0.12, 0.7], // front sight
    [0, -0.03, 0.21, 0.08, 0.12, 0.24, 0.75], // stock
    [0, -0.12, -0.52, 0.04, 0.16, 0.04, 0.6], // bipod leg
    [0, 0.085, -0.1, 0.04, 0.04, 0.2, 0.7], // top rail
  ],
  dmr: [
    [0, 0, -0.11, 0.085, 0.115, 0.52, 1.0],
    [0, -0.12, -0.02, 0.06, 0.15, 0.1, 0.8, 'mag'],
    [0, 0.005, -0.5, 0.04, 0.04, 0.36, 0.85],
    [0, 0.095, -0.14, 0.045, 0.05, 0.24, 0.55], // low-profile scope
    [0, 0.095, -0.27, 0.06, 0.06, 0.04, 0.45],
    [0, -0.025, 0.2, 0.075, 0.11, 0.22, 0.75],
    [0, -0.085, -0.3, 0.05, 0.09, 0.14, 0.7], // handguard
  ],
  knife: [
    [0, -0.02, -0.16, 0.022, 0.075, 0.3, 1.0], // blade
    [0, -0.05, 0.04, 0.045, 0.055, 0.14, 0.5], // grip
  ],
};

// Where the barrel tip sits, for muzzle flash placement.
const MUZZLE = {
  rifle: [0, 0.005, -0.6],
  smg: [0, 0.005, -0.43],
  pistol: [0, 0.005, -0.25],
  shotgun: [0, 0.005, -0.67],
  sniper: [0, 0.005, -0.78],
  lmg: [0, 0.01, -0.68],
  dmr: [0, 0.005, -0.69],
  knife: [0, 0, -0.3],
};

// A proper lower-right shoulder pose: the stock stays near the player while the
// barrel angles inward toward the crosshair. Long guns used to be pushed so far
// down -Z that only a thin, end-on silhouette was visible.
const HIP = new THREE.Vector3(0.1, -0.24, -1.0);
// Aimed: centred horizontally but sitting LOW, so the receiver occupies the
// bottom of the frame and the crosshair looks over the top of it. Putting the
// gun's centreline on the crosshair (which is what "align the sights" naively
// suggests) parks the receiver directly over whatever you're shooting at.
const ADS = new THREE.Vector3(0.0, -0.19, -0.9);
// Slightly larger than the authored silhouette without swallowing the
// crosshair. Hip fire remains shoulder-offset; ADS alone moves to x=0.
const VIEW_SCALE = 1.1;
// Shrink a little while aimed, so it intrudes even less.
const ADS_SCALE = 0.9;
// Imported models vary wildly in height and bulk even after being fitted to
// the procedural weapon's length. These values normalize their first-person
// screen footprint while preserving the intended pistol/SMG/rifle hierarchy.
const WEAPON_VIEW_SCALE = {
  pistol: 1.06,
  revolver: 1.06,
  machinepistol: 1.04,
  smg: 1.03,
  smg_compact: 1.05,
  smg_heavy: 1.02,
  rifle: 0.94,
  carbine: 1.04,
  bullpup: 1.03,
  shotgun: 1.02,
  sawnoff: 1.06,
  autoshotgun: 1.02,
  sniper: 0.86,
  dmr: 1.03,
  antimateriel: 1.02,
  lmg: 1.01,
  knife: 1.1,
};
// Point almost straight into the scene. The slight inward angle only brings the
// muzzle onto the crosshair; it is deliberately far below the old broad
// three-quarter pose that showed the gun side-on across the screen.
const BASE_YAW = 0.08;
const WEAPON_POSE_YAW = {
  pistol: 0.07,
  revolver: 0.07,
  machinepistol: 0.08,
  shotgun: 0.075,
  autoshotgun: 0.075,
  dmr: 0.075,
  sniper: 0.07,
  antimateriel: 0.065,
  lmg: 0.075,
};
// Every source pack uses a different unit scale. First-person guns are fitted to
// a real silhouette length, uniformly, so a scope stays round and a stock does
// not turn into a pancake.
const MODEL_LENGTH = {
  pistol: 0.38,
  revolver: 0.42,
  machinepistol: 0.44,
  smg: 0.64,
  smg_compact: 0.6,
  smg_heavy: 0.69,
  rifle: 1.0,
  carbine: 0.9,
  bullpup: 0.88,
  shotgun: 1.05,
  sawnoff: 0.7,
  autoshotgun: 0.96,
  sniper: 1.25,
  dmr: 1.08,
  antimateriel: 1.34,
  lmg: 1.05,
  knife: 0.46,
};
const WEAPON_HIP_OFFSET = {
  pistol: [0.025, 0.02, 0.08],
  revolver: [0.025, 0.015, 0.07],
  machinepistol: [0.02, 0.01, 0.04],
  rifle: [0.065, 0, -0.08],
  carbine: [0.015, 0, -0.06],
  bullpup: [0.015, 0, -0.06],
  sawnoff: [0.01, 0.015, -0.04],
  shotgun: [-0.025, 0.035, -0.16],
  autoshotgun: [-0.025, 0.03, -0.14],
  // Long optics sit low and to the right, leaving the centre reticle clear.
  sniper: [0.145, -0.04, -0.2],
  dmr: [0.01, 0.035, -0.18],
  antimateriel: [0.02, 0.035, -0.3],
  knife: [0.10, -0.045, 0],
  lmg: [-0.035, 0.025, -0.17],
};
// A reload needs to expose the receiver and the moving source mechanism.
// Compact guns, especially the cylinder and break-action barrels, otherwise
// disappear under the bottom edge of the 50-degree first-person camera.
const RELOAD_VIEW_LIFT = Object.freeze({ revolver: 0.055, sawnoff: 0.055 });
// The CC0 SniperRifle_1 MTL uses flat diffuse values. Under our dedicated
// first-person studio lights, its original lightness lift makes the entire gun
// almost white. Keep the distinct authored parts, with darker sRGB gunmetal,
// matte olive furniture and glass that reads as a lens instead of a neon cap.
const SNIPER_VIEW_COLORS = {
  Black: 0x161b1f,
  DarkMetal: 0x30363a,
  Glass: 0x0b2135,
  Green: 0x3f5139,
  Grey: 0x525a5f,
};
const BASE_PITCH = 0.02;

// The viewmodel gets its own scene and camera, rendered as a second pass on top
// of the world. Three reasons, all of which bite you if you parent the gun to
// the main camera instead:
//   - a 110° world FOV distorts a gun held 40cm from your face into a canoe;
//     a fixed 50° view FOV keeps it looking the same at any FOV setting
//   - it can never clip through a wall you're standing against
//   - it needs its own lighting, not the map's (a gun in shadow reads as a bug)
const VIEW_FOV = 50;

export function createWeaponView(renderer) {
  const scene = new THREE.Scene();
  // Dedicated HDR-like reflection lighting reveals the metal surfaces of the
  // detailed gun while the map continues using its inexpensive world lighting.
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(room, 0.05).texture;
  room.dispose();
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(
    VIEW_FOV,
    window.innerWidth / window.innerHeight,
    0.01,
    5,
  );
  scene.add(camera);

  // Fixed studio lighting so the gun reads clearly on every map.
  scene.add(new THREE.HemisphereLight(0xecf5f2, 0x292b31, 0.9));
  // Flat dark MTL colours need a little frontal fill. Without it, faces turned
  // away from the key light collapse to black even though their material colour
  // loaded correctly.
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const key = new THREE.DirectionalLight(0xffefd0, 1.45);
  key.position.set(-0.6, 1, 0.75);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xaed8ff, 0.55);
  rim.position.set(1, -0.3, -0.6);
  scene.add(rim);

  const root = new THREE.Group();
  scene.add(root);

  const models = {};
  for (const id of ALL_WEAPON_IDS) {
    const parts = shapeFor(id);
    const group = new THREE.Group();
    const base = new THREE.Color(getWeapon(id).viewColor);
    const moving = {};

    for (const [x, y, z, w, h, d, mult, part] of parts) {
      const mat = new THREE.MeshLambertMaterial({
        // Lifted well above the stored colour: gunmetal that reads correctly on
        // a wall in daylight reads as a black hole in the corner of the screen.
        color: base.clone().multiplyScalar(mult * 2.2),
        flatShading: true,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      group.add(mesh);
      if (part) {
        // Remember where it belongs, so the animation is always relative to rest.
        moving[part] = { mesh, rest: mesh.position.clone() };
      }
    }

    // A tight inner flash plus an elongated burst, visible for only a frame or two.
    const flash = new THREE.Group();
    const innerFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.043, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xfff5b8,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    flash.add(innerFlash);
    const flare = new THREE.Mesh(
      new THREE.ConeGeometry(0.063, 0.24, 5),
      new THREE.MeshBasicMaterial({
        color: 0xffa735,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    flare.rotation.x = -Math.PI / 2;
    flare.position.z = -0.095;
    flash.add(flare);
    flash.position.set(...muzzleFor(id));
    flash.visible = false;
    group.add(flash);

    group.visible = false;
    root.add(group);
    // The volume the boxes occupy, computed straight from the numbers above
    // rather than from the scene graph. It has to be in the group's own local
    // space, and asking three for a bounding box would give world space — the
    // root's scale and the group's per-frame position baked in.
    const bounds = new THREE.Box3();
    for (const [x, y, z, w, h, d] of parts) {
      bounds.expandByPoint(new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2));
      bounds.expandByPoint(new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2));
    }

    models[id] = {
      group,
      flash,
      moving,
      muzzle: new THREE.Vector3(...muzzleFor(id)),
      // The boxes, so a loaded model can take their place, and the space they
      // occupy, which is what it gets fitted to.
      boxes: group.children.filter((c) => c !== flash),
      bounds,
      usingModel: false,
    };
    models[id].handRig = createFirstPersonHandRig(group, getWeapon(id));
  }

  loadGunModels(models);

  return {
    scene,
    camera,
    root,
    models,
    currentId: null,
    // Animation state
    kick: 0,
    kickVel: 0,
    sway: new THREE.Vector2(),
    swayTarget: new THREE.Vector2(),
    flashUntil: 0,
    lowerAmount: 0,
    sprintBlend: 0,
    slideBlend: 0,
    shotPunch: 0,
    // Reuse the same vector each frame: no temporary Vector3 garbage while
    // blending hip, ADS, sprint, slide and recoil poses at 60+ FPS.
    posePosition: new THREE.Vector3(),
  };
}

// Rotations that bring a model's authored forward axis round to -Z, which is the
// direction the camera looks. A missing entry here doesn't throw — it silently
// leaves the gun lying sideways, and because fitGunModel then scales by the depth
// of a model that has almost none, the result is a gun three metres wide sitting
// off the edge of the screen. Which is exactly what the Quaternius pack did until
// '+x' was added.
const FORWARD_ROTATION = {
  '+z': (o) => {
    o.rotation.y = Math.PI;
  },
  '-x': (o) => {
    o.rotation.y = -Math.PI / 2;
  },
  '+x': (o) => {
    o.rotation.y = Math.PI / 2;
  },
  '+y': (o) => {
    o.rotation.x = -Math.PI / 2;
  },
};

/**
 * Fit a loaded gun into the space its box version occupies, then swap them.
 *
 * Matching the box's bounding box rather than picking a scale by eye is what
 * makes this safe: the hip and aimed poses, the muzzle offset, the reload dip and
 * the walking bob are all tuned against that volume, so a model that fills the
 * same volume inherits every one of them without a single number changing.
 */
function fitGunModel(model, loaded, forward, weaponId, withArms = false) {
  const orientation = new THREE.Group();
  orientation.add(instantiate(loaded));
  FORWARD_ROTATION[forward]?.(orientation);
  // Scaling belongs outside the orientation transform. If scale.z is placed on
  // the rotated node, a model authored along X gets stretched sideways instead
  // of down the barrel after that X axis is turned toward camera -Z.
  const pivot = new THREE.Group();
  pivot.add(orientation);

  // Detached, so its world matrix is its local one and the box comes back in the
  // space it will be added into.
  pivot.updateMatrixWorld(true);
  const gunBody = withArms ? pivot.getObjectByName('Body') : null;
  if (withArms && !gunBody) return null;
  const current = new THREE.Box3().setFromObject(gunBody ?? pivot);

  const currentSize = current.getSize(new THREE.Vector3());
  if (currentSize.z <= 0) return null;

  // A gun should be longer than it is wide once it's facing the right way. If it
  // isn't, its forward axis was never rotated — better to keep the boxes than to
  // scale a sideways model by its non-existent depth.
  if (currentSize.z < Math.max(currentSize.x, currentSize.y) * 0.8) {
    console.warn('[weaponView] model looks mis-oriented; keeping the box version');
    return null;
  }

  pivot.scale.setScalar((MODEL_LENGTH[weaponId] ?? model.bounds.getSize(new THREE.Vector3()).z) / currentSize.z);
  pivot.updateMatrixWorld(true);

  const scaled = new THREE.Box3().setFromObject(gunBody ?? pivot);
  const targetCentre = model.bounds.getCenter(new THREE.Vector3());
  pivot.position.sub(scaled.getCenter(new THREE.Vector3())).add(targetCentre);
  // This first-person rig includes both forearms, which should enter the
  // bottom edge of the frame rather than ending abruptly halfway up it.
  if (withArms) pivot.position.y -= 0.18;

  // Preserve authored colour separation but stop near-black OBJ materials from
  // losing all detail in the corner of the screen. Lifting HSL lightness keeps
  // walnut brown, blued steel and polymer grey distinct; blending every dark
  // part toward the same green-grey used to make the entire gun look moulded
  // from one piece of plastic.
  pivot.traverse((node) => {
    if (!node.isMesh) return;
    // The source GLB includes a spare magazine staged below the rifle for its
    // original reload rig. Without that rig it floats in the player's view.
    // Hide only the first-person instance; the lobby asset stays untouched.
    if (weaponId === 'rifle' && /SpareMagazine/i.test(node.name)) {
      node.visible = false;
      return;
    }
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material?.color) continue;
      if (weaponId === 'sniper' && SNIPER_VIEW_COLORS[material.name] !== undefined) {
        material.color.setHex(SNIPER_VIEW_COLORS[material.name]);
      }
      // The imported rifle is PBR-textured. A small neutral tint keeps its
      // highlights and normal detail, but avoids the washed-out gray look
      // under the separate, bright viewmodel lights.
      if (weaponId === 'rifle' && material.map && material.isMeshStandardMaterial && material.name !== 'arms') {
        material.color.multiplyScalar(withArms ? 0.46 : 0.72);
        material.envMapIntensity = 0.45;
      }
      const hsl = {};
      material.color.getHSL(hsl);
      if (weaponId !== 'sniper' && hsl.l < 0.18) material.color.setHSL(hsl.h, hsl.s, 0.18);
      if ('emissive' in material) {
        material.emissive = material.color.clone().multiplyScalar(0.025);
        material.emissiveIntensity = 1;
      }
    }
  });

  return pivot;
}

function createKnifeHand() {
  const hand = new THREE.Group();
  const glove = new THREE.MeshStandardMaterial({
    color: 0x3a4140, roughness: 0.93, flatShading: true,
  });
  const seam = new THREE.MeshStandardMaterial({
    color: 0x1d282a, roughness: 0.86, flatShading: true,
  });
  const armor = new THREE.MeshStandardMaterial({
    color: 0x697575, roughness: 0.74, metalness: 0.12, flatShading: true,
  });
  const part = (geometry, material, position, rotation) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    hand.add(mesh);
  };
  // The wrist disappears below the frame while the palm clasps the grip.
  part(new THREE.CylinderGeometry(0.068, 0.092, 0.27, 9), glove,
    [0.03, -0.092, 0.24], [Math.PI / 2.65, 0, -0.13]);
  part(new THREE.CylinderGeometry(0.088, 0.084, 0.065, 9), seam,
    [0.027, -0.092, 0.145], [Math.PI / 2.7, 0, -0.1]);
  part(new THREE.SphereGeometry(0.083, 10, 8), glove,
    [0.008, -0.052, 0.087]);
  part(new THREE.BoxGeometry(0.11, 0.017, 0.084), armor,
    [0.006, 0.002, 0.083], [-0.16, 0, 0]);
  // Four curled fingers and a separate thumb read as a real grip silhouette.
  for (let index = 0; index < 4; index++) {
    const x = -0.058 + index * 0.037;
    part(new THREE.CapsuleGeometry(0.019, 0.038, 4, 6), glove,
      [x, -0.028, 0.012 - index * 0.006], [Math.PI / 2.2, 0, -0.18]);
    part(new THREE.SphereGeometry(0.014, 7, 5), armor,
      [x, 0.005, 0.03 - index * 0.006]);
  }
  part(new THREE.CapsuleGeometry(0.029, 0.063, 5, 7), glove,
    [0.088, -0.069, 0.045], [-0.2, 0, -Math.PI / 3.6]);
  // This is a separate procedural arm, not part of the CC0 knife's fitted
  // bounding box. Keep it at viewmodel size and enter from the lower-right
  // instead of bringing the forearm close enough to fill the screen.
  hand.scale.setScalar(0.62);
  hand.position.set(0.055, -0.075, -0.055);
  return hand;
}

// Drive the CC0 chassis rifle's real moving geometry with its own glTF tracks.
// Each viewmodel is an independent clone; the cached source and Arsenal preview
// never change when the player fires, reloads, or swaps weapons.
export function createChassisSniperRig(fitted, animations) {
  const magazine = fitted.getObjectByName('magazine');
  const bolt = fitted.getObjectByName('bolt');
  if (!magazine || !bolt) return null;

  const positions = {};
  for (const [name, part] of [
    ['magazine-open', 'magazine'], ['magazine-close', 'magazine'],
    ['bolt-open', 'bolt'], ['bolt-close', 'bolt'],
  ]) {
    const clip = animations.find((animation) => animation.name === name);
    const track = clip?.tracks.find((candidate) => candidate.name === `${part}.position`);
    if (!track || !clip?.duration) return null;
    const interpolant = track.createInterpolant();
    positions[name] = (fraction) => interpolant.evaluate(
      THREE.MathUtils.clamp(fraction, 0, 1) * clip.duration,
    );
  }

  return {
    magazine,
    bolt,
    magRest: magazine.position.clone(),
    boltRest: bolt.position.clone(),
    sample(name, fraction) {
      const target = name.startsWith('magazine') ? magazine : bolt;
      target.position.fromArray(positions[name](fraction));
    },
  };
}

export function poseChassisSniper(model, progress, now) {
  const rig = model.sniperRig;
  if (!rig) return;
  rig.magazine.position.copy(rig.magRest);
  rig.bolt.position.copy(rig.boltRest);

  if (progress > 0 && progress < 1) {
    // The magazine is withdrawn, replaced and seated before the bolt cycles.
    // Both sequences come directly from the GLB animation tracks, resampled to
    // the actual game weapon's 2.8-second reload time.
    if (progress >= 0.13 && progress < 0.36) {
      rig.sample('magazine-open', (progress - 0.13) / 0.23);
    } else if (progress >= 0.36 && progress < 0.61) {
      rig.sample('magazine-open', 1);
    } else if (progress >= 0.61 && progress < 0.78) {
      rig.sample('magazine-close', (progress - 0.61) / 0.17);
    }
    if (progress >= 0.78 && progress < 0.88) {
      rig.sample('bolt-open', (progress - 0.78) / 0.10);
    } else if (progress >= 0.88 && progress < 0.90) {
      rig.sample('bolt-open', 1);
    } else if (progress >= 0.90 && progress < 0.98) {
      rig.sample('bolt-close', (progress - 0.90) / 0.08);
    }
    return;
  }

  // Single-action bolt cycle after a shot. It cannot keep running through an
  // interrupted reload because every frame starts from the authored rest pose.
  const elapsed = now - model.sniperShotAt;
  if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 720) {
    if (elapsed < 240) rig.sample('bolt-open', elapsed / 240);
    else if (elapsed < 320) rig.sample('bolt-open', 1);
    else rig.sample('bolt-close', (elapsed - 320) / 400);
  }
}

// The first-person M4A1 exposes independently poseable magazine and charging
// handle nodes. Store author-space rest poses on the fitted clone so interrupting
// a reload or switching guns never leaves a displaced mechanical part.
export function createTacticalRifleRig(fitted) {
  const magazine = fitted.getObjectByName('Magazine');
  const handle = fitted.getObjectByName('ChargingHandle');
  if (!magazine && !handle) return null;
  return {
    magazine,
    handle,
    magRest: magazine?.position.clone(),
    magRotation: magazine?.rotation.clone(),
    handleRest: handle?.position.clone(),
  };
}

export function poseTacticalRifle(model, progress, now) {
  const rig = model.rifleRig;
  if (!rig) return;
  if (rig.magazine) {
    rig.magazine.position.copy(rig.magRest);
    rig.magazine.rotation.copy(rig.magRotation);
  }
  if (rig.handle) rig.handle.position.copy(rig.handleRest);

  const smooth = (start, end, value) => THREE.MathUtils.smoothstep(value, start, end);
  if (progress > 0 && progress < 1) {
    if (rig.magazine) {
      const release = smooth(0.16, 0.38, progress);
      const insert = smooth(0.54, 0.81, progress);
      const displacement = release * (1 - insert);
      rig.magazine.position.y -= displacement * 0.18;
      rig.magazine.rotation.z += displacement * 0.18;
    }
    if (rig.handle) {
      const pull = smooth(0.84, 0.90, progress) - smooth(0.92, 0.98, progress);
      rig.handle.position.z += pull * 0.065;
    }
    return;
  }
  // Brief charging-handle movement on firing; the rest pose always wins.
  const age = now - model.rifleShotAt;
  if (rig.handle && Number.isFinite(age) && age >= 0 && age < 140) {
    rig.handle.position.z += Math.sin(age / 140 * Math.PI) * 0.045;
  }
}

function loadGunModels(models) {
  const debugModels = new URLSearchParams(window.location.search).has('debugAssets');
  // Escape hatch for comparing the original (no-arms) rifle in visual QA.
  const legacyRifle = new URLSearchParams(window.location.search).has('legacyRifle');
  const diagnostics = debugModels ? (window.__arenaWeaponModels = {}) : null;
  for (const id of Object.keys(models)) {
    const spec = modelSpecFor(id);
    const model = models[id];
    if (!spec || !model) continue;
    const { url, forward } = spec;

    if (diagnostics) diagnostics[id] = { status: 'loading' };
    // The realistic rifle has a second independently licensed asset to use if
    // the GLB is missing or authored in an unexpected orientation. All weapons
    // retain their procedural shape as the final fallback.
    const candidates = id === 'rifle'
      ? [...(!legacyRifle ? [{ url: 'models/fp/m4a1.glb', forward: '-z', withArms: true }] : []),
        { url, forward }, { url: 'models/guns-real/M4A1.fbx', forward: '-z' }]
      : id === 'sniper'
        ? [{ url, forward }, { url: 'models/guns-real/BoltSniper_CC0.glb', forward: '+z' },
          { url: 'models/guns-obj/SniperRifle_1.obj', forward: '+x' }]
        : SOURCE_WEAPON_RIGS[id]
          ? [{ url: url.replace(/\.(obj|gltf)$/i, '_Rigged.$1'), forward, separatedSource: true },
            { url, forward }]
          : [{ url, forward }];
    (async () => {
      for (const candidate of candidates) {
        const loaded = await loadModel(candidate.url);
        if (!loaded) continue;
        const fitted = fitGunModel(model, loaded, candidate.forward, id, candidate.withArms);
        if (!fitted) continue;
        // The untextured Quaternius/Toon packs were almost white under the
        // bright viewmodel lights. Preserve each genuine source part while
        // giving metal, polymer and wood separate low-glare PBR finishes.
        if (SOURCE_WEAPON_RIGS[id]) finishFirstPersonWeapon(fitted);
        if (candidate.separatedSource) {
          model.sourceRig = createSourceWeaponRig(fitted, id);
          // An invalid/incomplete generated asset may still load as geometry;
          // require all the named moving meshes before accepting it.
          if (!model.sourceRig) continue;
        }
        // Raise the blade to show its profile rather than looking straight down
        // the edge. This is an authored first-person pose, independent of the
        // rotation needed to convert the GLB's +Z axis to our -Z convention.
        if (id === 'knife') fitted.rotation.set(0.62, 0.28, -0.12);
        if (id === 'sniper' && /ChassisSniper_CC0\.glb$/i.test(candidate.url)) {
          model.sniperRig = createChassisSniperRig(fitted, loaded.animations);
        }
        if (id === 'rifle') model.rifleRig = createTacticalRifleRig(fitted);
        model.group.add(fitted);
        if (!model.rifleRig && !model.sniperRig && !model.sourceRig) {
          model.supplementalRig = createSupplementalWeaponRig(model, getWeapon(id));
        }
        // Each gun receives a separately cloned version of the source's actual
        // 68-bone skinned arms. On the M4A1, use the embedded skeleton to avoid
        // duplicate arms; on other guns, detach its gun geometry and retarget
        // the hands via the explicitly authored per-weapon grip positions.
        if (candidate.withArms) {
          model.skinnedRig = createSkinnedWeaponHandRig(fitted, id, model.group, false);
        } else {
          const armSource = await loadModel('models/fp/m4a1.glb');
          if (armSource) {
            const arms = fitGunModel(model, armSource, '-z', 'rifle', true);
            if (arms) {
              model.group.add(arms);
              model.skinnedRig = createSkinnedWeaponHandRig(arms, id, model.group);
              if (!model.skinnedRig) model.group.remove(arms);
            }
          }
        }
        model.handRig.root.visible = !model.skinnedRig;
        // Keep the old boxes available to drive the reload animation.
        for (const box of model.boxes) box.visible = false;
        model.usingModel = true;
        if (diagnostics) {
          let meshes = 0;
          let texturedMeshes = 0;
          let hiddenSpareMagazines = 0;
          fitted.traverse((node) => {
            if (!node.isMesh) return;
            meshes++;
            if (/SpareMagazine/i.test(node.name) && !node.visible) hiddenSpareMagazines++;
            if ((Array.isArray(node.material) ? node.material : [node.material]).some((m) => m?.map)) {
              texturedMeshes++;
            }
          });
          diagnostics[id] = {
            status: 'ready', source: candidate.url, meshes, texturedMeshes, hiddenSpareMagazines,
            authoredSniperRig: Boolean(model.sniperRig),
            tacticalRifleRig: Boolean(model.rifleRig),
            sourceSeparatedParts: model.sourceRig?.separatedParts ?? [],
            supplementalMechanism: model.supplementalRig?.kind ?? null,
            proceduralHands: model.handRig.root.visible,
            skinnedHands: Boolean(model.skinnedRig),
            skinnedBones: model.skinnedRig?.mesh.skeleton.bones.length ?? 0,
            handAnimation: model.skinnedRig ? 'weapon-specific-keyframes' : 'procedural-fallback',
          };
          // Keep live THREE references inspectable from DevTools without trying
          // to serialize their circular scene graph in a browser smoke result.
          if (model.sniperRig) {
            Object.defineProperty(diagnostics[id], 'rig', {
              value: model.sniperRig, enumerable: false,
            });
          }
          if (candidate.withArms) {
            Object.defineProperty(diagnostics[id], 'viewRoot', {
              value: fitted, enumerable: false,
            });
          }
        }
        return;
      }
      if (diagnostics) diagnostics[id] = { status: 'fallback' };
    })().catch((error) => {
      console.warn(`[weaponView] Could not fit ${id}:`, error);
      if (diagnostics) diagnostics[id] = { status: 'fallback' };
    });
  }
}

/** Second render pass, on top of the world, sharing the depth-cleared buffer. */
export function renderWeaponView(view, renderer) {
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(view.scene, view.camera);
  renderer.autoClear = true;
}

export function resizeWeaponView(view) {
  view.camera.aspect = window.innerWidth / window.innerHeight;
  view.camera.updateProjectionMatrix();
}

export function setViewWeapon(view, id) {
  if (view.currentId === id) return;
  if (view.currentId && view.models[view.currentId]) {
    view.models[view.currentId].group.visible = false;
  }
  view.currentId = id;
  const m = view.models[id];
  if (m) m.group.visible = true;
  // A switch reads as the new gun being raised into place.
  view.lowerAmount = 1;
  view.shotPunch = 0;
}

/** Trigger the local cosmetic weapon inspection on I (no network action). */
export function inspectViewWeapon(view, now) {
  const model = view.models[view.currentId];
  if (!model || !model.skinnedRig) return false;
  model.inspectStartedAt = now;
  return true;
}

export function weaponViewFire(view, now, weapon) {
  view.kickVel -= 3.4 * (weapon.recoil.up / 1.4);
  view.shotPunch = 1;
  view.flashUntil = now + 38;
  const m = view.models[view.currentId];
  if (m) m.lastShotAt = now;
  if (m) m.inspectStartedAt = -Infinity;
  if (m && weapon.id === 'sniper') m.sniperShotAt = now;
  if (m && weapon.id === 'rifle') m.rifleShotAt = now;
  if (m && weapon.id !== 'knife') {
    m.flash.visible = true;
    m.flash.scale.setScalar(0.7 + Math.random() * 0.7);
    m.flash.rotation.z = Math.random() * Math.PI;
  }
}

const easeInOut = (t) => t * t * (3 - 2 * t);

/**
 * Pose the moving parts for a reload and return the offset to apply to the whole
 * gun. `progress` runs 0..1 across the weapon's reloadMs.
 *
 * Mag-fed weapons drop the magazine, bring a fresh one up and seat it. The
 * shotgun cycles its pump once per shell instead, and the sniper works its bolt
 * at the end. Parts always animate relative to their stored rest position, so an
 * interrupted reload can't leave a magazine hanging in mid-air.
 */
function poseReload(model, progress, weapon) {
  const moving = model.moving;
  for (const key in moving) {
    moving[key].mesh.position.copy(moving[key].rest);
    moving[key].mesh.rotation.set(0, 0, 0);
  }

  if (progress <= 0 || progress >= 1) return { drop: 0, roll: 0, yaw: 0 };

  // The gun dips and rolls over, so you're looking at the magazine well while
  // the hands work — and, usefully, so the reload physically gets out of the way
  // of the middle of the screen.
  const dip = Math.sin(Math.PI * progress);
  const pose = { drop: dip * 0.038, roll: dip * 0.32, yaw: dip * 0.16 };

  if (weapon.id === 'shotgun' && moving.pump) {
    const shells = Math.max(1, Math.min(8, weapon.mag));
    const cycle = (progress * shells) % 1;
    moving.pump.mesh.position.z = moving.pump.rest.z + Math.sin(cycle * Math.PI) * 0.11;
  } else if (moving.mag) {
    const mag = moving.mag;
    let dy = 0;
    let rot = 0;
    if (progress >= 0.2 && progress < 0.45) {
      const t = (progress - 0.2) / 0.25; // falls away
      dy = -easeInOut(t) * 0.3;
      rot = t * 0.55;
    } else if (progress >= 0.45 && progress < 0.72) {
      const t = (progress - 0.45) / 0.27; // fresh one comes up
      dy = -0.3 + easeInOut(t) * 0.3;
      rot = (1 - t) * 0.55;
    } else if (progress >= 0.72 && progress < 0.82) {
      const t = (progress - 0.72) / 0.1; // slap it home
      dy = -Math.sin(t * Math.PI) * 0.025;
    }
    mag.mesh.position.y = mag.rest.y + dy;
    mag.mesh.rotation.x = rot;
  }

  if (moving.bolt && progress > 0.8) {
    const t = (progress - 0.8) / 0.2;
    moving.bolt.mesh.position.z = moving.bolt.rest.z + Math.sin(t * Math.PI) * 0.09;
  }

  return pose;
}

function poseShotMechanism(model, now) {
  // Pump-action guns and fallback bolt actions still cycle mechanically when
  // their imported model cannot load. Loaded tactical M4A1/sniper rigs animate
  // their authored moving nodes separately.
  const elapsed = now - model.lastShotAt;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 430) return;
  const moving = model.moving;
  if (moving.pump) {
    const cycle = elapsed < 170
      ? elapsed / 170
      : 1 - Math.min(1, (elapsed - 170) / 260);
    moving.pump.mesh.position.z = moving.pump.rest.z + Math.sin(cycle * Math.PI / 2) * 0.13;
  }
  if (moving.bolt && !model.sniperRig) {
    const cycle = elapsed < 180 ? elapsed / 180 : Math.max(0, 1 - (elapsed - 180) / 250);
    moving.bolt.mesh.position.z = moving.bolt.rest.z + cycle * 0.09;
  }
}

export function updateWeaponView(view, dt, now, player, lookDelta) {
  const m = view.models[view.currentId];
  if (!m) return;
  const weapon = getWeapon(view.currentId);

  // ---- recoil kick: a spring back to rest ----
  view.kickVel += -view.kick * 220 * dt; // stiffness
  view.kickVel *= Math.max(0, 1 - 14 * dt); // damping
  view.kick += view.kickVel * dt;
  view.shotPunch = Math.max(0, view.shotPunch - dt * 12);

  const poseRate = Math.min(1, dt * 11);
  view.sprintBlend += ((player.sprinting ? 1 : 0) - view.sprintBlend) * poseRate;
  view.slideBlend += ((player.slideRemaining > 0 ? 1 : 0) - view.slideBlend) * poseRate;

  // ---- sway: the gun lags behind the camera when you turn ----
  view.swayTarget.set(
    THREE.MathUtils.clamp(-lookDelta.dx * 2.4, -0.06, 0.06),
    THREE.MathUtils.clamp(lookDelta.dy * 2.4, -0.05, 0.05),
  );
  view.sway.lerp(view.swayTarget, Math.min(1, 9 * dt));

  // ---- raise animation after a switch ----
  view.lowerAmount += (0 - view.lowerAmount) * Math.min(1, 7 * dt);

  // ---- reload ----
  const reloadMs = weapon.reloadMs || 1;
  // Diagnostic screenshots can freeze a cosmetic reload pose for inspection.
  // Vite removes this override from normal production builds.
  const reloadProgress = import.meta.env.VITE_VISUAL_DIAGNOSTICS === '1' &&
    Number.isFinite(view.diagnosticReloadProgress)
    ? THREE.MathUtils.clamp(view.diagnosticReloadProgress, 0, 1)
    : player.reloadingUntil > now ? 1 - (player.reloadingUntil - now) / reloadMs : 0;
  const reload = poseReload(m, reloadProgress, weapon);
  poseChassisSniper(m, reloadProgress, now);
  poseTacticalRifle(m, reloadProgress, now);
  poseSourceWeaponRig(m.sourceRig, reloadProgress, now, m.lastShotAt);
  poseSupplementalWeaponRig(m.supplementalRig, reloadProgress, now, m.lastShotAt, weapon.mag);
  if (m.skinnedRig) {
    const inspectAge = now - (m.inspectStartedAt ?? -Infinity);
    const inspectProgress = inspectAge >= 0 && inspectAge < 1350 ? inspectAge / 1350 : -1;
    poseSkinnedWeaponHandRig(m.skinnedRig, reloadProgress, now, m.lastShotAt,
      player.adsProgress, inspectProgress);
  } else {
    poseFirstPersonHandRig(m.handRig, reloadProgress, now, m.lastShotAt, m.sourceRig);
  }
  if (reloadProgress === 0) poseShotMechanism(m, now);

  // ---- position: hip vs aimed ----
  // Reloading pulls you out of the aimed pose, which is both how it looks in
  // every shooter and the reason the animation doesn't obscure your aim.
  const t = player.adsProgress * (1 - Math.min(1, reloadProgress * 2.2)) *
    (1 - view.slideBlend);
  const pos = view.posePosition.copy(HIP).lerp(ADS, t);
  const hipOffset = WEAPON_HIP_OFFSET[view.currentId];
  if (hipOffset) {
    pos.x += hipOffset[0] * (1 - t);
    pos.y += hipOffset[1] * (1 - t);
    pos.z += hipOffset[2] * (1 - t);
  }
  pos.x += view.sway.x * (1 - t * 0.75);
  pos.y += view.sway.y * (1 - t * 0.75);
  pos.y -= reload.drop;
  if (reloadProgress > 0 && reloadProgress < 1) {
    // Raise the gun during manipulation so the player can see the actual
    // cylinder / magazine / pump instead of a mostly empty screen.
    pos.y += Math.sin(Math.PI * reloadProgress) * (RELOAD_VIEW_LIFT[view.currentId] ?? 0.025);
  }
  // The weapon settles low while running and tucks closer to the chest on a
  // slide. The world camera, aiming ray and hit registration never move.
  const sprint = view.sprintBlend * (1 - view.slideBlend);
  pos.x += sprint * 0.085;
  pos.y -= sprint * 0.13 + view.slideBlend * 0.22;
  pos.z += sprint * 0.12 + view.slideBlend * 0.1;

  // Scale the weapon around its own pivot. Scaling `view.root` also scales HIP
  // and ADS — the gun and its distance from the camera change together, leaving
  // its apparent size almost identical. That made VIEW_SCALE a misleading no-op
  // and is why several detailed models filled far more of the screen than their
  // fallback shapes suggested.
  const modelScale = WEAPON_VIEW_SCALE[view.currentId] ?? 1;
  m.group.scale.setScalar((VIEW_SCALE + (ADS_SCALE - VIEW_SCALE) * t) * modelScale);

  // Walking bob, damped hard when aiming.
  const speed = Math.hypot(player.vel[0], player.vel[2]);
  if (player.onGround && speed > 0.7) {
    const bob = (1 - t * 0.8) * Math.min(speed / 9, 1) * 0.014;
    pos.x += Math.sin(player.bobPhase) * bob;
    pos.y += Math.abs(Math.cos(player.bobPhase)) * -bob;
  }

  pos.z += view.kick * 0.05;
  pos.z += view.shotPunch * 0.025;
  pos.y -= view.shotPunch * 0.009;
  pos.y += view.lowerAmount * -0.22;

  // Cosmetic knife slash on the first-person model; hit detection stays server-authoritative.
  const knifeAge = now - (m.lastShotAt ?? -Infinity);
  const knifeSwing = weapon.id === 'knife' && knifeAge >= 0 && knifeAge < 360
    ? Math.sin(Math.PI * knifeAge / 360) : 0;
  pos.x -= knifeSwing * 0.085;
  pos.z -= knifeSwing * 0.10;

  m.group.position.copy(pos);
  m.group.rotation.set(
    BASE_PITCH + view.kick * 0.09 + view.shotPunch * 0.075 + sprint * 0.22 - view.slideBlend * 0.08,
    (WEAPON_POSE_YAW[view.currentId] ?? BASE_YAW) * (1 - t) + reload.yaw + sprint * 0.18 + knifeSwing * 0.35,
    reload.roll - sprint * 0.22 - view.slideBlend * 0.1 - knifeSwing * 0.78,
  );

  // A scoped sniper hides the model entirely — you're looking down the optic, and
  // the scope overlay provides the reticle instead.
  const scoped = isScoped(view.currentId, player.adsProgress) && reloadProgress === 0;
  m.group.visible = !scoped && player.alive && !player.parachuting && player.vehicleId === null;

  if (now > view.flashUntil) m.flash.visible = false;
}

/** True when the view should switch to a scope overlay rather than a viewmodel. */
export function isScoped(weaponId, adsProgress) {
  return (weaponId === 'sniper' || weaponId === 'antimateriel') && adsProgress > 0.75;
}

/**
 * Muzzle position in *world* space, for spawning tracers from the barrel rather
 * than from the middle of your face.
 *
 * The viewmodel lives in its own scene whose camera sits at the origin, so a
 * position there is already camera-relative — pushing it through the world
 * camera's matrix lands it in the world.
 */
export function muzzleWorldPosition(view, worldCamera, out = new THREE.Vector3()) {
  const m = view.models[view.currentId];
  if (!m) return out.copy(worldCamera.position);
  out.copy(m.muzzle);
  m.group.updateWorldMatrix(true, false);
  m.group.localToWorld(out);
  worldCamera.updateMatrixWorld();
  return out.applyMatrix4(worldCamera.matrixWorld);
}

// ---------------------------------------------------------------------------
// Tracers
//
// A pool of thin stretched boxes. Pooled because a shotgun burst spawns eight
// at once and an SMG can spawn fifteen a second — allocating per shot would
// have the garbage collector stuttering the frame rate.
// ---------------------------------------------------------------------------

const TRACER_COUNT = 48;

export function createTracers(scene) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const pool = [];

  for (let i = 0; i < TRACER_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    pool.push({ mesh, mat, until: 0, life: 0 });
  }

  return { pool, next: 0 };
}

export function spawnTracer(tracers, from, to, color, now, thickness = 0.022) {
  const slot = tracers.pool[tracers.next];
  tracers.next = (tracers.next + 1) % tracers.pool.length;

  const a = new THREE.Vector3(from[0], from[1], from[2]);
  const b = new THREE.Vector3(to[0], to[1], to[2]);
  const dist = a.distanceTo(b);
  if (dist < 0.05) return;

  slot.mesh.position.copy(a).add(b).multiplyScalar(0.5);
  slot.mesh.scale.set(thickness, thickness, dist);
  slot.mesh.lookAt(b);
  slot.mat.color.setHex(color);
  slot.mat.opacity = 0.85;
  slot.life = 0.07;
  slot.until = now + slot.life * 1000;
  slot.mesh.visible = true;
}

export function updateTracers(tracers, now) {
  for (const slot of tracers.pool) {
    if (!slot.mesh.visible) continue;
    const remaining = (slot.until - now) / 1000;
    if (remaining <= 0) {
      slot.mesh.visible = false;
      slot.mat.opacity = 0;
      continue;
    }
    slot.mat.opacity = 0.85 * (remaining / slot.life);
  }
}

// ---------------------------------------------------------------------------
// Impacts
// ---------------------------------------------------------------------------

const IMPACT_COUNT = 32;
// Every material uses the same small pooled effect, but dust and sparks should
// have recognisably different colours, sizes and decay times. All are cosmetic.
const SURFACE_IMPACTS = Object.freeze({
  stone: { color: 0xd0c1ae, scale: 1.0, life: 175, opacity: 0.8 },
  metal: { color: 0xffd17c, scale: 0.78, life: 115, opacity: 1 },
  wood: { color: 0xb98a57, scale: 1.15, life: 215, opacity: 0.72 },
  dirt: { color: 0xb5a28a, scale: 1.65, life: 290, opacity: 0.52 },
});

export function createImpacts(scene) {
  const geo = new THREE.SphereGeometry(0.045, 6, 4);
  const sparkGeo = new THREE.BoxGeometry(0.014, 0.014, 0.18);
  const pool = [];
  for (let i = 0; i < IMPACT_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    // The two streaks are drawn only for metallic hits. Shared geometry and one
    // material per slot bound allocations even during sustained automatic fire.
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffe7ac, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sparks = new THREE.Group();
    for (const direction of [-1, 1]) {
      const streak = new THREE.Mesh(sparkGeo, sparkMat);
      streak.position.set(direction * 0.057, 0.026, direction * 0.015);
      streak.rotation.set(direction * 0.55, direction * 0.42, direction * 0.65);
      sparks.add(streak);
    }
    sparks.visible = false;
    scene.add(sparks);
    pool.push({ mesh, mat, sparks, sparkMat, until: 0, lifeMs: 0, baseScale: 1, peakOpacity: 0.9 });
  }
  return { pool, next: 0 };
}

const IMPACT_MS = 150;

export function spawnImpact(impacts, point, now, color = null, isFlesh = false, surface = 'stone') {
  const slot = impacts.pool[impacts.next];
  impacts.next = (impacts.next + 1) % impacts.pool.length;
  const style = SURFACE_IMPACTS[surface] ?? SURFACE_IMPACTS.stone;

  slot.mesh.position.set(point[0], point[1], point[2]);
  // Base scale is stored rather than inferred from the mesh: reading the live
  // scale back to decide the multiplier makes the growth compound every frame,
  // and the puff swells to cover the whole screen within a second.
  slot.baseScale = isFlesh ? 1.5 : style.scale;
  slot.mesh.scale.setScalar(slot.baseScale);
  slot.mat.color.setHex(isFlesh ? 0xc0392b : color ?? style.color);
  slot.peakOpacity = isFlesh ? 0.9 : style.opacity;
  slot.mat.opacity = slot.peakOpacity;
  slot.lifeMs = isFlesh ? IMPACT_MS : style.life;
  slot.until = now + slot.lifeMs;
  slot.mesh.visible = true;
  slot.sparks.visible = !isFlesh && surface === 'metal';
  slot.sparkMat.opacity = slot.sparks.visible ? 1 : 0;
  if (slot.sparks.visible) {
    slot.sparks.position.copy(slot.mesh.position);
    slot.sparks.rotation.y = (point[0] * 0.31 + point[2] * 0.71) % (Math.PI * 2);
    slot.sparks.scale.setScalar(1);
  }
}

// ---------------------------------------------------------------------------
// Explosions
//
// A fireball plus a light flash. Pooled like everything else, because a chain of
// barrels going off produces several at once.
// ---------------------------------------------------------------------------

const EXPLOSION_COUNT = 6;
const EXPLOSION_MS = 620;

export function createExplosions(scene) {
  const geo = new THREE.SphereGeometry(1, 14, 10);
  const pool = [];
  for (let i = 0; i < EXPLOSION_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffa23c,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);

    // A real light makes the blast wash over the surrounding geometry, which is
    // most of what sells it.
    const light = new THREE.PointLight(0xffa040, 0, 16, 2);
    light.visible = false;
    scene.add(light);

    pool.push({ mesh, mat, light, until: 0, radius: 1 });
  }
  return { pool, next: 0 };
}

/**
 * Deactivate every pooled effect.
 *
 * These are fixed-size pools allocated once at startup and recycled, so this
 * hides and expires them rather than disposing anything — disposing would leave
 * the pool holding dead GPU resources for the rest of the session. The reason to
 * do it at all is continuity: a tracer or a blast still fading when the map
 * changes otherwise hangs in mid-air over the new level.
 */
export function clearTracers(tracers) {
  for (const slot of tracers.pool) {
    slot.mesh.visible = false;
    slot.mat.opacity = 0;
    slot.life = 0;
    slot.until = 0;
  }
  tracers.next = 0;
}

export function clearImpacts(impacts) {
  for (const slot of impacts.pool) {
    slot.mesh.visible = false;
    slot.mat.opacity = 0;
    slot.sparks.visible = false;
    slot.sparkMat.opacity = 0;
    slot.until = 0;
  }
  impacts.next = 0;
}

export function clearExplosions(explosions) {
  for (const slot of explosions.pool) {
    slot.mesh.visible = false;
    slot.mat.opacity = 0;
    slot.light.visible = false;
    slot.light.intensity = 0;
    slot.until = 0;
  }
  explosions.next = 0;
}

export function spawnExplosion(explosions, at, radius, now) {
  const slot = explosions.pool[explosions.next];
  explosions.next = (explosions.next + 1) % explosions.pool.length;

  slot.radius = radius;
  slot.mesh.position.set(at[0], at[1], at[2]);
  slot.mesh.scale.setScalar(radius * 0.2);
  slot.mat.opacity = 0.95;
  slot.mat.color.setHex(0xfff0b0);
  slot.mesh.visible = true;

  slot.light.position.set(at[0], at[1] + 0.4, at[2]);
  slot.light.distance = radius * 3;
  slot.light.intensity = 26;
  slot.light.visible = true;

  slot.until = now + EXPLOSION_MS;
}

export function updateExplosions(explosions, now) {
  for (const slot of explosions.pool) {
    if (!slot.mesh.visible) continue;
    const remaining = slot.until - now;
    if (remaining <= 0) {
      slot.mesh.visible = false;
      slot.light.visible = false;
      slot.light.intensity = 0;
      continue;
    }
    // t runs 0 -> 1 over the life of the blast.
    const t = 1 - remaining / EXPLOSION_MS;
    // Expands fast then holds, and cools from white through orange to red.
    slot.mesh.scale.setScalar(slot.radius * (0.2 + Math.sqrt(t) * 0.95));
    slot.mat.opacity = 0.95 * (1 - t) ** 1.6;
    slot.mat.color.setRGB(1, Math.max(0.15, 0.94 - t * 1.1), Math.max(0.05, 0.69 - t * 1.5));
    slot.light.intensity = 26 * (1 - t) ** 2;
  }
}

export function updateImpacts(impacts, now) {
  for (const slot of impacts.pool) {
    if (!slot.mesh.visible) continue;
    const remaining = slot.until - now;
    if (remaining <= 0) {
      slot.mesh.visible = false;
      slot.sparks.visible = false;
      continue;
    }
    const t = remaining / slot.lifeMs;
    slot.mat.opacity = slot.peakOpacity * t;
    slot.mesh.scale.setScalar(slot.baseScale * (1 + (1 - t) * 2.2));
    if (slot.sparks.visible) {
      slot.sparkMat.opacity = t * t;
      slot.sparks.scale.setScalar(0.6 + t * 0.4);
    }
  }
}
