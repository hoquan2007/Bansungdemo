// Lightweight articulated first-person gloves for source weapons without an
// authored armature. One rig per weapon is built once; frame updates only pose
// the existing groups. The M4A1's authored textured arms take precedence.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const glove = new THREE.MeshStandardMaterial({ color: 0x343e42, roughness: 0.91 });
const cuff = new THREE.MeshStandardMaterial({ color: 0x202b30, roughness: 0.88 });
const knuckle = new THREE.MeshStandardMaterial({ color: 0x657477, roughness: 0.8, metalness: 0.08 });
// Shared geometry: the extra curvature only creates one GPU buffer per shape,
// even though each firearm has its own articulated pair of gloves.
const forearmGeo = new THREE.CylinderGeometry(0.052, 0.074, 0.3, 16);
const palmGeo = new RoundedBoxGeometry(0.105, 0.071, 0.128, 4, 0.018);
const cuffGeo = new THREE.CylinderGeometry(0.061, 0.069, 0.058, 16);
const digitGeo = new THREE.CapsuleGeometry(0.013, 0.055, 6, 10);
const fingerTipGeo = new THREE.CapsuleGeometry(0.011, 0.033, 6, 10);
const thumbGeo = new THREE.CapsuleGeometry(0.016, 0.041, 6, 10);
const plateGeo = new RoundedBoxGeometry(0.085, 0.009, 0.064, 3, 0.004);

function mesh(parent, name, geometry, material, position, rotation) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.position.set(...position);
  if (rotation) object.rotation.set(...rotation);
  object.castShadow = false;
  object.receiveShadow = false;
  parent.add(object);
  return object;
}

function hand(side) {
  const wrist = new THREE.Group();
  wrist.name = side === 1 ? 'FPRightWrist' : 'FPLeftWrist';
  // Wrist is the articulation pivot. Forearm fades into the lower screen edge.
  mesh(wrist, 'Forearm', forearmGeo, glove, [0, -0.19, 0.13], [0.42, 0, side * 0.07]);
  mesh(wrist, 'Cuff', cuffGeo, cuff, [0, -0.058, 0.032], [0.3, 0, 0]);
  mesh(wrist, 'Palm', palmGeo, glove, [0, 0, -0.045]);
  mesh(wrist, 'KnucklePlate', plateGeo, knuckle, [0, 0.041, -0.062]);
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Group();
    finger.name = `Finger${i}`;
    finger.position.set(-0.035 + i * 0.023, -0.012, -0.105);
    wrist.add(finger);
    mesh(finger, 'GlovedDigit', digitGeo, glove, [0, -0.014, -0.018], [1.18, 0, 0]);
    const tip = new THREE.Group();
    tip.name = `FingerTip${i}`;
    tip.position.set(0, -0.038, -0.042);
    mesh(tip, 'DistalPhalanx', fingerTipGeo, glove, [0, -0.008, -0.012], [1.18, 0, 0]);
    finger.add(tip);
  }
  const thumb = new THREE.Group();
  thumb.name = 'Thumb';
  thumb.position.set(side * 0.058, -0.039, -0.047);
  mesh(thumb, 'ProximalThumb', thumbGeo, glove, [0, -0.007, -0.018], [0.18, side * 0.6, -side * 0.6]);
  const thumbTip = new THREE.Group();
  thumbTip.name = 'ThumbTip';
  thumbTip.position.set(side * 0.012, -0.029, -0.036);
  mesh(thumbTip, 'DistalThumb', fingerTipGeo, glove, [0, -0.008, -0.013], [0.18, side * 0.4, -side * 0.35]);
  thumb.add(thumbTip);
  wrist.add(thumb);
  return wrist;
}

// Tuned contact points in weapon-local viewmodel space.  Keep every weapon ID
// explicit so a new entry cannot silently inherit an unsuitable rifle grip.
export const WEAPON_HAND_GRIPS = Object.freeze({
  pistol:        { right: [0.075, -0.105, 0.13], left: [-0.08, -0.125, -0.02] },
  smg:           { right: [0.075, -0.105, 0.13], left: [-0.065, -0.075, -0.20] },
  shotgun:       { right: [0.075, -0.105, 0.13], left: [-0.065, -0.075, -0.37] },
  rifle:         { right: [0.075, -0.105, 0.13], left: [-0.065, -0.075, -0.29] },
  sniper:        { right: [0.075, -0.105, 0.13], left: [-0.065, -0.075, -0.33] },
  lmg:           { right: [0.080, -0.115, 0.14], left: [-0.072, -0.078, -0.34] },
  dmr:           { right: [0.075, -0.105, 0.13], left: [-0.065, -0.075, -0.30] },
  revolver:      { right: [0.075, -0.105, 0.13], left: [-0.08, -0.125, -0.02] },
  machinepistol: { right: [0.075, -0.105, 0.13], left: [-0.08, -0.12, -0.07] },
  smg_compact:   { right: [0.075, -0.105, 0.13], left: [-0.065, -0.075, -0.16] },
  smg_heavy:     { right: [0.075, -0.105, 0.13], left: [-0.072, -0.08, -0.24] },
  carbine:       { right: [0.075, -0.105, 0.13], left: [-0.065, -0.075, -0.25] },
  bullpup:       { right: [0.075, -0.105, 0.13], left: [-0.065, -0.075, -0.21] },
  sawnoff:       { right: [0.075, -0.105, 0.13], left: [-0.065, -0.075, -0.21] },
  autoshotgun:   { right: [0.075, -0.105, 0.13], left: [-0.065, -0.075, -0.35] },
  antimateriel:  { right: [0.080, -0.11, 0.14], left: [-0.075, -0.085, -0.39] },
  knife:         { right: [0.09, -0.105, 0.13], left: [-0.065, -0.075, -0.29] },
});

// Weapon-specific support-hand reach, in weapon-local coordinates. The basic
// rifle magazine reload differs markedly from an LMG box, revolver speedloader,
// forward shotgun loading port or rear-mounted bullpup magazine.
const RELOAD_REACH = Object.freeze({
  revolver: { x: 0.15, y: -0.13, z: 0.12, pitch: -0.2 },
  shotgun: { x: 0.11, y: -0.11, z: 0.27, pitch: -0.55 },
  sawnoff: { x: 0.12, y: -0.13, z: 0.30, pitch: -0.6 },
  autoshotgun: { x: 0.11, y: -0.11, z: 0.28, pitch: -0.55 },
  lmg: { x: 0.09, y: -0.27, z: 0.11, pitch: 0.28 },
  bullpup: { x: 0.12, y: -0.19, z: 0.24, pitch: 0.36 },
  antimateriel: { x: 0.07, y: -0.23, z: 0.17, pitch: 0.45 },
});

function layout(weapon) {
  const grip = WEAPON_HAND_GRIPS[weapon.id];
  if (!grip) throw new Error(`Missing first-person grip for ${weapon.id}`);
  return {
    right: new THREE.Vector3(...grip.right),
    left: new THREE.Vector3(...grip.left),
    supportVisible: weapon.type !== 'melee',
  };
}

export function createFirstPersonHandRig(parent, weapon) {
  const root = new THREE.Group();
  root.name = `FPHands_${weapon.id}`;
  const right = hand(1);
  const left = hand(-1);
  const rest = layout(weapon);
  right.position.copy(rest.right);
  left.position.copy(rest.left);
  left.rotation.y = -0.2;
  right.rotation.y = 0.12;
  left.visible = rest.supportVisible;
  root.add(right, left);
  parent.add(root);
  const fingers = {
    right: [0, 1, 2, 3].map((i) => right.getObjectByName(`Finger${i}`)),
    left: [0, 1, 2, 3].map((i) => left.getObjectByName(`Finger${i}`)),
  };
  const fingerTips = {
    right: [0, 1, 2, 3].map((i) => right.getObjectByName(`FingerTip${i}`)),
    left: [0, 1, 2, 3].map((i) => left.getObjectByName(`FingerTip${i}`)),
  };
  const thumbs = { right: right.getObjectByName('Thumb'), left: left.getObjectByName('Thumb') };
  const thumbTips = { right: right.getObjectByName('ThumbTip'), left: left.getObjectByName('ThumbTip') };
  // Reused per-frame: transform a moving source part into the hand rig's local
  // coordinates without allocating matrices/vectors during reloads.
  const contact = {
    partToHand: new THREE.Matrix4(),
    handToPart: new THREE.Matrix4(),
    point: new THREE.Vector3(),
    restOffset: new THREE.Vector3(),
    target: new THREE.Vector3(),
    delta: new THREE.Vector3(),
    restQuaternion: new THREE.Quaternion(),
  };
  return { root, right, left, rest, fingers, fingerTips, thumbs, thumbTips, contact,
    weaponType: weapon.type, weaponId: weapon.id };
}

const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

// When the source asset exposes a moving magazine, slide, pump, bolt or hinged
// barrels, let the support hand inherit that part's actual local movement. This
// also handles OBJ and glTF meshes that were fitted with different rotations
// and scales. A blend keeps the artist-tuned approach/return gesture intact.
function followSourcePart(rig, sourceRig, progress) {
  if (!sourceRig || progress <= 0 || progress >= 1 || !rig.left.visible) return;
  const name = sourceRig.separatedParts?.[0];
  const part = sourceRig.parts?.[name];
  if (!part?.pivot?.parent) return;
  const lateAction = ['Slide', 'Pump', 'Bolt', 'Barrel'].includes(name);
  const weight = lateAction
    ? 0.7 * smooth((progress - 0.71) / 0.1) * (1 - smooth((progress - 0.96) / 0.04))
    : 0.7 * smooth((progress - 0.12) / 0.14) * (1 - smooth((progress - 0.76) / 0.18));
  if (weight <= 0) return;

  // The hand and the source pivot may have different, nested orientations and
  // scales, so a raw pivot.position delta would move the glove on the wrong
  // axis for guns authored facing +X instead of +Z.
  const { contact } = rig;
  rig.root.updateWorldMatrix(true, false);
  part.pivot.parent.updateWorldMatrix(true, false);
  contact.partToHand.copy(rig.root.matrixWorld).invert().multiply(part.pivot.parent.matrixWorld);
  contact.handToPart.copy(contact.partToHand).invert();
  contact.point.copy(rig.left.position).applyMatrix4(contact.handToPart);
  contact.restQuaternion.setFromEuler(part.restRotation).invert();
  contact.restOffset.copy(contact.point).sub(part.restPosition).applyQuaternion(contact.restQuaternion);
  contact.target.copy(contact.restOffset).applyQuaternion(part.pivot.quaternion)
    .add(part.pivot.position).applyMatrix4(contact.partToHand);
  // Clamp in viewmodel units: extremely long import pivots must not drag the
  // hand off-screen while the user switches weapons or interrupts a reload.
  contact.delta.copy(contact.target).sub(rig.left.position).clampLength(0, 0.16);
  rig.left.position.addScaledVector(contact.delta, weight);
  rig.left.rotation.z += (part.pivot.rotation.z - part.restRotation.z) * weight * 0.45;
}

// Reload gestures are entirely cosmetic. Never alter shooting origin, camera,
// ammo count, or the network protocol in response to these poses.
export function poseFirstPersonHandRig(rig, progress, now, lastShotAt, sourceRig = null) {
  if (!rig) return;
  const { left, right, rest } = rig;
  left.position.copy(rest.left);
  right.position.copy(rest.right);
  left.rotation.set(0, -0.2, 0);
  right.rotation.set(0, 0.12, 0);
  for (const digit of rig.fingers.right) digit.rotation.x = 0.22;
  for (const digit of rig.fingers.left) digit.rotation.x = 0.3;
  for (const tip of rig.fingerTips.right) tip.rotation.x = 0.32;
  for (const tip of rig.fingerTips.left) tip.rotation.x = 0.38;
  rig.thumbs.right.rotation.set(-0.12, 0.14, -0.2);
  rig.thumbs.left.rotation.set(-0.12, -0.14, 0.2);
  rig.thumbTips.right.rotation.x = 0.28;
  rig.thumbTips.left.rotation.x = 0.28;
  rig.fingers.right[1].rotation.x = 0.05; // relaxed trigger finger
  const reload = progress > 0 && progress < 1;
  if (reload) {
    const t = Math.sin(Math.PI * Math.min(1, progress));
    const reach = RELOAD_REACH[rig.weaponId] ??
      { x: 0.07, y: -0.19, z: 0.15, pitch: 0.42 };
    // The left hand unhooks, retrieves a magazine or shell and returns to grip.
    left.position.x += reach.x * t;
    left.position.y += reach.y * t;
    left.position.z += reach.z * t;
    left.rotation.x += t * reach.pitch;
    left.rotation.z += t * 0.32;
    right.rotation.x = -t * 0.15;
    // Individual knuckles open as the support hand releases the foregrip,
    // then curl around the shell/magazine on the return stroke.
    for (const digit of rig.fingers.left) digit.rotation.x += t * (progress < 0.5 ? -0.45 : 0.35);
    for (const tip of rig.fingerTips.left) tip.rotation.x += t * (progress < 0.5 ? -0.32 : 0.3);
    rig.thumbs.left.rotation.y -= t * 0.3;
    rig.thumbTips.left.rotation.x -= t * (progress < 0.5 ? 0.24 : -0.18);
    rig.fingers.right[1].rotation.x = -t * 0.18;
    rig.fingerTips.right[1].rotation.x -= t * 0.12;
    if (rig.weaponType === 'sniper' && progress > 0.78) {
      const cycle = Math.sin(Math.PI * (progress - 0.78) / 0.22);
      left.position.z += Math.max(0, cycle) * 0.12;
    }
    followSourcePart(rig, sourceRig, progress);
  } else {
    const age = now - lastShotAt;
    if (Number.isFinite(age) && age >= 0 && age < 260) {
      const impulse = Math.sin(Math.PI * age / 260);
      left.position.z += impulse * 0.018;
      right.position.z += impulse * 0.024;
      right.rotation.x += impulse * 0.14;
      rig.fingers.right[1].rotation.x -= impulse * 0.23;
      rig.fingerTips.right[1].rotation.x -= impulse * 0.17;
      rig.thumbTips.right.rotation.x += impulse * 0.09;
      if (rig.weaponType === 'melee') {
        // The knife follows through with the wrist, alongside weaponView's
        // full-weapon slash. No gameplay hitbox or server timing is affected.
        right.rotation.z -= impulse * 0.58;
        right.rotation.y += impulse * 0.32;
        right.position.x -= impulse * 0.045;
      }
    }
  }
}
