import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { finishFirstPersonWeapon } from '../client/src/weaponFinishes.js';

test('tactical refinish changes only cloned, untextured known weapon materials', () => {
  const root = new THREE.Group();
  const original = new THREE.MeshLambertMaterial({ color: 0xffffff });
  original.name = 'Main';
  const textured = new THREE.MeshLambertMaterial({ map: new THREE.Texture() });
  textured.name = 'Black';
  const unknown = new THREE.MeshLambertMaterial({ color: 0xff5500 });
  unknown.name = 'CustomVarnish';
  const meshA = new THREE.Mesh(new THREE.BoxGeometry(), [original, textured, unknown]);
  const meshB = new THREE.Mesh(new THREE.BoxGeometry(), original);
  root.add(meshA, meshB);
  const sourceGeometry = meshA.geometry;

  assert.equal(finishFirstPersonWeapon(root), 1);
  assert.ok(meshA.material[0].isMeshStandardMaterial);
  assert.equal(meshA.material[0].name, 'Main');
  assert.equal(meshA.material[0], meshB.material);
  assert.notEqual(meshA.material[0], original);
  assert.equal(meshA.material[1], textured);
  assert.equal(meshA.material[2], unknown);
  assert.equal(meshA.geometry, sourceGeometry);
  assert.equal(original.color.getHex(), 0xffffff);
  assert.equal(finishFirstPersonWeapon(root), 0);
});

test('tactical refinish retains transparency, culling and mesh skinning', () => {
  const root = new THREE.Group();
  const original = new THREE.MeshLambertMaterial({
    side: THREE.DoubleSide, transparent: true, opacity: .4, alphaTest: .2,
  });
  original.name = 'Glass';
  const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), original);
  root.add(mesh);
  assert.equal(finishFirstPersonWeapon(root), 1);
  assert.equal(mesh.isSkinnedMesh, true);
  assert.equal(mesh.material.side, THREE.DoubleSide);
  assert.equal(mesh.material.transparent, true);
  assert.equal(mesh.material.opacity, .4);
  assert.equal(mesh.material.alphaTest, .2);
});
