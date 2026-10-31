import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ALL_WEAPON_IDS } from '../shared/weapons.js';
import {
  SKINNED_WEAPON_ANIMATIONS, sampleSkinnedTimeline,
  createSkinnedWeaponHandRig, poseSkinnedWeaponHandRig,
} from '../client/src/skinnedWeaponHands.js';

function sourceFixture(sanitized = false) {
  const fitted = new THREE.Group();
  const rigRoot = new THREE.Group();
  const root = new THREE.Bone(); root.name = 'Root';
  const bones = [root];
  for (const side of ['L', 'R']) {
    const arm = new THREE.Bone(); arm.name = `Arm_${side}`; root.add(arm); bones.push(arm);
    const control = new THREE.Bone(); control.name = `IK_Hand_Cntrl_${side}`;
    root.add(control); bones.push(control);
    const hand = new THREE.Bone(); hand.name = `Hand_${side}`;
    control.add(hand); bones.push(hand);
    for (const suffix of ['004','008','012','016','020']) {
      const finger = new THREE.Bone();
      finger.name = sanitized ? `Bone_${side}${suffix}` : `Bone_${side}.${suffix}`;
      hand.add(finger); bones.push(finger);
    }
  }
  const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = 'FPArms';
  rigRoot.add(root, mesh);
  mesh.bind(new THREE.Skeleton(bones));
  fitted.add(rigRoot);
  const gun = new THREE.Group(); gun.name = 'Gun_m4a1';
  fitted.add(gun);
  return { fitted, mesh };
}

test('source model contains a textured, skinned armature with separate weapon geometry', () => {
  const bytes = readFileSync(new URL('../client/public/models/fp/m4a1.glb', import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const mesh = gltf.nodes.find((node) => node.name === 'FPArms');
  assert.equal(typeof mesh.skin, 'number');
  assert.ok(gltf.skins[mesh.skin].joints.length >= 60);
  for (const name of ['Arm_L', 'Arm_R', 'IK_Hand_Cntrl_L', 'IK_Hand_Cntrl_R', 'Gun_m4a1']) {
    assert.ok(gltf.nodes.some((node) => node.name === name), name);
  }
  assert.ok(gltf.animations.some((clip) => clip.name === 'grip_vgrip'));
});

test('all 17 weapons have bounded, ordered, nonidentical fire/reload/inspect timelines', () => {
  assert.deepEqual(Object.keys(SKINNED_WEAPON_ANIMATIONS).sort(), [...ALL_WEAPON_IDS].sort());
  const signatures = new Set();
  for (const id of ALL_WEAPON_IDS) {
    const actions = SKINNED_WEAPON_ANIMATIONS[id];
    assert.equal(actions.reload[0][0], 0, id);
    assert.equal(actions.reload.at(-1)[0], 1, id);
    assert.deepEqual(actions.reload.at(-1).slice(1), [0, 0, 0, 0, 0], id);
    for (let i = 1; i < actions.reload.length; i++) {
      assert.ok(actions.reload[i][0] > actions.reload[i - 1][0], `${id} order`);
      assert.equal(actions.reload[i].length, 6);
    }
    for (const progress of [0, .15, .4, .65, .9, 1]) {
      assert.ok(sampleSkinnedTimeline(actions.reload, progress).every(Number.isFinite), id);
    }
    assert.ok(actions.fire[0] > 0 && actions.fire.every(Number.isFinite), id);
    assert.ok(actions.inspect.every(Number.isFinite), id);
    const signature = JSON.stringify(actions);
    assert.ok(!signatures.has(signature), `${id} reuses another weapon animation`);
    signatures.add(signature);
  }
});

test('real Skeleton bones move together and reset after reload, fire and inspect', () => {
  for (const id of ALL_WEAPON_IDS) {
    // The dotless variant mirrors actual GLTFLoader name sanitization.
    const { fitted, mesh } = sourceFixture(true);
    const parent = new THREE.Group(); parent.add(fitted);
    const rig = createSkinnedWeaponHandRig(fitted, id, parent);
    assert.ok(rig, `${id} failed binding`);
    assert.equal(fitted.getObjectByName('Gun_m4a1'), undefined, `${id} retained source gun`);
    assert.equal(rig.mesh, mesh);
    poseSkinnedWeaponHandRig(rig, 0, 9000, -Infinity);
    const restLeft = rig.left.control.position.clone();
    const restArm = rig.left.arm.position.clone();
    const restRight = rig.right.control.position.clone();
    const restFinger = rig.fingerBones.left[0].quaternion.clone();
    poseSkinnedWeaponHandRig(rig, .4, 5000, -Infinity);
    if (id !== 'knife') {
      assert.ok(rig.left.control.position.distanceTo(restLeft) > .05, `${id} reload motion`);
      assert.ok(rig.fingerBones.left[0].quaternion.angleTo(restFinger) > .02, `${id} fingers`);
    }
    const leftDelta = rig.left.control.position.clone().sub(restLeft);
    const armDelta = rig.left.arm.position.clone().sub(restArm);
    assert.ok(leftDelta.distanceTo(armDelta) < .003, `${id} detached wrist`);
    poseSkinnedWeaponHandRig(rig, 0, 5100, 5000);
    assert.ok(rig.right.control.position.distanceTo(restRight) > 0, `${id} recoil`);
    poseSkinnedWeaponHandRig(rig, 0, 9000, -Infinity, 0, .4);
    assert.ok(rig.right.control.position.distanceTo(restRight) > 0, `${id} inspect`);
    poseSkinnedWeaponHandRig(rig, 0, 9000, -Infinity, 0, -1);
    assert.ok(rig.left.control.position.distanceTo(restLeft) <= .003, `${id} reload reset`);
    assert.ok(rig.right.control.position.distanceTo(restRight) < 1e-8, `${id} fire/inspect reset`);
    assert.ok(rig.fingerBones.left[0].quaternion.angleTo(restFinger) < 1e-8, `${id} finger reset`);
  }
});

test('raw and GLTFLoader-sanitized source bone names both bind', () => {
  for (const sanitized of [false, true]) {
    const { fitted } = sourceFixture(sanitized);
    const parent = new THREE.Group(); parent.add(fitted);
    const rig = createSkinnedWeaponHandRig(fitted, 'rifle', parent, false);
    assert.ok(rig, `Armature failed binding; sanitized=${sanitized}`);
    assert.equal(rig.fingerBones.left.length, 5);
    assert.equal(rig.fingerBones.right.length, 5);
  }
});

test('bad rigs keep the procedural fallbacks usable', () => {
  const group = new THREE.Group();
  assert.equal(createSkinnedWeaponHandRig(group, 'rifle', group), null);
});
