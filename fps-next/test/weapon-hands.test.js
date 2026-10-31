import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ALL_WEAPON_IDS, getWeapon } from '../shared/weapons.js';
import { createFirstPersonHandRig, poseFirstPersonHandRig, WEAPON_HAND_GRIPS } from '../client/src/weaponHands.js';
import { createSupplementalWeaponRig, poseSupplementalWeaponRig } from '../client/src/weaponMechanisms.js';
import { createSourceWeaponRig, poseSourceWeaponRig, SOURCE_WEAPON_RIGS } from '../client/src/sourceWeaponRig.js';

test('all arsenal IDs have their own hands, 10 articulated digits and finite rest transforms', () => {
  assert.deepEqual(Object.keys(WEAPON_HAND_GRIPS).sort(), [...ALL_WEAPON_IDS].sort());
  for (const id of ALL_WEAPON_IDS) {
    const parent = new THREE.Group();
    const rig = createFirstPersonHandRig(parent, getWeapon(id));
    assert.equal(parent.children.includes(rig.root), true, id);
    assert.equal(rig.root.name, `FPHands_${id}`);
    assert.equal(rig.fingers.left.length, 4);
    assert.equal(rig.fingers.right.length, 4);
    assert.ok(rig.right.getObjectByName('Thumb'), `${id} right thumb`);
    assert.ok(rig.left.getObjectByName('Thumb'), `${id} left thumb`);
    assert.equal(rig.fingerTips.left.length, 4, `${id} left distal joints`);
    assert.equal(rig.fingerTips.right.length, 4, `${id} right distal joints`);
    for (const side of ['right', 'left']) {
      assert.ok(rig.fingerTips[side].every((tip) => tip.parent.name.startsWith('Finger')),
        `${id} independently parented finger tips`);
      assert.equal(rig.thumbTips[side].parent, rig.thumbs[side], `${id} articulated thumb tip`);
    }
    assert.equal(rig.left.visible, id !== 'knife', id);
    for (const hand of [rig.left, rig.right]) {
      assert.ok(hand.position.toArray().every(Number.isFinite), `${id} has invalid position`);
    }
    poseFirstPersonHandRig(rig, 0, 5_000, -Infinity);
    assert.ok(rig.left.position.equals(rig.rest.left), `${id} left hand at rest`);
    assert.ok(rig.right.position.equals(rig.rest.right), `${id} right hand at rest`);
  }
});

test('reload and firing pose hands, knuckles and camera-independent joints, then reset', () => {
  for (const id of ALL_WEAPON_IDS.filter((id) => id !== 'knife')) {
    const rig = createFirstPersonHandRig(new THREE.Group(), getWeapon(id));
    poseFirstPersonHandRig(rig, 0.4, 1_000, -Infinity);
    assert.ok(rig.left.position.distanceTo(rig.rest.left) > 0.05, `${id} support hand moves for reload`);
    assert.notEqual(rig.fingers.left[0].rotation.x, 0.3, `${id} knuckle articulates`);
    assert.notEqual(rig.fingerTips.left[0].rotation.x, 0.38, `${id} finger tip articulates`);
    assert.notEqual(rig.thumbs.left.rotation.y, -0.14, `${id} thumb articulates`);
    poseFirstPersonHandRig(rig, 0, 100, 0);
    assert.ok(rig.right.position.distanceTo(rig.rest.right) > 0, `${id} right-hand recoil`);
    poseFirstPersonHandRig(rig, 0, 4_000, 0);
    assert.ok(rig.left.position.equals(rig.rest.left), `${id} support position resets`);
    assert.ok(rig.right.position.equals(rig.rest.right), `${id} right position resets`);
    assert.equal(rig.fingers.left[0].rotation.x, 0.3, `${id} knuckle resets`);
    assert.equal(rig.fingers.right[1].rotation.x, 0.05, `${id} trigger finger resets`);
    assert.equal(rig.fingerTips.left[0].rotation.x, 0.38, `${id} distal joint resets`);
    assert.equal(rig.thumbs.left.rotation.y, -0.14, `${id} thumb resets`);
  }
});

test('knife wrist slashes with the shot event and returns exactly to its rest pose', () => {
  const rig = createFirstPersonHandRig(new THREE.Group(), getWeapon('knife'));
  poseFirstPersonHandRig(rig, 0, 120, 0);
  assert.ok(rig.right.rotation.z < -0.3, 'slash articulates the wrist');
  assert.ok(rig.right.position.x < rig.rest.right.x, 'slash follows through');
  poseFirstPersonHandRig(rig, 0, 500, 0);
  assert.equal(rig.right.rotation.z, 0);
  assert.equal(rig.right.rotation.y, 0.12);
  assert.ok(rig.right.position.equals(rig.rest.right));
});

test('support hand tracks source mechanisms in their fitted local space, and resets after interruption', () => {
  for (const [id, definition] of Object.entries(SOURCE_WEAPON_RIGS)) {
    const group = new THREE.Group();
    const bare = createFirstPersonHandRig(group, getWeapon(id));
    const coupled = createFirstPersonHandRig(group, getWeapon(id));
    const fitted = new THREE.Group();
    fitted.rotation.y = Math.PI / 3;
    fitted.scale.setScalar(0.55);
    group.add(fitted);
    const node = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.1));
    node.name = `Rig${definition.parts[0]}`;
    fitted.add(node);
    const source = createSourceWeaponRig(fitted, id);
    assert.ok(source, `${id} source rig missing`);
    const action = ['Slide', 'Pump', 'Bolt', 'Barrel'].includes(definition.parts[0]) ? 0.86 : 0.45;
    poseSourceWeaponRig(source, action, 1500, -Infinity);
    poseFirstPersonHandRig(bare, action, 1500, -Infinity);
    poseFirstPersonHandRig(coupled, action, 1500, -Infinity, source);
    assert.ok(coupled.left.position.distanceTo(bare.left.position) > 1e-5,
      `${id} support glove ignores moving source geometry`);
    assert.ok(coupled.left.position.distanceTo(bare.left.position) <= 0.113,
      `${id} support glove moved farther than the contact safety clamp`);
    poseSourceWeaponRig(source, 0, 3000, -Infinity);
    poseFirstPersonHandRig(coupled, 0, 3000, -Infinity, source);
    assert.ok(coupled.left.position.equals(coupled.rest.left), `${id} contact did not reset`);
  }
});

test('each non-authored firearm gets a separate cosmetic action rig', () => {
  const authored = new Set(['rifle', 'sniper']);
  for (const id of ALL_WEAPON_IDS) {
    const weapon = getWeapon(id);
    const group = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.1));
    const model = {
      group,
      moving: {
        mag: { mesh: box, rest: new THREE.Vector3(0, -0.1, 0) },
        bolt: { mesh: box, rest: new THREE.Vector3(0, 0.03, -0.1) },
        pump: { mesh: box, rest: new THREE.Vector3(0, -0.06, -0.3) },
      },
    };
    // Authored models bind moving nodes in weaponView; a melee weapon has no reload.
    if (authored.has(id)) continue;
    const rig = createSupplementalWeaponRig(model, weapon);
    if (id === 'knife') {
      assert.equal(rig, null);
      continue;
    }
    assert.ok(rig, `missing ${id} supplemental rig`);
    assert.ok(rig.magazine || rig.shell || rig.mechanism, `${id} lacks moving part`);
    const reloadSamples = [0.31, 0.36, 0.42, 0.51, 0.61, 0.85];
    const anyMovingPart = reloadSamples.some((progress) => {
      poseSupplementalWeaponRig(rig, progress, 1500, -Infinity, weapon.mag);
      return [rig.magazine, rig.shell, rig.mechanism].some((part) => part?.visible);
    });
    assert.ok(anyMovingPart,
      `${id} has no part in motion during reload`);
    poseSupplementalWeaponRig(rig, 0, 2500, -Infinity, weapon.mag);
    assert.ok([rig.magazine, rig.shell, rig.mechanism].every((p) => !p?.visible),
      `${id} left a floating prop after reload`);
  }
});
