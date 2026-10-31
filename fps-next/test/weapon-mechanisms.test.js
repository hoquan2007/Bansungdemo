import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSupplementalWeaponRig, poseSupplementalWeaponRig } from '../client/src/weaponMechanisms.js';
import { getWeapon } from '../shared/weapons.js';

function mockModel(parts = ['mag']) {
  const group = new THREE.Group();
  const moving = {};
  for (const name of parts) {
    moving[name] = {
      mesh: new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.08)),
      rest: new THREE.Vector3(0, -0.12, -0.02),
    };
  }
  return { group, moving };
}

test('mag-fed one-piece model adds an optional magazine only during reload, then resets', () => {
  const model = mockModel(['mag']);
  const rig = createSupplementalWeaponRig(model, getWeapon('smg'));
  assert.equal(rig.magazine.visible, false);
  assert.equal(model.group.children.includes(rig.magazine), true);
  poseSupplementalWeaponRig(rig, 0.4, 2500, 0, 30);
  assert.equal(rig.magazine.visible, true);
  assert.ok(rig.magazine.position.y < rig.magRest.y);
  poseSupplementalWeaponRig(rig, 0, 2600, 0, 30);
  assert.equal(rig.magazine.visible, false, 'an interrupted reload leaves no spare in view');
  assert.ok(rig.magazine.position.equals(rig.magRest));
  assert.equal(rig.magazine.castShadow, false);
});

test('shotgun shell insertion cycles, bolt follows a shot, and both stop when interrupted', () => {
  const shotgun = createSupplementalWeaponRig(mockModel(['pump']), getWeapon('shotgun'));
  assert.ok(shotgun.shell);
  assert.ok(shotgun.mechanism);
  poseSupplementalWeaponRig(shotgun, 0.2, 2500, 0, 5);
  assert.equal(shotgun.shell.visible, true);
  poseSupplementalWeaponRig(shotgun, 0, 100, 0, 5);
  assert.equal(shotgun.shell.visible, false);
  assert.equal(shotgun.mechanism.visible, true, 'firing cycles the action');
  poseSupplementalWeaponRig(shotgun, 0, 1500, 0, 5);
  assert.equal(shotgun.mechanism.visible, false);
  assert.ok(shotgun.mechanism.position.equals(shotgun.mechanismRest));
});

test('revolver displays its speedloader and melee has no supplemental parts', () => {
  const revolver = createSupplementalWeaponRig(mockModel(['mag']), getWeapon('revolver'));
  assert.equal(revolver.kind, 'speedloader');
  assert.equal(revolver.magazine.children.length, 6);
  assert.equal(revolver.mechanism.name, 'SupplementalRevolverEjector');
  poseSupplementalWeaponRig(revolver, 0.45, 1000, -Infinity, 6);
  assert.equal(revolver.magazine.visible, true);
  assert.equal(revolver.mechanism.visible, true, 'revolver ejector extends during extraction');
  assert.ok(revolver.mechanism.position.z > revolver.mechanismRest.z);
  poseSupplementalWeaponRig(revolver, 0.85, 1000, -Infinity, 6);
  assert.equal(revolver.mechanism.visible, false, 'revolver does not cycle a fake slide at reload end');
  poseSupplementalWeaponRig(revolver, 0, 1000, -Infinity, 6);
  assert.equal(revolver.magazine.visible, false);
  assert.equal(revolver.mechanism.visible, false);
  assert.ok(revolver.mechanism.position.equals(revolver.mechanismRest));
  assert.equal(createSupplementalWeaponRig(mockModel(), getWeapon('knife')), null);
});

test('sawnoff breech latch hinges only during reload and returns to rest on interruption', () => {
  const sawnoff = createSupplementalWeaponRig(mockModel(['pump']), getWeapon('sawnoff'));
  assert.equal(sawnoff.kind, 'break-action');
  assert.equal(sawnoff.mechanism.name, 'SupplementalBreechLatch');
  poseSupplementalWeaponRig(sawnoff, 0.47, 1000, -Infinity, 2);
  assert.equal(sawnoff.mechanism.visible, true);
  assert.ok(sawnoff.mechanism.rotation.x < sawnoff.mechanismRotation.x);
  poseSupplementalWeaponRig(sawnoff, 0.88, 1000, -Infinity, 2);
  assert.equal(sawnoff.mechanism.visible, true);
  poseSupplementalWeaponRig(sawnoff, 0.97, 1000, -Infinity, 2);
  assert.equal(sawnoff.mechanism.visible, false);
  poseSupplementalWeaponRig(sawnoff, 0, 100, 0, 2);
  assert.equal(sawnoff.mechanism.visible, false, 'sawnoff never cycles after firing');
  assert.equal(sawnoff.mechanism.rotation.x, sawnoff.mechanismRotation.x);
});

test('semi-auto shotgun has shell feed and bolt cycling without a manual pump', () => {
  const model = mockModel(['pump']);
  const rig = createSupplementalWeaponRig(model, getWeapon('autoshotgun'));
  assert.equal(rig.kind, 'semi-auto');
  assert.ok(rig.shell);
  assert.equal(rig.mechanism.name, 'SupplementalChargingHandle');
  poseSupplementalWeaponRig(rig, 0, 200, 100, 8);
  assert.equal(rig.mechanism.visible, true);
  poseSupplementalWeaponRig(rig, 0, 500, 100, 8);
  assert.equal(rig.mechanism.visible, false);
});
