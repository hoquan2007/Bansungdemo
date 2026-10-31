// First-person tactical arms. The 68-bone, skinned FPArms mesh comes from the
// attributed M4A1 source; every weapon uses an independent SkeletonUtils clone.
// The curves below are weapon-specific cosmetic keyframes, expressed in the
// viewmodel's metres and remapped into the source armature's parent space.
import * as THREE from 'three';
import { WEAPON_HAND_GRIPS } from './weaponHands.js';

// [time fraction, support-hand x, y, z, wrist pitch, finger extension].
// Distinct magazine, shell, cylinder, bolt, feed-box and blade manipulations.
export const SKINNED_WEAPON_ANIMATIONS = Object.freeze({
  pistol:        { reload: [[0,0,0,0,0,0],[.16,.025,-.06,.07,-.2,.3],[.42,.12,-.19,.13,-.48,.85],[.70,.11,-.16,.12,-.26,.7],[.88,.02,-.04,.03,-.08,.2],[1,0,0,0,0,0]], fire: [170,.012,.045,.16], inspect: [.16,.06,.24] },
  smg:           { reload: [[0,0,0,0,0,0],[.14,.03,-.08,.06,-.14,.3],[.38,.13,-.20,.16,-.44,.9],[.66,.09,-.22,.12,.14,.6],[.9,.01,-.02,.02,0,.1],[1,0,0,0,0,0]], fire: [145,.02,.035,.12], inspect: [.13,.08,.18] },
  shotgun:       { reload: [[0,0,0,0,0,0],[.16,.06,-.06,.12,-.22,.5],[.34,.10,-.14,.26,-.65,.8],[.56,.07,-.1,.22,-.28,.25],[.79,.12,-.11,.27,-.7,.85],[1,0,0,0,0,0]], fire: [240,.035,.09,.28], inspect: [.21,.06,.3] },
  rifle:         { reload: [[0,0,0,0,0,0],[.16,.03,-.09,.04,.12,.4],[.4,.1,-.21,.13,.48,.95],[.61,.05,-.23,.11,.22,.8],[.86,.01,-.035,.01,-.12,.2],[1,0,0,0,0,0]], fire: [155,.025,.052,.2], inspect: [.18,.09,.24] },
  sniper:        { reload: [[0,0,0,0,0,0],[.14,.05,-.09,.07,.25,.25],[.38,.1,-.20,.15,.45,.85],[.68,.06,-.15,.11,.1,.55],[.86,.05,-.03,.14,-.6,.1],[1,0,0,0,0,0]], fire: [275,.025,.11,.32], inspect: [.24,.10,.3] },
  lmg:           { reload: [[0,0,0,0,0,0],[.12,.045,-.12,.02,.12,.25],[.35,.1,-.28,.12,.35,.9],[.63,.1,-.3,.09,-.08,.95],[.88,.01,-.045,.01,-.2,.3],[1,0,0,0,0,0]], fire: [175,.015,.09,.22], inspect: [.23,.11,.32] },
  dmr:           { reload: [[0,0,0,0,0,0],[.13,.02,-.07,.07,.18,.3],[.39,.1,-.21,.16,.45,.9],[.68,.075,-.22,.1,.06,.65],[.88,.01,-.03,.01,-.07,.15],[1,0,0,0,0,0]], fire: [185,.022,.08,.23], inspect: [.2,.1,.26] },
  revolver:      { reload: [[0,0,0,0,0,0],[.16,.04,-.06,.09,-.15,.4],[.36,.15,-.13,.13,-.35,.95],[.62,.14,-.16,.10,-.08,.65],[.84,.03,-.04,.09,.18,.3],[1,0,0,0,0,0]], fire: [280,.025,.11,.35], inspect: [.31,.08,.28] },
  machinepistol: { reload: [[0,0,0,0,0,0],[.17,.03,-.09,.06,-.12,.3],[.38,.14,-.2,.12,-.41,.88],[.7,.1,-.13,.08,-.2,.68],[.91,.02,-.02,.02,0,.1],[1,0,0,0,0,0]], fire: [130,.011,.034,.12], inspect: [.15,.06,.22] },
  smg_compact:   { reload: [[0,0,0,0,0,0],[.16,.02,-.06,.04,-.12,.3],[.40,.12,-.18,.13,-.38,.9],[.65,.09,-.16,.12,-.14,.65],[.91,.01,-.02,.02,0,.15],[1,0,0,0,0,0]], fire: [125,.012,.038,.13], inspect: [.14,.06,.19] },
  smg_heavy:     { reload: [[0,0,0,0,0,0],[.13,.04,-.09,.04,.14,.25],[.39,.11,-.25,.15,.32,.88],[.69,.08,-.21,.11,.07,.7],[.9,.015,-.03,.02,-.05,.2],[1,0,0,0,0,0]], fire: [175,.018,.06,.18], inspect: [.2,.07,.27] },
  carbine:       { reload: [[0,0,0,0,0,0],[.15,.025,-.07,.04,.12,.4],[.41,.1,-.19,.14,.45,.9],[.66,.07,-.18,.13,.12,.65],[.9,.01,-.02,.01,0,.15],[1,0,0,0,0,0]], fire: [150,.017,.047,.16], inspect: [.18,.09,.21] },
  bullpup:       { reload: [[0,0,0,0,0,0],[.17,.04,-.08,.12,.16,.3],[.4,.13,-.2,.24,.4,.95],[.7,.1,-.16,.19,-.12,.6],[.89,.02,-.02,.04,0,.15],[1,0,0,0,0,0]], fire: [165,.025,.049,.17], inspect: [.23,.08,.26] },
  sawnoff:       { reload: [[0,0,0,0,0,0],[.15,.03,-.06,.11,.28,.25],[.35,.12,-.13,.3,-.6,.9],[.65,.1,-.14,.3,-.42,.7],[.89,.02,-.03,.1,.16,.15],[1,0,0,0,0,0]], fire: [275,.045,.11,.35], inspect: [.25,.09,.28] },
  autoshotgun:   { reload: [[0,0,0,0,0,0],[.15,.05,-.07,.11,-.12,.35],[.37,.1,-.13,.28,-.55,.9],[.64,.09,-.13,.25,-.22,.45],[.86,.04,-.06,.1,.28,.2],[1,0,0,0,0,0]], fire: [220,.03,.085,.25], inspect: [.22,.09,.29] },
  antimateriel:  { reload: [[0,0,0,0,0,0],[.14,.04,-.12,.05,.3,.3],[.36,.09,-.24,.17,.52,.85],[.7,.05,-.23,.13,-.16,.85],[.89,.03,-.03,.1,-.55,.15],[1,0,0,0,0,0]], fire: [340,.035,.14,.41], inspect: [.32,.12,.3] },
  knife:         { reload: [[0,0,0,0,0,0],[.2,0,0,0,0,0],[1,0,0,0,0,0]], fire: [360,0,.11,.59], inspect: [.38,.15,.37] },
});

const smooth = (t) => { const x = THREE.MathUtils.clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const scratch = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);
const axisZ = new THREE.Vector3(0, 0, 1);

export function sampleSkinnedTimeline(frames, fraction) {
  if (!Number.isFinite(fraction) || fraction <= 0) return [...frames[0].slice(1)];
  if (fraction >= 1) return [...frames.at(-1).slice(1)];
  for (let i = 1; i < frames.length; i++) {
    const end = frames[i], start = frames[i - 1];
    if (fraction > end[0]) continue;
    const t = smooth((fraction - start[0]) / (end[0] - start[0]));
    return start.slice(1).map((value, j) => THREE.MathUtils.lerp(value, end[j + 1], t));
  }
  return [...frames.at(-1).slice(1)];
}

// The source M4A1 GLB binds its hands under IK_Hand_Cntrl_* and its forearms
// under Arm_*. Move both branches together so wrists don't detach on reload.
export function createSkinnedWeaponHandRig(fitted, weaponId, weaponGroup, isolated = true) {
  const mesh = fitted.getObjectByName('FPArms');
  if (!mesh?.isSkinnedMesh || !mesh.skeleton || !SKINNED_WEAPON_ANIMATIONS[weaponId]) return null;
  // GLTFLoader sanitizes node names for animation tracks (e.g. Bone_L.004
  // becomes Bone_L004). Resolve either variant so the imported armature and
  // hand-authored fixtures bind to the same rig safely.
  const bone = (name) => mesh.skeleton.bones.find((candidate) =>
    candidate.name === name || candidate.name === THREE.PropertyBinding.sanitizeNodeName(name));
  const left = { control: bone('IK_Hand_Cntrl_L'), arm: bone('Arm_L'), hand: bone('Hand_L') };
  const right = { control: bone('IK_Hand_Cntrl_R'), arm: bone('Arm_R'), hand: bone('Hand_R') };
  if (Object.values(left).some((part) => !part) || Object.values(right).some((part) => !part)) return null;
  if (isolated) {
    const gun = fitted.getObjectByName('Gun_m4a1');
    if (!gun) return null;
    gun.parent.remove(gun);
  }
  const fingerBones = {
    left: ['Bone_L.004','Bone_L.008','Bone_L.012','Bone_L.016','Bone_L.020'].map(bone),
    right: ['Bone_R.004','Bone_R.008','Bone_R.012','Bone_R.016','Bone_R.020'].map(bone),
  };
  if ([...fingerBones.left, ...fingerBones.right].some((part) => !part)) return null;

  weaponGroup.updateWorldMatrix(true, true);
  // Root space is shared by both Arm_* and IK_Hand_Cntrl_* bones.
  left.control.parent.updateWorldMatrix(true, false);
  const transform = new THREE.Matrix4().copy(left.control.parent.matrixWorld)
    .invert().multiply(weaponGroup.matrixWorld);
  const zero = new THREE.Vector3().applyMatrix4(transform);
  const toBoneSpace = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(transform).sub(zero);
  const grip = WEAPON_HAND_GRIPS[weaponId], rifleGrip = WEAPON_HAND_GRIPS.rifle;
  const restOffset = {
    left: toBoneSpace(...grip.left.map((p, i) => p - rifleGrip.left[i])),
    right: toBoneSpace(...grip.right.map((p, i) => p - rifleGrip.right[i])),
  };
  const rest = {
    left: { arm: left.arm.position.clone(), control: left.control.position.clone(),
      rotation: left.control.quaternion.clone() },
    right: { arm: right.arm.position.clone(), control: right.control.position.clone(),
      rotation: right.control.quaternion.clone() },
    fingers: Object.fromEntries(['left', 'right'].map((side) => [side,
      fingerBones[side].map((node) => node.quaternion.clone())])),
  };
  if (weaponId === 'knife') {
    left.arm.scale.setScalar(.00001);
    left.control.scale.setScalar(.00001);
  }
  return { weaponId, mesh, left, right, fingerBones, rest, restOffset, toBoneSpace,
    animations: SKINNED_WEAPON_ANIMATIONS[weaponId] };
}

export function poseSkinnedWeaponHandRig(rig, reloadProgress, now, lastShotAt,
  adsProgress = 0, inspectProgress = -1) {
  if (!rig) return;
  const { left, right, rest, animations: actions } = rig;
  const [x, y, z, pitch, extension] = sampleSkinnedTimeline(actions.reload,
    THREE.MathUtils.clamp(reloadProgress, 0, 1));
  const fireAge = now - (lastShotAt ?? -Infinity);
  const fire = fireAge >= 0 && fireAge < actions.fire[0]
    ? Math.sin(Math.PI * fireAge / actions.fire[0]) : 0;
  const ads = smooth(adsProgress) * (reloadProgress > 0 ? 0 : 1);
  const inspecting = inspectProgress >= 0 && inspectProgress < 1 && reloadProgress === 0;
  const inspect = inspecting ? Math.sin(Math.PI * inspectProgress) : 0;

  const leftTarget = rig.toBoneSpace(x + (inspect * actions.inspect[1]),
    y - (inspect * .06), z + fire * actions.fire[1] + ads * -.012);
  const rightTarget = rig.toBoneSpace(inspect * .025,
    inspect * .04, fire * actions.fire[2] + inspect * actions.inspect[2]);
  for (const [side, target] of [['left', leftTarget], ['right', rightTarget]]) {
    const limb = side === 'left' ? left : right;
    limb.arm.position.copy(rest[side].arm).add(rig.restOffset[side]).add(target);
    limb.control.position.copy(rest[side].control).add(rig.restOffset[side]).add(target);
    limb.control.quaternion.copy(rest[side].rotation);
  }
  left.control.quaternion.multiply(scratchQuat.setFromAxisAngle(axisX, pitch - inspect * .12));
  left.control.quaternion.multiply(scratchQuat.setFromAxisAngle(axisZ, inspect * actions.inspect[0]));
  right.control.quaternion.multiply(scratchQuat.setFromAxisAngle(axisX,
    -fire * actions.fire[3] - (reloadProgress > 0 ? Math.sin(reloadProgress * Math.PI) * .12 : 0)));
  right.control.quaternion.multiply(scratchQuat.setFromAxisAngle(axisY,
    (rig.weaponId === 'knife' ? fire * .36 : 0) + inspect * actions.inspect[0]));
  // Individual skinned finger bones release and regrip the magazine/shell.
  const grip = extension * Math.sin(Math.PI * THREE.MathUtils.clamp(reloadProgress, 0, 1));
  for (const side of ['left', 'right']) {
    for (let i = 0; i < rig.fingerBones[side].length; i++) {
      const node = rig.fingerBones[side][i];
      node.quaternion.copy(rest.fingers[side][i]);
      const angle = side === 'left' ? -grip * (.22 + i * .035) :
        (i === 1 ? fire * -.12 : 0);
      node.quaternion.multiply(scratchQuat.setFromAxisAngle(axisX, angle));
    }
  }
  // An almost imperceptible, weapon-specific breathing pass during idle/ADS.
  scratch.set(0, Math.sin(now * .00155 + actions.fire[0]) * .002 * (1 - ads), 0);
  left.arm.position.add(scratch);
  left.control.position.add(scratch);
}
