import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getMap } from '../shared/maps/index.js';
import { createCourtyardDetails, disposeCourtyardDetails } from '../client/src/courtyardDetails.js';

test('Courtyard decoration is instanced, deterministic and leaves server collision intact', () => {
  const map = getMap('courtyard');
  const original = map.solids.map((solid) => [solid.min, solid.max, solid.tag]);
  const a = createCourtyardDetails();
  const b = createCourtyardDetails();
  try {
    assert.equal(a.children.length, 5, 'five batches of geometry, not hundreds of draw calls');
    assert.deepEqual(a.children.map((mesh) => mesh.count), [56, 8, 4, 16, 16]);
    const matrixA = new THREE.Matrix4();
    const matrixB = new THREE.Matrix4();
    const position = new THREE.Vector3();
    for (let meshIndex = 0; meshIndex < a.children.length; meshIndex++) {
      const first = a.children[meshIndex];
      const second = b.children[meshIndex];
      assert.ok(first.isInstancedMesh);
      assert.equal(first.castShadow, false);
      for (let i = 0; i < first.count; i++) {
        first.getMatrixAt(i, matrixA);
        second.getMatrixAt(i, matrixB);
        assert.deepEqual(matrixA.elements, matrixB.elements, 'placement must remain stable between rounds');
        position.setFromMatrixPosition(matrixA);
        assert.ok(Math.max(Math.abs(position.x), Math.abs(position.z)) > 28.9,
          'decorations must stay beside the existing outer collision walls');
        assert.ok(position.y >= 0 && position.y < 7.1);
      }
    }
    assert.deepEqual(map.solids.map((solid) => [solid.min, solid.max, solid.tag]), original);
  } finally {
    disposeCourtyardDetails(a);
    disposeCourtyardDetails(b);
  }
});

test('Courtyard detail materials and geometries are released on map rotation', () => {
  const group = createCourtyardDetails();
  const disposed = [];
  for (const child of group.children) {
    child.geometry.addEventListener('dispose', () => disposed.push(`${child.name}:geometry`));
    child.material.addEventListener('dispose', () => disposed.push(`${child.name}:material`));
  }
  disposeCourtyardDetails(group);
  assert.equal(disposed.length, 10);
  assert.equal(new Set(disposed).size, 10);
});
